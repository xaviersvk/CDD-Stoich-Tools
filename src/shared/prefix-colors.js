// shared/prefix-colors.js
//
// SINGLE SOURCE OF TRUTH for "Sample ID prefix -> colour".
//
// Imported by BOTH execution contexts, exactly like sample-panel-fields.js:
//   - the content script (bundled by vite)            -> reads colours while
//                                                         augmenting tooltips/panel
//   - the popup (loaded as an ES module from dist/)    -> edits the colour map
//
// Keep this file free of DOM access and of imports from other modules so the
// very same source can run verbatim in both contexts. The ONLY parsing of a
// Sample ID prefix in the whole project lives here (extractPrefix); every
// visualization must call getColorForSampleId() instead of slicing strings.

/* ------------------------------------------------------------------ *
 * Storage contract
 * ------------------------------------------------------------------ */

// chrome.storage.local key holding the user's map. The stored value is a plain
// object Record<prefix, hexColor>, e.g. { "IXX-DEMO": "#1976d2", "PHA-0334477": "#43a047" }.
// A plain object (not an Array) is deliberate: lookup is O(1) and the shape is
// trivially extendable later (e.g. { color, icon, label } per prefix) without a
// migration of existing keys.
export const PREFIX_COLORS_STORAGE_KEY = "cddPrefixColors";

// Hard cap on stored prefixes. Prevents unbounded chrome.storage growth from
// large vaults with many unique Sample ID series. When the cap is hit, new
// auto-discovered prefixes are silently ignored (user-added ones in the popup
// are still accepted up to this limit via sanitizePrefixColorMap).
export const MAX_PREFIX_COUNT = 40;

/* ------------------------------------------------------------------ *
 * Prefix parsing — the ONE place that defines what a "prefix" is
 * ------------------------------------------------------------------ */

// How many trailing dash-segments to strip, counting from the right.
//   IXX-CL-0000002-001-SM003035  →  IXX-CL  (3rd dash from right)
//   PHA-0265229-001-S001095       →  PHA     (3rd dash from right)
const PREFIX_DASH_INDEX = 3;

/**
 * extractPrefix(sampleId) — pure BUSINESS logic, no UI, no storage.
 *
 * Input : a Sample ID string, e.g. "IXX-CL-0000002-001-SM003035".
 * Output: everything before the PREFIX_DASH_INDEX-th dash from the RIGHT,
 *         or null when the id is not a string, is blank, or has fewer dashes
 *         than PREFIX_DASH_INDEX.
 *
 * Called by: getColorForSampleId() below, and (indirectly) every visualization.
 * Nobody should re-implement this; that is the whole point of the module.
 */
export function extractPrefix(sampleId) {
    if (typeof sampleId !== "string") return null;

    const trimmed = sampleId.trim();
    if (!trimmed) return null;

    // Walk from right; cut at the PREFIX_DASH_INDEX-th dash from the end.
    let cut = -1;
    let seen = 0;
    for (let i = trimmed.length - 1; i >= 0; i -= 1) {
        if (trimmed[i] !== "-") continue;
        seen += 1;
        if (seen === PREFIX_DASH_INDEX) {
            cut = i;
            break;
        }
    }

    if (cut <= 0) return null;

    return trimmed.slice(0, cut);
}

/* ------------------------------------------------------------------ *
 * Colour validation / sanitisation
 * ------------------------------------------------------------------ */

// Accept the formats a native <input type="color"> and hand-typed values use:
// #rgb, #rrggbb, #rrggbbaa.
const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function isValidHexColor(value) {
    return typeof value === "string" && HEX_COLOR_RE.test(value.trim());
}

// Normalise an arbitrary stored value into a clean Record<prefix, hexColor|"">.
// Used on every read AND write so neither the content script nor the popup ever
// has to trust raw storage. Pure.
//
// IMPORTANT: a prefix with no (valid) colour is KEPT with an empty string ""
// rather than dropped. This is what lets auto-DISCOVERED prefixes persist and
// show up in the popup while waiting for the user to assign a colour — we never
// pick a colour for them. An "" colour means "known prefix, no colour yet" and
// getColorForSampleId() treats it as a fallback (no tint).
export function sanitizePrefixColorMap(raw) {
    const out = {};
    if (!raw || typeof raw !== "object") return out;

    for (const [prefix, color] of Object.entries(raw)) {
        if (typeof prefix !== "string") continue;
        const key = prefix.trim();
        if (!key) continue;
        out[key] = isValidHexColor(color) ? color.trim() : "";
    }

    return pruneToMaxPrefixes(out);
}

// Prune a sanitised map to at most MAX_PREFIX_COUNT entries.
// Priority: (1) prefixes with a valid hex colour, (2) prefixes without a colour.
// Both groups are sorted alphabetically so the result is stable across runs.
function pruneToMaxPrefixes(map) {
    if (Object.keys(map).length <= MAX_PREFIX_COUNT) return map;

    const colored = [];
    const uncolored = [];
    for (const [prefix, color] of Object.entries(map)) {
        (isValidHexColor(color) ? colored : uncolored).push(prefix);
    }
    colored.sort();
    uncolored.sort();

    const kept = [...colored, ...uncolored].slice(0, MAX_PREFIX_COUNT);
    const pruned = {};
    for (const prefix of kept) pruned[prefix] = map[prefix];
    return pruned;
}

/* ------------------------------------------------------------------ *
 * Storage access (async) — used directly by the popup
 * ------------------------------------------------------------------ */

/**
 * getPrefixColorMap() — INFRASTRUCTURE. Reads the saved map from
 * chrome.storage.local and returns a sanitised Record<prefix, hexColor>.
 * Returns {} on any error or when nothing has been saved yet.
 *
 * Called by: the popup (to render the editor) and initPrefixColorCache() below.
 */
