// content/features/run-form-templates/form-model.js
//
// Everything this feature knows about CDD's "Run Definition" form. Two very
// different representations of the same fields, and both are needed:
//
//   READING (view mode) — `div.protocolAnnotator[react_props]` carries the
//   whole form as JSON: `protocolFields[] = {label, value, definition}`, plus
//   `protocolId`, `schemaPrefix` and `resourceType`. No click required, so a
//   template can be saved without ever opening the editor.
//
//   WRITING (edit mode) — "Edit run definition" swaps in a plain RAILS form.
//   Each field is a triplet of inputs sharing an arbitrary index N:
//       run[editable_fields_including_blanks_attributes][N][field_definition_id]
//       run[editable_fields_including_blanks_attributes][N][value]
//       run[editable_fields_including_blanks_attributes][N][id]
//   N is NOT the display order and NOT stable between forms (Lab=0, Person=1,
//   Quality=15, G factor=57 on the assay we mapped), so the definition id is
//   the only key worth holding on to. The run's own date is separate again:
//   `run[run_date]`.
//
// The form is submitted by an explicit Save button — there is no autosave.
// Nothing here ever presses it: a fill loads the controls and stops, so the
// chemist reads the whole form before anything reaches the server.

import {
    KIND_BATCH_LINK,
    KIND_DATE,
    KIND_FILE,
    KIND_NUMBER,
} from "../../../shared/run-form-templates.js";

export const ANNOTATOR_SELECTOR = ".protocolAnnotator";

const FIELD_PREFIX = "run[editable_fields_including_blanks_attributes]";
const RUN_DATE_NAME = "run[run_date]";

// The label a run's own date gets in a template. It has no field definition,
// so the name is all that identifies it.
export const RUN_DATE_FIELD_NAME = "Run Date";

// Waiting is counted in POLL ATTEMPTS, not wall-clock: Chrome throttles
// timers in a background tab to roughly one tick per minute, and a
// wall-clock deadline would expire before the second poll even ran. Only the
// BatchLink picker needs this — it runs a remote search.
const POLL_ATTEMPTS = 40;
const POLL_MS = 150;

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(probe, attempts = POLL_ATTEMPTS) {
    for (let i = 0; i < attempts; i += 1) {
        const result = probe();
        if (result) return result;
        await wait(POLL_MS);
    }
    return null;
}

function mouseClick(element) {
    const rect = element.getBoundingClientRect();
    const options = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        button: 0,
    };
    element.dispatchEvent(new MouseEvent("mousedown", options));
    element.dispatchEvent(new MouseEvent("mouseup", options));
    element.dispatchEvent(new MouseEvent("click", options));
}

// React tracks an input's value on the DOM node itself; assigning `.value`
// hides the change from it. Go through the prototype setter so the framework
// sees a real edit — the same trick the stoichiometry row fill uses.
//
// `change` is opt-out for a reason. The Rails controls want it (a <select>
// especially). CDD's BatchLink autocomplete must NOT get it: a change event
// reads as "commit" to MUI and the component throws the typed text away —
// verified live, the search never even fires. That picker also ignores input
// on an unfocused box, so it is focused first.
function setNativeValue(element, value, { change = true, focus = false } = {}) {
    const prototype = element instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : element instanceof HTMLSelectElement
            ? window.HTMLSelectElement.prototype
            : window.HTMLInputElement.prototype;

    if (focus) element.focus();

    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (setter) setter.call(element, value);
    else element.value = value;

    element.dispatchEvent(new Event("input", { bubbles: true }));
    if (change) element.dispatchEvent(new Event("change", { bubbles: true }));
}

export function normalizeValue(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
}

function sameValue(a, b) {
    const left = normalizeValue(a);
    const right = normalizeValue(b);
    if (left.toLowerCase() === right.toLowerCase()) return true;

    // "5" and "5.0" are the same number in a Number field; comparing them as
    // strings would report a conflict on every fill.
    const na = Number(left.replace(",", "."));
    const nb = Number(right.replace(",", "."));
    return Number.isFinite(na) && Number.isFinite(nb) && na === nb;
}

/* ------------------------------------------------------------------ *
 * Reading — react_props
 * ------------------------------------------------------------------ */

