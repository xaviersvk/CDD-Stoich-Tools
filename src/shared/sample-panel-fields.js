// shared/sample-panel-fields.js
//
// Central, dependency-free definition of which attributes the floating ELN
// sample panel can show. Imported by BOTH:
//   - the content panel (bundled by vite)            → renders rows
//   - the popup (loaded as an ES module from dist/)   → renders checkboxes
//
// Keep this file free of DOM access and of imports from other modules so it
// stays usable verbatim in both contexts.

export const SAMPLE_PANEL_SETTINGS_KEY = "cddSamplePanelVisibleFields";

/* ------------------------------------------------------------------ *
 * Pure formatting helpers (previously inlined in sample-panel.js)
 * ------------------------------------------------------------------ */

export function parsePurity(value) {
    if (value == null || value === "") return NaN;
    return parseFloat(String(value).replace(",", "."));
}

function formatClipboardNumber(value) {
    if (!Number.isFinite(value)) return null;

    const rounded = Number(value.toFixed(12));
    if (Object.is(rounded, -0)) return "0";

    return String(rounded);
}

function normalizeConcentrationUnit(unit) {
    return String(unit || "")
        .trim()
        .replace(/\s+/g, "")
        .replace(/μ/g, "u")
        .replace(/µ/g, "u")
        .toLowerCase();
}

export function formatConcentration(sample) {
    if (sample.concentration == null || sample.concentration === "") return null;
    if (sample.concentrationUnits) {
        return `${sample.concentration} ${sample.concentrationUnits}`;
    }
    return String(sample.concentration);
}

// Concentration value normalized to a CDD-paste-compatible string for copying.
export function getCddCompatibleConcentrationCopyValue(sample) {
    const rawValue = sample?.concentration;
    const rawUnits = sample?.concentrationUnits;

    if (rawValue == null || rawValue === "") return null;

    const numericValue = parseFloat(String(rawValue).replace(",", "."));
    if (!Number.isFinite(numericValue)) {
        return rawUnits ? `${rawValue} ${rawUnits}` : String(rawValue);
    }

    const unit = normalizeConcentrationUnit(rawUnits);

    if (!unit) return String(rawValue);
    if (unit === "m" || unit === "mol/l") return `${formatClipboardNumber(numericValue)} mol/L`;
    if (unit === "mm" || unit === "mmol/l") return `${formatClipboardNumber(numericValue)} mmol/L`;
    if (unit === "um" || unit === "umol/l") return `${formatClipboardNumber(numericValue / 1000)} mmol/L`;
    if (unit === "nm" || unit === "nmol/l") return `${formatClipboardNumber(numericValue / 1000000)} mmol/L`;
    if (unit === "mol/ml") return `${formatClipboardNumber(numericValue)} mol/mL`;

    return rawUnits ? `${rawValue} ${rawUnits}` : String(rawValue);
}

function isLowPurity(sample) {
    const purityValue = parsePurity(sample?.purity);
    return Number.isFinite(purityValue) && purityValue <= 93;
}

function withUnit(value, unit) {
    if (value == null || value === "") return null;
    return unit ? `${value} ${unit}` : String(value);
}

/* ------------------------------------------------------------------ *
 * Field registry
 *
 * Each field:
 *   key            unique id, also the chrome.storage flag name
 *   label          shown in the panel and the popup checkbox
 *   source         sample | batch | molecule | computed (informational)
 *   defaultEnabled whether it shows when the user has no saved preference
 *   get(sample)    raw value resolver (null/"" → row is skipped)
 *   format?(v, s)  optional display formatter
 *   copyValue?(s)  optional override for the click-to-copy value
 *   highlight?(v,s) optional → render the value in red
 * ------------------------------------------------------------------ */

