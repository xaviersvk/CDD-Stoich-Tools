// shared/purity-threshold.js — TWO purity thresholds (percent), both
// defaulting to 93 but independently configurable:
//
//   fill  → a purity is offered for filling only at or below this value
//   warn  → the panel's ⚠ LOW PURITY badge fires at or below this value
//
// DOM-free; read by the content script (sync cache) and the options page
// (async load/save).

export const PURITY_FILL_THRESHOLD_KEY = "cddPurityFillThreshold";
export const PURITY_WARN_THRESHOLD_KEY = "cddPurityWarnThreshold";
export const DEFAULT_PURITY_THRESHOLD = 93;

export function sanitizePurityThreshold(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0 || n > 100) return DEFAULT_PURITY_THRESHOLD;
    return n;
}

export async function loadPurityThresholds() {
    try {
        const result = await chrome.storage.local.get([
            PURITY_FILL_THRESHOLD_KEY,
            PURITY_WARN_THRESHOLD_KEY,
        ]);
        return {
            fill: sanitizePurityThreshold(result?.[PURITY_FILL_THRESHOLD_KEY]),
            warn: sanitizePurityThreshold(result?.[PURITY_WARN_THRESHOLD_KEY]),
        };
    } catch {
        return { fill: DEFAULT_PURITY_THRESHOLD, warn: DEFAULT_PURITY_THRESHOLD };
    }
}

async function saveThreshold(key, value) {
    try {
        await chrome.storage.local.set({ [key]: sanitizePurityThreshold(value) });
    } catch {
        // Orphaned content script — nothing useful to do.
    }
}

export function savePurityFillThreshold(value) {
    return saveThreshold(PURITY_FILL_THRESHOLD_KEY, value);
}

export function savePurityWarnThreshold(value) {
    return saveThreshold(PURITY_WARN_THRESHOLD_KEY, value);
}

/* Sync cache for render paths, refreshed via chrome.storage.onChanged. */

let cached = { fill: DEFAULT_PURITY_THRESHOLD, warn: DEFAULT_PURITY_THRESHOLD };
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

export function getPurityFillThreshold() {
    return cached.fill;
}

export function getPurityWarnThreshold() {
    return cached.warn;
}

export function onPurityThresholdChanged(cb) {
    changeListeners.add(cb);
    return () => changeListeners.delete(cb);
}

export async function initPurityThresholds() {
    if (!listenerAttached && chrome?.storage?.onChanged) {
        listenerAttached = true;
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== "local") return;
            let touched = false;
            if (changes[PURITY_FILL_THRESHOLD_KEY]) {
                cached = {
                    ...cached,
                    fill: sanitizePurityThreshold(changes[PURITY_FILL_THRESHOLD_KEY].newValue),
                };
                touched = true;
            }
            if (changes[PURITY_WARN_THRESHOLD_KEY]) {
                cached = {
                    ...cached,
                    warn: sanitizePurityThreshold(changes[PURITY_WARN_THRESHOLD_KEY].newValue),
                };
                touched = true;
            }
            if (touched) notify();
        });
    }

    cached = await loadPurityThresholds();
    notify();
    return cached;
}
