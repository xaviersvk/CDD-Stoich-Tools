// content/features/ui-fixes/field-clipboard/page-dom.js
//
// Everything that knows what CDD's "… Fields" settings pages look like, so
// that when CDD renames a class there is exactly one file to fix.
//
// Facts this file is built on, all measured rather than assumed:
//
//   - Every page is a React table. Edit mode is entered through the
//     "Add/Edit … Fields" link and gives every editable row an
//     input[name="name"], a select[name="data_type_name"] whose option VALUES
//     are Text / Number / Date / PickList / File (+ LongText, BatchLink on
//     some pages), checkboxes named unique_value / unique / overwritable /
//     is_single_use / is_display_identifier / required, and on most pages a
//     select[name="required_group_number"] whose options read "is required",
//     "is optional" and "or X is required". The Sample Fields row also has an
//     UNNAMED checkbox — the sample identifier — which is never touched.
//   - "Add a … field" appends a row at the end of the table.
//   - A Pick List row grows a pencil (.editPickListButton) at once, even
//     unsaved. It opens .pickListDefinitionDialog: one text input per value
//     and an empty one whose placeholder says "Type in a value and hit enter
//     or paste in a list of values, one per line". A `paste` event with a
//     multi-line text/plain payload adds one value per line; setting the
//     input's value alone adds nothing. "Update Pick List" closes it.
//   - Nothing reaches the server before the page's own "Update … fields".

import { EVENTS, EVENT_SOURCE } from "../../../../shared/event-types.js";
import { kindConfig } from "./field-model.js";

const PICK_DIALOG = ".pickListDefinitionDialog";
const PICK_BUTTON = ".editPickListButton";
const BRIDGE_TIMEOUT_MS = 500;

/* ----- waiting ----- */

// One beat: the next DOM mutation, or a short timer, whichever is first.
// Timers alone are throttled in a hidden tab; mutations are not.
export function tick(ms = 40) {
    return new Promise((resolve) => {
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            observer.disconnect();
            resolve();
        };
        const observer = new MutationObserver(() => setTimeout(finish, 0));
        observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
        setTimeout(finish, ms);
    });
}

export async function waitFor(predicate, tries = 60) {
    for (let attempt = 0; attempt < tries; attempt += 1) {
        const value = predicate();
        if (value) return value;
        await tick();
    }
    return null;
}

/* ----- finding things ----- */

// A vault can rename any of the nouns ("Molecule" → "Entity"), and the links
// follow, so they are found by shape, not by word. Two tables share the
// Sample/Inventory page: a link belongs to the table in its nearest ancestor
// that holds a table, which is always exactly one. The Add/Edit link may
// carry a trailing "⚠", hence no end anchor.
const EDIT_LINK = /^Add\/Edit .+ Fields\b/;
const ADD_LINK = /^Add (?:an? )?.+ field\b/i;
const UPDATE_BUTTON = /^Update .+ fields\b/i;

function ownTable(el) {
    let node = el.parentElement;
    while (node && !node.querySelector("table")) node = node.parentElement;
    const tables = node ? node.querySelectorAll("table") : [];
    return tables.length === 1 ? tables[0] : null;
}

function visibleLink(kind, pattern) {
    const table = findTable(kind);
    if (!table) return null;
    return [...document.querySelectorAll("a, button")]
        .find((el) => pattern.test(el.textContent.trim()) && el.offsetParent !== null && ownTable(el) === table) || null;
}

// The Update button as this vault words it, for the status line.
export function updateButtonText(kind) {
    return visibleLink(kind, UPDATE_BUTTON)?.textContent.trim() || "Update";
}

export function findTable(kind) {
    const config = kindConfig(kind);
    return config ? document.querySelectorAll("table")[config.tableIndex] || null : null;
}

export function findEditLink(kind) {
    return visibleLink(kind, EDIT_LINK);
}

function editableRows(table) {
    return [...(table?.querySelectorAll("tbody tr") || [])]
        .filter((tr) => tr.querySelector('input[name="name"]'));
}

// A vault with only the built-in rows (Name, Synonyms, Structure) has no
// editable row even in edit mode, so the Add link counts as well.
export function isEditing(kind) {
    return editableRows(findTable(kind)).length > 0 || visibleLink(kind, ADD_LINK) !== null;
}

// Names already on the page, from either mode: the first cell in read mode,
// the name input in edit mode. Used when the bridge is silent.
export function namesFromDom(kind) {
    const table = findTable(kind);
    if (!table) return [];
    return [...table.querySelectorAll("tbody tr")].map((tr) => {
        const input = tr.querySelector('input[name="name"]');
        if (input) return input.value.trim();
        return tr.querySelector("td")?.textContent.trim() || "";
    }).filter(Boolean);
}

export function vaultInfo() {
    const match = /^\/vaults\/(\d+)(?:\/|$)/.exec(location.pathname);
    const name = document.querySelector("#headerSwitcher-current-title")?.textContent.trim() || "";
    return { id: match ? match[1] : null, name };
}

/* ----- the bridge ----- */

let requestCounter = 0;

