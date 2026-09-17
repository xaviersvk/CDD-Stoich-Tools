// content/features/ui-fixes/registration-form-clipboard/form-model.js
//
// The data side of carrying a registration form from one vault to another.
//
// Same rule as the protocol form clipboard: the clipboard never holds an id.
// A registration form points at ids in three places, all measured on real
// forms:
//
//   - every field cell's `fieldID`, under components.molecule / batch /
//     sample / inventory, each against its own list of definitions;
//   - a Pick List cell's numeric `defaultValue`, which is the id of one of
//     that field's pick list values;
//   - the form's `registration_system_id`.
//
// At copy time they become { $field, $component }, { $default: "GC" } and
// $system: "I25-SM". At paste time a field or a default value is looked up
// by name in the target; a system by prefix, then by what follows the first
// dash ("I25-SM" finds "AHL-SM"), then the target's first system — the one
// thing a user may well want different, so the preview says which it chose.
//
// No DOM, no storage, no imports.

export const PLAN_ADD = "add";
export const PLAN_SAME_NAME = "same-name";
export const PLAN_MISSING_FIELDS = "missing-fields";

export const COMPONENTS = ["molecule", "batch", "sample", "inventory"];
// Keys whose numeric values are layout, not references.
const LAYOUT_NUMBERS = new Set(["context", "span"]);
// The form keys CDD itself sends when it saves a registration form.
const CARRIED = ["registration_type", "structureless_image_name", "allow_new_molecules"];

function looksLikeId(key) {
    return /(^|_)id$|ID$|_ids?$|template/i.test(key);
}

function cleanName(name) {
    return String(name ?? "").trim();
}

function walk(node, onCell, onNumber, path = "") {
    if (Array.isArray(node)) {
        node.forEach((child, index) => walk(child, onCell, onNumber, `${path}[${index}]`));
        return;
    }
    if (!node || typeof node !== "object") return;
    if ("fieldID" in node || "$field" in node) onCell(node, path);
    for (const [key, value] of Object.entries(node)) {
        if (key === "fieldID" || key === "$field" || key === "$component" || key === "defaultValue" || key === "$default") continue;
        if (typeof value === "number" && !LAYOUT_NUMBERS.has(key) && looksLikeId(key)) {
            onNumber(key, value, `${path}.${key}`);
        } else if (value && typeof value === "object") {
            walk(value, onCell, onNumber, `${path}.${key}`);
        }
    }
}

// { molecule: [def], batch: [def], … } → component → id → def
function indexById(defs) {
    const out = {};
    for (const component of COMPONENTS) {
        out[component] = new Map((defs?.[component] || []).map((def) => [String(def.id), def]));
    }
    return out;
}

function indexByName(defs) {
    const out = {};
    for (const component of COMPONENTS) {
        out[component] = new Map((defs?.[component] || []).map((def) => [cleanName(def.name), def]));
    }
    return out;
}

// Source form + the source vault's { defs, systems } → a form with no ids in
// it, or the reasons it cannot be carried.
export function neutralize(form, source) {
    const components = JSON.parse(JSON.stringify(form?.components || {}));
    const defs = indexById(source?.defs);
    const unknownIds = [];
    const missingNames = [];

    for (const component of Object.keys(components)) {
        const lookup = defs[component];
        walk(components[component], (cell, path) => {
            if (typeof cell.fieldID !== "number") return;
            const def = lookup?.get(String(cell.fieldID));
            if (!def) {
                missingNames.push(`${component}${path}: id ${cell.fieldID}`);
                return;
            }
            if (cell.defaultValue != null && def.data_type_name === "PickList") {
                const value = (def.pick_list_values || []).find((entry) => String(entry.id) === String(cell.defaultValue));
                if (!value) {
                    unknownIds.push(`${component}${path}.defaultValue = ${cell.defaultValue}`);
                    return;
                }
                delete cell.defaultValue;
                cell.$default = cleanName(value.value);
            }
            delete cell.fieldID;
            cell.$field = cleanName(def.name);
            cell.$component = component;
        }, (key, value, path) => {
            unknownIds.push(`${component}${path} = ${value}`);
        });
    }

    const clean = { name: cleanName(form?.name), form_type: form?.form_type || "registration_form" };
    for (const key of CARRIED) {
        if (form && key in form) clean[key] = form[key];
    }
    const system = form?.registration_system?.prefix
        || (source?.systems || []).find((entry) => String(entry.id) === String(form?.registration_system_id))?.prefix;
    if (system) clean.$system = cleanName(system);
    clean.components = components;

    return { form: clean, unknownIds, missingNames };
}

