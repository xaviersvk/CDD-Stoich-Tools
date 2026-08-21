// shared/auto-fill-flag.js — the experimental "fill tables automatically"
// switch. DOM-free; read by the content script and the options page.
export const AUTO_FILL_STORAGE_KEY = "cddAutoFillEnabled";

export async function getAutoFillEnabled() {
    try {
        const result = await chrome.storage.local.get(AUTO_FILL_STORAGE_KEY);
        return result?.[AUTO_FILL_STORAGE_KEY] === true;
    } catch {
        return false;
    }
}

export async function saveAutoFillEnabled(value) {
    try {
        await chrome.storage.local.set({ [AUTO_FILL_STORAGE_KEY]: value === true });
    } catch {
        // Orphaned content script — nothing useful to do.
    }
}
