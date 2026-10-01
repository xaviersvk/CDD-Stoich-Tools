// content/features/ui-fixes/form-rows/selection.js
//
// The fields last added to forms, per table key, so the same row can be
// added in the next vault without ticking it together again — and which
// kind each page used last, so the card opens on it. Names and default
// value texts, never ids: { picks: { [key]: [{ name, default }] },
// lastKind: { registration|protocol: key } }. Nothing is remembered until
// the user has run it once.
//
// Before 18.8.0 only batch fields could be added, under their own key; that
// list is read as the batch entry until the first new save carries it over.

const STORAGE_KEY = "cddFormRowSelection";
const LEGACY_BATCH_KEY = "cddRegistrationFormRowSelection";

function cleanPicks(list) {
    return Array.isArray(list) ? list.filter((pick) => pick && typeof pick.name === "string") : [];
}

export async function readFormRowSelection() {
    try {
        const result = await chrome.storage.local.get([STORAGE_KEY, LEGACY_BATCH_KEY]);
        const entry = result?.[STORAGE_KEY] || {};
        const picks = {};
        for (const [key, list] of Object.entries(entry.picks || {})) picks[key] = cleanPicks(list);
        if (!picks.batch) picks.batch = cleanPicks(result?.[LEGACY_BATCH_KEY]);
        return { picks, lastKind: { ...(entry.lastKind || {}) } };
    } catch {
        return { picks: {}, lastKind: {} };
    }
}

export async function writeFormRowSelection(page, key, list) {
    const current = await readFormRowSelection();
    current.picks[key] = list;
    current.lastKind[page] = key;
    await chrome.storage.local.set({ [STORAGE_KEY]: current });
}
