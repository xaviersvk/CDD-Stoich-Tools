// content/features/ui-fixes/field-forms/init.js
//
// Discovery + wiring: on the Molecule / Batch / Sample / Inventory "…
// Fields" settings pages, print under each field's name which registration
// forms show it — protocol/run/eln have no registration-form component, so
// those three kinds of field-clipboard/field-model.js's KINDS are skipped.
//
// Registration forms are read once per vault per page visit (the promise is
// cached by vault id — a fresh page visit is a fresh content-script
// instance, so the cache starts empty on its own) through
// registration-form-clipboard/api.js, the same internal endpoint that
// feature's Copy button uses. The field's own id comes back through the
// field-rows bridge the field clipboard already relies on
// (inject/hooks/field-rows-bridge.js via field-clipboard/page-dom.js);
// serializeRow() there copies every plain-value key off the raw row, `id`
// included.
//
// A read-mode <tr>'s raw row is found by matching the DOM row's displayed
// name against a name -> [id, id, …] queue built from the bridge's rows, in
// bridge order; a duplicate name is resolved in that same order, and a name
// the bridge did not recognise (built-in rows: Name, Synonyms, Structure, …
// have no field id at all) is quietly skipped — exactly the "no id, no
// annotation" rule the spec calls for.
//
// Edit mode is left alone: every name cell there is CDD's own <input>, and
// a line left over from read mode is taken out. Nothing here replaces or
// moves a CDD node — one `.cdd-field-forms` span per row is appended, once,
// so re-running the pass (Turbo body swap, MutationObserver noise) is safe.
// The line sits in the name cell, so names are read through
// page-dom.js's readModeName(), which reads around it.

import { listRegistrationForms, vaultIdFromPath } from "../registration-form-clipboard/api.js";
import { kindsForPath } from "../field-clipboard/field-model.js";
import { FIELD_FORMS_CLASS, findTable, isEditing, readModeName, requestFieldRows } from "../field-clipboard/page-dom.js";
import { describeForms, formsForField } from "./forms-model.js";
import { injectFieldFormsStyles } from "./styles.js";

// Registration forms only have a component for these four kinds.
const KEPT_KINDS = new Set(["molecule", "batch", "sample", "inventory"]);
const ANNOTATION_CLASS = FIELD_FORMS_CLASS;

let started = false;

// vaultId -> Promise<forms[] | null>. A new page visit is a new module
// instance, so this starts empty on its own; nothing here needs to clear it.
const formsCache = new Map();

function formsForVault(vaultId) {
    if (!formsCache.has(vaultId)) {
        formsCache.set(
            vaultId,
            listRegistrationForms(vaultId).catch((error) => {
                console.warn("[CDD field-forms] could not read registration forms", error);
                return null;
            }),
        );
    }
    return formsCache.get(vaultId);
}

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

// Read mode only: an editable row carries CDD's own name input.
function readModeRows(table) {
    return [...(table?.querySelectorAll("tbody tr") || [])]
        .filter((tr) => !tr.querySelector('input[name="name"]'));
}

// name -> [id, id, …] in bridge order. Rows the bridge sent without a
// numeric id (built-ins have no field id to begin with) never enter a queue,
// so looking one up for such a row correctly comes back empty.
function idQueuesByName(rawRows) {
    const queues = new Map();
    for (const row of rawRows || []) {
        const id = row?.id;
        if (typeof id !== "number") continue;
        const name = String(row?.name ?? "").trim();
        if (!name) continue;
        if (!queues.has(name)) queues.set(name, []);
        queues.get(name).push(id);
    }
    return queues;
}

function annotate(tr, described) {
    const cell = tr.querySelector("td");
    if (!cell || cell.querySelector(`.${ANNOTATION_CLASS}`)) return;
    const span = el("span", ANNOTATION_CLASS, described.text);
    if (described.warn) span.classList.add(`${ANNOTATION_CLASS}--warn`);
    if (described.title) span.title = described.title;
    cell.appendChild(span);
}

async function annotateKind(kind, vaultId) {
    const table = findTable(kind);
    if (!table) return;
    if (isEditing(kind)) {
        table.querySelectorAll(`.${ANNOTATION_CLASS}`).forEach((node) => node.remove());
        return;
    }
    const rows = readModeRows(table);
    if (!rows.length) return;

    const [forms, rawRows] = await Promise.all([formsForVault(vaultId), requestFieldRows(kind)]);
    if (!forms || !forms.length || !rawRows) return;
    // The page may have flipped to edit mode while the bridge/fetch was in flight.
    if (isEditing(kind)) return;

    const queues = idQueuesByName(rawRows);
    for (const tr of rows) {
        // Taken off the queue even for a row that has its line already, so a
        // name used twice keeps pairing up in order.
        const queue = queues.get(readModeName(tr));
        const id = queue && queue.length ? queue.shift() : null;
        if (id == null || tr.querySelector(`.${ANNOTATION_CLASS}`)) continue;
        const described = describeForms(formsForField(forms, kind, id), forms.length);
        if (described) annotate(tr, described);
    }
}

function mount() {
    const vaultId = vaultIdFromPath(location.pathname);
    if (!vaultId) return;
    for (const { kind } of kindsForPath(location.pathname)) {
        if (!KEPT_KINDS.has(kind)) continue;
        annotateKind(kind, vaultId).catch((error) => {
            // A missing annotation must never cost the user the page.
            console.warn("[CDD field-forms] annotate failed", error);
        });
    }
}

export function initFieldForms() {
    injectFieldFormsStyles();
    if (started) return;
    started = true;

    let scheduled = false;
    const schedule = () => {
        if (scheduled) return;
        scheduled = true;
        setTimeout(() => {
            scheduled = false;
            try {
                mount();
            } catch (error) {
                console.warn("[CDD field-forms] mount failed", error);
            }
        }, 48);
    };

    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
    schedule();
}
