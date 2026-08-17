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

// The 1-based number the table PRINTS in each row's first cell. The table
// does not render rows in payload order — it groups them by role:
// reactants first, then agents (incl. solvents and solutions), then
// products, each group in payload order. Parallel rows sit in the
// lettered A/B/C block and get no number. Verified against the live
// tables of entry 2504170 (all three reaction variants).
function computeDisplayRowNumbers(rows) {
    const groupOf = (row) => {
        const role = String(row?.role || "").toLowerCase();
        if (role.startsWith("parallel")) return null;
        if (role === "reactant") return 0;
        if (role === "product") return 2;
        return 1;
    };

    const numbers = new Array(rows.length).fill(null);
    let n = 0;
    for (let group = 0; group <= 2; group += 1) {
        rows.forEach((row, i) => {
            if (groupOf(row) === group) {
                n += 1;
                numbers[i] = n;
            }
        });
    }
    return numbers;
}

// Typed table purity as a percent string ("98.2"), or null. The row keeps
// purity as a fraction; exactly 1 is the untyped 100 % default, which we
// deliberately read as "nothing typed" (a hand-typed 100 is
// indistinguishable and stays un-captured — harmless).
function resolveTablePurity(row) {
    const p = Number(row?.purity);
    if (!Number.isFinite(p) || p === 1) return null;
    return String(Number((p * 100).toFixed(6)));
}

// The solvent a solution row was made with, as the name CDD stores it
// ("ethanol"). A solution keeps its solvent NESTED under `row.solvent` — a
// row object of its own, never a member of stoichiometryTable.rows. The
// nested row exists from the moment "Make solution" is clicked; until a
// molecule is picked it carries no name, which reads here as "no solvent".
function resolveTableSolvent(row) {
    const name = row?.solvent?.name;
    return typeof name === "string" && name.trim() ? name.trim() : null;
}

export function extractRowsFromReactionFeature(feature, reactionIndex) {
    const stoichTable = feature?.data?.stoichiometryTable;
    const rows = Array.isArray(stoichTable?.rows) ? stoichTable.rows : [];
    const output = [];
    const seen = new Set();

    const displayRowNumbers = computeDisplayRowNumbers(rows);

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        const row = rows[rowIndex];
        const hasSample = !!row?.sample;
        const rowBatchId = row?.batchId ?? row?.batch?.id ?? null;
        const role = String(row?.role || "").toLowerCase();

        const rowUid = row?.uid ?? null;
        const isProduct = role === "product" || role === "parallelproduct";

        // Rows without a sample are still worth a card when they carry a
        // registered batch — its metafields (purity, density…) are fetched
        // later by the content script — or when they are PRODUCTS, which
        // often have neither sample nor batch ("Unspecified Batch"): their
        // identity comes from the molecule. Whether products are SHOWN is
        // decided content-side by the show-products option.
        if (!hasSample && !isProduct && !rowBatchId) continue;
        if (isProduct && !rowBatchId && !row?.moleculeName && !rowUid) continue;
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
            // The number the table prints in the row's first cell (null
            // for lettered parallel rows). Lets the fill target a row
            // deterministically even when the same batch appears twice.
            rowNumber: displayRowNumbers[rowIndex],
            role: row?.role ?? null,
            sampleId,
            hasSample,
            isProduct,
            // Values already sitting in the table row (user-entered); used
            // to decide whether the fill buttons are offered and what the
            // density-memory capture may remember. Verified against the
            // live eln/v2 payload: density is the typed string in
            // userInput; purity is a row-level FRACTION (0.982 = 98.2 %,
            // and exactly 1 is CDD's untyped 100 % default); concentration
            // is a row-level number, always in mol/L (the editor popup has
            // no unit selector).
            // Effective density: the typed value, or the row-level one CDD
            // keeps/derives itself (molecule data, or a typed value it has
            // moved out of userInput on some edit paths). Either way the
            // table HAS a density — no fill offer needed.
            tableDensity: row?.userInput?.density ?? row?.density ?? null,
            // Only the typed value is worth remembering.
            typedDensity: row?.userInput?.density ?? null,
            tablePurity: resolveTablePurity(row),
            tableConcentration:
                row?.concentration != null && row.concentration !== ""
                    ? String(row.concentration)
                    : null,
            tableConcentrationUnits:
                row?.concentration != null && row.concentration !== ""
                    ? "mol/L"
                    : null,
            tableSolvent: resolveTableSolvent(row),
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