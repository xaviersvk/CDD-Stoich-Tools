// shared/heat-map-outlier-drag-flag.js — on a run heat map, Shift-drag a box
// to flag the wells in it as outliers and Ctrl-drag to unflag them. Saved at
// once, as CDD's own flag link saves.
// On by default; an explicit `false` in storage turns it off. DOM-free.

export const HEAT_MAP_OUTLIER_DRAG_STORAGE_KEY = "cddHeatMapOutlierDrag";

export async function getHeatMapOutlierDragEnabled() {
    try {
        const result = await chrome.storage.local.get(HEAT_MAP_OUTLIER_DRAG_STORAGE_KEY);
        return result?.[HEAT_MAP_OUTLIER_DRAG_STORAGE_KEY] !== false;
    } catch {
        return true;
    }
}

export async function saveHeatMapOutlierDragEnabled(value) {
    try {
        await chrome.storage.local.set({ [HEAT_MAP_OUTLIER_DRAG_STORAGE_KEY]: value === true });
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

export function isHeatMapOutlierDragEnabled() {
    return cached;
}

export function onHeatMapOutlierDragChanged(cb) {
    changeListeners.add(cb);
    return () => changeListeners.delete(cb);
}

export async function initHeatMapOutlierDrag() {
    if (!listenerAttached && chrome?.storage?.onChanged) {
        listenerAttached = true;
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== "local" || !changes[HEAT_MAP_OUTLIER_DRAG_STORAGE_KEY]) return;
            cached = changes[HEAT_MAP_OUTLIER_DRAG_STORAGE_KEY].newValue !== false;
            notify();
        });
    }
    cached = await getHeatMapOutlierDragEnabled();
    notify();
    return cached;
}
