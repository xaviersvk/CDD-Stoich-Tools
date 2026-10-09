// shared/dose-response-drag-flag.js — on a dose-response plot in Edit
// Outliers & Override, Shift-drag a box to mark the points in it as outliers
// and Ctrl-drag to unmark them. Nothing is saved until CDD's own Save.
// On by default; an explicit `false` in storage turns it off. DOM-free.

export const DOSE_RESPONSE_DRAG_STORAGE_KEY = "cddDoseResponseDrag";

export async function getDoseResponseDragEnabled() {
    try {
        const result = await chrome.storage.local.get(DOSE_RESPONSE_DRAG_STORAGE_KEY);
        return result?.[DOSE_RESPONSE_DRAG_STORAGE_KEY] !== false;
    } catch {
        return true;
    }
}

export async function saveDoseResponseDragEnabled(value) {
    try {
        await chrome.storage.local.set({ [DOSE_RESPONSE_DRAG_STORAGE_KEY]: value === true });
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

export function isDoseResponseDragEnabled() {
    return cached;
}

export function onDoseResponseDragChanged(cb) {
    changeListeners.add(cb);
    return () => changeListeners.delete(cb);
}

export async function initDoseResponseDrag() {
    if (!listenerAttached && chrome?.storage?.onChanged) {
        listenerAttached = true;
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== "local" || !changes[DOSE_RESPONSE_DRAG_STORAGE_KEY]) return;
            cached = changes[DOSE_RESPONSE_DRAG_STORAGE_KEY].newValue !== false;
            notify();
        });
    }
    cached = await getDoseResponseDragEnabled();
    notify();
    return cached;
}
