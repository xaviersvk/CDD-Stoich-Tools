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
export const HEAT_MAP_DISCOVERED_KEY = "cddHeatMapDiscoveredFields";

// The one built-in pseudo-field: the molecule's first synonym.
export const SYNONYMS_LABEL = "Synonyms";

// Cap on stored discovered labels — far above any real vault's field count.
const MAX_DISCOVERED = 200;

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

// The default is deliberately EMPTY: the tooltip shows nothing extra until
// the user picks rows in the options card — the vault's fields are discovered
// automatically, choosing them is the user's job (like prefix colours).
export function sanitizeHeatMapFields(raw) {
    if (!Array.isArray(raw)) return [];

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
        return [];
    }
}

export async function saveHeatMapFields(list) {
    try {
        await chrome.storage.local.set({
            [HEAT_MAP_FIELDS_STORAGE_KEY]: sanitizeHeatMapFields(list),
        });
    } catch {
        // Orphaned content script — nothing useful to do.
    }
}

let cached = [];
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

/* ------------------------------------------------------------------ *
 * Discovered fields — the options page never asks the user to TYPE a field
 * name. The content script records every batch field definition it parses off
 * a molecule page (api/batch-fields.js), and the options page renders the
 * recorded labels as checkboxes, exactly like the Panel fields card.
 *
 * Stored shape: Array<{ label, order, lastSeen }> — `order` is the vault's
 * display_order so the checkbox list reads like the vault's own batch form.
 * ------------------------------------------------------------------ */

export function sanitizeDiscoveredHeatMapFields(raw) {
    if (!Array.isArray(raw)) return [];

    const out = [];
    const seen = new Set();
    for (const entry of raw) {
        const label = typeof entry?.label === "string" ? entry.label.trim() : "";
        const key = normalizeFieldLabel(label);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push({
            label,
            order: Number.isFinite(entry.order) ? entry.order : 0,
            lastSeen: Number.isFinite(entry.lastSeen) ? entry.lastSeen : 0,
        });
        if (out.length >= MAX_DISCOVERED) break;
    }
    return out;
}

export async function getDiscoveredHeatMapFields() {
    try {
        const result = await chrome.storage.local.get(HEAT_MAP_DISCOVERED_KEY);
        return sanitizeDiscoveredHeatMapFields(result?.[HEAT_MAP_DISCOVERED_KEY]);
    } catch {
        return [];
    }
}

export async function saveDiscoveredHeatMapFields(list) {
    try {
        await chrome.storage.local.set({
            [HEAT_MAP_DISCOVERED_KEY]: sanitizeDiscoveredHeatMapFields(list),
        });
    } catch {
        // Orphaned content script — discovery re-runs on the next page load.
    }
}

// Refresh `lastSeen` at most daily so a hover burst over a heat map does not
// write storage once per molecule parsed.
const DISCOVERY_TOUCH_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Serialises read-modify-write cycles so parallel molecule parses can't lose
// each other's labels.
let recordQueue = Promise.resolve();

/**
 * recordHeatMapFieldDefs(defs) — content-side AUTO-DISCOVERY, fire-and-forget.
 * `defs` are raw batch_field_definitions off a molecule page. The batch-name
 * field is skipped (the popup shows the batch name natively).
 */
export function recordHeatMapFieldDefs(defs) {
    const found = [];
    for (const def of Array.isArray(defs) ? defs : []) {
        if (!def || typeof def.name !== "string" || def.is_batch_name_field) continue;
        const label = def.name.trim();
        if (!label) continue;
        found.push({
            label,
            order: Number.isFinite(def.display_order) ? def.display_order : 0,
        });
    }
    if (!found.length) return;

    recordQueue = recordQueue
        .then(async () => {
            const existing = await getDiscoveredHeatMapFields();
            const byKey = new Map(existing.map((f) => [normalizeFieldLabel(f.label), f]));
            const now = Date.now();
            let changed = false;

            for (const field of found) {
                const key = normalizeFieldLabel(field.label);
                const prev = byKey.get(key);
                if (
                    !prev ||
                    prev.order !== field.order ||
                    now - prev.lastSeen > DISCOVERY_TOUCH_INTERVAL_MS
                ) {
                    changed = true;
                }
                byKey.set(key, { ...field, lastSeen: now });
            }

            if (changed) await saveDiscoveredHeatMapFields([...byKey.values()]);
        })
        .catch(() => {
            /* storage gone (extension reloaded) — rediscovered next load */
        });
}
