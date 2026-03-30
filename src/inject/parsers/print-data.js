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

function resolveRowData(row) {
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

        depleted: !!row?.sample?.depleted
    };
}

function extractRows(feature) {
    const stoichTable = feature?.data?.stoichiometryTable;
    const rows = Array.isArray(stoichTable?.rows) ? stoichTable.rows : [];

    return rows
        .filter((row) => {
            const role = String(row?.role || "").toLowerCase();
            const rowType = String(row?.rowType || "").toLowerCase();
            return role !== "product" && rowType !== "product";
        })
        .map(resolveRowData);
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



        for (const [key, arr] of Object.entries(samples)) {

            // console.log("[CDD depleted][inject] sample bucket =", key, arr);//
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