// shared/link-alias.js — which batch field the ELN link popup offers as the
// link's description (content/features/ui-fixes/link-alias.js). A blank
// setting falls back to the default, so the box can never be left empty.
// DOM-free.

export const LINK_ALIAS_FIELD_KEY = "cddLinkAliasField";
export const DEFAULT_LINK_ALIAS_FIELD = "Internal ID";

function clean(value) {
    return String(value ?? "").trim() || DEFAULT_LINK_ALIAS_FIELD;
}

export async function getLinkAliasField() {
    try {
        const result = await chrome.storage.local.get(LINK_ALIAS_FIELD_KEY);
        return clean(result?.[LINK_ALIAS_FIELD_KEY]);
    } catch {
        return DEFAULT_LINK_ALIAS_FIELD;
    }
}

// Returns what was stored, so the options page can show the default after a
// blank entry.
export async function saveLinkAliasField(value) {
    const label = clean(value);
    try {
        await chrome.storage.local.set({ [LINK_ALIAS_FIELD_KEY]: label });
    } catch {
        // Orphaned content script — nothing useful to do.
    }
    return label;
}

let cached = DEFAULT_LINK_ALIAS_FIELD;
let started = false;

// The current field name, kept in step with storage. Synchronous for the
// content script's DOM callbacks.
export function currentLinkAliasField() {
    return cached;
}

export async function initLinkAliasField() {
    if (!started && chrome?.storage?.onChanged) {
        started = true;
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== "local" || !changes[LINK_ALIAS_FIELD_KEY]) return;
            cached = clean(changes[LINK_ALIAS_FIELD_KEY].newValue);
        });
    }
    cached = await getLinkAliasField();
    return cached;
}
