// inject/parsers/sample-data.js
import { getReactionFeatures } from "./common.js";
import {
    resolveBatchFields,
    resolveSampleFields,
    resolveMoleculeFields,
    resolveIdentityFields,
    resolveQuantityFields,
    resolveRowName,
    resolveRowLocation,
    collectCustomFields,
    getBatchFields,
    getSampleFields
} from "./field-resolvers.js";

export function extractRowsFromReactionFeature(feature, reactionIndex) {
    const stoichTable = feature?.data?.stoichiometryTable;
    const rows = Array.isArray(stoichTable?.rows) ? stoichTable.rows : [];
    const output = [];
    const seen = new Set();

    for (const row of rows) {
        const hasSample = !!row?.sample;
        const rowBatchId = row?.batchId ?? row?.batch?.id ?? null;
        const role = String(row?.role || "").toLowerCase();

        // Rows without a sample are still worth a card when they carry a
        // registered batch — its metafields (purity, density…) are fetched
        // later by the content script. Products are skipped: their batches
        // are the synthesis targets and carry no useful QC metadata.
        if (!hasSample) {
            if (!rowBatchId) continue;
            if (role === "product" || role === "parallelproduct") continue;
        }

        const rowUid = row?.uid ?? null;
        const sampleId =
            row?.sample?.id ??
            row?.sampleId ??
            row?.sample_id ??
            null;

        const dedupeKey = `${reactionIndex}::${rowUid ?? "no-row"}::${sampleId ?? (rowBatchId ? `batch-${rowBatchId}` : "no-sample")}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        const batchFields = resolveBatchFields(row);
        const sampleFields = resolveSampleFields(row);
        const moleculeFields = resolveMoleculeFields(row);
        const identityFields = resolveIdentityFields(row);
        const quantityFields = resolveQuantityFields(row);

        output.push({
            reactionIndex,
            reactionLabel: `Reaction ${reactionIndex + 1}`,
            featureId: feature?.id ?? null,
            rowUid,
            role: row?.role ?? null,
            sampleId,
            hasSample,
            name: resolveRowName(row),
            location: resolveRowLocation(row),
            ...batchFields,      // purity, density, internalID
            ...sampleFields,     // concentration, concentrationUnits, solvent
            ...moleculeFields,   // moleculeName/Id, molecularFormula, smiles, inchiKey, molecular/formulaWeight
            ...identityFields,   // batchName/Id, vendorId, project, owner
            ...quantityFields,   // amount(+amountUnit), volume, mass

            // Raw per-vault custom field maps, kept whole so the panel can
            // render (and the popup can discover) any of them dynamically.
            customBatchFields: collectCustomFields(getBatchFields(row)),
            customSampleFields: collectCustomFields(getSampleFields(row)),
        });
    }

    return output;
}

export function extractAllReactionRows(payload) {
    const reactionFeatures = getReactionFeatures(payload);
    const allRows = [];

    reactionFeatures.forEach((feature, index) => {
        const rows = extractRowsFromReactionFeature(feature, index);
        allRows.push(...rows);
    });

    return {
        reactionCount: reactionFeatures.length,
        samples: allRows,
    };
}