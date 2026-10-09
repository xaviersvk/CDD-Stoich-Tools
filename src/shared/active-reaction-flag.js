// shared/active-reaction-flag.js — on an ELN entry with several reactions,
// mark the reaction in view in the sample panel (heavier frame, panel
// scrolled to it). See content/features/active-reaction.js.
// On by default; an explicit `false` in storage turns it off. DOM-free.

export const ACTIVE_REACTION_STORAGE_KEY = "cddActiveReaction";

export async function getActiveReactionEnabled() {
    try {
        const result = await chrome.storage.local.get(ACTIVE_REACTION_STORAGE_KEY);
        return result?.[ACTIVE_REACTION_STORAGE_KEY] !== false;
    } catch {
        return true;
    }
}

export async function saveActiveReactionEnabled(value) {
    try {
        await chrome.storage.local.set({ [ACTIVE_REACTION_STORAGE_KEY]: value === true });
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

export function isActiveReactionEnabled() {
    return cached;
}

export function onActiveReactionChanged(cb) {
    changeListeners.add(cb);
    return () => changeListeners.delete(cb);
}

export async function initActiveReactionFlag() {
    if (!listenerAttached && chrome?.storage?.onChanged) {
        listenerAttached = true;
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== "local" || !changes[ACTIVE_REACTION_STORAGE_KEY]) return;
            cached = changes[ACTIVE_REACTION_STORAGE_KEY].newValue !== false;
            notify();
        });
    }
    cached = await getActiveReactionEnabled();
    notify();
    return cached;
}
