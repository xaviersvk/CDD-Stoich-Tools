// content/features/inventory-sample-enrichment.js
//
// Rows WITH an inventory sample get their sample from the source, not from
// the entry.
//
// Since CDD's 2026-09 update the entry payload carries only a stripped copy
// of each row's sample. Measured on entry 1000000814: older rows arrive with
// `batch_fields: {}`, `location: { value: null }` and sample fields holding
// nothing but "Sample ID", while a row added later still has everything. The
// panel showed full cards for a moment (the last row) and then bare names.
//
// So the panel does not rely on what the entry happens to carry. It asks
// `/vaults/<v>/molecules/<m>/inventory_samples.json` — the list CDD's own
// sample picker loads — finds the row's sample by id, and resolves location,
// batch fields and sample fields from that. One request per molecule, cached
// for the page and shared with the sample picker hints.
//
// Batch-only rows and products without a sample are batch-field-enrichment's.

import { STATE } from "../state.js";
import {
    resolveBatchFields,
    resolveSampleFields,
    resolveIdentityFields,
    resolveRowLocation,
    collectCustomFields,
    getBatchFields,
    getSampleFields,
} from "../../inject/parsers/field-resolvers.js";
import { getRawMoleculeSamples, peekRawMoleculeSamples } from "../api/molecule-samples.js";

function getVaultId() {
    return location.pathname.match(/\/vaults\/(\d+)/)?.[1] || null;
}

// Copy a value in only when the fetched sample has one: an empty server
// field must not wipe what the entry did carry.
function assign(sample, key, value) {
    if (value != null && value !== "") sample[key] = value;
}

function applyInventorySample(sample, inventorySample) {
    const row = { sample: inventorySample };

    assign(sample, "location", resolveRowLocation(row));

    const batch = resolveBatchFields(row);
    assign(sample, "purity", batch.purity);
    assign(sample, "density", batch.density);
    assign(sample, "internalID", batch.internalID);

    const fields = resolveSampleFields(row);
    assign(sample, "concentration", fields.concentration);
    assign(sample, "concentrationUnits", fields.concentrationUnits);
    assign(sample, "solvent", fields.solvent);

    const identity = resolveIdentityFields(row);
    assign(sample, "vendorId", identity.vendorId);
    assign(sample, "project", identity.project);
    assign(sample, "owner", identity.owner);

    // Replaced, not merged: the stripped copy spells the same field
    // differently ("Sample ID" where the sample says "*Sample ID"), and a
    // merge would show it twice.
    sample.customBatchFields = collectCustomFields(getBatchFields(row));
    sample.customSampleFields = collectCustomFields(getSampleFields(row));

    sample.inventorySampleEnriched = true;
}

function findSample(list, sample) {
    return list.find((s) => String(s?.id) === String(sample.sampleId)) || null;
}

// Called when a SAMPLE_DATA payload lands in STATE, BEFORE it is rendered.
// CDD sends the entry several times (load, then every save) and each copy
// brings fresh stripped samples. Samples whose molecule list has already
// arrived are filled in here synchronously, so the render never shows bare
// cards between two full ones; only the rest wait for a request.
//
// → null when nothing is left to load, else Promise<boolean> (did any card
// change). The caller renders; this module never does, so a card is drawn
// once, full, instead of bare first.
export function enrichInventorySamples(samples = STATE.lastPayload?.samples) {
    if (!Array.isArray(samples) || !samples.length) return;

    const pageVault = getVaultId();
    if (!pageVault) return;

    // `${vault}:${molecule}` → { vaultId, moleculeId, targets }
    const byMolecule = new Map();

    for (const sample of samples) {
        if (!sample?.hasSample || sample.inventorySampleEnriched) continue;
        if (sample.sampleId == null || sample.moleculeId == null) continue;

        const vaultId = sample.sampleVaultId || pageVault;

        const loaded = peekRawMoleculeSamples(vaultId, sample.moleculeId);
        if (loaded) {
            const found = findSample(loaded, sample);
            if (found) applyInventorySample(sample, found);
            continue;
        }

        const key = `${vaultId}:${sample.moleculeId}`;
        const group = byMolecule.get(key) || { vaultId, moleculeId: sample.moleculeId, targets: [] };
        group.targets.push(sample);
        byMolecule.set(key, group);
    }

    if (!byMolecule.size) return null;

    return Promise.all(
        Array.from(byMolecule.values(), async ({ vaultId, moleculeId, targets }) => {
            let list;
            try {
                list = await getRawMoleculeSamples(vaultId, moleculeId);
            } catch (err) {
                console.debug("[CDD Stoich Tools] inventory samples failed", err);
                return false;
            }

            let changed = false;
            for (const sample of targets) {
                const found = findSample(list, sample);
                if (!found) continue;
                applyInventorySample(sample, found);
                changed = true;
            }
            return changed;
        })
    ).then((results) => results.some(Boolean));
}
