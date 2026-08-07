// shared/density-memory.js
//
// SINGLE SOURCE OF TRUTH for "molecule batch → remembered density".
//
// Imported by BOTH execution contexts, like prefix-colors.js:
//   - the content script  → captures typed densities, offers them for fill
//   - the options page    → lists and deletes remembered entries
//
// Keep this file free of DOM access and of imports from other modules.
//
// A remembered density is a fallback for batches whose registration record
// has no density field value. The batch field is always authoritative: as
// soon as a parse shows the batch itself carries a density, the remembered
// entry is deleted.

export const DENSITY_MEMORY_STORAGE_KEY = "cddDensityMemoryV1";
export const DENSITY_MEMORY_LIMIT = 100;

// The value fields a batch entry can remember. concentrationUnits is a
// ride-along of concentration, not a value of its own.
export const VALUE_FIELDS = ["density", "purity", "concentration"];

// Normalise an arbitrary stored value into a clean map
// Record<batchId, {density?, purity?, concentration?, concentrationUnits?,
// name, savedAt, lastUsedAt}>. Used on every read AND write so neither
// context ever trusts raw storage. Entries written by 12.4.0 (density
// only) sanitize into the same shape. Pure.
export function sanitizeDensityMemory(raw) {
    const out = {};
    if (!raw || typeof raw !== "object") return out;

    for (const [key, entry] of Object.entries(raw)) {
        const id = String(key).trim();
        if (!/^\d+$/.test(id)) continue;
        if (!entry || typeof entry !== "object") continue;

        const clean = {};
        for (const field of VALUE_FIELDS) {
            if (typeof entry[field] === "string" && entry[field].trim()) {
                clean[field] = entry[field].trim();
            }
        }
        if (!Object.keys(clean).length) continue;

        if (clean.concentration && typeof entry.concentrationUnits === "string"
            && entry.concentrationUnits.trim()) {
            clean.concentrationUnits = entry.concentrationUnits.trim();
        }

        out[id] = {
            ...clean,
            name: typeof entry.name === "string" ? entry.name.trim() : "",
            savedAt: Number.isFinite(entry.savedAt) ? entry.savedAt : 0,
            lastUsedAt: Number.isFinite(entry.lastUsedAt) ? entry.lastUsedAt : 0,
        };
    }

    return out;
}

export async function loadDensityMemory() {
    try {
        const result = await chrome.storage.local.get(DENSITY_MEMORY_STORAGE_KEY);
        return sanitizeDensityMemory(result?.[DENSITY_MEMORY_STORAGE_KEY]);
    } catch {
        return {};
    }
}

export async function saveDensityMemory(map) {
    await chrome.storage.local.set({
        [DENSITY_MEMORY_STORAGE_KEY]: sanitizeDensityMemory(map),
    });
}

/* ------------------------------------------------------------------ *
 * In-memory cache (sync) — content-script render passes cannot await
 * chrome.storage, so the map lives in module scope and refreshes on
 * every storage change (which is also how options-page edits propagate
 * live to the panel).
 * ------------------------------------------------------------------ */

let cachedMemory = {};
let cacheLoaded = false;
let listenerAttached = false;
let persistScheduled = false;
const changeListeners = new Set();

function notifyChange() {
    for (const cb of changeListeners) {
        try {
            cb(cachedMemory);
        } catch {
            /* a misbehaving listener must not break the others */
        }
    }
}

// Debounced write-back (coalesces the burst of captures on first render).
function schedulePersist() {
    if (persistScheduled) return;
    persistScheduled = true;
    setTimeout(() => {
        persistScheduled = false;
        saveDensityMemory(cachedMemory);
    }, 250);
}

export function getRememberedValues(batchId) {
    return cachedMemory[String(batchId)] || null;
}

// Merge-upsert. `values` may hold any of VALUE_FIELDS plus
// concentrationUnits. Persists ONLY when something actually changed —
// repeated renders of an unchanged page never churn chrome.storage.
//
// Deliberately does NOT call notifyChange(): capture runs inside a render
// pass, and a synchronous notification would re-enter the renderer and
// duplicate cards. Subscribers are notified by the chrome.storage.onChanged
// listener instead, which fires asynchronously (in the writing context too)
// after the debounced persist.
export function rememberValues(batchId, values, name) {
    if (!cacheLoaded) return;

    const id = String(batchId ?? "").trim();
    if (!/^\d+$/.test(id)) return;

    const existing = cachedMemory[id];
    const label = String(name ?? "").trim();
    const merged = { ...(existing || {}) };
    let changed = !existing || existing.name !== label;
    merged.name = label;

    for (const field of VALUE_FIELDS) {
        const value = values?.[field] != null ? String(values[field]).trim() : "";
        if (!value || merged[field] === value) continue;
        merged[field] = value;
        changed = true;
    }
    const units = values?.concentrationUnits != null
        ? String(values.concentrationUnits).trim() : "";
    if (units && merged.concentrationUnits !== units) {
        merged.concentrationUnits = units;
        changed = true;
    }
    if (!changed) return;

    const now = Date.now();
    merged.savedAt = existing?.savedAt || now;
    merged.lastUsedAt = now;

    // Over the cap: evict the entry with the oldest lastUsedAt (never the
    // one just written).
    const next = { ...cachedMemory, [id]: merged };
    const keys = Object.keys(next);
    if (keys.length > DENSITY_MEMORY_LIMIT) {
        let oldestKey = null;
        let oldestAt = Infinity;
        for (const key of keys) {
            if (key === id) continue;
            if (next[key].lastUsedAt < oldestAt) {
                oldestAt = next[key].lastUsedAt;
                oldestKey = key;
            }
        }
        if (oldestKey) delete next[oldestKey];
    }

    cachedMemory = next;
    schedulePersist();
}

