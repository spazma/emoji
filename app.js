// ===============================
// CONFIG
// ===============================
const DB_NAME = "spaz_emoji_db";
const STORE_NAME = "emoji";
let emojiDB = [];
let lastPythonCode = "";


// ===============================
// INDEXEDDB SETUP
// ===============================
async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
    });
}

async function saveEmojiDB(data) {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put(data, "emoji_data");
}

async function getCachedEmojiDB() {
    const db = await initDB();
    return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const request = store.get("emoji_data");
        request.onsuccess = () => resolve(request.result);
    });
}


// ===============================
// LOADING DB (LOCAL + SERVER)
// ===============================
async function loadEmojiDB() {
    
    // Najpierw szukamy w IndexedDB
    const cached = await getCachedEmojiDB();
    if (cached) {
        console.log("✓ Baza załadowana z IndexedDB");
        return cached;
    }

    // Potem sprawdzamy localStorage
    const storedDB = localStorage.getItem("emoji_db_backup");
    if (storedDB) {
        try {
            const db = JSON.parse(storedDB);
            await saveEmojiDB(db);
            console.log("✓ Baza załadowana z localStorage i zapisana w IndexedDB");
            return db;
        } catch (e) {
            console.warn("Błąd parsowania localStorage:", e);
        }
    }

    // Tryb online - pobierz z serwera
    if (location.protocol === "https:") {
        try {
            console.log("Ładuję bazę z serwera...");
            const res = await fetch("data/emoji_db.json", {cache: "no-cache"});
            if (!res.ok) throw new Error("HTTP " + res.status);
            const db = await res.json();
            await saveEmojiDB(db);
            localStorage.setItem("emoji_db_backup", JSON.stringify(db));
            console.log("✓ Baza zapisana w IndexedDB i localStorage");
            return db;
        } catch (e) {
            console.error("Błąd pobierania z serwera:", e);
            return [];
        }
    }

    // Tryb offline (file://) - próbuj fetch, potem dialog
    try {
        console.log("Ładuję z pliku lokalnego...");
        const res = await fetch("data/emoji_db.json");
        if (res.ok) {
            const db = await res.json();
            await saveEmojiDB(db);
            localStorage.setItem("emoji_db_backup", JSON.stringify(db));
            console.log("✓ Baza załadowana i zapisana w IndexedDB + localStorage");
            return db;
        }
    } catch (e) {
        console.warn("Nie mogę pobrać z pliku:", e);
    }

    // Ostateczność - dialog ręcznego wyboru
    return new Promise(resolve => {
        const wrapper = document.createElement("div");
        wrapper.style.padding = "20px";
        wrapper.style.background = "#111";
        wrapper.style.border = "1px solid #333";
        wrapper.style.margin = "20px";
        wrapper.style.borderRadius = "8px";
        wrapper.style.fontSize = "14px";

        wrapper.innerHTML = `
            <b>Strona działa lokalnie.</b><br><br>
            Wybierz plik <code>emoji_db.json</code> z katalogu <b>/data/</b>:<br><br>
            <input type="file" id="localDB" accept="application/json">
        `;

        document.body.prepend(wrapper);

        const input = wrapper.querySelector("#localDB");

        input.addEventListener("change", async () => {
            const file = input.files[0];
            const reader = new FileReader();
            reader.onload = async () => {
                const db = JSON.parse(reader.result);
                await saveEmojiDB(db);
                localStorage.setItem("emoji_db_backup", JSON.stringify(db));
                wrapper.remove();
                resolve(db);
            };
            reader.readAsText(file);
        });
    });
}


// ===============================
// INIT APP
// ===============================
async function initApp() {
    emojiDB = await loadEmojiDB();
    document.getElementById("emojiCount").textContent = emojiDB.length;

    buildTabs();
    const fav = JSON.parse(localStorage.getItem("favorites") || "[]");
    renderFavorites(fav);
    
    // Sprawdź aktualizacje (raz na 30 dni)
    checkForUpdates();
}




// ===============================
// SEARCH
// ===============================
function searchEmojis() {
    const q = document.getElementById("searchInput").value.trim().toLowerCase();
    if (!q) return renderEmojis(emojiDB);

    const filtered = emojiDB.filter(e =>
        e.keywords.some(k => k.includes(q)) ||
        e.name.toLowerCase().includes(q) ||
        e.name_pl.toLowerCase().includes(q)
    );

    renderEmojis(filtered);
}


// ===============================
// RENDER EMOJIS
// ===============================
function renderEmojis(list) {
    const grid = document.getElementById("emojiGrid");
    grid.innerHTML = "";

    list.forEach(e => {
        const div = document.createElement("div");
        div.className = "emoji-item";
        div.textContent = e.emoji;
        div.onclick = () => handleEmojiClick(e.emoji);
        grid.appendChild(div);
    });
}


