// shared/heat-map-fields.js — which extra rows the heat-map well tooltip
// shows, as a user-ordered list of field labels. DOM-free; the options page
// uses the async pair, the content script the sync cache (hover handlers are
// synchronous), exactly like show-products-flag.js.
//
// Labels are matched against the vault's batch field names ignoring case and
// any "*" markers, so "Internal ID", "*Internal ID" and "internal id" all hit
// the same field. The special label "Synonyms" (or "Synonym") shows the
// molecule's first synonym instead of a batch field.

export const HEAT_MAP_FIELDS_STORAGE_KEY = "cddHeatMapTooltipFields";

export const DEFAULT_HEAT_MAP_FIELDS = ["Synonyms", "Internal ID"];

// At most this many extra rows — the tooltip is a glance, not a data sheet.
const MAX_FIELDS = 30;

// "*Internal ID " -> "internal id": the form used for all label comparisons.
export function normalizeFieldLabel(label) {
    return String(label ?? "")
        .replace(/\*/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}

export function isSynonymLabel(label) {
    const normalized = normalizeFieldLabel(label);
    return normalized === "synonyms" || normalized === "synonym";
}

// undefined (never saved) -> the default list. Anything else is cleaned to a
// deduped array of non-empty strings; an EMPTY array is a valid saved state
// ("show nothing extra"), so it is kept, not replaced by the default.
export function sanitizeHeatMapFields(raw) {
    if (raw === undefined) return [...DEFAULT_HEAT_MAP_FIELDS];
    if (!Array.isArray(raw)) return [...DEFAULT_HEAT_MAP_FIELDS];

    const out = [];
    const seen = new Set();
    for (const value of raw) {
        if (typeof value !== "string") continue;
        const label = value.trim();
        const key = normalizeFieldLabel(label);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(label);
        if (out.length >= MAX_FIELDS) break;
    }
    return out;
}

export async function getHeatMapFields() {
    try {
        const result = await chrome.storage.local.get(HEAT_MAP_FIELDS_STORAGE_KEY);
        return sanitizeHeatMapFields(result?.[HEAT_MAP_FIELDS_STORAGE_KEY]);
    } catch {
        return [...DEFAULT_HEAT_MAP_FIELDS];
    }
}

export async function saveHeatMapFields(list) {
    try {
        await chrome.storage.local.set({
            // sanitize() maps undefined to the default list, but a save always
            // has an explicit array (possibly empty) from the options page.
            [HEAT_MAP_FIELDS_STORAGE_KEY]: sanitizeHeatMapFields(
                Array.isArray(list) ? list : []
            ),
        });
    } catch {
        // Orphaned content script — nothing useful to do.
    }
}

let cached = [...DEFAULT_HEAT_MAP_FIELDS];
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

// Synchronous snapshot for hover-time reads. Treat as read-only.
export function getCachedHeatMapFields() {
    return cached;
}

export function onHeatMapFieldsChanged(cb) {
    changeListeners.add(cb);
    return () => changeListeners.delete(cb);
}

export async function initHeatMapFieldsConfig() {
    if (!listenerAttached && chrome?.storage?.onChanged) {
        listenerAttached = true;
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== "local" || !changes[HEAT_MAP_FIELDS_STORAGE_KEY]) return;
            cached = sanitizeHeatMapFields(changes[HEAT_MAP_FIELDS_STORAGE_KEY].newValue);
            notify();
        });
    }
    cached = await getHeatMapFields();
    notify();
    return cached;
}
