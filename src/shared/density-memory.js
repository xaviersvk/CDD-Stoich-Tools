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

// Normalise an arbitrary stored value into a clean map
// Record<batchId, {density, name, savedAt, lastUsedAt}>. Used on every read
// AND write so neither context ever trusts raw storage. Pure.
export function sanitizeDensityMemory(raw) {
    const out = {};
    if (!raw || typeof raw !== "object") return out;

    for (const [key, entry] of Object.entries(raw)) {
        const id = String(key).trim();
        if (!/^\d+$/.test(id)) continue;
        if (!entry || typeof entry !== "object") continue;

        const density = typeof entry.density === "string" ? entry.density.trim() : "";
        if (!density) continue;

        out[id] = {
            density,
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

export function getRememberedDensity(batchId) {
    const entry = cachedMemory[String(batchId)];
    return entry || null;
}

// Upsert. Writes storage ONLY when density or name actually changed, so
// repeated renders of an unchanged page never churn chrome.storage.
//
// Deliberately does NOT call notifyChange(): capture runs inside a render
// pass, and a synchronous notification would re-enter the renderer and
// duplicate cards. Subscribers are notified by the chrome.storage.onChanged
// listener instead, which fires asynchronously (in the writing context too)
// after the debounced persist.
export function rememberDensity(batchId, density, name) {
    if (!cacheLoaded) return;

    const id = String(batchId ?? "").trim();
    const value = String(density ?? "").trim();
    if (!/^\d+$/.test(id) || !value) return;

    const label = String(name ?? "").trim();
    const existing = cachedMemory[id];
    if (existing && existing.density === value && existing.name === label) return;

    const now = Date.now();
    const next = {
        ...cachedMemory,
        [id]: {
            density: value,
            name: label,
            savedAt: existing?.savedAt || now,
            lastUsedAt: now,
        },
    };

    // Over the cap: evict the entry with the oldest lastUsedAt (never the
    // one just written).
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

// Same no-notify rule as rememberDensity (see above).
export function forgetDensity(batchId) {
    if (!cacheLoaded) return;

    const id = String(batchId ?? "").trim();
    if (!Object.prototype.hasOwnProperty.call(cachedMemory, id)) return;

    const next = { ...cachedMemory };
    delete next[id];
    cachedMemory = next;
    schedulePersist();
}

// A successful fill from memory refreshes the entry's LRU stamp.
export function touchDensityUsed(batchId) {
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
 * captureDensitiesFromSamples(samples) — THE capture rule, run after every
 * payload parse / enrichment re-render. For each row with a batchId:
 *
 *   - batch-field density present → forget the remembered entry (the batch
 *     record is authoritative and the slot is freed);
 *   - else a user-typed table density present → remember it — but for
 *     batch-only rows only AFTER enrichment has run (batchFieldsEnriched),
 *     otherwise we would briefly remember a density that IS on the batch,
 *     just not fetched yet. Rows with a sample carry their batch fields
 *     from the payload itself, so they capture immediately.
 *
 * All writes funnel through rememberDensity/forgetDensity, which no-op on
 * unchanged data — calling this on every render is safe.
 */
export function captureDensitiesFromSamples(samples) {
    if (!cacheLoaded || !Array.isArray(samples)) return;

    for (const sample of samples) {
        if (!sample?.batchId) continue;

        const batchDensity =
            sample.density != null && String(sample.density).trim() !== "";
        const tableDensity =
            sample.tableDensity != null && String(sample.tableDensity).trim() !== "";

        if (batchDensity) {
            forgetDensity(sample.batchId);
        } else if (
            tableDensity &&
            (sample.hasSample !== false || sample.batchFieldsEnriched === true)
        ) {
            rememberDensity(sample.batchId, String(sample.tableDensity), sample.name);
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
