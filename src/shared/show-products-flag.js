// shared/show-products-flag.js — opt-in display of reaction PRODUCT rows
// in the Samples panel and the print flows. DOM-free; options page uses
// the async pair, the content script the sync cache.

export const SHOW_PRODUCTS_STORAGE_KEY = "cddShowProducts";

export async function getShowProducts() {
    try {
        const result = await chrome.storage.local.get(SHOW_PRODUCTS_STORAGE_KEY);
        return result?.[SHOW_PRODUCTS_STORAGE_KEY] === true;
    } catch {
        return false;
    }
}

export async function saveShowProducts(value) {
    try {
        await chrome.storage.local.set({ [SHOW_PRODUCTS_STORAGE_KEY]: value === true });
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

export function isShowProductsEnabled() {
    return cached;
}

export function onShowProductsChanged(cb) {
    changeListeners.add(cb);
    return () => changeListeners.delete(cb);
}

export async function initShowProducts() {
    if (!listenerAttached && chrome?.storage?.onChanged) {
        listenerAttached = true;
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== "local" || !changes[SHOW_PRODUCTS_STORAGE_KEY]) return;
            cached = changes[SHOW_PRODUCTS_STORAGE_KEY].newValue === true;
            notify();
        });
    }
    cached = await getShowProducts();
    notify();
    return cached;
}
