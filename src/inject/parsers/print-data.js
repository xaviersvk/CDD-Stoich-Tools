// inject/parsers/print-data.js
import { getReactionFeatures } from "./common.js";

const PRINT_STATE = {
    lastNonEmptyDepletedIdentifiers: [],
    lastNonEmptyReactionPayloads: []
};

function getReactionTitle(payload) {
    return (
        payload?.eln_entry?.title ||
        payload?.eln_entry?.displayTitle ||
        "Stoichiometry Sheet"
    );
}

function resolveDisplayName(row) {
    return (
        row?.sample?.name ||
        row?.name ||
        row?.iupacName ||
        row?.moleculeName ||
        row?.batch?.name ||
        "Unnamed"
    );
}

function formatValue(value) {
    if (value == null || value === "") return "";
    if (typeof value === "number") return String(value);
    return String(value).trim();
}

// A solution row (`rowType === "solution"`) keeps its solvent NESTED under
// `row.solvent` — a full row object of its own, with `role === "solutionSolvent"`.
// It is not a member of `stoichiometryTable.rows`, so it used to vanish from the
// printed sheet even though CDD renders it as a sub-row under its parent.
// Returns the solvent as print row data, or null when there is nothing to show.
function resolveSolventRow(row) {
    const solvent = row?.solvent;
    if (!solvent || typeof solvent !== "object") return null;

    const hasIdentity = !!(
        solvent.name ||
        solvent.moleculeName ||
        solvent.iupacName ||
        solvent.sample?.name
    );

    // A solvent with no molecule picked yet still carries the volume the
    // chemist typed — worth printing (CDD labels it "Solvent: Required").
    const hasNumbers = [
        solvent.mass,
        solvent.volume,
        solvent.mole,
        solvent.mw,
        solvent.molecularWeight
    ].some((value) => value != null && value !== "");

    if (!hasIdentity && !hasNumbers) return null;

    const data = resolveRowData(solvent, 1);
    if (!hasIdentity) data.name = "not specified";
    return data;
}

function resolveRowData(row, depth = 0) {
    const amount = row?.amount ?? row?.mass ?? row?.value ?? "";
    const amountUnit = row?.amountUnit ?? row?.unit ?? row?.units ?? "";

    const desiredEq = row?.desiredEq ?? row?.equivalents ?? row?.eq ?? row?.equivalent ?? "";
    const mol = row?.mole ?? "";
    const mw = row?.mw ?? row?.molecularWeight ?? row?.formulaWeight ?? "";
    const exactMass = row?.exactMass ?? "";
    const volume = row?.volume ?? "";
    const density = row?.density ?? row?.sample?.density ?? "";
    const boilingPoint = row?.boilingPoint ?? "";
    const effectiveMole = row?.moleffective ?? row?.effectiveMole ?? "";
    const limitingReagent = !!(row?.limitingReagent ?? row?.limiting);
    const yieldValue = row?.yield ?? "";

    const location =
        row?.sample?.location?.value ??
        row?.sample?.location ??
        "";

    const subtitle =
        row?.subtitle ??
        row?.iupacName ??
        "";

    return {
        name: resolveDisplayName(row),

        role: String(row?.role || ""),
        // "default" | "solution" | "solvent" — tells a 2 M stock apart from
        // neat material and from a plain reaction solvent.
        rowType: String(row?.rowType || ""),
        // Parallel (bulk) reactions pair a variable reagent with its product via
        // this id; CDD labels each pair A, B, C… by order of appearance.
        parallelPairId: row?.parallelReactionsPairId || null,

        formulaWeight: formatValue(mw),
        molecularWeight: formatValue(mw),
        exactMass: formatValue(exactMass),
        density: formatValue(density),
        boilingPoint: formatValue(boilingPoint),

        mass: formatValue(amount),
        amountUnit: formatValue(amountUnit),
        volume: formatValue(volume),

        equivalent: formatValue(desiredEq),
        mole: formatValue(mol),
        effectiveMole: formatValue(effectiveMole),
        limitingReagent,
        yield: formatValue(yieldValue),

        location: formatValue(location),
        subtitle: formatValue(subtitle),
        casNumber: formatValue(row?.casNumber),

        // Both are plain numbers in the payload and CDD only ever shows them
        // in mol/L: `concentration` is the stock strength of a solution row,
        // `molarity` the reaction molarity a solvent row contributes.
        concentration: formatValue(row?.concentration),
        molarity: formatValue(row?.molarity),

        // Nested one level only — a solvent never carries a solvent itself.
        solvent: depth === 0 ? resolveSolventRow(row) : null,

        depleted: !!row?.sample?.depleted
    };
}

