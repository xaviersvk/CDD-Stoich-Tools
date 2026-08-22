// shared/eln-shift-flag.js — on an ELN entry page, push CDD's centred entry
// to the left edge while the sample panel is open, so the panel has the
// empty margin to sit in instead of the entry's right-hand columns.
// On by default; an explicit `false` in storage turns it off. DOM-free.

export const ELN_SHIFT_STORAGE_KEY = "cddElnShiftLeft";

export async function getElnShiftEnabled() {
    try {
        const result = await chrome.storage.local.get(ELN_SHIFT_STORAGE_KEY);
        return result?.[ELN_SHIFT_STORAGE_KEY] !== false;
    } catch {
        return true;
    }
}

export async function saveElnShiftEnabled(value) {
    try {
        await chrome.storage.local.set({ [ELN_SHIFT_STORAGE_KEY]: value === true });
    } catch {
        // Orphaned content script — nothing useful to do.
    }
}

let cached = true;
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

export function isElnShiftEnabled() {
    return cached;
}

export function onElnShiftChanged(cb) {
    changeListeners.add(cb);
    return () => changeListeners.delete(cb);
}

export async function initElnShift() {
    if (!listenerAttached && chrome?.storage?.onChanged) {
        listenerAttached = true;
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== "local" || !changes[ELN_SHIFT_STORAGE_KEY]) return;
            cached = changes[ELN_SHIFT_STORAGE_KEY].newValue !== false;
            notify();
        });
    }
    cached = await getElnShiftEnabled();
    notify();
    return cached;
}
