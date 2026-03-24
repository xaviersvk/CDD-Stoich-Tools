// inject/parsers/sample-data.js
import { getReactionFeatures } from "./common.js";
import {
    resolveBatchFields,
    resolveSampleFields,
    resolveRowName,
    resolveRowLocation
} from "./field-resolvers.js";

export function extractRowsFromReactionFeature(feature, reactionIndex) {
    const stoichTable = feature?.data?.stoichiometryTable;
    const rows = Array.isArray(stoichTable?.rows) ? stoichTable.rows : [];
    const output = [];
    const seen = new Set();

    for (const row of rows) {
        if (!row?.sample) continue;

        const rowUid = row?.uid ?? null;
        const sampleId =
            row?.sample?.id ??
            row?.sampleId ??
            row?.sample_id ??
            null;

        const dedupeKey = `${reactionIndex}::${rowUid ?? "no-row"}::${sampleId ?? "no-sample"}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        const { purity, density } = resolveBatchFields(row);
        const { concentration, concentrationUnits } = resolveSampleFields(row);

        output.push({
            reactionIndex,
            reactionLabel: `Reaction ${reactionIndex + 1}`,
            featureId: feature?.id ?? null,
            rowUid,
            role: row?.role ?? null,
            sampleId,
            name: resolveRowName(row),
            location: resolveRowLocation(row),
            purity,
            density,
            concentration,
            concentrationUnits,
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