export async function getPrefixColorMap() {
    try {
        const result = await chrome.storage.local.get(PREFIX_COLORS_STORAGE_KEY);
        return sanitizePrefixColorMap(result?.[PREFIX_COLORS_STORAGE_KEY]);
    } catch {
        return {};
    }
}

/**
 * savePrefixColorMap(map) — INFRASTRUCTURE. Persists a sanitised copy of `map`.
 * Writing fires chrome.storage.onChanged in every context (including the content
 * script), which is how a popup edit propagates live to the page — see
 * initPrefixColorCache().
 *
 * Called by: the popup whenever the user adds/edits/deletes a prefix.
 */
export async function savePrefixColorMap(map) {
    await chrome.storage.local.set({
        [PREFIX_COLORS_STORAGE_KEY]: sanitizePrefixColorMap(map),
    });
}

/* ------------------------------------------------------------------ *
 * In-memory cache (sync) — used by the content-script visualizations
 *
 * Why a cache? Hover/render handlers are SYNCHRONOUS — a mouseover cannot await
 * chrome.storage on every event. So we read the map once, keep it in module
 * scope, and refresh it whenever storage changes. Because the content bundle is
 * a single module instance (vite inlines all dynamic imports), this cache is
 * shared by every feature that imports this file.
 * ------------------------------------------------------------------ */

let cachedMap = {};
let cacheLoaded = false;
let listenerAttached = false;
const changeListeners = new Set();

// Prefixes we've already ensured are stored, so repeated sightings of the same
// prefix never re-write storage. Lives for the page session.
const seenPrefixes = new Set();
let persistScheduled = false;

function notifyChange() {
    for (const cb of changeListeners) {
        try {
            cb(cachedMap);
        } catch {
            /* a misbehaving listener must not break the others */
        }
    }
}

/**
 * getColorForSampleId(sampleId) — the API every visualization calls.
 *
 * Pipeline: extractPrefix(sampleId) -> O(1) lookup in the cached map -> colour.
 * Returns the configured hex colour, or null when there is no prefix or no
 * mapping for it (caller then keeps the existing/default appearance).
 *
 * SYNCHRONOUS by design (reads the in-memory cache), so it is safe to call from
 * a mouseover handler or a render pass. Business logic, not UI.
 */
export function getColorForSampleId(sampleId) {
    const prefix = extractPrefix(sampleId);
    if (prefix == null) return null;

    const color = cachedMap[prefix];
    return isValidHexColor(color) ? color : null;
}

// Synchronous snapshot of the current map (e.g. for the popup-less content side
// to inspect). Returns the live object; treat as read-only.
export function getCachedPrefixColorMap() {
    return cachedMap;
}

// Debounced write of the whole cache back to storage (coalesces the burst of
// discoveries that happens when a page first renders).
function schedulePersist() {
    if (persistScheduled) return;
    persistScheduled = true;
    setTimeout(() => {
        persistScheduled = false;
        savePrefixColorMap(cachedMap);
    }, 250);
}

/**
 * recordSampleIdPrefix(sampleId) — AUTO-DISCOVERY (business logic).
 *
 * Called by every visualization as it renders a Sample ID. If the id yields a
 * prefix we have never stored, we add it to the map with NO colour ("") and
 * persist, so it shows up in the popup for the user to colour. We deliberately
 * never choose a colour — that is the user's job.
 *
 * No-ops until the cache has loaded (so we can't clobber saved colours with a
 * half-empty map) and after the first sighting of each prefix (cheap Set guard).
 */
export function recordSampleIdPrefix(sampleId) {
    if (!cacheLoaded) return;

    const prefix = extractPrefix(sampleId);
    if (prefix == null || seenPrefixes.has(prefix)) return;
    seenPrefixes.add(prefix);

    // Already known (with or without a colour): leave it exactly as the user
    // left it. This is the "don't change an existing prefix's colour" rule.
    if (Object.prototype.hasOwnProperty.call(cachedMap, prefix)) return;

    // Respect the hard cap — never auto-discover beyond MAX_PREFIX_COUNT.
    if (Object.keys(cachedMap).length >= MAX_PREFIX_COUNT) return;

    cachedMap = { ...cachedMap, [prefix]: "" };
    schedulePersist();
}

/**
 * onPrefixColorsChanged(cb) — subscribe to map changes. The callback runs after
 * initial load AND on every later storage change (i.e. after a popup edit), so a
 * feature can re-paint already-rendered elements. Returns an unsubscribe fn.
 *
 * This is the "reactivity" of a plain extension: chrome.storage.onChanged is the
 * event source; this Set of callbacks is our tiny dispatcher.
 */
export function onPrefixColorsChanged(cb) {
    changeListeners.add(cb);
    return () => changeListeners.delete(cb);
}

/**
 * initPrefixColorCache() — INFRASTRUCTURE. Call once from the content script at
 * startup. It:
 *   1. attaches a one-time chrome.storage.onChanged listener that refreshes the
 *      cache and notifies subscribers when the map changes in any context;
 *   2. loads the current map into the cache and notifies subscribers.
 *
 * Idempotent: the global listener is only ever attached once; repeated calls
 * just re-read storage. Returns the loaded map.
 */
export async function initPrefixColorCache() {
    if (!listenerAttached && chrome?.storage?.onChanged) {
        listenerAttached = true;
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== "local" || !changes[PREFIX_COLORS_STORAGE_KEY]) return;
            cachedMap = sanitizePrefixColorMap(
                changes[PREFIX_COLORS_STORAGE_KEY].newValue
            );
            notifyChange();
        });
    }

    cachedMap = await getPrefixColorMap();
    cacheLoaded = true;
    notifyChange();
    return cachedMap;
}
