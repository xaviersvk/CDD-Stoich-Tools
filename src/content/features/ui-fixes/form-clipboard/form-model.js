// content/features/ui-fixes/form-clipboard/form-model.js
//
// The data side of carrying a protocol form from one vault to another.
//
// A form is a JSON document whose cells point at field definitions BY ID,
// and an id means nothing — or something else — in another vault. So the
// clipboard never holds an id: at copy time every numeric fieldID becomes
// { $field: name, $component: "protocol" | "run" }, and at paste time the
// name is looked up in the target vault's own definitions. A form that
// refers to a name the target lacks is not created; a document that carries
// a numeric id under a key this file does not know is not even copied,
// because shipping an unknown id is exactly the mistake this exists to stop.
//
// When the target lacks a field, the paste cannot make the form, but it can
// say what to make first: the copy carries the definitions of the fields
// its forms use, in the field clipboard's shape, ready to hand over.
//
// No DOM, no storage; the imports are the tree walk shared with the
// registration form model and the field clipboard's row normalizer.

import { formWalker } from "../../../utils/form-walk.js";
import { normalizeRows } from "../field-clipboard/field-model.js";

export const PLAN_ADD = "add";
export const PLAN_SAME_NAME = "same-name";
export const PLAN_MISSING_FIELDS = "missing-fields";

const COMPONENTS = ["protocol", "run", "readout"];
// Keys carried on a form that belong to the source vault alone.
const SOURCE_ONLY = new Set(["id", "data_set_id", "created_at", "updated_at"]);

// Walk a component's tree once, calling `onCell` for every object that has a
// fieldID, and `onNumber` for every other numeric value keyed like an id.
const walk = formWalker();

function cleanName(name) {
    return String(name ?? "").trim();
}

function byId(list) {
    const map = new Map();
    for (const entry of list || []) {
        if (entry && entry.id != null) map.set(String(entry.id), cleanName(entry.name));
    }
    return map;
}

function byName(list) {
    const map = new Map();
    for (const entry of list || []) {
        if (entry && entry.id != null) map.set(cleanName(entry.name), entry.id);
    }
    return map;
}

// A cell whose field the source vault no longer has, in words the user can
// find on the form: the label cell that sits before it in the same row.
export function lostField(component, path, fieldID, label) {
    return label ? `"${label}" in ${component}` : `id ${fieldID} at ${component}${path}`;
}

// Why a form cannot be copied, and what to do about it. A field deleted from
// the vault leaves its cell behind on the form; that is the user's to fix, so
// it is said apart from an id this extension simply does not know.
export function explainProblems(unknownIds, missingNames) {
    const parts = [];
    if (missingNames?.length) {
        parts.push(`points at a field this vault no longer has: ${missingNames.join("; ")}. Remove that row from the form in CDD, then copy again.`);
    }
    if (unknownIds?.length) parts.push(`carries an id this extension cannot translate: ${unknownIds.join("; ")}`);
    return parts.join(" ");
}

// Source form + the source vault's { protocol: [{id,name}], run: [...] } →
// a form with no ids in it, or the reasons it cannot be carried.
export function neutralize(form, sourceMap) {
    const components = JSON.parse(JSON.stringify(form?.components || {}));
    const names = { protocol: byId(sourceMap?.protocol), run: byId(sourceMap?.run) };
    const unknownIds = [];
    const missingNames = [];

    for (const component of Object.keys(components)) {
        const lookup = names[component];
        walk(components[component], (cell, path, label) => {
            if (typeof cell.fieldID !== "number") return; // built-ins stay as they are
            const name = lookup?.get(String(cell.fieldID));
            if (!name) {
                missingNames.push(lostField(component, path, cell.fieldID, label));
                return;
            }
            delete cell.fieldID;
            cell.$field = name;
            cell.$component = component;
        }, (key, value, path) => {
            unknownIds.push(`${component}${path} = ${value}`);
        });
    }

    const clean = { name: cleanName(form?.name), form_type: form?.form_type, components };
    for (const key of Object.keys(form || {})) {
        if (SOURCE_ONLY.has(key) || key in clean) continue;
        // Anything else on the form is unknown territory; a number is an id
        // until proven otherwise, a string or boolean is carried.
        const value = form[key];
        if (typeof value === "number") unknownIds.push(`${key} = ${value}`);
        else if (typeof value !== "object" || value === null) clean[key] = value;
        else unknownIds.push(`${key} (object)`);
    }

    return { form: clean, unknownIds, missingNames };
}

