// content/features/ui-fixes/readout-clipboard/clipboard.js
//
// Where copied readout definitions wait between one vault and the next. One
// entry; what is stored is names and settings, never ids.

const STORAGE_KEY = "cddReadoutClipboard";

export async function readReadoutClipboard() {
    try {
        const result = await chrome.storage.local.get(STORAGE_KEY);
        const entry = result?.[STORAGE_KEY];
        return entry && Array.isArray(entry.readouts) ? entry : null;
    } catch {
        return null;
    }
}

export async function writeReadoutClipboard(entry) {
    await chrome.storage.local.set({ [STORAGE_KEY]: entry });
}

export function onReadoutClipboardChanged(callback) {
    try {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === "local" && changes[STORAGE_KEY]) callback();
        });
    } catch {
        // no storage events; the buttons refresh on the next page pass
    }
}
