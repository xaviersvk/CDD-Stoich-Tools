// shared/row-name-flag.js — opt-in filling of a stoichiometry row's Name
// field from the molecule's shortest synonym, plus the memory of names the
// user types by hand. DOM-free; options page uses the async pair, the
// content script the sync cache.
//
// While this is off NOTHING happens: no molecule page is fetched, no offer
// is computed, and no typed name is remembered.

export const ROW_NAME_STORAGE_KEY = "cddFillRowName";

export async function getFillRowName() {
    try {
        const result = await chrome.storage.local.get(ROW_NAME_STORAGE_KEY);
        return result?.[ROW_NAME_STORAGE_KEY] === true;
    } catch {
        return false;
    }
}

export async function saveFillRowName(value) {
    try {
        await chrome.storage.local.set({ [ROW_NAME_STORAGE_KEY]: value === true });
    } catch {
        // Orphaned content script — nothing useful to do.
    }
}

let cached = false;
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

export function isFillRowNameEnabled() {
    return cached;
}

export function onFillRowNameChanged(cb) {
    changeListeners.add(cb);
    return () => changeListeners.delete(cb);
}

export async function initFillRowName() {
    if (!listenerAttached && chrome?.storage?.onChanged) {
        listenerAttached = true;
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== "local" || !changes[ROW_NAME_STORAGE_KEY]) return;
            cached = changes[ROW_NAME_STORAGE_KEY].newValue === true;
            notify();
        });
    }
    cached = await getFillRowName();
    notify();
    return cached;
}