export function requestFieldRows(kind) {
    const config = kindConfig(kind);
    return new Promise((resolve) => {
        const requestId = `cdd-field-rows-${++requestCounter}`;
        let settled = false;
        const finish = (rows) => {
            if (settled) return;
            settled = true;
            window.removeEventListener("message", onMessage);
            clearTimeout(timer);
            resolve(rows);
        };
        const onMessage = (event) => {
            if (event.source !== window) return;
            const data = event.data;
            if (!data || data.source !== EVENT_SOURCE || data.type !== EVENTS.FIELD_ROWS) return;
            if (data.payload?.requestId !== requestId) return;
            finish(Array.isArray(data.payload.rows) ? data.payload.rows : null);
        };
        const timer = setTimeout(() => finish(null), BRIDGE_TIMEOUT_MS);
        window.addEventListener("message", onMessage);
        window.postMessage(
            { source: EVENT_SOURCE, type: EVENTS.FIELD_ROWS_REQUEST, payload: { requestId, tableIndex: config?.tableIndex ?? 0 } },
            "*",
        );
    });
}

/* ----- writing ----- */

// React tracks an input's value on the node; assigning `.value` hides the
// change from it. The prototype setter plus input+change is what a keystroke
// looks like to React — the same trick every write in this extension uses.
function setNativeValue(element, value) {
    const prototype = element instanceof HTMLSelectElement
        ? window.HTMLSelectElement.prototype
        : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (setter) setter.call(element, value);
    else element.value = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
}

function setCheckbox(tr, name, wanted) {
    const box = tr.querySelector(`input[type="checkbox"][name="${name}"]`);
    if (!box || box.disabled) return;
    if (box.checked !== wanted) box.click();
}

export async function enterEditMode(kind) {
    if (isEditing(kind)) return;
    const link = findEditLink(kind);
    if (!link) throw new Error("the Add/Edit link is not on the page");
    link.click();
    const editing = await waitFor(() => isEditing(kind));
    if (!editing) throw new Error("the page did not switch to editing");
}

export async function addRow(kind) {
    const before = editableRows(findTable(kind)).length;
    const link = visibleLink(kind, ADD_LINK);
    if (!link) throw new Error("the Add field link is not on the page");
    link.click();
    const rows = await waitFor(() => {
        const now = editableRows(findTable(kind));
        return now.length > before ? now : null;
    });
    if (!rows) throw new Error("CDD did not add a row");
    return rows[rows.length - 1];
}

export function typeOptions(tr) {
    const select = tr.querySelector('select[name="data_type_name"]');
    return select ? [...select.options].map((option) => option.value) : [];
}

export async function fillRow(tr, field, requiredText) {
    const nameInput = tr.querySelector('input[name="name"]');
    if (!nameInput) throw new Error("the new row has no name field");
    setNativeValue(nameInput, field.name);
    await tick();

    const typeSelect = tr.querySelector('select[name="data_type_name"]');
    if (!typeSelect) throw new Error("the new row has no type field");
    if (!typeOptions(tr).includes(field.type)) {
        throw new Error(`type ${field.type} is not offered here`);
    }
    setNativeValue(typeSelect, field.type);
    await tick();

    setCheckbox(tr, "unique_value", field.unique);
    setCheckbox(tr, "unique", field.unique);
    setCheckbox(tr, "overwritable", field.overwritable);
    setCheckbox(tr, "is_single_use", field.singleUse);
    setCheckbox(tr, "is_display_identifier", field.displayIdentifier);
    setCheckbox(tr, "required", field.required === "required");

    const requiredSelect = tr.querySelector('select[name="required_group_number"]');
    if (requiredSelect) {
        const option = [...requiredSelect.options].find((candidate) => candidate.textContent.trim() === requiredText);
        if (option) setNativeValue(requiredSelect, option.value);
    }
    await tick();

    const painted = tr.querySelector('input[name="name"]')?.value;
    if (painted !== field.name) throw new Error(`the row reads "${painted}" instead of "${field.name}"`);
}

export async function setPickList(tr, values) {
    if (!values.length) return;
    const pencil = await waitFor(() => tr.querySelector(PICK_BUTTON));
    if (!pencil) throw new Error("the pick list pencil did not appear");
    pencil.click();

    const dialog = await waitFor(() => document.querySelector(PICK_DIALOG));
    if (!dialog) throw new Error("the pick list dialog did not open");

    const entry = await waitFor(() => [...dialog.querySelectorAll("input")]
        .find((input) => input.type !== "checkbox" && input.type !== "hidden" && input.value === "") || null);
    if (!entry) throw new Error("the pick list dialog has no entry box");

    const transfer = new DataTransfer();
    transfer.setData("text/plain", values.join("\n"));
    entry.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));

    const filled = await waitFor(() => {
        const present = [...dialog.querySelectorAll("input")].map((input) => input.value.trim());
        return values.every((value) => present.includes(value)) ? true : null;
    });
    if (!filled) throw new Error("the pick list did not take the values");

    const update = [...dialog.querySelectorAll("a, button")].find((el) => el.textContent.trim() === "Update Pick List");
    if (!update) throw new Error("the pick list dialog has no Update button");
    update.click();

    const closed = await waitFor(() => (document.querySelector(PICK_DIALOG) ? null : true));
    if (!closed) throw new Error("the pick list dialog did not close");
}
