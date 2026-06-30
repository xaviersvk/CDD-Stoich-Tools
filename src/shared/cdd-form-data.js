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
//
// Iterator note: all loops use formData.forEach() instead of
// for...of formData.entries() / formData.keys(). Firefox WebExtension content
// scripts wrap FormData iterators in Xray wrappers that lose [Symbol.iterator],
// making for...of throw "not iterable". forEach() is callback-based and avoids
// the iterator protocol entirely. Chrome is unaffected either way.

export const LOCATION_FIELD_DEFINITION_ID = "1000001955";

// True if a FormData looks like a CDD create-sample payload.
export function hasInventorySampleKeys(formData) {
    if (!formData || typeof formData.forEach !== "function") return false;
    let found = false;
    formData.forEach((_v, k) => {
        if (k.includes("inventory_sample")) found = true;
    });
    return found;
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
    if (!formData || typeof formData.forEach !== "function") return copy;
    formData.forEach((v, k) => copy.append(k, v));
    return copy;
}

// Locate the Location field. Returns
//   { defKey, valueKey, raw, boxId, position, viaFallback } | null
// Strategy: find the fields_attributes entry whose [field_definition_id] equals
// the Location field-definition id, then read its sibling [value]. Fallback:
// the only [value] shaped "<digits>,<digits>".
export function findLocationField(formData, locId = LOCATION_FIELD_DEFINITION_ID) {
    if (!formData || typeof formData.forEach !== "function") {
        console.error("[CDD cdd-form-data] findLocationField: not a FormData",
            { type: typeof formData, ctor: formData?.constructor?.name });
        return null;
    }

    // Primary: by sibling field_definition_id.
    let result = null;
    formData.forEach((v, k) => {
        if (result) return;
        if (
            /\[fields_attributes\]\[\d+\]\[field_definition_id\]$/.test(k) &&
            String(v) === String(locId)
        ) {
            const prefix = k.replace(/\[field_definition_id\]$/, "");
            const valueKey = `${prefix}[value]`;
            if (!formData.has(valueKey)) return;
            const raw = String(formData.get(valueKey));
            const [boxId, position] = splitComposite(raw);
            result = { defKey: k, valueKey, raw, boxId, position, viaFallback: false };
        }
    });
    if (result) return result;

    // Fallback: a [value] entry shaped "digits,digits".
    formData.forEach((v, k) => {
        if (result) return;
        if (/\[value\]$/.test(k) && /^\d+\s*,\s*\d+$/.test(String(v))) {
            const raw = String(v);
            const [boxId, position] = splitComposite(raw);
            result = { defKey: null, valueKey: k, raw, boxId, position, viaFallback: true };
        }
    });
    return result;
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
    if (!formData || typeof formData.forEach !== "function") return "(not a FormData)";
    const lines = [];
    formData.forEach((v, k) => {
        let shown;
        if (typeof v === "string") {
            shown = v.length > maxValueLen ? `${v.slice(0, maxValueLen)}… (${v.length} chars)` : v;
        } else {
            shown = `[${v?.constructor?.name || "blob"}]`;
        }
        lines.push(`${k} = ${shown}`);
    });
    return lines.join("\n");
}
