// shared/name-memory.js
//
// SINGLE SOURCE OF TRUTH for "molecule → the name to put on its row".
//
// Imported by BOTH execution contexts, like density-memory.js:
//   - the content script  → captures typed names, offers them for fill
//   - the options page    → lists and deletes remembered entries
//
// Keep this file free of DOM access and of imports from other modules.
//
// Keyed by MOLECULE, not by batch: the name belongs to the substance, so it
// should follow it onto any batch — and product rows have no batch at all.
// There is no authoritative record to defer to (CDD has no "row name" field
// on a molecule), so unlike a remembered density this value is never
// invalidated by something better; it only ages out of the cap.

export const NAME_MEMORY_STORAGE_KEY = "cddNameMemoryV1";
export const NAME_MEMORY_LIMIT = 300;

// Normalise arbitrary stored data into a clean map
// Record<moleculeId, {name, moleculeName, savedAt, lastUsedAt}>. Used on
// every read AND write so neither context ever trusts raw storage. Pure.
export function sanitizeNameMemory(raw) {
    const out = {};
    if (!raw || typeof raw !== "object") return out;

    for (const [key, entry] of Object.entries(raw)) {
        const id = String(key).trim();
        if (!/^\d+$/.test(id)) continue;
        if (!entry || typeof entry !== "object") continue;

        const name = typeof entry.name === "string" ? entry.name.trim() : "";
        if (!name) continue;

        out[id] = {
            name,
            moleculeName:
                typeof entry.moleculeName === "string" ? entry.moleculeName.trim() : "",
            savedAt: Number.isFinite(entry.savedAt) ? entry.savedAt : 0,
            lastUsedAt: Number.isFinite(entry.lastUsedAt) ? entry.lastUsedAt : 0,
        };
    }

    return out;
}

export async function loadNameMemory() {
    try {
        const result = await chrome.storage.local.get(NAME_MEMORY_STORAGE_KEY);
        return sanitizeNameMemory(result?.[NAME_MEMORY_STORAGE_KEY]);
    } catch {
        return {};
    }
}

export async function saveNameMemory(map) {
    try {
        await chrome.storage.local.set({
            [NAME_MEMORY_STORAGE_KEY]: sanitizeNameMemory(map),
        });
    } catch {
        // An orphaned content script (the extension was reloaded while this
        // page stayed open) has no storage any more — "Extension context
        // invalidated". The fresh script in a refreshed tab persists the
        // next change.
    }
}

/* ------------------------------------------------------------------ *
 * In-memory cache (sync) — content-script render passes cannot await
 * chrome.storage, so the map lives in module scope and refreshes on
 * every storage change (which is also how options-page edits propagate
 * live to the panel).
 * ------------------------------------------------------------------ */

let cachedMemory = {};
let cacheLoaded = false;
let listenerAttached = false;
let persistScheduled = false;
const changeListeners = new Set();

function notifyChange() {
    for (const cb of changeListeners) {
        try {
            cb(cachedMemory);
        } catch {
            /* a misbehaving listener must not break the others */
        }
    }
}

// Debounced write-back (coalesces the burst of captures on first render).
function schedulePersist() {
    if (persistScheduled) return;
    persistScheduled = true;
    setTimeout(() => {
        persistScheduled = false;
        saveNameMemory(cachedMemory);
    }, 250);
}

export function getRememberedName(moleculeId) {
    return cachedMemory[String(moleculeId)]?.name || null;
}

// Upsert. Persists ONLY when the stored name actually changes — repeated
// renders of an unchanged page never churn chrome.storage.
//
// Deliberately does NOT call notifyChange(): capture runs inside a render
// pass, and a synchronous notification would re-enter the renderer and
// duplicate cards. Subscribers are notified by the chrome.storage.onChanged
// listener instead, which fires asynchronously (in the writing context too)
// after the debounced persist.
export function rememberName(moleculeId, name, moleculeName) {
    if (!cacheLoaded) return;

    const id = String(moleculeId ?? "").trim();
    if (!/^\d+$/.test(id)) return;

    const value = String(name ?? "").trim();
    if (!value) return;

    const existing = cachedMemory[id];
    if (existing?.name === value) return;

    const now = Date.now();
    const merged = {
        name: value,
        moleculeName:
            String(moleculeName ?? "").trim() || existing?.moleculeName || "",
        savedAt: existing?.savedAt || now,
        lastUsedAt: now,
    };

    // Over the cap: evict the entry with the oldest lastUsedAt (never the
    // one just written).
    const next = { ...cachedMemory, [id]: merged };
    const keys = Object.keys(next);
    if (keys.length > NAME_MEMORY_LIMIT) {
        let oldestKey = null;
        let oldestAt = Infinity;
        for (const key of keys) {
            if (key === id) continue;
            if (next[key].lastUsedAt < oldestAt) {
                oldestAt = next[key].lastUsedAt;
                oldestKey = key;
            }
        }
        if (oldestKey) delete next[oldestKey];
    }

    cachedMemory = next;
    schedulePersist();
}

// Same no-notify rule as rememberName (see above).
export function forgetName(moleculeId) {
    if (!cacheLoaded) return;

    const id = String(moleculeId ?? "").trim();
    if (!cachedMemory[id]) return;

    const next = { ...cachedMemory };
    delete next[id];
    cachedMemory = next;
    schedulePersist();
}

// A successful fill from memory refreshes the entry's LRU stamp.
export function touchNameUsed(moleculeId) {
    if (!cacheLoaded) return;

    const id = String(moleculeId);
    const entry = cachedMemory[id];
    if (!entry) return;

    cachedMemory = { ...cachedMemory, [id]: { ...entry, lastUsedAt: Date.now() } };
    schedulePersist();
}

export async function clearNameMemory() {
    cachedMemory = {};
    await saveNameMemory({});
    // Subscribers hear about it via chrome.storage.onChanged.
}

export function onNameMemoryChanged(cb) {
    changeListeners.add(cb);
    return () => changeListeners.delete(cb);
}

export async function initNameMemory() {
    if (!listenerAttached && chrome?.storage?.onChanged) {
        listenerAttached = true;
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== "local" || !changes[NAME_MEMORY_STORAGE_KEY]) return;
            cachedMemory = sanitizeNameMemory(changes[NAME_MEMORY_STORAGE_KEY].newValue);
            notifyChange();
        });
    }

    cachedMemory = await loadNameMemory();
    cacheLoaded = true;
    notifyChange();
    return cachedMemory;
}
