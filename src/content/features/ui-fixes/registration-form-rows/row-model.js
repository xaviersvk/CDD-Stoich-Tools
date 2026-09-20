// content/features/ui-fixes/registration-form-rows/row-model.js
//
// The data side of adding batch fields to registration forms that already
// exist: what a new row looks like, which forms can take it, the document to
// send, and the check that the server kept everything else.
//
// All of it measured on real forms:
//
//   - components.batch is either null — the form has no layout of its own
//     and CDD shows every batch field — or { sections: [ { contents: [ a
//     table ] } ] }. A null layout is never given one here: a layout with one
//     row would hide every other field.
//   - a table's rows are always 6 wide: a label cell of span 1 and a field
//     cell, as L1 F5, L1 F2 ×2, L1 F1 ×3 or L1 F0.5 ×4. New rows are built
//     three to a row, so a row of one or two widens its field cells.
//   - a Pick List default is the id of one of the field's pick list values,
//     on the field cell, beside isLocked.
//
// The rest of the document goes back as it came, dead fieldIDs included.
//
// No DOM, no storage, no imports — checkable with `node`.

export const PLAN_ADD = "add";
export const PLAN_HAS_ALL = "has-all";
export const PLAN_NO_LAYOUT = "no-layout";
export const PLAN_ODD_LAYOUT = "odd-layout";

const ROW_WIDTH = 6;
const PAIRS_PER_ROW = 3;
// The form keys CDD itself sends when it saves a registration form.
const SENT = ["name", "components", "registration_type", "structureless_image_name", "allow_new_molecules", "registration_system_id"];

function cleanName(name) {
    return String(name ?? "").trim();
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

// Key order is the server's business; everything else has to match.
export function sameDocument(a, b) {
    if (a === b) return true;
    if (a == null || b == null || typeof a !== "object" || typeof b !== "object") return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) return a.length === b.length && a.every((item, index) => sameDocument(item, b[index]));
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((key) => key in b && sameDocument(a[key], b[key]));
}

function fieldIds(node, out = new Set()) {
    if (Array.isArray(node)) node.forEach((child) => fieldIds(child, out));
    else if (node && typeof node === "object") {
        if (typeof node.fieldID === "number") out.add(node.fieldID);
        for (const value of Object.values(node)) if (value && typeof value === "object") fieldIds(value, out);
    }
    return out;
}

// The last table of the last section: "the end of the batch table".
function lastTable(batch) {
    const sections = batch?.sections;
    if (!Array.isArray(sections) || !sections.length) return null;
    const contents = sections[sections.length - 1]?.contents;
    if (!Array.isArray(contents)) return null;
    const table = [...contents].reverse().find((entry) => entry?.layoutType === "table");
    return table && Array.isArray(table.contents) ? table : null;
}

function rowWidth(row) {
    return (row?.contents || []).reduce((sum, cell) => sum + (typeof cell?.span === "number" ? cell.span : 1), 0);
}

// The user's choice — [{ name, default }] , names and value texts, never ids —
// against this vault's batch field definitions.
export function resolveChosen(chosen, batchDefs) {
    const byName = new Map((batchDefs || []).filter((def) => def && !def.disabled).map((def) => [cleanName(def.name), def]));
    const cells = [];
    const missing = [];
    const droppedDefaults = [];
    for (const pick of chosen || []) {
        const name = cleanName(pick?.name);
        const def = byName.get(name);
        if (!def) {
            missing.push(name);
            continue;
        }
        const cell = { name, fieldID: def.id, defaultValue: null };
        const wanted = cleanName(pick.default);
        if (wanted && def.data_type_name === "PickList") {
            const value = (def.pick_list_values || []).find((entry) => !entry.hidden && cleanName(entry.value) === wanted);
            // A default the pick list lacks is left off, not guessed.
            if (value) cell.defaultValue = value.id;
            else droppedDefaults.push(`${name} = ${wanted}`);
        }
        cells.push(cell);
    }
    return { cells, missing, droppedDefaults };
}

// What adding `cells` would do to one form.
export function planForm(form, cells) {
    const batch = form?.components?.batch;
    if (batch == null) {
        return { status: PLAN_NO_LAYOUT, add: [], note: "no layout of its own — it shows every batch field already" };
    }
    const table = lastTable(batch);
    if (!table) return { status: PLAN_ODD_LAYOUT, add: [], note: "its batch section has no table to add a row to" };
    const odd = table.contents.find((row) => row?.layoutType !== "row" || rowWidth(row) !== ROW_WIDTH);
    if (odd) return { status: PLAN_ODD_LAYOUT, add: [], note: `a row of its batch table is not ${ROW_WIDTH} wide` };

    const present = fieldIds(batch);
    const add = (cells || []).filter((cell) => !present.has(cell.fieldID));
    if (!add.length) return { status: PLAN_HAS_ALL, add: [], note: "has them already" };
    return { status: PLAN_ADD, add, note: `adds ${add.map((cell) => cell.name).join(", ")}` };
}

// Cells in, rows out — three label/field pairs to a row, keys in CDD's order.
export function buildRows(cells) {
    const rows = [];
    for (let start = 0; start < cells.length; start += PAIRS_PER_ROW) {
        const group = cells.slice(start, start + PAIRS_PER_ROW);
        const span = (ROW_WIDTH - group.length) / group.length;
        const contents = [];
        for (const cell of group) {
            contents.push({ span: 1, label: cell.name, isRequired: false, layoutType: "cell" });
            contents.push(cell.defaultValue != null
                ? { span, fieldID: cell.fieldID, isLocked: false, layoutType: "cell", defaultValue: cell.defaultValue }
                : { span, fieldID: cell.fieldID, layoutType: "cell" });
        }
        rows.push({ contents, layoutType: "row" });
    }
    return rows;
}

// The form as it should be afterwards. Throws rather than returning a form
// the plan did not promise.
export function withRows(form, cells) {
    const plan = planForm(form, cells);
    if (plan.status !== PLAN_ADD) throw new Error(plan.note);
    const next = clone(form);
    lastTable(next.components.batch).contents.push(...buildRows(plan.add));
    return next;
}

export function putBody(form) {
    const body = {};
    for (const key of SENT) body[key] = form[key];
    return body;
}

// `expected` is what was sent, `saved` what the server lists afterwards.
// Anything but the agreed document is a problem worth stopping for.
export function verifySaved(expected, saved) {
    const problems = [];
    if (!saved) return ["the form is no longer listed"];
    for (const key of SENT) {
        if (key === "components") continue;
        if (!sameDocument(expected[key] ?? null, saved[key] ?? null)) problems.push(`${key} changed`);
    }
    for (const component of new Set([...Object.keys(expected.components || {}), ...Object.keys(saved.components || {})])) {
        if (!sameDocument(expected.components?.[component] ?? null, saved.components?.[component] ?? null)) {
            problems.push(`the ${component} layout is not what was sent`);
        }
    }
    return problems;
}
