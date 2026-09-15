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
// No DOM, no storage, no imports.

export const PLAN_ADD = "add";
export const PLAN_SAME_NAME = "same-name";
export const PLAN_MISSING_FIELDS = "missing-fields";

const COMPONENTS = ["protocol", "run", "readout"];
// Keys whose numeric values are layout, not references.
const LAYOUT_NUMBERS = new Set(["context", "span"]);
// Keys carried on a form that belong to the source vault alone.
const SOURCE_ONLY = new Set(["id", "data_set_id", "created_at", "updated_at"]);

function looksLikeId(key) {
    return /(^|_)id$|ID$|_ids?$|template/i.test(key);
}

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

// Walk a component's tree once, calling `onCell` for every object that has a
// fieldID, and `onNumber` for every other numeric value keyed like an id.
function walk(node, onCell, onNumber, path = "") {
    if (Array.isArray(node)) {
        node.forEach((child, index) => walk(child, onCell, onNumber, `${path}[${index}]`));
        return;
    }
    if (!node || typeof node !== "object") return;
    if ("fieldID" in node || "$field" in node) onCell(node, path);
    for (const [key, value] of Object.entries(node)) {
        if (key === "fieldID" || key === "$field" || key === "$component") continue;
        if (typeof value === "number" && !LAYOUT_NUMBERS.has(key) && looksLikeId(key)) {
            onNumber(key, value, `${path}.${key}`);
        } else if (value && typeof value === "object") {
            walk(value, onCell, onNumber, `${path}.${key}`);
        }
    }
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
        walk(components[component], (cell, path) => {
            if (typeof cell.fieldID !== "number") return; // built-ins stay as they are
            const name = lookup?.get(String(cell.fieldID));
            if (!name) {
                missingNames.push(`${component}${path}: id ${cell.fieldID}`);
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

export function countPlan(plan) {
    let add = 0;
    let skip = 0;
    for (const entry of plan || []) {
        if (entry.status === PLAN_ADD) add += 1;
        else skip += 1;
    }
    return { add, skip };
}