export const SAMPLE_PANEL_FIELDS = [
    {
        key: "name",
        label: "Name",
        source: "sample",
        defaultEnabled: true,
        get: (s) => s?.name || "—",
    },
    {
        key: "location",
        label: "Location",
        source: "sample",
        defaultEnabled: true,
        get: (s) => s?.location,
    },
    {
        key: "purity",
        label: "Purity [%]",
        source: "batch",
        defaultEnabled: true,
        get: (s) => s?.purity,
        highlight: (_v, s) => isLowPurity(s),
    },
    {
        key: "internalID",
        label: "Internal ID",
        source: "batch",
        defaultEnabled: true,
        get: (s) => s?.internalID,
    },
    {
        key: "density",
        label: "Density [g/mL]",
        source: "batch",
        defaultEnabled: true,
        get: (s) => s?.density,
    },
    {
        key: "concentration",
        label: "Concentration",
        source: "computed",
        defaultEnabled: true,
        get: (s) => s?.concentration,
        format: (_v, s) => formatConcentration(s),
        copyValue: (s) => getCddCompatibleConcentrationCopyValue(s),
    },
    {
        key: "solvent",
        label: "Solvent",
        source: "sample",
        defaultEnabled: true,
        get: (s) => s?.solvent,
    },

    /* ---- optional fields (off by default) ---- */
    {
        key: "concentrationUnits",
        label: "Concentration unit",
        source: "sample",
        defaultEnabled: false,
        get: (s) => s?.concentrationUnits,
    },
    {
        key: "molecularWeight",
        label: "Molecular weight",
        source: "molecule",
        defaultEnabled: false,
        get: (s) => s?.molecularWeight,
    },
    {
        key: "formulaWeight",
        label: "Formula weight",
        source: "molecule",
        defaultEnabled: false,
        get: (s) => s?.formulaWeight,
    },
    {
        key: "molecularFormula",
        label: "Molecular formula",
        source: "molecule",
        defaultEnabled: false,
        get: (s) => s?.molecularFormula,
    },
    {
        key: "moleculeName",
        label: "Molecule name",
        source: "molecule",
        defaultEnabled: false,
        get: (s) => s?.moleculeName,
    },
    {
        key: "batchName",
        label: "Batch name",
        source: "batch",
        defaultEnabled: false,
        get: (s) => s?.batchName,
    },
    {
        key: "vendorId",
        label: "Vendor ID",
        source: "batch",
        defaultEnabled: false,
        get: (s) => s?.vendorId,
    },
    {
        key: "owner",
        label: "Owner / created by",
        source: "sample",
        defaultEnabled: false,
        get: (s) => s?.owner,
    },
    {
        key: "amount",
        label: "Amount",
        source: "sample",
        defaultEnabled: false,
        get: (s) => s?.amount,
        format: (v, s) => withUnit(v, s?.amountUnit),
    },
    {
        key: "volume",
        label: "Volume",
        source: "sample",
        defaultEnabled: false,
        get: (s) => s?.volume,
    },
];

/* ------------------------------------------------------------------ *
 * Value resolution
 * ------------------------------------------------------------------ */

// Resolve one field for one sample into { text, copyValue, highlight },
// or null when there is nothing meaningful to show. Never throws.
export function resolveFieldValue(field, sample) {
    let raw;
    try {
        raw = field.get ? field.get(sample) : sample?.[field.key];
    } catch {
        return null;
    }

    if (raw == null || raw === "") return null;
    if (typeof raw === "object") return null; // never render raw objects

    let text;
    try {
        text = field.format ? field.format(raw, sample) : String(raw);
    } catch {
        text = String(raw);
    }

    if (text == null || text === "") return null;

    let copyValue = text;
    if (field.copyValue) {
        try {
            const cv = field.copyValue(sample);
            if (cv != null && cv !== "") copyValue = cv;
        } catch {
            /* keep default copyValue */
        }
    }

    let highlight = false;
    if (field.highlight) {
        try {
            highlight = !!field.highlight(raw, sample);
        } catch {
            highlight = false;
        }
    }

    return { text: String(text), copyValue: String(copyValue), highlight };
}

/* ------------------------------------------------------------------ *
 * Settings (chrome.storage.local) — available in content & popup
 * ------------------------------------------------------------------ */

// Default visibility map derived from the registry. Pure, no storage access.
export function getDefaultVisibleFields() {
    const map = {};
    for (const field of SAMPLE_PANEL_FIELDS) {
        map[field.key] = !!field.defaultEnabled;
    }
    return map;
}

// Read the saved map, merged over the registry defaults so newly added
// static fields appear with their own defaultEnabled value. Stored keys that
// are not in the registry (dynamic custom fields) are preserved as-is.
export async function getSamplePanelSettings() {
    const defaults = getDefaultVisibleFields();

    try {
        const result = await chrome.storage.local.get(SAMPLE_PANEL_SETTINGS_KEY);
        const stored = result?.[SAMPLE_PANEL_SETTINGS_KEY];
        if (!stored || typeof stored !== "object") return defaults;

        const merged = { ...defaults };
        for (const [key, value] of Object.entries(stored)) {
            if (typeof value === "boolean") merged[key] = value;
        }
        return merged;
    } catch {
        return defaults;
    }
}