export function formFieldNames(neutralForm) {
    const out = [];
    for (const component of COMPONENTS) {
        walk(neutralForm?.components?.[component], (cell) => {
            if (cell.$field) out.push({ component: cell.$component || component, name: cell.$field });
        }, () => {});
    }
    return out;
}

function suffix(prefix) {
    const index = prefix.indexOf("-");
    return index >= 0 ? prefix.slice(index + 1).toLowerCase() : null;
}

export function chooseSystem(sourcePrefix, systems) {
    const list = systems || [];
    if (!list.length) return null;
    const wanted = cleanName(sourcePrefix);
    const exact = list.find((entry) => cleanName(entry.prefix) === wanted);
    if (exact) return exact;
    const tail = wanted ? suffix(wanted) : null;
    const sameTail = tail ? list.filter((entry) => suffix(cleanName(entry.prefix)) === tail) : [];
    if (sameTail.length === 1) return sameTail[0];
    return list[0];
}

// Neutral form + the TARGET vault's { defs, systems } → the document to POST,
// the fields it cannot resolve, and the system it picked.
export function resolve(neutralForm, target) {
    const components = JSON.parse(JSON.stringify(neutralForm?.components || {}));
    const defs = indexByName(target?.defs);
    const missing = [];
    const droppedDefaults = [];

    for (const component of Object.keys(components)) {
        walk(components[component], (cell) => {
            if (!cell.$field) return;
            const owner = cell.$component || component;
            const def = defs[owner]?.get(cell.$field);
            if (!def) {
                missing.push({ component: owner, name: cell.$field });
                return;
            }
            if (cell.$default != null) {
                const value = (def.pick_list_values || []).find((entry) => cleanName(entry.value) === cell.$default);
                // A default the target's pick list lacks is left off, not guessed.
                if (value) cell.defaultValue = value.id;
                else droppedDefaults.push(`${cell.$field} = ${cell.$default}`);
                delete cell.$default;
            }
            cell.fieldID = def.id;
            delete cell.$field;
            delete cell.$component;
        }, () => {});
    }

    const { components: _components, $system, ...rest } = neutralForm || {};
    const system = chooseSystem($system, target?.systems);
    const form = { ...rest, components };
    if (system) form.registration_system_id = system.id;
    return { form, missing, droppedDefaults, system: system ? cleanName(system.prefix) : null };
}

export function planForms(neutralForms, targetNames, target) {
    const names = new Set((targetNames || []).map(cleanName));
    const seen = new Set();
    return (neutralForms || []).map((form) => {
        const name = cleanName(form.name);
        if (names.has(name) || seen.has(name)) {
            return { form, status: PLAN_SAME_NAME, note: "same name here", missing: [] };
        }
        seen.add(name);
        const { missing, droppedDefaults, system } = resolve(form, target);
        if (missing.length) {
            const unique = [...new Set(missing.map((entry) => entry.name))];
            return { form, status: PLAN_MISSING_FIELDS, note: `missing fields: ${unique.join(", ")}`, missing };
        }
        if (!system) {
            return { form, status: PLAN_MISSING_FIELDS, note: "no registration system in this vault yet", missing: [] };
        }
        const notes = [`system ${system}`];
        if (droppedDefaults.length) notes.push(`no default for ${droppedDefaults.join(", ")}`);
        return { form, status: PLAN_ADD, note: notes.join(" · "), missing: [] };
    });
}
