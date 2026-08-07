// shared/purity-threshold.js — the one purity threshold (percent). At or
// below it a purity counts as "low": the panel badge flags it and the
// fill offers consider a purity worth filling. DOM-free; read by the
// content script (sync cache) and the options page (async load/save).

export const PURITY_THRESHOLD_STORAGE_KEY = "cddPurityThreshold";
export const DEFAULT_PURITY_THRESHOLD = 93;

export function sanitizePurityThreshold(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0 || n > 100) return DEFAULT_PURITY_THRESHOLD;
    return n;
}

export async function loadPurityThreshold() {
    try {
        const result = await chrome.storage.local.get(PURITY_THRESHOLD_STORAGE_KEY);
        return sanitizePurityThreshold(result?.[PURITY_THRESHOLD_STORAGE_KEY]);
    } catch {
        return DEFAULT_PURITY_THRESHOLD;
    }
}

export async function savePurityThreshold(value) {
    try {
        await chrome.storage.local.set({
            [PURITY_THRESHOLD_STORAGE_KEY]: sanitizePurityThreshold(value),
        });
    } catch {
        // Orphaned content script — nothing useful to do.
    }
}

/* Sync cache for render paths, refreshed via chrome.storage.onChanged. */

let cached = DEFAULT_PURITY_THRESHOLD;
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

export function getPurityThreshold() {
    return cached;
}

export function onPurityThresholdChanged(cb) {
    changeListeners.add(cb);
    return () => changeListeners.delete(cb);
}

export async function initPurityThreshold() {
    if (!listenerAttached && chrome?.storage?.onChanged) {
        listenerAttached = true;
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== "local" || !changes[PURITY_THRESHOLD_STORAGE_KEY]) return;
            cached = sanitizePurityThreshold(changes[PURITY_THRESHOLD_STORAGE_KEY].newValue);
            notify();
        });
    }

    cached = await loadPurityThreshold();
    notify();
    return cached;
}
