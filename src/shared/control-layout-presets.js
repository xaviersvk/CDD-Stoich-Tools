// shared/control-layout-presets.js — named control-layout presets, one list per
// plate format (96 / 384 / 1536 ...), stored in chrome.storage.local.
//
// DOM-free on purpose: the content feature imports it for load/save, and the
// options page could later render the same lists without pulling in any page
// code (same split as heat-map-fields.js / show-products-flag.js).
//
// Stored shape
// ------------
//   cddControlLayoutPresets = {
//     "8x12":  [ { name: "DR FRG standard", rows: ["+..........-", ...],
//                  updatedAt: 1765432100000 }, ... ],
//     "16x24": [ ... ],
//   }
//
// The format key is the grid's own geometry (`rows x cols`), not the well
// count, so a preset can only ever be applied to a grid of exactly the same
// shape — loading a 96-well layout into a 384-well plate is impossible by
// construction rather than by a runtime check.
//
// A row is encoded as ONE CHARACTER PER WELL, using the very values CDD puts in
// its hidden `control_layout[control_states][r][c]` inputs ("+", "-", "#") plus
// "." for an empty well (the input's value is "", which cannot be a character).
// That keeps a 1536-well preset at ~1.5 kB and makes a stored preset readable
// at a glance in the storage inspector.

export const CONTROL_LAYOUT_PRESETS_KEY = "cddControlLayoutPresets";

// Well states — the exact strings CDD writes into the hidden input.
export const STATE_EMPTY = "";
export const STATE_POSITIVE = "+";
export const STATE_NEGATIVE = "-";
export const STATE_REFERENCE = "#";

export const ALL_STATES = [STATE_EMPTY, STATE_POSITIVE, STATE_NEGATIVE, STATE_REFERENCE];

// The stand-in for STATE_EMPTY inside an encoded row string.
const EMPTY_CHAR = ".";

// Generous ceilings — a real user has a handful of layouts per format.
const MAX_PRESETS_PER_FORMAT = 50;
export const MAX_PRESET_NAME_LENGTH = 60;

/* ------------------------------------------------------------------ *
 * Format key + labels
 * ------------------------------------------------------------------ */

export function formatKey(rowCount, colCount) {
    return `${rowCount}x${colCount}`;
}

// "8x12" -> "96-well". Used for the toolbar caption only.
export function formatLabel(rowCount, colCount) {
    return `${rowCount * colCount}-well`;
}

/* ------------------------------------------------------------------ *
 * Encoding
 * ------------------------------------------------------------------ */

function stateToChar(state) {
    return state === STATE_POSITIVE || state === STATE_NEGATIVE || state === STATE_REFERENCE
        ? state
        : EMPTY_CHAR;
}

function charToState(ch) {
    return ch === STATE_POSITIVE || ch === STATE_NEGATIVE || ch === STATE_REFERENCE
        ? ch
        : STATE_EMPTY;
}

// Array<Array<state>> -> Array<string>, one string per grid row.
export function encodeStates(matrix) {
    return (Array.isArray(matrix) ? matrix : []).map((row) =>
        (Array.isArray(row) ? row : []).map(stateToChar).join("")
    );
}

// Array<string> -> Array<Array<state>>. Unknown characters decode to empty, so
// a preset written by a future version can never paint a bogus state.
export function decodeStates(rows) {
    return (Array.isArray(rows) ? rows : []).map((row) =>
        String(row ?? "").split("").map(charToState)
    );
}

/* ------------------------------------------------------------------ *
 * Sanitising — every read goes through this, so a hand-edited or
 * half-written storage value can never reach the painter.
 * ------------------------------------------------------------------ */

export function sanitizePresetName(raw) {
    return String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_PRESET_NAME_LENGTH);
}