function extractRows(feature) {
    const stoichTable = feature?.data?.stoichiometryTable;
    const rows = Array.isArray(stoichTable?.rows) ? stoichTable.rows : [];

    // Product rows ride along (each carries its `role`); the content-side
    // print builder decides whether to render them, driven by the
    // show-products option.
    // Not `rows.map(resolveRowData)` — map's index argument would land in the
    // recursion-depth parameter and suppress every solvent past the first row.
    return rows.map((row) => resolveRowData(row));
}

function extractDepletedIdentifiers(payload) {
    const reactionFeatures = getReactionFeatures(payload);
    const identifiers = new Set();


    for (const feature of reactionFeatures) {
        const stoichTable = feature?.data?.stoichiometryTable;
        const samples = stoichTable?.samples || {};

        // console.log("[CDD depleted][inject] reactionFeatures count =", reactionFeatures.length);
        // console.log("[CDD depleted][inject] stoichTable =", stoichTable);
        // console.log("[CDD depleted][inject] samples =", samples);



        for (const arr of Object.values(samples)) {

            // console.log("[CDD depleted][inject] sample bucket =", arr);//
            if (!Array.isArray(arr)) continue;

            for (const sample of arr) {

               // console.log("[CDD depleted][inject] candidate sample =", sample);

                if (sample?.depleted !== true) continue;

                // console.log("[CDD depleted][inject] raw depleted sample =", {
                //     sample_identifier: sample?.sample_identifier,
                //     name: sample?.name,
                //     id: sample?.id
                // });


                const identifier =
                    sample?.sample_identifier ||
                    sample?.name ||
                    sample?.id;

                //console.log("[CDD depleted][inject] resolved identifier =", identifier);

                if (identifier) {
                    identifiers.add(String(identifier).trim());
                }
            }
        }
    }

    // console.log("[CDD depleted][inject] final identifiers =", Array.from(identifiers));
    return Array.from(identifiers);
}

export function extractPrintData(payload) {
    const reactionFeatures = getReactionFeatures(payload);
    const experimentIdentifier = payload?.eln_entry?.identifier || null;

    const reactionPayloads = reactionFeatures.map((feature, reactionIndex) => ({
        reactionIndex,
        title: getReactionTitle(payload),
        featureId: feature?.id ?? null,
        rows: extractRows(feature),
        identifier: experimentIdentifier,
        reactionImage:
            feature?.data?.reactionImage ||
            feature?.data?.image ||
            feature?.data?.reaction_scheme ||
            null
    }));

    const depletedIdentifiers = extractDepletedIdentifiers(payload);

    if (reactionPayloads.length) {
        PRINT_STATE.lastNonEmptyReactionPayloads = reactionPayloads;
    }

    if (depletedIdentifiers.length) {
        PRINT_STATE.lastNonEmptyDepletedIdentifiers = depletedIdentifiers;
    }

    return {
        reactionPayloads: reactionPayloads.length
            ? reactionPayloads
            : PRINT_STATE.lastNonEmptyReactionPayloads,
        depletedIdentifiers: depletedIdentifiers.length
            ? depletedIdentifiers
            : PRINT_STATE.lastNonEmptyDepletedIdentifiers
    };
}