// Every placeholder in a neutral form, for the preview and for planning.
export function formFieldNames(neutralForm) {
    const out = [];
    for (const component of COMPONENTS) {
        walk(neutralForm?.components?.[component], (cell) => {
            if (cell.$field) out.push({ component: cell.$component || component, name: cell.$field });
        }, () => {});
    }
    return out;
}

// Neutral form + the TARGET vault's map → the document to POST, or the names
// it cannot resolve.
export function resolve(neutralForm, targetMap) {
    const components = JSON.parse(JSON.stringify(neutralForm?.components || {}));
    const ids = { protocol: byName(targetMap?.protocol), run: byName(targetMap?.run) };
    const missing = [];

    for (const component of Object.keys(components)) {
        walk(components[component], (cell) => {
            if (!cell.$field) return;
            const lookup = ids[cell.$component || component];
            const id = lookup?.get(cell.$field);
            if (id == null) {
                missing.push({ component: cell.$component || component, name: cell.$field });
                return;
            }
            cell.fieldID = id;
            delete cell.$field;
            delete cell.$component;
        }, () => {});
    }

    const { components: _ignored, ...rest } = neutralForm || {};
    return { form: { ...rest, components }, missing };
}

export function planForms(neutralForms, targetNames, targetMap) {
    const names = new Set((targetNames || []).map(cleanName));
    const seen = new Set();
    return (neutralForms || []).map((form) => {
        const name = cleanName(form.name);
        if (names.has(name) || seen.has(name)) {
            return { form, status: PLAN_SAME_NAME, note: "same name here", missing: [] };
        }
        seen.add(name);
        const { missing } = resolve(form, targetMap);
        if (missing.length) {
            const unique = [...new Set(missing.map((entry) => entry.name))];
            return { form, status: PLAN_MISSING_FIELDS, note: `missing fields: ${unique.join(", ")}`, missing };
        }
        return { form, status: PLAN_ADD, note: "", missing: [] };
    });
}

// The kinds of field a protocol form points at, in the order a user makes
// them: each is a settings page of its own.
export const FIELD_KINDS = ["protocol", "run"];

// The definitions behind the fields `neutralForms` use, per kind, in the
// field clipboard's shape. Normalized against the whole source list first:
// a required group is "is required" or "or X is required" only once all of
// its members are counted.
export function usedFieldDefinitions(neutralForms, sourceMap) {
    const used = Object.fromEntries(FIELD_KINDS.map((kind) => [kind, new Set()]));
    for (const form of neutralForms || []) {
        for (const { component, name } of formFieldNames(form)) used[component]?.add(name);
    }
    return Object.fromEntries(FIELD_KINDS.map((kind) => [
        kind,
        normalizeRows(sourceMap?.[kind]).filter((field) => used[kind].has(field.name)),
    ]));
}

// What the target lacks for the forms a paste plan cannot make:
// [{ kind, fields: [{ name, definition | null }] }], kinds with nothing
// missing left out. `definition` is null for a clipboard copied before the
// definitions were carried.
export function missingFields(plan, fieldDefinitions) {
    const out = [];
    for (const kind of FIELD_KINDS) {
        const names = [];
        for (const entry of plan || []) {
            if (entry.status !== PLAN_MISSING_FIELDS) continue;
            for (const { component, name } of entry.missing || []) {
                if (component === kind && !names.includes(name)) names.push(name);
            }
        }
        if (!names.length) continue;
        const known = new Map((fieldDefinitions?.[kind] || []).map((field) => [field.name, field]));
        out.push({ kind, fields: names.map((name) => ({ name, definition: known.get(name) || null })) });
    }
    return out;
}

// A name for a copy that lands beside its original: "X (copy)", then
// "X (copy 2)", … — the first one not already taken.
export function suggestName(name, takenNames) {
    const taken = new Set((takenNames || []).map((entry) => cleanName(entry)));
    const base = cleanName(name);
    if (!taken.has(base)) return base;
    let candidate = `${base} (copy)`;
    for (let n = 2; taken.has(candidate); n += 1) candidate = `${base} (copy ${n})`;
    return candidate;
}

export function countPlan(plan) {
    let add = 0;
    let skip = 0;
    for (const entry of plan || []) {
        if (entry.status === PLAN_ADD) add += 1;
        else skip += 1;
    }
    return { add, skip };
}