function sanitizePresetList(raw) {
    if (!Array.isArray(raw)) return [];

    const out = [];
    const seen = new Set();
    for (const entry of raw) {
        const name = sanitizePresetName(entry?.name);
        if (!name) continue;

        const key = name.toLowerCase();
        if (seen.has(key)) continue;

        const rows = Array.isArray(entry?.rows)
            ? entry.rows.filter((r) => typeof r === "string")
            : [];
        if (!rows.length) continue;

        seen.add(key);
        out.push({
            name,
            rows,
            updatedAt: Number.isFinite(entry?.updatedAt) ? entry.updatedAt : 0,
        });
        if (out.length >= MAX_PRESETS_PER_FORMAT) break;
    }
    return out;
}

export function sanitizePresetMap(raw) {
    if (!raw || typeof raw !== "object") return {};

    const out = {};
    for (const [key, list] of Object.entries(raw)) {
        if (!/^\d+x\d+$/.test(key)) continue;
        const presets = sanitizePresetList(list);
        if (presets.length) out[key] = presets;
    }
    return out;
}

// Presets sort by name so the dropdown reads the same on every page.
function byName(a, b) {
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

/* ------------------------------------------------------------------ *
 * Storage
 * ------------------------------------------------------------------ */

// False once the extension has been reloaded/updated under a page that is still
// open: the content script keeps running (it is ordinary JS on a live page) but
// every chrome.* call throws "Extension context invalidated". `chrome.runtime.id`
// going undefined is the documented way to notice. Callers use it to tell the
// user "reload the page" instead of "could not save", which is what the failure
// actually means.
export function isExtensionContextAlive() {
    try {
        return !!chrome?.runtime?.id;
    } catch {
        return false;
    }
}

export async function getControlLayoutPresets() {
    try {
        const result = await chrome.storage.local.get(CONTROL_LAYOUT_PRESETS_KEY);
        return sanitizePresetMap(result?.[CONTROL_LAYOUT_PRESETS_KEY]);
    } catch {
        // Orphaned content script (extension reloaded under a live page).
        return {};
    }
}

async function saveControlLayoutPresets(map) {
    try {
        await chrome.storage.local.set({
            [CONTROL_LAYOUT_PRESETS_KEY]: sanitizePresetMap(map),
        });
        return true;
    } catch {
        return false;
    }
}

// Presets for one grid geometry, sorted by name.
export async function getPresetsForFormat(key) {
    const map = await getControlLayoutPresets();
    return (map[key] || []).slice().sort(byName);
}

// Create or overwrite by name (case-insensitive). `matrix` is the live grid's
// states; it is encoded here so callers never touch the wire format.
// Returns { ok, reason } — `reason` is "limit" when the format list is full.
export async function savePreset(key, name, matrix) {
    const cleanName = sanitizePresetName(name);
    if (!cleanName) return { ok: false, reason: "name" };

    const map = await getControlLayoutPresets();
    const list = map[key] ? map[key].slice() : [];
    const index = list.findIndex((p) => p.name.toLowerCase() === cleanName.toLowerCase());

    const entry = { name: cleanName, rows: encodeStates(matrix), updatedAt: Date.now() };
    if (index >= 0) list[index] = entry;
    else if (list.length >= MAX_PRESETS_PER_FORMAT) return { ok: false, reason: "limit" };
    else list.push(entry);

    map[key] = list;
    return { ok: await saveControlLayoutPresets(map), reason: "storage" };
}

export async function deletePreset(key, name) {
    const map = await getControlLayoutPresets();
    const list = map[key];
    if (!list) return false;

    const next = list.filter((p) => p.name.toLowerCase() !== String(name).toLowerCase());
    if (next.length === list.length) return false;

    if (next.length) map[key] = next;
    else delete map[key];
    return saveControlLayoutPresets(map);
}

// Fires whenever the preset map changes anywhere (another tab, the options
// page). Returns an unsubscribe function.
export function onControlLayoutPresetsChanged(cb) {
    if (!chrome?.storage?.onChanged) return () => {};

    const listener = (changes, areaName) => {
        if (areaName !== "local" || !changes[CONTROL_LAYOUT_PRESETS_KEY]) return;
        try {
            cb(sanitizePresetMap(changes[CONTROL_LAYOUT_PRESETS_KEY].newValue));
        } catch {
            /* a misbehaving listener must not break storage handling */
        }
    };

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
}
