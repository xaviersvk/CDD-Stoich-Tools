// content/api/molecule-samples.js — every sample of a molecule, depleted ones
// included, with how much each has been used.
//
//   GET /vaults/<v>/molecules/<m>/inventory_samples.json?include_depleted=true
//   → { inventory_samples: [{ sample_identifier, batch_name, depleted,
//        current_amount, units, inventory_events: [{ fields: { Debit, Credit },
//        created_at }] }], … }
//
// One request per molecule (~15 kB for a molecule with a dozen events),
// promise-cached for the page so the prefetch and the picker share it.
// Failures are not cached: the next ask retries.

const cache = new Map(); // `${vaultId}:${moleculeId}` → Promise<SampleInfo[]>

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

// → Promise<[{ identifier, batchName, depleted, debitCount, lastDebit,
//              amount, units }]>
export function getMoleculeSamples(vaultId, moleculeId) {
    const key = `${vaultId}:${moleculeId}`;
    if (!cache.has(key)) {
        const url = `/vaults/${vaultId}/molecules/${moleculeId}/inventory_samples.json?include_depleted=true`;
        const promise = fetch(url, {
            credentials: "include",
            headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
        })
            .then((res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
                return res.json();
            })
            .then((json) => (json?.inventory_samples || []).map(summarize).filter((s) => s.identifier))
            .catch((error) => {
                cache.delete(key);
                throw error;
            });
        cache.set(key, promise);
    }
    return cache.get(key);
}

// CDD fetched the same list itself (seen by the page hook): take it as ours.
export function seedMoleculeSamples(vaultId, moleculeId, rawSamples) {
    const samples = (rawSamples || []).map(summarize).filter((s) => s.identifier);
    cache.set(`${vaultId}:${moleculeId}`, Promise.resolve(samples));
    return samples;
}

export function clearMoleculeSamples() {
    cache.clear();
}
