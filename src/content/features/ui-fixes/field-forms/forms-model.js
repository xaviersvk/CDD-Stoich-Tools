// content/features/ui-fixes/field-forms/forms-model.js
//
// The data side of "which registration forms show this field": walking a
// registration form's `components[kind]` layout for a `fieldID`, and turning
// the matches into what the annotation under the field's name says. No DOM,
// no storage, no imports — checkable with `node`.
//
// A form "implements" field F of kind K when `components[K]` is null or
// absent — CDD then draws every field of that kind, so there is nothing to
// opt out of — or when some cell under it carries `fieldID === F.id`. A
// field cell is any object with a numeric `fieldID`; the nesting
// (sections -> table -> row -> cell) is walked generically rather than
// assumed, the same caution registration-form-clipboard/form-model.js takes
// with the very same trees.

function hasFieldId(node, fieldId, seen) {
    if (Array.isArray(node)) return node.some((child) => hasFieldId(child, fieldId, seen));
    if (!node || typeof node !== "object") return false;
    if (seen.has(node)) return false; // defends a hostile/cyclic tree; JSON.parse output never cycles in practice
    seen.add(node);
    if (typeof node.fieldID === "number" && node.fieldID === fieldId) return true;
    return Object.values(node).some((value) => (
        value && typeof value === "object" ? hasFieldId(value, fieldId, seen) : false
    ));
}

// forms: the array listRegistrationForms() resolves to. kind: "molecule" |
// "batch" | "sample" | "inventory". fieldId: the field's numeric id.
// -> [{ name, byLayout }], byLayout true when the form has no layout for
// this kind and is showing the field only because it shows every field.
export function formsForField(forms, kind, fieldId) {
    if (!Array.isArray(forms) || typeof fieldId !== "number") return [];
    const out = [];
    for (const form of forms) {
        const name = String(form?.name ?? "").trim();
        if (!name) continue;
        const layout = form?.components?.[kind];
        if (layout == null) {
            out.push({ name, byLayout: true });
        } else if (hasFieldId(layout, fieldId, new Set())) {
            out.push({ name, byLayout: false });
        }
    }
    return out;
}

const SHOW_NAMES_MAX = 4;

// list: formsForField()'s result. totalForms: how many forms the vault has
// at all (registration_form_definitions.length) — "In no registration form"
// is only said when there are forms and none of them show the field; a
// vault with zero forms gets no annotation (null), which init.js reads as
// "render nothing".
export function describeForms(list, totalForms) {
    if (!totalForms) return null;

    if (!list.length) {
        return { text: "In no registration form", title: "", warn: true };
    }

    const title = list
        .map((entry) => (entry.byLayout ? `${entry.name} (no layout — shows every field)` : entry.name))
        .join("\n");

    if (list.length <= SHOW_NAMES_MAX) {
        return { text: `Forms: ${list.map((entry) => entry.name).join(", ")}`, title, warn: false };
    }
    return { text: `In ${list.length} of ${totalForms} forms`, title, warn: false };
}
