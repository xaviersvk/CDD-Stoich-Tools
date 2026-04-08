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
export function resolveBatchFields(row) {
    const batchFields =
        row?.sample?.batch_fields ||
        row?.batch_fields ||
        row?.batch?.batch_fields ||
        row?.sample?.batch?.batch_fields ||
        {};

    const purity = getFieldValueCaseInsensitive(batchFields, [
        "Purity (%)",
        "Purity [%]",
        "Purity[%]",
        "Purity %",
        "Purity",
    ]);

    const internalID = getFieldValueCaseInsensitive(batchFields, [
        "Internal ID",
        "*Internal ID"
    ]);

    const density = getFieldValueCaseInsensitive(batchFields, [
        "Density [g/mL]",
        "Density[g/mL]",
        "Density",
    ]);

    return {
        purity,
        density,
        internalID
    };
}

export function resolveSampleFields(row) {
    const sampleFields =
        row?.sample?.inventory_sample_fields ||
        row?.sample?.sample_fields ||
        row?.sample?.fields ||
        row?.sample_fields ||
        {};

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
