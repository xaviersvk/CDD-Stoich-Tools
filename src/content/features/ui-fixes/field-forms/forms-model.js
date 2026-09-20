// content/features/ui-fixes/field-forms/forms-model.js
//
// The data side of "which registration forms show this field": walking a
// registration form's `components[kind]` layout for a `fieldID`, and turning
// the matches into what the bubble behind the field's (i) says. No DOM,
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

// list: formsForField()'s result. totalForms: how many forms the vault has
// at all. -> what the bubble behind the field's (i) says: a heading, one line
// per form, and whether the field is in no form at all — the one case worth
// a colour. A vault with zero forms gets null: nothing to say.
export function describeForms(list, totalForms) {
    if (!totalForms) return null;
    if (!list.length) return { heading: "In no registration form", lines: [], warn: true };
    return {
        heading: `In ${list.length} of ${totalForms} registration form${totalForms === 1 ? "" : "s"}`,
        lines: list.map((entry) => ({ name: entry.name, note: entry.byLayout ? "no layout — shows every field" : "" })),
        warn: false,
    };
}
