export function shortenLocation(value) {
    if (value == null) return "";

    const parts = String(value)
        .split(/\s*>\s*/)
        .map((part) => part.trim())
        .filter(Boolean);

    return parts.length >= 2
        ? `${parts.at(-2)} > ${parts.at(-1)}`
        : (parts[0] || "");
}

export function normalizeFieldMap(fieldMap) {
    if (!fieldMap || typeof fieldMap !== "object") return {};
    return fieldMap;
}

// Reduce a CDD field value to a primitive, unwrapping { value } wrappers.
// Returns null for objects/empty so they are never rendered as "[object]".
function toScalarFieldValue(value) {
    if (value && typeof value === "object") {
        return "value" in value ? toScalarFieldValue(value.value) : null;
    }
    if (value == null || value === "") return null;
    return value;
}

// Turn an arbitrary custom-field map (batch_fields / sample fields) into a
// flat name → primitive map, dropping empty and non-primitive entries.
export function collectCustomFields(fieldMap) {
    const map = normalizeFieldMap(fieldMap);
    const out = {};
    for (const [name, raw] of Object.entries(map)) {
        const scalar = toScalarFieldValue(raw);
        if (scalar == null || scalar === "") continue;
        out[name] = scalar;
    }
    return out;
}

export function getFieldValueCaseInsensitive(fieldMap, candidateNames = []) {
    const map = normalizeFieldMap(fieldMap);
    const entries = Object.entries(map);

    for (const candidate of candidateNames) {
        const normalizedCandidate = String(candidate).trim().toLowerCase();

        for (const [key, value] of entries) {
            if (String(key).trim().toLowerCase() === normalizedCandidate) {
                if (value && typeof value === "object" && "value" in value) {
                    return value.value;
                }
                return value;
            }
        }
    }

    return null;
}

export function resolveRowName(row) {
    if (row?.sample?.sample_identifier) {
        return String(row.sample.sample_identifier).trim();
    }

    const fallback =
        row?.sample?.name ||
        row?.iupacName ||
        row?.moleculeName ||
        row?.batch?.name ||
        "Unnamed sample";

    return String(fallback).trim();
}

export function resolveRowLocation(row) {
    const rawLocation =
        row?.sample?.location?.value ??
        row?.sample?.location ??
        null;

    if (!rawLocation) return null;

    let normalized = null;

    if (typeof rawLocation === "string") {
        normalized = rawLocation;
    } else if (typeof rawLocation === "object") {
        normalized =
            rawLocation.value ||
            rawLocation.name ||
            rawLocation.label ||
            null;
    }

    if (!normalized || typeof normalized !== "string") return null;

    return shortenLocation(normalized);
}
// Locate the batch-level custom field map regardless of where CDD nests it.
export function getBatchFields(row) {
    return (
        row?.sample?.batch_fields ||
        row?.batch_fields ||
        row?.batch?.batch_fields ||
        row?.sample?.batch?.batch_fields ||
        {}
    );
}

// Locate the sample-level custom field map regardless of where CDD nests it.
export function getSampleFields(row) {
    return (
        row?.sample?.inventory_sample_fields ||
        row?.sample?.sample_fields ||
        row?.sample?.fields ||
        row?.sample_fields ||
        {}
    );
}

export function resolveBatchFields(row) {
    const batchFields = getBatchFields(row);

    const purity = getFieldValueCaseInsensitive(batchFields, [
        "Purity (%)",
        "Purity [%]",
        "*Purity [%]",
        "Purity[%]",
        "*Purity[%]",
        "Purity %",
        "Purity",
    ]);

    const internalID = getFieldValueCaseInsensitive(batchFields, [
        "Internal ID",
        "*Internal ID"
    ]);

    const density = getFieldValueCaseInsensitive(batchFields, [
        "Density [g/mL]",
        "*Density [g/mL]",
        "Density[g/mL]",
        "*Density[g/mL]",
        "Density",
        "*Density",
    ]);

    return {
        purity,
        density,
        internalID
    };
}

