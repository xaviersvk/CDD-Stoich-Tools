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

// Typed table purity as a percent string ("98.2"), or null. The row keeps
// purity as a fraction; exactly 1 is the untyped 100 % default, which we
// deliberately read as "nothing typed" (a hand-typed 100 is
// indistinguishable and stays un-captured — harmless).
function resolveTablePurity(row) {
    const p = Number(row?.purity);
    if (!Number.isFinite(p) || p === 1) return null;
    return String(Number((p * 100).toFixed(6)));
}

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
            // Values already sitting in the table row (user-entered); used
            // to decide whether the fill buttons are offered and what the
            // density-memory capture may remember. Verified against the
            // live eln/v2 payload: density is the typed string in
            // userInput; purity is a row-level FRACTION (0.982 = 98.2 %,
            // and exactly 1 is CDD's untyped 100 % default); concentration
            // is a row-level number, always in mol/L (the editor popup has
            // no unit selector).
            tableDensity: row?.userInput?.density ?? null,
            tablePurity: resolveTablePurity(row),
            tableConcentration:
                row?.concentration != null && row.concentration !== ""
                    ? String(row.concentration)
                    : null,
            tableConcentrationUnits:
                row?.concentration != null && row.concentration !== ""
                    ? "mol/L"
                    : null,
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