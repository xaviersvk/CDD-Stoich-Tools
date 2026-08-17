// content/features/run-form-templates/protocol-runs.js
//
// A Copy button on every row of a protocol's "Run Data" table.
//
// That table is the one place where every run of a protocol is visible at
// once, with its parameters as columns — which makes it the natural place to
// say "that one, give me those settings" without opening the run first. What
// it copies is exactly what the run page's own Copy produces, so "Paste into
// form" on the target run does not care where the values came from.
//
// Which columns count is NOT guessed from the headers. The same page carries
// a run-definition annotator (`resourceType === "run"`), and its
// protocolFields are the authoritative list of field names — so `Molecules`
// and `Plates`, which are row counts rather than fields, drop out on their
// own rather than by a hand-maintained blocklist.

import { copyText } from "../../utils/clipboard.js";
import { setRunFormStash } from "../../../shared/run-form-templates.js";
import { formatFields } from "./clipboard-io.js";
import { isRunDefinition, normalizeValue, readProps, RUN_DATE_FIELD_NAME } from "./form-model.js";
import { BUTTON_CLASS, injectRunFormTemplateStyles, QUIET_CLASS, ROOT_CLASS } from "./styles.js";

const TABLE_SELECTOR = "table.SimpleDataTable";
const HEADER_ROW_SELECTOR = "tr.header-row";
const MARKER = "cddRunRowCopy";

// Fields that belong to ONE run rather than to the method — the same pair the
// panel's own Copy leaves out. Pasting last week's date and operator into a
// fresh run is never what "reuse these settings" means.
const PER_RUN_FIELDS = new Set([RUN_DATE_FIELD_NAME.toLowerCase(), "person", "date"]);

// The run-definition field names this page knows about, lowercased.
function runFieldNames() {
    for (const annotator of document.querySelectorAll(".protocolAnnotator")) {
        const props = readProps(annotator);
        if (!isRunDefinition(props)) continue;

        const names = new Set([RUN_DATE_FIELD_NAME.toLowerCase()]);
        for (const field of props.protocolFields) {
            const name = field?.definition?.name || field?.label;
            if (name) names.add(normalizeValue(name).toLowerCase());
        }
        return names;
    }
    return null;
}

function headerLabels(table) {
    const headerRow = table.querySelector(HEADER_ROW_SELECTOR);
    if (!headerRow) return null;
    return Array.from(headerRow.cells, (cell) => normalizeValue(cell.innerText));
}

// One run's parameters as {name, value} pairs, in column order.
function rowFields(row, labels, validNames) {
    const out = [];

    Array.from(row.cells).forEach((cell, index) => {
        const label = labels[index];
        if (!label) return;

        const key = label.toLowerCase();
        if (!validNames.has(key) || PER_RUN_FIELDS.has(key)) return;

        const value = normalizeValue(cell.innerText);
        if (!value) return;

        out.push({ name: label, value });
    });

    return out;
}

function attachRowButton(row, labels, validNames, table) {
    if (row.dataset[MARKER] === "1") return;

    const cell = row.cells[row.cells.length - 1];
    if (!cell) return;

    row.dataset[MARKER] = "1";

    const button = document.createElement("button");
    button.type = "button";
    button.className = `${ROOT_CLASS}-inline ${BUTTON_CLASS} ${QUIET_CLASS}`;
    button.textContent = "copy";
    button.title = "Copy this run's parameters, ready for “Paste into form” on another run.";

    button.addEventListener("click", async (event) => {
        event.stopPropagation();

        const fields = rowFields(row, labels, validNames);
        if (!fields.length) {
            button.textContent = "nothing to copy";
            return;
        }

        const text = formatFields(fields);
        const ok = await copyText(text);
        await setRunFormStash(text, {
            protocolName: normalizeValue(document.querySelector("h1")?.textContent),
            fieldCount: fields.length,
        });

        button.textContent = ok ? `copied ${fields.length}` : `kept ${fields.length}`;
        setTimeout(() => { button.textContent = "copy"; }, 2000);
    });

    // The bar's stylesheet is injected on demand; a protocol page may never
    // have shown a run definition bar.
    injectRunFormTemplateStyles();
    cell.appendChild(button);
    void table;
}

export function scanProtocolRunTables() {
    const validNames = runFieldNames();
    if (!validNames) return;

    for (const table of document.querySelectorAll(TABLE_SELECTOR)) {
        const labels = headerLabels(table);
        if (!labels) continue;

        // Only a table whose columns ARE run fields — the same page renders
        // other SimpleDataTables.
        const matches = labels.filter((l) => l && validNames.has(l.toLowerCase())).length;
        if (matches < 3) continue;

        for (const row of table.querySelectorAll("tbody tr")) {
            if (!row.cells?.length) continue;
            attachRowButton(row, labels, validNames, table);
        }
    }
}
