// shared/cdd-form-data.js
//
// PURE helpers for working with a CDD "create inventory sample" payload as a
// FormData. No DOM, no network, no CDD page knowledge beyond the one fact the
// contract pinned down:
//
//   The inventory event's *Location* field is encoded as ONE composite value
//   "<boxId>,<position>" on the fields_attributes entry whose
//   field_definition_id == LOCATION_FIELD_DEFINITION_ID, e.g.:
//     inventory_sample[inventory_events_attributes][0][fields_attributes][2][field_definition_id] = 1000001955
//     inventory_sample[inventory_events_attributes][0][fields_attributes][2][value]               = 1000001682,43
//
// The multi-position feature changes ONLY the part after the comma (position),
// keeping the box id. Everything else in the payload is reused byte-for-byte —
// we never reconstruct CDD's fields.
//
// Why pure/shared: this is the single most safety-critical transform (it decides
// where a sample is created), so it is isolated, DOM-free and unit-testable.
//
// What it must NOT do: read the DOM, do network, or assume a fixed array index
// for the location field (locate it by sibling field_definition_id, fallback by
// value shape).

export const LOCATION_FIELD_DEFINITION_ID = "1000001955";

// True if a FormData looks like a CDD create-sample payload.
export function hasInventorySampleKeys(formData) {
    for (const key of formData.keys()) {
        if (key.includes("inventory_sample")) return true;
    }
    return false;
}

// Rebuild a FormData from captured [key, value] string entries (the page-world
// capture serialises the body to entries so it can cross postMessage).
export function formDataFromEntries(entries) {
    const fd = new FormData();
    for (const [k, v] of entries || []) fd.append(k, String(v));
    return fd;
}

// Shallow clone. Create payloads here are string-only; File/Blob values would be
// referenced (not duplicated), which is fine because we never mutate them.
export function cloneFormData(formData) {
    const copy = new FormData();
    for (const [k, v] of formData.entries()) copy.append(k, v);
    return copy;
}

// Locate the Location field. Returns
//   { defKey, valueKey, raw, boxId, position, viaFallback } | null
// Strategy: find the fields_attributes entry whose [field_definition_id] equals
// the Location field-definition id, then read its sibling [value]. Fallback:
// the only [value] shaped "<digits>,<digits>".
export function findLocationField(formData, locId = LOCATION_FIELD_DEFINITION_ID) {
    // Primary: by sibling field_definition_id.
    for (const [k, v] of formData.entries()) {
        if (
            /\[fields_attributes\]\[\d+\]\[field_definition_id\]$/.test(k) &&
            String(v) === String(locId)
        ) {
            const prefix = k.replace(/\[field_definition_id\]$/, "");
            const valueKey = `${prefix}[value]`;
            if (!formData.has(valueKey)) break;
            const raw = String(formData.get(valueKey));
            const [boxId, position] = splitComposite(raw);
            return {
                defKey: k,
                valueKey,
                raw,
                boxId,
                position,
                viaFallback: false,
            };
        }
    }

    // Fallback: a [value] entry shaped "digits,digits".
    for (const [k, v] of formData.entries()) {
        if (/\[value\]$/.test(k) && /^\d+\s*,\s*\d+$/.test(String(v))) {
            const raw = String(v);
            const [boxId, position] = splitComposite(raw);
            return { defKey: null, valueKey: k, raw, boxId, position, viaFallback: true };
        }
    }

    return null;
}

function splitComposite(raw) {
    const idx = String(raw).indexOf(",");
    if (idx < 0) return [String(raw), ""];
    return [raw.slice(0, idx).trim(), raw.slice(idx + 1).trim()];
}

// Current "<boxId>,<position>" location value, or null.
export function readLocationValue(formData, locId = LOCATION_FIELD_DEFINITION_ID) {
    return findLocationField(formData, locId)?.raw ?? null;
}

// Produce a CLONE with the location position replaced (box id kept). Returns
//   { formData, valueKey, before, after, boxId, position }
// Throws if no location field is found (caller must surface, never guess).
export function withReplacedPosition(formData, newPosition, locId = LOCATION_FIELD_DEFINITION_ID) {
    const loc = findLocationField(formData, locId);
    if (!loc) throw new Error("Location field not found in payload");
    const clone = cloneFormData(formData);
    const after = `${loc.boxId},${newPosition}`;
    clone.set(loc.valueKey, after);
    return {
        formData: clone,
        valueKey: loc.valueKey,
        before: loc.raw,
        after,
        boxId: loc.boxId,
        position: String(newPosition),
    };
}

// Human-readable, length-capped dump of a FormData for console preview.
export function previewFormData(formData, maxValueLen = 300) {
    const lines = [];
    for (const [k, v] of formData.entries()) {
        let shown;
        if (typeof v === "string") {
            shown = v.length > maxValueLen ? `${v.slice(0, maxValueLen)}… (${v.length} chars)` : v;
        } else {
            shown = `[${v?.constructor?.name || "blob"}]`;
        }
        lines.push(`${k} = ${shown}`);
    }
    return lines.join("\n");
}