// ===============================
// EMOJI CLICK
// ===============================
function handleEmojiClick(emoji) {
    const obj = emojiDB.find(e => e.emoji === emoji);
    if (!obj) return;

    lastPythonCode = obj.python;

    document.getElementById("previewEmoji").textContent = emoji;
    document.getElementById("pythonCode").textContent = obj.python + "   # " + emoji;

    copyToClipboard(emoji);
    addFavorite(emoji);

    updateDebugPanel(emoji);
}


// ===============================
// DEBUG PANEL
// ===============================
function updateDebugPanel(emoji) {
    const dbgEmoji = document.getElementById("debugEmoji");
    const dbgKeywords = document.getElementById("debugKeywords");

    const obj = emojiDB.find(e => e.emoji === emoji);
    if (!obj) {
        dbgEmoji.textContent = "Brak danych";
        dbgKeywords.textContent = "";
        return;
    }

    dbgEmoji.innerHTML = `
        <span style="font-size:20px">${emoji}</span><br>
        Unicode: ${obj.unicode}<br>
        Python: ${obj.python}
    `;

    dbgKeywords.innerHTML = `
        <b>Keywords:</b><br>
        <span style="color:#9cf">${obj.keywords.join(", ")}</span>
    `;
}


// ===============================
// UNICODE PREVIEW
// ===============================
function updateUnicodePreview() {
    const input = document.getElementById("unicodeInput").value.trim();

    let cpHex = null;

    // Format: \UXXXXXXXX (Python)
    let match = input.match(/\\U([0-9A-Fa-f]{8})/);
    if (match) {
        cpHex = match[1];
    }

    // Format: U+XXXX lub U+XXXXX lub U+XXXXXX (standard Unicode)
    if (!match) {
        match = input.match(/U\+([0-9A-Fa-f]+)/);
        if (match) {
            cpHex = match[1];
        }
    }

    if (!cpHex) {
        document.getElementById("unicodePreview").textContent = "";
        return;
    }

    try {
        // Pad na 8 cyfr (dla astralnych znaków)
        cpHex = cpHex.padStart(8, '0');
        const cp = parseInt(cpHex, 16);

        // Sprawdź czy kod jest valid
        if (cp < 0 || cp > 0x10FFFF) {
            document.getElementById("unicodePreview").textContent = "❌ Niewłaściwy kod";
            return;
        }

        const emoji = String.fromCodePoint(cp);
        document.getElementById("unicodePreview").textContent = emoji;
    } catch (e) {
        document.getElementById("unicodePreview").textContent = "❌ Błąd";
    }
}



// ===============================
// FAVORITES
// ===============================
function loadFavorites() {
    const fav = JSON.parse(localStorage.getItem("favorites") || "[]");
    renderFavorites(fav);
}

function addFavorite(emoji) {
    let fav = JSON.parse(localStorage.getItem("favorites") || "[]");
    fav = [emoji, ...fav.filter(e => e !== emoji)].slice(0, 56);
    localStorage.setItem("favorites", JSON.stringify(fav));
    renderFavorites(fav);
}

function renderFavorites(list) {
    const box = document.getElementById("favorites");
    box.innerHTML = "";
    list.forEach(e => {
        const div = document.createElement("div");
        div.className = "fav-item";
        div.textContent = e;
        div.onclick = () => handleEmojiClick(e);
        box.appendChild(div);
    });
}

function clearFavorites() {
    if (confirm("Na pewno wyczyścić ulubione?")) {
        localStorage.removeItem("favorites");
        document.getElementById("favorites").innerHTML = "";
        renderFavorites([]);
    }
}

// ===============================
// EXPORT / IMPORT FAVORITES
// ===============================
function exportFavorites() {
    const fav = JSON.parse(localStorage.getItem("favorites") || "[]");
    const data = JSON.stringify(fav, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "spaz_emoji_favorites.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function importFavorites() {
    const input = document.getElementById("importFile");
    input.click();
}

function handleImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
        try {
            const imported = JSON.parse(reader.result);
            if (Array.isArray(imported)) {
                localStorage.setItem("favorites", JSON.stringify(imported));
                renderFavorites(imported);
                alert("✓ Ulubione zaimportowane!");
            } else {
                alert("✗ Błędny format pliku");
            }
        } catch (e) {
            alert("✗ Błąd odczytu pliku: " + e.message);
        }
    };
    reader.readAsText(file);
    
    // Reset input
    event.target.value = "";
}

// ===============================
// COPY
// ===============================
function copyPythonCode() {
    navigator.clipboard.writeText(lastPythonCode);
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text);
}

// ===============================
// TABS
// ===============================