export function resolveSampleFields(row) {
    const sampleFields = getSampleFields(row);

    const concentration = getFieldValueCaseInsensitive(sampleFields, [
        "Concentration",
        "*Concentration",
    ]);

    const solvent = getFieldValueCaseInsensitive(sampleFields, [
        "*Solvent",
        "Solvent",
        "Buffer",
        "*Buffer",
        "*Solvent/Buffer/Medium",
        "Solvent/Buffer/Medium",
        "Solvent/Buffer",
        "Solvent/Medium",
        "Buffer/Medium",
        "Buffer/Solvent",
        "Buffer/Medium",
        "Medium/Solvent",
        "Medium/Buffer",
        "Medium",
    ]);

    const concentrationUnits = getFieldValueCaseInsensitive(sampleFields, [
        "Concentration units",
        "Concentration Units",
        "Concentration unit",
        "Concentration Unit",
        "*Concentration Unit",
    ]);

    return {
        concentration,
        concentrationUnits,
        solvent,
    };
}

/* ------------------------------------------------------------------ *
 * Optional fields (best-effort).
 *
 * The exact CDD shape for these varies, so every resolver probes a few
 * likely paths / field-name candidates and returns null when absent.
 * Missing data simply means the corresponding panel row is skipped.
 * ------------------------------------------------------------------ */

function getMolecule(row) {
    return (
        row?.molecule ||
        row?.sample?.molecule ||
        row?.sample?.batch?.molecule ||
        row?.batch?.molecule ||
        null
    );
}

export function resolveMoleculeFields(row) {
    const molecule = getMolecule(row) || {};

    return {
        // The stoich row carries the molecule identity directly.
        moleculeName: row?.moleculeName || molecule.name || row?.iupacName || null,
        moleculeId: row?.moleculeId ?? molecule.id ?? molecule.molecule_id ?? null,
        molecularFormula:
            row?.formula || molecule.molecular_formula || molecule.formula || null,
        smiles: molecule.smiles || molecule.structure_smiles || row?.smiles || null,
        inchiKey: molecule.inchi_key || molecule.inchikey || row?.inchiKey || null,
        molecularWeight: row?.molecularWeight ?? molecule.molecular_weight ?? null,
        formulaWeight:
            row?.formulaWeight ??
            row?.batch?.formulaWeight ??
            row?.sample?.batch?.formula_weight ??
            molecule.formula_weight ??
            null,
    };
}

export function resolveIdentityFields(row) {
    const batch = row?.sample?.batch || row?.batch || {};
    const mergedFields = { ...getSampleFields(row), ...getBatchFields(row) };

    return {
        batchName: batch.name || row?.sample?.batch_name || batch.batch_identifier || null,
        batchId: row?.batchId ?? batch.id ?? row?.sample?.batch_id ?? null,
        vendorId: getFieldValueCaseInsensitive(getBatchFields(row), [
            "Vendor ID",
            "*Vendor ID",
            "Vendor Id",
            "Supplier ID",
        ]),
        project:
            getFieldValueCaseInsensitive(mergedFields, ["Project", "*Project", "Projects"]) ||
            row?.sample?.project?.name ||
            null,
        owner:
            getFieldValueCaseInsensitive(mergedFields, [
                "Owner",
                "*Owner",
                "Created by",
                "Created By",
            ]) ||
            row?.sample?.created_by_user_full_name ||
            row?.sample?.created_by ||
            row?.sample?.owner?.name ||
            null,
    };
}

export function resolveQuantityFields(row) {
    return {
        amount: row?.amount ?? row?.sample?.current_amount ?? null,
        amountUnit: row?.amountUnit ?? row?.sample?.units ?? row?.unit ?? row?.units ?? null,
        volume: row?.volume ?? null,
        mass: row?.mass ?? null,
    };
}
