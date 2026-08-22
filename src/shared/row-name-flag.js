// shared/row-name-flag.js — how a stoichiometry row's Name gets filled.
//
// Three modes, one setting:
//
//   "off"      nothing happens: no molecule page is fetched, no offer is
//              computed, no typed name is remembered.
//   "suggest"  the panel offers the name, and CDD's own Name editor grows a
//              list of that molecule's synonyms to pick from.
//   "auto"     everything "suggest" does, PLUS the name is written without
//              being asked for — into rows ADDED while the page is open, the
//              same policy the experimental auto-fill has always had.
//
// The modes stack rather than exclude: writing the name automatically is no
// reason to take the list away, because the name that gets written is a guess
// and changing it is the same click as choosing it.
//
// DOM-free; the options page uses the async pair, the content script the
// sync cache.
//
// The key predates the modes and used to hold a boolean. `true` reads as
// "suggest" (what the checkbox did), anything else as "off", so an existing
// install keeps its behaviour without a migration step.

export const ROW_NAME_STORAGE_KEY = "cddFillRowName";



export const ROW_NAME_OFF = "off";
export const ROW_NAME_SUGGEST = "suggest";
export const ROW_NAME_AUTO = "auto";

const MODES = new Set([ROW_NAME_OFF, ROW_NAME_SUGGEST, ROW_NAME_AUTO]);

function normalizeMode(stored) {
    if (stored === true) return ROW_NAME_SUGGEST;
    return MODES.has(stored) ? stored : ROW_NAME_OFF;
}

export async function getFillRowNameMode() {
    try {
        const result = await chrome.storage.local.get(ROW_NAME_STORAGE_KEY);
        return normalizeMode(result?.[ROW_NAME_STORAGE_KEY]);
    } catch {
        return ROW_NAME_OFF;
    }
}

export async function saveFillRowNameMode(mode) {
    try {
        await chrome.storage.local.set({
            [ROW_NAME_STORAGE_KEY]: normalizeMode(mode),
        });
    } catch {
        // Orphaned content script — nothing useful to do.
    }
}


let cached = ROW_NAME_OFF;
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

export function getRowNameMode() {
    return cached;
}

/** Anything at all to do: prefetch synonyms, remember typed names, offer. */
export function isFillRowNameEnabled() {
    return cached !== ROW_NAME_OFF;
}

/** List the synonyms inside CDD's Name editor — in both working modes. */
export function isRowNamePickerEnabled() {
    return cached === ROW_NAME_SUGGEST || cached === ROW_NAME_AUTO;
}

/** Write the name into new rows without being asked. */
export function isRowNameAutoFillEnabled() {
    return cached === ROW_NAME_AUTO;
}

export function onFillRowNameChanged(cb) {
    changeListeners.add(cb);
    return () => changeListeners.delete(cb);
}


export async function initFillRowName() {
    if (!listenerAttached && chrome?.storage?.onChanged) {
        listenerAttached = true;
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== "local") return;
            let touched = false;

            if (changes[ROW_NAME_STORAGE_KEY]) {
                cached = normalizeMode(changes[ROW_NAME_STORAGE_KEY].newValue);
                touched = true;
            }

            if (touched) notify();
        });
    }
    cached = await getFillRowNameMode();
    notify();
    return cached;
}
