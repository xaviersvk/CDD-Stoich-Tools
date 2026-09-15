// content/features/ui-fixes/form-clipboard/clipboard.js
//
// Where copied forms wait between one vault and the next. What is stored is
// already neutral — names, never ids — so nothing in here could be sent to
// the wrong vault as it is.

const STORAGE_KEY = "cddFormClipboard";

export async function readFormClipboard() {
    try {
        const result = await chrome.storage.local.get(STORAGE_KEY);
        const entry = result?.[STORAGE_KEY];
        return entry && Array.isArray(entry.forms) ? entry : null;
    } catch {
        return null;
    }
}

export async function writeFormClipboard(entry) {
    await chrome.storage.local.set({ [STORAGE_KEY]: entry });
}

export function onFormClipboardChanged(callback) {
    try {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === "local" && changes[STORAGE_KEY]) callback();
        });
    } catch {
        // no storage events; the buttons refresh on the next page pass
    }
}
