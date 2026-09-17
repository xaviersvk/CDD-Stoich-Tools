// content/features/ui-fixes/registration-form-clipboard/clipboard.js
//
// Where copied registration forms wait between one vault and the next. What
// is stored is already neutral — names, never ids. A key of its own: a
// protocol form pasted on the Registration page would be nonsense.

const STORAGE_KEY = "cddRegistrationFormClipboard";

export async function readRegistrationFormClipboard() {
    try {
        const result = await chrome.storage.local.get(STORAGE_KEY);
        const entry = result?.[STORAGE_KEY];
        return entry && Array.isArray(entry.forms) ? entry : null;
    } catch {
        return null;
    }
}

export async function writeRegistrationFormClipboard(entry) {
    await chrome.storage.local.set({ [STORAGE_KEY]: entry });
}

export function onRegistrationFormClipboardChanged(callback) {
    try {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === "local" && changes[STORAGE_KEY]) callback();
        });
    } catch {
        // no storage events; the buttons refresh on the next page pass
    }
}
