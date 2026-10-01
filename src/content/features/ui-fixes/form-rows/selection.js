// content/features/ui-fixes/registration-form-rows/selection.js
//
// The fields last added to forms, so the same row can be added in the next
// vault without ticking it together again. Names and default value texts,
// never ids — [{ name, default }], in row order. Nothing is remembered until
// the user has run it once.

const STORAGE_KEY = "cddRegistrationFormRowSelection";

export async function readRowSelection() {
    try {
        const result = await chrome.storage.local.get(STORAGE_KEY);
        const entry = result?.[STORAGE_KEY];
        return Array.isArray(entry) ? entry.filter((pick) => pick && typeof pick.name === "string") : [];
    } catch {
        return [];
    }
}

export async function writeRowSelection(picks) {
    await chrome.storage.local.set({ [STORAGE_KEY]: picks });
}