export function readProps(annotator) {
    const raw = annotator?.getAttribute("react_props");
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

// A run's Run Definition, and nothing else. `.protocolAnnotator` also renders
// for other resources, so the payload's own `resourceType` is the test —
// never the URL.
export function isRunDefinition(props) {
    return props?.resourceType === "run" && Array.isArray(props?.protocolFields);
}

export function protocolLabel(props) {
    const form = (props?.formDefinitionList || [])
        .find((f) => String(f?.id) === String(props?.schemaPrefix));
    return {
        protocolId: String(props?.protocolId ?? ""),
        // The run page's own heading — "run of <protocol>" — is the only
        // place the protocol NAME appears; react_props carries just the id.
        protocolName: normalizeValue(
            document.querySelector('a[href*="/protocols/"]')?.textContent
        ),
        formName: normalizeValue(form?.name),
    };
}

function kindOf(field) {
    const name = field?.definition?.data_type_name;
    if (name) return name;
    // The run's own date is the one entry with no definition at all.
    return field?.definition == null && field?.label === "Date" ? KIND_DATE : null;
}

function valueOf(kind, value) {
    if (!value || typeof value !== "object") return "";
    if (kind === KIND_DATE) return value.date_value != null ? String(value.date_value) : "";
    if (kind === KIND_NUMBER) return value.float_value != null ? String(value.float_value) : "";
    if (kind === KIND_FILE) {
        return value.uploaded_file_id != null ? String(value.uploaded_file_id) : "";
    }
    return value.text_value != null ? String(value.text_value) : "";
}

/**
 * Every field the run actually has a value for, in the form's own display
 * order. This is what the "save as template" picker lists.
 *
 * Returns [{ defId, name, label, kind, value }]. `defId` is null for the run
 * date. Fields with no value are left out — a template that wrote blanks
 * would clear the target run rather than fill it.
 */
export function readFilledFields(props) {
    const out = [];

    for (const field of props?.protocolFields || []) {
        const kind = kindOf(field);
        if (!kind) continue;

        const value = valueOf(kind, field?.value);
        if (!normalizeValue(value)) continue;

        const definition = field?.definition || null;
        out.push({
            defId: definition?.id ?? null,
            name: normalizeValue(definition?.name) || RUN_DATE_FIELD_NAME,
            label: normalizeValue(field?.label) || RUN_DATE_FIELD_NAME,
            kind,
            value: normalizeValue(value),
            order: Number.isFinite(definition?.display_order) ? definition.display_order : -1,
        });
    }

    return out.sort((a, b) => a.order - b.order);
}

/* ------------------------------------------------------------------ *
 * Writing — the Rails edit form
 * ------------------------------------------------------------------ */

export function isEditMode(annotator) {
    return !!annotator?.querySelector(`input[name^="${FIELD_PREFIX}"]`);
}

// There is deliberately no openEditor() here. Opening CDD's editor is the
// chemist's move, not ours: a fill that let itself in would leave the run
// editable and dirty without anyone deciding to edit it. The writing
// buttons wait for `isEditMode` instead.

// A BatchLink renders as a MUI autocomplete sitting next to a HIDDEN rails
// input: the hidden field is what Rails submits, the combobox is what a user
// drives. Writing the hidden field directly would submit a batch the React
// component never resolved, so the picker is driven instead.
//
// Refuses to guess: if the nearest ancestor holding the hidden input contains
// more than one combobox, the pairing is ambiguous and this returns null.
function comboFor(control) {
    if (control.getAttribute("data-testid") !== "rails-hidden-fields") return null;

    let box = control.parentElement;
    for (let i = 0; i < 8 && box; i += 1) {
        const combos = box.querySelectorAll('input[role="combobox"]');
        if (combos.length === 1) return combos[0];
        if (combos.length > 1) return null;
        box = box.parentElement;
    }
    return null;
}

/**
 * The live edit controls, keyed by field-definition id (as a string), plus
 * the run date under RUN_DATE_FIELD_NAME.
 *
 * Each entry is { control, combo, index }. `combo` is set only for a
 * BatchLink; `control` is then the hidden rails input it belongs to.
 */
export function readEditControls(annotator) {
    const map = new Map();
    if (!annotator) return map;

    for (const hidden of annotator.querySelectorAll('input[name$="[field_definition_id]"]')) {
        const match = (hidden.getAttribute("name") || "").match(/\[(\d+)\]\[field_definition_id\]$/);
        if (!match) continue;

        const index = match[1];
        const control = annotator.querySelector(`[name="${FIELD_PREFIX}[${index}][value]"]`);
        if (!control) continue;

        map.set(String(hidden.value), { control, combo: comboFor(control), index });
    }

    const runDate = annotator.querySelector(`[name="${RUN_DATE_NAME}"]`);
    if (runDate) map.set(RUN_DATE_FIELD_NAME, { control: runDate, combo: null, index: null });

    return map;
}

// What the form shows for this field right now — the combobox's visible text
// for a BatchLink, the control's own value otherwise.
export function readControlValue(entry) {
    if (!entry) return "";
    const shown = entry.combo ? entry.combo.value : entry.control.value;
    return normalizeValue(shown);
}

function writeSelect(select, value) {
    const wanted = normalizeValue(value).toLowerCase();
    const option = Array.from(select.options).find(
        (o) => normalizeValue(o.value).toLowerCase() === wanted
            || normalizeValue(o.textContent).toLowerCase() === wanted
    );
    if (!option) return { ok: false, reason: `"${value}" is not an option here` };

    setNativeValue(select, option.value);
    return { ok: true };
}

// Type the identifier and take the option that matches it. The list is a
// REMOTE search — it needs a moment, and CDD portals it to <body> as
// `#<comboId>-listbox`, so it is never found by looking inside the form.
//
// The new identifier is typed straight OVER whatever is there; the box is
// never cleared first. Clearing would leave a moment where the field holds
// nothing, and if the search then found no match that moment would be the
// final state — a template quietly deleting a batch link it could not
// replace. Typing over keeps CDD's committed selection untouched until an
// option is actually clicked, and a failure only has to put the display text
// back.
async function writeBatchLink(entry, value) {
    const { combo } = entry;
    if (!combo) return { ok: false, reason: "batch picker not found" };

    const previousText = combo.value;
    const restore = () => {
        if (previousText !== combo.value) {
            setNativeValue(combo, previousText, { change: false, focus: true });
        }
    };

    // Open it the way a user does. focus() alone is not always enough: a
    // closed MUI Autocomplete has been seen to swallow the typed text and
    // never fire its search, while the same code worked on a box whose
    // popup already happened to be open. The click is skipped when it is
    // open already, because there it would TOGGLE the popup shut.
    if (combo.getAttribute("aria-expanded") !== "true") {
        mouseClick(combo);
        await wait(POLL_MS);
    }

    setNativeValue(combo, value, { change: false, focus: true });

    const wanted = normalizeValue(value).toLowerCase();
    const option = await waitFor(() => {
        const listbox = combo.id ? document.getElementById(`${combo.id}-listbox`) : null;
        if (!listbox) return null;

        const options = Array.from(listbox.querySelectorAll('[role="option"]'));
        // Exact identifier first; an option that merely STARTS with it (a
        // vault that appends the molecule name) is the fallback.
        return options.find((o) => normalizeValue(o.textContent).toLowerCase() === wanted)
            || options.find((o) => normalizeValue(o.textContent).toLowerCase().startsWith(wanted))
            || null;
    });

    if (!option) {
        restore();
        return { ok: false, reason: `no batch matching "${value}"` };
    }

    mouseClick(option);

    const landed = await waitFor(
        () => (sameValue(readControlValue(entry), value) ? true : null), 20
    );
    if (landed) return { ok: true };

    restore();
    return { ok: false, reason: "the batch did not stick" };
}

/**
 * Write one template field into its live control. Async because a BatchLink
 * has to go through CDD's remote-search picker.
 *
 * Returns { ok } or { ok: false, reason }.
 */
export async function writeField(entry, field) {
    if (!entry) return { ok: false, reason: "not on this form" };

    if (field.kind === KIND_BATCH_LINK) return writeBatchLink(entry, field.value);

    const { control } = entry;
    if (control instanceof HTMLSelectElement) return writeSelect(control, field.value);

    setNativeValue(control, field.value);
    return sameValue(readControlValue(entry), field.value)
        ? { ok: true }
        : { ok: false, reason: "the value did not stick" };
}

export { sameValue };
