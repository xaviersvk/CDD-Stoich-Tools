// content/api/molecule-samples.js — every sample of a molecule, depleted ones
// included, with how much each has been used.
//
//   GET /vaults/<v>/molecules/<m>/inventory_samples.json?include_depleted=true
//   → { inventory_samples: [{ id, sample_identifier, batch_name, depleted,
//        current_amount, units, location, fields, batch_fields,
//        inventory_events: [{ fields: { Debit, Credit }, created_at }] }], … }
//
// One request per molecule (~15 kB for a molecule with a dozen events),
// promise-cached for the page so the prefetch, the picker and the panel's
// sample enrichment share it. Failures are not cached: the next ask retries.

const rawCache = new Map(); // `${vaultId}:${moleculeId}` → Promise<object[]>
const cache = new Map();    // `${vaultId}:${moleculeId}` → Promise<SampleInfo[]>
const settled = new Map();  // `${vaultId}:${moleculeId}` → object[], once loaded

function summarize(sample) {
    const debits = (sample.inventory_events || [])
        .filter((e) => Number(e?.fields?.Debit) > 0);
    const lastDebit = debits
        .map((e) => e.created_at || "")
        .sort()
        .pop() || null;
    return {
        identifier: String(sample.sample_identifier || "").trim(),
        batchName: String(sample.batch_name ?? sample.batch?.name ?? "").trim(),
        depleted: sample.depleted === true,
        debitCount: debits.length,
        lastDebit,
        amount: sample.current_amount ?? null,
        units: sample.units ?? "",
    };
}

function summarizeAll(rawSamples) {
    return (rawSamples || []).map(summarize).filter((s) => s.identifier);
}

// → Promise<object[]>: the samples exactly as CDD serves them.
export function getRawMoleculeSamples(vaultId, moleculeId) {
    const key = `${vaultId}:${moleculeId}`;
    if (!rawCache.has(key)) {
        const url = `/vaults/${vaultId}/molecules/${moleculeId}/inventory_samples.json?include_depleted=true`;
        const promise = fetch(url, {
            credentials: "include",
            headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
        })
            .then((res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
                return res.json();
            })
            .then((json) => {
                const list = Array.isArray(json?.inventory_samples) ? json.inventory_samples : [];
                settled.set(key, list);
                return list;
            })
            .catch((error) => {
                rawCache.delete(key);
                cache.delete(key);
                throw error;
            });
        rawCache.set(key, promise);
    }
    return rawCache.get(key);
}

// → Promise<[{ identifier, batchName, depleted, debitCount, lastDebit,
//              amount, units }]>
export function getMoleculeSamples(vaultId, moleculeId) {
    const key = `${vaultId}:${moleculeId}`;
    if (!cache.has(key)) {
        cache.set(key, getRawMoleculeSamples(vaultId, moleculeId).then(summarizeAll));
    }
    return cache.get(key);
}

// CDD fetched the same list itself (seen by the page hook): take it as ours.
export function seedMoleculeSamples(vaultId, moleculeId, rawSamples) {
    const key = `${vaultId}:${moleculeId}`;
    const samples = summarizeAll(rawSamples);
    const list = Array.isArray(rawSamples) ? rawSamples : [];
    settled.set(key, list);
    rawCache.set(key, Promise.resolve(list));
    cache.set(key, Promise.resolve(samples));
    return samples;
}

// The list if it has already arrived, else null — for callers that must
// decide before the next render and cannot wait on a promise.
export function peekRawMoleculeSamples(vaultId, moleculeId) {
    return settled.get(`${vaultId}:${moleculeId}`) || null;
}

export function clearMoleculeSamples() {
    settled.clear();
    rawCache.clear();
    cache.clear();
}
