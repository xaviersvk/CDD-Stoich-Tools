// content/features/sample-bulk-edit/model.js
//
// The pure half of Bulk edit: which fields can be set, what each sample holds
// now, what a write would change, and the form a write sends. No DOM, no
// fetch — init.js owns those.
//
// The form is the one CDD's own sample Edit dialog builds
// (buildSubmitSampleFormData in CDD's bundle, read 2026-10-29):
//
//   inventory_sample[id|name|units|batch_id|depleted]
//   inventory_sample[fields_attributes][i][field_definition_id]
//   inventory_sample[fields_attributes][i][value]
//
// Every field the sample holds goes along, with the one being edited
// replaced, so the request says what the dialog would have said.

// One value per sample; setting them all to the same thing makes no sense.
const SKIPPED_FIELDS = new Set(["sample id", "sample number", "barcode"]);

// Field kinds an input can be offered for. Files, links… stay out.
const EDITABLE_TYPES = new Set(["PickList", "Number", "Integer", "Float", "Date", "Text", "LongText"]);

const SAMPLE_KEYS = ["id", "name", "units", "batch_id", "depleted"];

function nameKey(name) {
    return String(name ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

// → [{ id, name, type, options }] in CDD's order. `options` holds the visible
// pick list values; empty for anything but a pick list.
export function editableFields(definitionsJson) {
    const defs = Array.isArray(definitionsJson?.inventory_sample_field_definitions)
        ? definitionsJson.inventory_sample_field_definitions
        : [];
    return defs
        .filter((d) => d && d.id != null && d.name && !d.is_hidden)
        .filter((d) => EDITABLE_TYPES.has(d.data_type_name) && !SKIPPED_FIELDS.has(nameKey(d.name)))
        .map((d) => ({
            id: d.id,
            name: String(d.name),
            type: d.data_type_name,
            options: d.data_type_name === "PickList"
                ? (d.pick_list_values || []).filter((v) => v && !v.hidden).map((v) => String(v.value))
                : [],
        }));
}

// What a field value reads as. Objects (pick list entries, files) carry it
// in `value` or `name`.
export function valueText(value) {
    if (value == null) return "";
    if (typeof value === "object") return String(value.value ?? value.name ?? "");
    return String(value);
}

// What a field value is sent as — CDD sends a file's uploaded_file_id.
function valueToSend(value) {
    if (value == null) return "";
    if (typeof value === "object") return String(value.uploaded_file_id ?? value.value ?? "");
    return String(value);
}

function findEntry(fields, fieldName) {
    const entries = Object.entries(fields || {});
    return entries.find(([name]) => name === fieldName)
        || entries.find(([name]) => nameKey(name) === nameKey(fieldName))
        || null;
}

export function currentValue(sample, fieldName) {
    const entry = findEntry(sample?.fields, fieldName);
    return entry ? valueText(entry[1]) : "";
}

// Numbers compare as numbers ("10" = "10.0"), everything else as text.
export function sameValue(a, b, type) {
    const left = String(a ?? "").trim();
    const right = String(b ?? "").trim();
    if (left === right) return true;
    if (["Number", "Integer", "Float"].includes(type) && left !== "" && right !== "") {
        return Number(left) === Number(right);
    }
    return false;
}

// → [{ sample, from, to, unchanged }] for the given samples, in their order.
export function previewRows(samples, field, newValue) {
    const to = String(newValue ?? "").trim();
    return (samples || []).map((sample) => {
        const from = currentValue(sample, field.name);
        return { sample, from, to, unchanged: sameValue(from, to, field.type) };
    });
}

// → { entries: [[key, value], …] } for one sample's PUT, or { error } when it
// cannot be sent as CDD would send it. `allDefinitions` is every inventory
// sample field definition of the vault — the sample's other fields need
// their ids too, not just the editable ones.
export function buildSampleEntries(sample, allDefinitions, field, newValue) {
    const idByName = new Map();
    for (const def of allDefinitions || []) {
        if (def && def.id != null && def.name) idByName.set(nameKey(def.name), def.id);
    }

    const entries = [];
    for (const key of SAMPLE_KEYS) {
        if (sample?.[key] !== undefined && sample[key] !== null) {
            entries.push([`inventory_sample[${key}]`, String(sample[key])]);
        }
    }

    const fields = [];
    let edited = false;
    for (const [name, value] of Object.entries(sample?.fields || {})) {
        const id = idByName.get(nameKey(name));
        if (id == null) return { error: `field "${name}" is not defined in this vault` };
        if (String(id) === String(field.id)) {
            fields.push([id, String(newValue ?? "").trim()]);
            edited = true;
        } else {
            fields.push([id, valueToSend(value)]);
        }
    }
    if (!edited) fields.push([field.id, String(newValue ?? "").trim()]);

    fields.forEach(([id, value], i) => {
        entries.push([`inventory_sample[fields_attributes][${i}][field_definition_id]`, String(id)]);
        entries.push([`inventory_sample[fields_attributes][${i}][value]`, value]);
    });
    return { entries };
}

export function sampleUrl(vaultId, moleculeId, sampleId) {
    return `/vaults/${vaultId}/molecules/${moleculeId}/inventory_samples/${sampleId}`;
}