// Remove the listed fields from a batch entry; the entry disappears with
// its last value. Same no-notify rule as rememberValues (see above).
export function forgetValues(batchId, fields) {
    if (!cacheLoaded) return;

    const id = String(batchId ?? "").trim();
    const existing = cachedMemory[id];
    if (!existing) return;

    const nextEntry = { ...existing };
    let changed = false;
    for (const field of fields) {
        if (nextEntry[field] == null) continue;
        delete nextEntry[field];
        if (field === "concentration") delete nextEntry.concentrationUnits;
        changed = true;
    }
    if (!changed) return;

    const next = { ...cachedMemory };
    if (VALUE_FIELDS.some((f) => nextEntry[f] != null)) next[id] = nextEntry;
    else delete next[id];
    cachedMemory = next;
    schedulePersist();
}

// A successful fill from memory refreshes the entry's LRU stamp.
export function touchValueUsed(batchId) {
    if (!cacheLoaded) return;

    const entry = cachedMemory[String(batchId)];
    if (!entry) return;

    cachedMemory = {
        ...cachedMemory,
        [String(batchId)]: { ...entry, lastUsedAt: Date.now() },
    };
    schedulePersist();
}

export async function clearDensityMemory() {
    cachedMemory = {};
    await saveDensityMemory({});
    // Subscribers hear about it via chrome.storage.onChanged.
}

/**
 * captureValuesFromSamples(samples) — THE capture rule, run after every
 * payload parse / enrichment re-render. Per row with a batchId, per field:
 *
 *   - the authoritative value present → forget the stored copy of that
 *     field (the record is authoritative and the slot is freed);
 *   - else a user-typed table value present → remember it.
 *
 * Density and purity are authoritative on the BATCH record, so batch-only
 * rows wait for enrichment (batchFieldsEnriched) — otherwise we would
 * briefly remember a value that IS on the batch, just not fetched yet.
 * Rows with a sample carry their batch fields from the payload itself.
 * Concentration is authoritative on the SAMPLE, which is in the payload
 * directly — no gate needed.
 *
 * All writes funnel through rememberValues/forgetValues, which no-op on
 * unchanged data — calling this on every render is safe.
 */
export function captureValuesFromSamples(samples) {
    if (!cacheLoaded || !Array.isArray(samples)) return;

    const has = (v) => v != null && String(v).trim() !== "";

    for (const sample of samples) {
        if (!sample?.batchId) continue;

        const gate = sample.hasSample !== false || sample.batchFieldsEnriched === true;
        const toForget = [];
        const toRemember = {};

        if (has(sample.density)) toForget.push("density");
        else if (has(sample.tableDensity) && gate) toRemember.density = String(sample.tableDensity);

        if (has(sample.purity)) toForget.push("purity");
        else if (has(sample.tablePurity) && gate) toRemember.purity = String(sample.tablePurity);

        if (has(sample.concentration)) toForget.push("concentration");
        else if (has(sample.tableConcentration)) {
            toRemember.concentration = String(sample.tableConcentration);
            if (has(sample.tableConcentrationUnits)) {
                toRemember.concentrationUnits = String(sample.tableConcentrationUnits);
            }
        }

        if (toForget.length) forgetValues(sample.batchId, toForget);
        if (Object.keys(toRemember).length) {
            rememberValues(sample.batchId, toRemember, sample.name);
        }
    }
}

export function onDensityMemoryChanged(cb) {
    changeListeners.add(cb);
    return () => changeListeners.delete(cb);
}

/**
 * initDensityMemory() — call once at startup (content script AND options
 * page). Attaches a one-time chrome.storage.onChanged listener, loads the
 * map into the cache, notifies subscribers. Idempotent.
 */
export async function initDensityMemory() {
    if (!listenerAttached && chrome?.storage?.onChanged) {
        listenerAttached = true;
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== "local" || !changes[DENSITY_MEMORY_STORAGE_KEY]) return;
            cachedMemory = sanitizeDensityMemory(
                changes[DENSITY_MEMORY_STORAGE_KEY].newValue
            );
            notifyChange();
        });
    }

    cachedMemory = await loadDensityMemory();
    cacheLoaded = true;
    notifyChange();
    return cachedMemory;
}
