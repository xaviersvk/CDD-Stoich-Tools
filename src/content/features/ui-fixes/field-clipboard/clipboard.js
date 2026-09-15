// content/features/ui-fixes/field-clipboard/clipboard.js
//
// Where copied definitions wait between one vault and the next: one entry
// per kind in chrome.storage.local, so the whole of vault A can be copied
// page by page before any of it is pasted into vault B, and a tab of either
// vault sees the same clipboard.

const STORAGE_KEY = "cddFieldClipboard";

export async function readClipboard() {
    try {
        const result = await chrome.storage.local.get(STORAGE_KEY);
        const value = result?.[STORAGE_KEY];
        return value && typeof value === "object" ? value : {};
    } catch {
        return {};
    }
}

export async function readClipboardEntry(kind) {
    const all = await readClipboard();
    const entry = all[kind];
    return entry && Array.isArray(entry.fields) ? entry : null;
}

export async function writeClipboardEntry(kind, entry) {
    const all = await readClipboard();
    all[kind] = entry;
    await chrome.storage.local.set({ [STORAGE_KEY]: all });
}

export function onClipboardChanged(callback) {
    try {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === "local" && changes[STORAGE_KEY]) callback();
        });
    } catch {
        // no storage events; the buttons refresh on the next page pass
    }
}
