// shared/boolean-flag.js — one on/off setting in chrome.storage.local.
// DOM-free; the options page uses the async get/save pair, the content
// script the sync cache that init() fills and storage changes keep live.
//
// `defaultOn`: true → anything but an explicit `false` reads as on;
// false → only an explicit `true` does.

export function createBooleanFlag(storageKey, defaultOn) {
    const read = (value) => (defaultOn ? value !== false : value === true);

    let cached = defaultOn;
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

    async function get() {
        try {
            const result = await chrome.storage.local.get(storageKey);
            return read(result?.[storageKey]);
        } catch {
            return defaultOn;
        }
    }

    async function save(value) {
        try {
            await chrome.storage.local.set({ [storageKey]: value === true });
        } catch {
            // Orphaned content script — nothing useful to do.
        }
    }

    function isEnabled() {
        return cached;
    }

    function onChanged(cb) {
        changeListeners.add(cb);
        return () => changeListeners.delete(cb);
    }

    async function init() {
        if (!listenerAttached && chrome?.storage?.onChanged) {
            listenerAttached = true;
            chrome.storage.onChanged.addListener((changes, areaName) => {
                if (areaName !== "local" || !changes[storageKey]) return;
                cached = read(changes[storageKey].newValue);
                notify();
            });
        }
        cached = await get();
        notify();
        return cached;
    }

    return { get, save, isEnabled, onChanged, init };
}
