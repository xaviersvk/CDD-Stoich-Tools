// shared/panel-sources-flag.js — which sources the ELN Samples panel draws
// from: the stoichiometry tables, the batch/sample links written into the
// entry body, or both.
//
// DOM-free; the options page uses the async pair, the content script the sync
// cache (same split as show-products-flag.js / auto-fill-flag.js).
//
// Both default to ON. The table rows are what the panel has always shown, and
// mentions are the thing this setting was added for — a switch that starts by
// hiding the feature it introduces would just look broken.

export const PANEL_SOURCES_STORAGE_KEY = "cddPanelSources";

const DEFAULTS = { tableRows: true, mentions: true };

// Anything missing or non-boolean falls back to the default rather than to
// false: a half-written storage value must not silently empty the panel.
export function sanitizePanelSources(raw) {
    if (!raw || typeof raw !== "object") return { ...DEFAULTS };
    return {
        tableRows: typeof raw.tableRows === "boolean" ? raw.tableRows : DEFAULTS.tableRows,
        mentions: typeof raw.mentions === "boolean" ? raw.mentions : DEFAULTS.mentions,
    };
}

export async function getPanelSources() {
    try {
        const result = await chrome.storage.local.get(PANEL_SOURCES_STORAGE_KEY);
        return sanitizePanelSources(result?.[PANEL_SOURCES_STORAGE_KEY]);
    } catch {
        return { ...DEFAULTS };
    }
}

export async function savePanelSources(value) {
    try {
        await chrome.storage.local.set({
            [PANEL_SOURCES_STORAGE_KEY]: sanitizePanelSources(value),
        });
    } catch {
        // Orphaned content script — nothing useful to do.
    }
}

let cached = { ...DEFAULTS };
let listenerAttached = false;
const changeListeners = new Set();

function notify() {
    for (const cb of changeListeners) {
        try {
            cb(cached);
        } catch {
            /* a misbehaving listener must not break the others */
        }
    }
}

export function isTableRowsEnabled() {
    return cached.tableRows;
}

export function isMentionsEnabled() {
    return cached.mentions;
}

export function onPanelSourcesChanged(cb) {
    changeListeners.add(cb);
    return () => changeListeners.delete(cb);
}

export async function initPanelSources() {
    if (!listenerAttached && chrome?.storage?.onChanged) {
        listenerAttached = true;
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== "local" || !changes[PANEL_SOURCES_STORAGE_KEY]) return;
            cached = sanitizePanelSources(changes[PANEL_SOURCES_STORAGE_KEY].newValue);
            notify();
        });
    }
    cached = await getPanelSources();
    notify();
    return cached;
}
