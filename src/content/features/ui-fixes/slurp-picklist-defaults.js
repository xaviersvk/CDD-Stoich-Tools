// content/features/ui-fixes/slurp-picklist-defaults.js
//
// Bulk registration ("slurp") mapping page:
//
//   /vaults/{vault}/slurps/{slurp}/mapping/edit
//
// CDD blocks the import until each required field is mapped or given a
// default ("You must map Origin … Or, provide a default origin."). The default
// dialog is a plain text input even when the field is a pick list, so nobody
// knows what to type. This puts the allowed values next to it as buttons; one
// click applies that value to every record in the file.
//
// WHERE THE VALUES COME FROM
// --------------------------
//   GET /api/internal/v1/vaults/{v}/data_sets/{v}/registration_form_definitions
//
// Works on the session cookie and is small — unlike /molecules/new, which
// api/registration-form-fields.js scrapes. Top-level molecule_field_definitions
// and batch_field_definitions carry { id, data_type_name, pick_list_values }.
//
// HOW CDD APPLIES A DEFAULT
// -------------------------
// Each required field has a hidden dialog form already in the page:
//
//   <form action="/vaults/{v}/slurps/{s}/mapping/headers" data-turbo-stream
//         data-virtual-header-form>
//     <input type="hidden" name="header_mapping[field_definition_id]" value="159492">
//     <input name="virtual_header[virtual_value]" id="provide159492-dialog_virtual_value">
//
// and the error list links to it with a[data-mapping-error-id="provide159492-dialog"].
// A click fills that same form and submits it — exactly "type it, press Apply".
// Turbo then re-renders the mapping section, so injection is idempotent and
// driven by the document watcher.

import { watchDocument } from "../../utils/dom.js";

const PAGE = /^\/vaults\/(\d+)\/slurps\/\d+\/mapping/;

const ROW_CLASS = "cdd-picklist-defaults";
const FIELD_ID_INPUT = 'input[name="header_mapping[field_definition_id]"]';
const VALUE_INPUT = 'input[name="virtual_header[virtual_value]"]';
const ERROR_LINK = 'a[data-mapping-error-id^="provide"]';

let started = false;
let stylesInjected = false;

// vaultId -> Map<fieldId, string[]>, or a Promise while it loads.
const picklistsByVault = new Map();

/* ------------------------------------------------------------------ *
 * Pure helpers
 * ------------------------------------------------------------------ */

// Map<fieldDefinitionId, string[]> of every pick-list field, visible values
// only, in CDD's order.
export function picklistsFromDefinitions(json) {
    const out = new Map();

    for (const key of ["molecule_field_definitions", "batch_field_definitions"]) {
        const list = Array.isArray(json?.[key]) ? json[key] : [];
        for (const def of list) {
            if (def?.data_type_name !== "PickList" || !def.id) continue;

            const values = (Array.isArray(def.pick_list_values) ? def.pick_list_values : [])
                .filter((v) => v && !v.hidden && typeof v.value === "string" && v.value.trim())
                .map((v) => v.value);

            if (values.length) out.set(String(def.id), values);
        }
    }

    return out;
}

// "provide159492-dialog" -> "159492"
export function fieldIdFromErrorId(errorId) {
    return (errorId || "").match(/^provide(\d+)-dialog$/)?.[1] || null;
}

/* ------------------------------------------------------------------ *
 * Data
 * ------------------------------------------------------------------ */

async function fetchPicklists(vaultId) {
    try {
        const response = await fetch(
            `/api/internal/v1/vaults/${vaultId}/data_sets/${vaultId}/registration_form_definitions`,
            { credentials: "same-origin", headers: { Accept: "application/json" } }
        );
        if (!response.ok) return new Map();
        return picklistsFromDefinitions(await response.json());
    } catch {
        return new Map();
    }
}

// Returns the map when loaded, otherwise starts loading and returns null; the
// caller is re-run once it lands.
function picklistsFor(vaultId, rerun) {
    const cached = picklistsByVault.get(vaultId);
    if (cached instanceof Map) return cached;

    if (!cached) {
        picklistsByVault.set(
            vaultId,
            fetchPicklists(vaultId).then((map) => {
                picklistsByVault.set(vaultId, map);
                rerun();
            })
        );
    }
    return null;
}

/* ------------------------------------------------------------------ *
 * DOM
 * ------------------------------------------------------------------ */

function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;

    const style = document.createElement("style");
    style.id = "cdd-picklist-defaults-style";
    style.textContent = `
        .${ROW_CLASS} {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
            margin: 4px 0 6px;
        }
        .${ROW_CLASS} .buttony {
            font-weight: normal;
            margin: 0;
        }
    `;
    document.head.appendChild(style);
}

// The dialog form that applies a default for this field. The column-mapping
// drilldown forms carry the same field id but no value input, so require both.
function defaultFormFor(fieldId) {
    for (const input of document.querySelectorAll(`${FIELD_ID_INPUT}[value="${fieldId}"]`)) {
        const form = input.closest("form");
        if (form?.querySelector(VALUE_INPUT)) return form;
    }
    return null;
}

function applyDefault(fieldId, value) {
    const form = defaultFormFor(fieldId);
    const input = form?.querySelector(VALUE_INPUT);
    if (!input) return;

    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    form.requestSubmit();
}

function buildRow(fieldId, values) {
    const row = document.createElement("div");
    row.className = ROW_CLASS;

    for (const value of values) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "buttony buttony-small";
        button.textContent = value;
        button.title = `Use "${value}" for all records in this file`;
        button.addEventListener("click", (event) => {
            event.preventDefault();
            applyDefault(fieldId, value);
        });
        row.appendChild(button);
    }

    return row;
}

// Under each "You must map X … provide a default x" line.
function decorateErrors(picklists) {
    for (const link of document.querySelectorAll(ERROR_LINK)) {
        const fieldId = fieldIdFromErrorId(link.dataset.mappingErrorId);
        const values = fieldId && picklists.get(fieldId);
        const item = link.closest("li");
        if (!values || !item || item.querySelector(`.${ROW_CLASS}`)) continue;

        item.appendChild(buildRow(fieldId, values));
    }
}

// Inside each "This origin will be used for all records" dialog, below the
// input. The "+ Add a field…" form has no field id and is skipped.
function decorateDialogs(picklists) {
    for (const input of document.querySelectorAll(VALUE_INPUT)) {
        const form = input.closest("form");
        const fieldId = form?.querySelector(FIELD_ID_INPUT)?.value;
        const values = fieldId && picklists.get(fieldId);
        if (!values || form.querySelector(`.${ROW_CLASS}`)) continue;

        const anchor = input.closest("table") || input;
        anchor.insertAdjacentElement("afterend", buildRow(fieldId, values));
    }
}

/* ------------------------------------------------------------------ *
 * Wiring
 * ------------------------------------------------------------------ */

export function initSlurpPicklistDefaults() {
    if (started) return;
    started = true;

    let run = () => {};

    const sync = () => {
        const vaultId = location.pathname.match(PAGE)?.[1];
        if (!vaultId) return;
        if (!document.querySelector(ERROR_LINK) && !document.querySelector(VALUE_INPUT)) return;

        const picklists = picklistsFor(vaultId, () => run());
        if (!picklists || !picklists.size) return;

        injectStyles();
        decorateErrors(picklists);
        decorateDialogs(picklists);
    };

    run = watchDocument(sync);
    run();
}