function buildTabs() {
    const tabs = document.getElementById("tabs");
    tabs.innerHTML = "";

    if (!emojiDB || emojiDB.length === 0) {
        console.warn("Brak emojiDB – tabs nie mogą zostać wygenerowane.");
        return;
    }

    const categories = [...new Set(emojiDB.map(e => e.category))];
    categories.sort((a, b) => a.localeCompare(b));

    categories.forEach((cat) => {
        const btn = document.createElement("button");
        btn.className = "tab-btn";
        btn.textContent = cat;

        // Zaznacz "Smileys & Emotion" jako domyślną
        if (cat === "Smileys & Emotion") {
            btn.classList.add("active");
        }

        btn.onclick = () => {
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");

            const filtered = emojiDB.filter(e => e.category === cat);
            renderEmojis(filtered);
        };

        tabs.appendChild(btn);
    });

    // Pokaż "Smileys & Emotion" domyślnie
    const smileyCategory = emojiDB.filter(e => e.category === "Smileys & Emotion");
    if (smileyCategory.length > 0) {
        renderEmojis(smileyCategory);
    }
}


// ===============================
// DEBUG TOGGLE - INIT + PERSIST
// ===============================
function initDebugToggle() {
    const toggle = document.getElementById("toggleDebug");
    const panel = document.getElementById("debugPanel");

    if (!toggle || !panel) return;

    // Wczytaj zapisany stan z localStorage
    const savedState = localStorage.getItem("debug_toggle_state");
    const isChecked = savedState === "true";

    // Ustaw checkbox na zapisany stan
    toggle.checked = isChecked;

    // Ustaw widoczność panelu
    panel.style.display = isChecked ? "block" : "none";

    // Listener na zmiany
    toggle.addEventListener("change", () => {
        const isNowChecked = toggle.checked;
        panel.style.display = isNowChecked ? "block" : "none";
        localStorage.setItem("debug_toggle_state", isNowChecked.toString());
    });
}


// ===============================
// DOM READY
// ===============================
document.addEventListener("DOMContentLoaded", () => {
    initApp();
    initDebugToggle();
});


// ===============================
// UPDATE CHECK
// ===============================
const UPDATE_CHECK_KEY = "emoji_last_update_check";
const UPDATE_CHECK_INTERVAL = 30 * 24 * 60 * 60 * 1000; // 30 dni

async function checkForUpdates() {
    const lastCheck = localStorage.getItem(UPDATE_CHECK_KEY);
    const now = Date.now();

    if (lastCheck && (now - parseInt(lastCheck)) < UPDATE_CHECK_INTERVAL) {
        return;
    }

    try {
        console.log("Sprawdzam aktualizacje...");
        const res = await fetch("data/emoji_db.json?t=" + Date.now(), {cache: "no-cache"});
        const serverDB = await res.json();
        const serverCount = serverDB.length;
        
        localStorage.setItem(UPDATE_CHECK_KEY, now.toString());

        if (serverCount > emojiDB.length) {
            showUpdateNotification(serverCount);
        }
    } catch (e) {
        console.warn("Nie udało się sprawdzić aktualizacji:", e);
    }
}

function showUpdateNotification(newCount) {
    const notification = document.createElement("div");
    
    notification.style.cssText = `
        position: fixed;
        bottom: 60px;
        left: 50%;
        transform: translateX(-50%);
        background: #FF6B3D;
        color: white;
        padding: 12px 16px;
        border-radius: 6px;
        font-size: 13px;
        z-index: 1000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        animation: slideUp 0.3s ease;
        display: flex;
        align-items: center;
        gap: 8px;
    `;
    
    notification.innerHTML = `
        <span>Dostępna aktualizacja: <strong>${newCount}</strong> emotek</span>
        <button onclick="updateEmojiDB()" style="
            background: white;
            color: #FF6B3D;
            border: none;
            padding: 4px 8px;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
            font-size: 12px;
        ">Aktualizuj</button>
        <button onclick="remindLater()" style="
            background: rgba(255,255,255,0.2);
            color: white;
            border: none;
            padding: 4px 8px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        ">Przypomnij</button>
        <button onclick="this.parentElement.remove()" style="
            background: rgba(255,255,255,0.2);
            color: white;
            border: none;
            padding: 4px 8px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        ">Ignoruj</button>
    `;
    
    document.body.appendChild(notification);
    
    // Usuń po 15 sekundach
    setTimeout(() => notification.remove(), 15000);
}

function remindLater() {
    // Przypomnij za 7 dni
    localStorage.setItem(UPDATE_CHECK_KEY, (Date.now() - UPDATE_CHECK_INTERVAL + 7 * 24 * 60 * 60 * 1000).toString());
    document.querySelector("[onclick*='remindLater']").parentElement.remove();
    console.log("Przypomnię za 7 dni");
}

async function updateEmojiDB() {
    console.log("Czyszczę cache...");
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    
    // Pobierz nową bazę
    try {
        const res = await fetch("data/emoji_db.json", {cache: "no-cache"});
        const newDB = await res.json();
        await saveEmojiDB(newDB);
        localStorage.setItem("emoji_db_backup", JSON.stringify(newDB));
        
        // Przeładuj stronę
        location.reload();
    } catch (e) {
        alert("Błąd aktualizacji: " + e);
    }
}
