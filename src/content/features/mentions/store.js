// content/features/mentions/store.js
//
// Turning a mention (vault + molecule + record id) into a card the Samples
// panel can already render.
//
// ONE endpoint answers both kinds:
//
//   /vaults/<vault>/molecules/<molecule>/inventory_samples.json
//
// Each entry carries its own `id` and its `batch_id`, plus `location`,
// `current_amount`/`units`, `fields` (sample metafields), `batch_fields` and a
// nested `batch` (identifier, molecule name, formula weight). So a sample
// mention is a direct hit, and a batch mention reads the batch half of any
// sample belonging to it — one GET per molecule either way, cached.
//
// `include_depleted=true` on purpose: a mention of a bottle that has since
// been used up must still resolve, and the panel already knows how to badge a
// depleted sample. Filtering it out here would leave a card saying only
// "PRO-0000017-001-P000545" with no explanation.
//
// A batch mention deliberately shows NO location, amount or concentration.
// Those belong to one bottle, and the entry did not mention a bottle — it
// mentioned the batch. Borrowing an arbitrary sample's shelf would be an
// invented fact.

import {
    collectCustomFields,
    getFieldValueCaseInsensitive,
    resolveBatchFields,
    resolveSampleFields,
} from "../../../inject/parsers/field-resolvers.js";
import { KIND_SAMPLE } from "./scan.js";

// Sorts after every real reaction, so the group lands at the bottom of the
// panel. Reaction indexes are display positions and never come near this.
export const MENTIONS_REACTION_INDEX = 100000;
export const MENTIONS_GROUP_LABEL = "Mentioned in text";

// moleculeId → Promise<{bySampleId: Map, byBatchId: Map}>. Promise-cached so
// several mentions of the same molecule share one request; failures are
// evicted so a later scan can retry.
const moleculeSamplesCache = new Map();

const nameKey = (value) => String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();

function indexSamples(list) {
    const bySampleId = new Map();
    const byBatchId = new Map();
    // For links whose href stops at the section and names the record only in
    // its text. Every name a record answers to, pointing at that record.
    const byName = new Map();

    const remember = (key, sample) => {
        const k = nameKey(key);
        if (k && !byName.has(k)) byName.set(k, sample);
    };

    for (const sample of Array.isArray(list) ? list : []) {
        if (sample?.id != null) bySampleId.set(String(sample.id), sample);

        // First one wins: any sample of the batch carries the same batch
        // half, and picking a stable one keeps the card from changing
        // between renders.
        const batchId = sample?.batch_id;
        if (batchId != null && !byBatchId.has(String(batchId))) {
            byBatchId.set(String(batchId), sample);
        }

        remember(sample?.name, sample);
        remember(sample?.sample_identifier, sample);
        remember(sample?.batch?.molecule_batch_identifier, sample);
    }

    return { bySampleId, byBatchId, byName };
}

export function fetchMoleculeSamples(vaultId, moleculeId) {
    const cached = moleculeSamplesCache.get(moleculeId);
    if (cached) return cached;

    const promise = (async () => {
        const response = await fetch(
            `/vaults/${vaultId}/molecules/${moleculeId}/inventory_samples.json?include_depleted=true`,
            { credentials: "include", headers: { Accept: "application/json" } }
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        return indexSamples(data?.inventory_samples);
    })();

    promise.catch(() => {
        if (moleculeSamplesCache.get(moleculeId) === promise) {
            moleculeSamplesCache.delete(moleculeId);
        }
    });

    moleculeSamplesCache.set(moleculeId, promise);
    return promise;
}

function moleculeUrl(mention, recordId) {
    const section = mention.kind === KIND_SAMPLE ? "inventory_samples" : "batches";
    const id = mention.id ?? recordId;
    const fragment = id != null
        ? `#molecule-${section}/${id}`
        : `#molecule-${section}`;
    return `/vaults/${mention.vaultId}/molecules/${mention.moleculeId}${fragment}`;
}

// The batch half — shared by both kinds. `record` is any sample of the batch.
function batchHalf(record) {
    const batchFields = record?.batch_fields || {};
    const resolved = resolveBatchFields({ batch_fields: batchFields });
    const batch = record?.batch || {};

    return {
        purity: resolved.purity,
        density: resolved.density,
        internalID: resolved.internalID,
        vendorId: getFieldValueCaseInsensitive(batchFields, [
            "Vendor ID", "*Vendor ID", "Vendor Id", "Supplier ID", "Vendor",
        ]),
        moleculeName: batch.molecule_name ?? null,
        batchName: batch.molecule_batch_identifier ?? record?.batch_name ?? null,
        formulaWeight: batch.formula_weight ?? null,
        customBatchFields: collectCustomFields(batchFields),
        // The batch record IS the authority here, so density-memory can trust
        // this the same way it trusts an enriched stoichiometry row.
        batchFieldsEnriched: true,
    };
}

/**
 * One panel card for one mention, or null when the record could not be
 * found (deleted, or in a vault this user cannot read).
 *
 * The shape is deliberately the same one the stoichiometry parser produces,
 * so every existing renderer — the field registry, the custom-field
 * discovery, the depleted badge, the CSV export — works unchanged.
 */
export function buildMentionSample(mention, index) {
    // With an id, the lookup is exact. Without one — a link that stopped at
    // the section — the link's own text is the only handle, and it is the
    // record's name.
    let record = null;
    if (mention.id != null) {
        record = mention.kind === KIND_SAMPLE
            ? index.bySampleId.get(String(mention.id))
            : index.byBatchId.get(String(mention.id));
    } else {
        record = index.byName?.get(nameKey(mention.text)) || null;
    }

    const recordId = mention.kind === KIND_SAMPLE ? record?.id : record?.batch_id;

    const base = {
        reactionIndex: MENTIONS_REACTION_INDEX,
        reactionLabel: MENTIONS_GROUP_LABEL,
        isMention: true,
        mentionKind: mention.kind,
        isProduct: false,
        moleculeId: mention.moleculeId,
        mentionUrl: moleculeUrl(mention, recordId),
        // Nothing to fill INTO: a mention is prose, not a table row. The
        // absence of a rowNumber is what keeps the fill machinery away.
        rowNumber: null,
    };

    if (!record) {
        return {
            ...base,
            name: mention.text || `${mention.kind} ${mention.id ?? ""}`.trim(),
            batchId: mention.kind === KIND_SAMPLE ? null : mention.id,
            sampleId: mention.kind === KIND_SAMPLE ? mention.id : null,
            hasSample: mention.kind === KIND_SAMPLE,
            unresolved: true,
        };
    }

    const batch = batchHalf(record);

    if (mention.kind === KIND_SAMPLE) {
        const sampleFields = resolveSampleFields({ sample: { fields: record.fields || {} } });

        return {
            ...base,
            ...batch,
            ...sampleFields,          // concentration, concentrationUnits, solvent
            name: record.name || mention.text,
            sampleId: String(record.id),
            batchId: record.batch_id != null ? String(record.batch_id) : null,
            hasSample: true,
            depleted: record.depleted === true,
            location: record.location?.value ?? null,
            amount: record.current_amount ?? null,
            amountUnit: record.units ?? null,
            owner: record.created_by_user_full_name ?? null,
            customSampleFields: collectCustomFields(record.fields || {}),
        };
    }

    return {
        ...base,
        ...batch,
        name: batch.batchName || mention.text,
        // The href's id when it had one, otherwise the batch the name
        // resolved to. Either way this is what the dedupe matches on.
        batchId: String(mention.id ?? record.batch_id ?? ""),
        sampleId: null,
        hasSample: false,
    };
}
