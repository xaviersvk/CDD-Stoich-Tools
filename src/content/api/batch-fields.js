// content/api/batch-fields.js
//
// Resolves a molecule's batch field values (plus its synonym) for the heat-map
// well tooltip. The displayed batch table on a molecule page is rendered
// client-side by React, so a plain fetch never yields its cells — but the raw
// HTML carries everything in the RegistrationFormRenderer components'
// `react_props`: `batch_field_definitions` (field id -> label) and `data` (the
// batch's values). We join the two here.
//
// Same contract as molecule-image.js: one fetch per (vault, molecule) per
// session, the Promise is cached (failures included), so hover bursts and
// neighbour prefetches never re-request.

import { extractSynonym } from "./molecule-image.js";

const LOG_PREFIX = "[CDD plate plugin]";

// cacheKey (`${vaultId}:${moleculeId}`) -> Promise<{ synonym, batches }>
const cache = new Map();

const EMPTY = { synonym: null, batches: [] };

// One RegistrationFormRenderer per SAVED batch (resource_type "batch" with an
// object_id; the blank new-batch form has object_id null). Every vault field
// is kept, valued or not, so a configured field can render as "—" rather than
// silently vanish. The batch-name field ("001") names the batch instead.
function extractBatches(doc) {
    const batches = [];

    for (const el of doc.querySelectorAll('[component_class="RegistrationFormRenderer"]')) {
        let props;
        try {
            props = JSON.parse(el.getAttribute("react_props") || "");
        } catch {
            continue;
        }
        if (props?.resource_type !== "batch" || props.object_id == null) continue;

        const values = new Map();
        for (const entry of Object.values(props.data || {})) {
            if (!entry || entry.batch_field_definition_id == null) continue;
            const value =
                entry.text_value ??
                entry.date_value ??
                (entry.float_value != null ? String(entry.float_value) : null);
            if (value != null && value !== "") {
                values.set(entry.batch_field_definition_id, String(value));
            }
        }

        let name = null;
        const fields = [];
        const defs = Array.isArray(props.batch_field_definitions)
            ? props.batch_field_definitions
            : [];
        for (const def of defs) {
            if (!def || typeof def.name !== "string") continue;
            const value = values.get(def.id) ?? "";
            if (def.is_batch_name_field) {
                name = value || null;
                continue;
            }
            fields.push({ label: def.name, value });
        }

        batches.push({ batchId: props.object_id, name, fields });
    }

    return batches;
}

async function fetchBatchFieldData(vaultId, moleculeId) {
    try {
        const res = await fetch(`/vaults/${vaultId}/molecules/${moleculeId}`, {
            credentials: "include",
        });
        if (!res.ok) {
            console.warn(`${LOG_PREFIX} molecule page request failed`, {
                vaultId,
                moleculeId,
                httpStatus: res.status,
            });
            return EMPTY;
        }

        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, "text/html");

        return { synonym: extractSynonym(doc), batches: extractBatches(doc) };
    } catch (err) {
        console.warn(`${LOG_PREFIX} failed to load batch fields`, {
            vaultId,
            moleculeId,
            error: err?.message || String(err),
        });
        return EMPTY;
    }
}

// Public API: cached Promise<{ synonym, batches }>. Safe to call on every
// hover — at most one fetch per (vault, molecule) per session.
export function getBatchFieldData(vaultId, moleculeId) {
    if (!vaultId || moleculeId == null || moleculeId === "") {
        return Promise.resolve(EMPTY);
    }

    const cacheKey = `${vaultId}:${moleculeId}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const promise = fetchBatchFieldData(vaultId, moleculeId);
    cache.set(cacheKey, promise);
    return promise;
}

function scheduleIdle(fn) {
    if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(fn, { timeout: 2000 });
    } else {
        setTimeout(fn, 200);
    }
}

// Pre-warm the cache for the wells around the hovered one so sweeping the
// mouse across a heat map feels instant. Runs on idle with a small concurrency
// cap; already-cached molecules are skipped, so repeated calls are cheap.
export function prefetchBatchFieldData(targets, { concurrency = 2 } = {}) {
    if (!Array.isArray(targets)) return;

    const queue = [];
    const queued = new Set();
    for (const target of targets) {
        const vaultId = target?.vaultId;
        const moleculeId = target?.moleculeId;
        if (!vaultId || moleculeId == null) continue;
        const cacheKey = `${vaultId}:${moleculeId}`;
        if (cache.has(cacheKey) || queued.has(cacheKey)) continue;
        queued.add(cacheKey);
        queue.push({ vaultId, moleculeId });
    }

    if (!queue.length) return;

    let active = 0;
    const pump = () => {
        while (active < concurrency && queue.length) {
            const { vaultId, moleculeId } = queue.shift();
            active += 1;
            getBatchFieldData(vaultId, moleculeId).finally(() => {
                active -= 1;
                if (queue.length) scheduleIdle(pump);
            });
        }
    };

    scheduleIdle(pump);
}
