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
//   - forms made from the vault template end in rows of File fields only
//     (NMR · COA · MS, MSDS File · Vendor QC/COA, Documentation). New rows go
//     above that closing block, so the files stay last; a form that does not
//     end in files gets them at the end. A row this feature put below the
//     files before it knew better is moved up — and only such a row: one made
//     of nothing but the chosen fields, sitting under the closing file rows.
//   - forms laid out by hand often carry the Pick List cell without a default.
//     Where the user chose a default and the form's cell has NONE, it is set —
//     in the same save as a row added or moved. A cell that has a default,
//     any default, is somebody's decision and is left alone.
//
// The rest of the document goes back as it came, dead fieldIDs included.
//
// No DOM, no storage, no imports — checkable with `node`.

export const PLAN_ADD = "add";
export const PLAN_MOVE = "move";
export const PLAN_DEFAULT = "default";
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

function rowFieldIds(row) {
    return (row?.contents || []).filter((cell) => typeof cell?.fieldID === "number").map((cell) => cell.fieldID);
}

// The ids of this vault's File fields; a dead id is in no set, so a row that
// carries one is never taken for a file row.
export function fileFieldIds(batchDefs) {
    return new Set((batchDefs || []).filter((def) => def?.data_type_name === "File").map((def) => def.id));
}

// Where new rows go: above the closing run of rows that hold File fields only.
function insertionIndex(rows, fileIds) {
    let index = rows.length;
    while (index > 0) {
        const ids = rowFieldIds(rows[index - 1]);
        if (!ids.length || !ids.every((id) => fileIds.has(id))) break;
        index -= 1;
    }
    return index;
}

// Rows of nothing but the chosen fields that sit below the closing file rows,
// and the table as it should be instead — or null when there is nothing to move.
function misplaced(rows, cells, fileIds) {
    const chosen = new Set((cells || []).map((cell) => cell.fieldID));
    const own = rows.filter((row) => {
        const ids = rowFieldIds(row);
        return ids.length > 0 && ids.every((id) => chosen.has(id));
    });
    if (!own.length) return null;
    const others = rows.filter((row) => !own.includes(row));
    const at = insertionIndex(others, fileIds);
    if (at === others.length) return null; // no closing file rows to be above
    const firstFileRow = others[at];
    if (!own.every((row) => rows.indexOf(row) > rows.indexOf(firstFileRow))) return null;
    return [...others.slice(0, at), ...own, ...others.slice(at)];
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
        const cell = { name, fieldID: def.id, defaultValue: null, defaultText: null };
        const wanted = cleanName(pick.default);
        if (wanted && def.data_type_name === "PickList") {
            const value = (def.pick_list_values || []).find((entry) => !entry.hidden && cleanName(entry.value) === wanted);
            // A default the pick list lacks is left off, not guessed.
            if (value) {
                cell.defaultValue = value.id;
                cell.defaultText = wanted;
            } else droppedDefaults.push(`${name} = ${wanted}`);
        }
        cells.push(cell);
    }
    return { cells, missing, droppedDefaults };
}

// The form's own cells of chosen fields that have no default, where one was chosen.
function cellsWithoutDefault(batch, cells) {
    const wanted = new Map((cells || []).filter((cell) => cell.defaultValue != null).map((cell) => [cell.fieldID, cell]));
    const out = [];
    (function walk(node) {
        if (Array.isArray(node)) node.forEach(walk);
        else if (node && typeof node === "object") {
            if (wanted.has(node.fieldID) && node.defaultValue == null) out.push({ node, cell: wanted.get(node.fieldID) });
            for (const value of Object.values(node)) if (value && typeof value === "object") walk(value);
        }
    })(batch);
    return out;
}

// Keys in the order CDD writes a field cell with a default.
function setDefault(node, value) {
    const copy = { ...node };
    for (const key of Object.keys(node)) delete node[key];
    for (const key of ["span", "fieldID"]) if (key in copy) node[key] = copy[key];
    node.isLocked = copy.isLocked ?? false;
    for (const [key, kept] of Object.entries(copy)) if (!(key in node) && key !== "defaultValue") node[key] = kept;
    node.defaultValue = value;
}

// What adding `cells` would do to one form. `fileIds`: fileFieldIds().
export function planForm(form, cells, fileIds = new Set()) {
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
    const defaults = [...new Set(cellsWithoutDefault(batch, cells).map(({ cell }) => cell))];
    const defaultsNote = defaults.length
        ? `sets the default ${defaults.map((cell) => `"${cell.defaultText}" on ${cell.name}`).join(", ")}`
        : "";
    if (!add.length) {
        if (misplaced(table.contents, cells, fileIds)) {
            return {
                status: PLAN_MOVE,
                add: [],
                defaults,
                note: `has them below the file rows — moves them above${defaultsNote ? ` · ${defaultsNote}` : ""}`,
            };
        }
        if (defaults.length) return { status: PLAN_DEFAULT, add: [], defaults, note: `has them — ${defaultsNote}` };
        return { status: PLAN_HAS_ALL, add: [], defaults, note: "has them already" };
    }
    const aboveFiles = insertionIndex(table.contents, fileIds) < table.contents.length;
    return {
        status: PLAN_ADD,
        add,
        defaults,
        note: `adds ${add.map((cell) => cell.name).join(", ")}${aboveFiles ? " — above the file rows" : ""}${defaultsNote ? ` · ${defaultsNote}` : ""}`,
    };
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
export function withRows(form, cells, fileIds = new Set()) {
    const plan = planForm(form, cells, fileIds);
    if (plan.status !== PLAN_ADD && plan.status !== PLAN_MOVE && plan.status !== PLAN_DEFAULT) throw new Error(plan.note);
    const next = clone(form);
    const table = lastTable(next.components.batch);
    // Defaults first, on the form's own cells; the rows built below carry theirs already.
    for (const { node, cell } of cellsWithoutDefault(next.components.batch, cells)) setDefault(node, cell.defaultValue);
    if (plan.status === PLAN_MOVE) table.contents = misplaced(table.contents, cells, fileIds);
    else if (plan.status === PLAN_ADD) table.contents.splice(insertionIndex(table.contents, fileIds), 0, ...buildRows(plan.add));
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