// Persist every boolean flag, including dynamic custom-field keys that are not
// part of the static registry. Missing static keys simply fall back to their
// registry default on the next read.
export async function saveSamplePanelSettings(visibleMap) {
    const clean = {};
    for (const [key, value] of Object.entries(visibleMap || {})) {
        if (typeof value === "boolean") clean[key] = value;
    }
    await chrome.storage.local.set({ [SAMPLE_PANEL_SETTINGS_KEY]: clean });
}

/* ------------------------------------------------------------------ *
 * Dynamic custom fields (per-vault batch_fields / sample fields)
 *
 * These names vary per vault, so they cannot live in the static registry.
 * The content script discovers them from the parsed data and persists the
 * list so the popup can offer them as checkboxes. As with static fields, an
 * enabled custom field still only renders when the sample actually has it.
 * ------------------------------------------------------------------ */

export const CUSTOM_BATCH_FIELD_PREFIX = "bf:";
export const CUSTOM_SAMPLE_FIELD_PREFIX = "sf:";
export const SAMPLE_PANEL_CUSTOM_FIELDS_KEY = "cddSamplePanelCustomFields";

// Custom field descriptors (with values) present on a single sample.
export function getCustomFieldsFromSample(sample) {
    const out = [];

    const batch = sample?.customBatchFields;
    if (batch && typeof batch === "object") {
        for (const [name, value] of Object.entries(batch)) {
            out.push({
                key: CUSTOM_BATCH_FIELD_PREFIX + name,
                label: name,
                source: "batch",
                value,
            });
        }
    }

    const sampleMap = sample?.customSampleFields;
    if (sampleMap && typeof sampleMap === "object") {
        for (const [name, value] of Object.entries(sampleMap)) {
            out.push({
                key: CUSTOM_SAMPLE_FIELD_PREFIX + name,
                label: name,
                source: "sample",
                value,
            });
        }
    }

    return out;
}

// Union of custom field options across all samples (identity only, no values).
export function discoverCustomFields(samples) {
    const byKey = new Map();
    for (const sample of samples || []) {
        for (const field of getCustomFieldsFromSample(sample)) {
            if (!byKey.has(field.key)) {
                byKey.set(field.key, {
                    key: field.key,
                    label: field.label,
                    source: field.source,
                });
            }
        }
    }
    return [...byKey.values()];
}

export async function getDiscoveredCustomFields() {
    try {
        const result = await chrome.storage.local.get(SAMPLE_PANEL_CUSTOM_FIELDS_KEY);
        const stored = result?.[SAMPLE_PANEL_CUSTOM_FIELDS_KEY];
        return Array.isArray(stored) ? stored : [];
    } catch {
        return [];
    }
}

export async function saveDiscoveredCustomFields(list) {
    await chrome.storage.local.set({
        [SAMPLE_PANEL_CUSTOM_FIELDS_KEY]: Array.isArray(list) ? list : [],
    });
}

/* ------------------------------------------------------------------ *
 * Custom field lifecycle
 *
 * Each discovered field carries a `lastSeen` timestamp (ms). A field that has
 * not arrived from CDD for longer than the TTL is dropped from the option list,
 * UNLESS it is currently enabled — an enabled field is never removed.
 * ------------------------------------------------------------------ */

export const CUSTOM_FIELD_TTL_MS = 120 * 24 * 60 * 60 * 1000; // 120 days

// Upsert the currently-seen fields, refreshing their `lastSeen` to `now`.
// Returns { list, changed }. Pure (no storage / no clock access).
export function touchSeenCustomFields(existing, found, now) {
    const byKey = new Map((existing || []).map((field) => [field.key, field]));
    let changed = false;

    for (const field of found || []) {
        const prev = byKey.get(field.key);
        if (!prev) changed = true;
        byKey.set(field.key, {
            key: field.key,
            label: field.label,
            source: field.source,
            lastSeen: now,
        });
        changed = true;
    }

    return { list: [...byKey.values()], changed };
}

// Drop fields unseen for longer than the TTL, keeping any currently-enabled
// one. Missing `lastSeen` is treated as "just seen" (migration grace).
// Returns { list, changed }. Pure (no storage / no clock access).
export function pruneExpiredCustomFields(list, enabledMap, now) {
    const out = [];
    let changed = false;

    for (const field of list || []) {
        if (field.lastSeen == null) {
            out.push({ ...field, lastSeen: now });
            changed = true;
            continue;
        }

        const expired = now - field.lastSeen > CUSTOM_FIELD_TTL_MS;
        if (expired && !enabledMap?.[field.key]) {
            changed = true; // dropped
            continue;
        }

        out.push(field);
    }

    return { list: out, changed };
}
