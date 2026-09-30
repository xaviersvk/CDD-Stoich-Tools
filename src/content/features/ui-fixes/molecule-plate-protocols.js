// content/features/ui-fixes/molecule-plate-protocols.js
//
// Adds a "Protocols" column to a molecule's Plates tab
// (`table#molecule-plates-table`): which protocols each plate was run in, with
// the run dates. CDD lists a plate's runs only on the plate's own page, so the
// values come from the same per-plate fetch + session cache as the Plates list
// columns (api/plate-info.js).
//
// A molecule can sit on hundreds of plates and the tab is often never opened,
// so a row is fetched only once it scrolls near the viewport -- rows of the
// hidden tab have no box and never intersect. A plate with two batches spans
// two rows (rowspan on its Name cell); the new cell copies that rowspan and the
// continuation row gets none, so the columns stay aligned.

import { getPlateInfo } from "../../api/plate-info.js";
import { createLimiter } from "../../utils/concurrency.js";
import { watchDocument } from "../../utils/dom.js";

const LOG_PREFIX = "[CDD plate plugin]";

const STYLE_ID = "cdd-molecule-plate-protocols-style";
const TABLE_SELECTOR = "table#molecule-plates-table";
const CELL_CLASS = "cdd-plate-protocols-cell";
const HEADER_CLASS = "cdd-plate-protocols-header";

// Marks a row whose Protocols cell is already inserted (loading or done).
const ROW_ATTR = "data-cdd-protocols";

// Same politeness as the Plates list columns.
const withSlot = createLimiter(4);

let started = false;
let observer = null;
// Protocols cell -> plate path, for the rows waiting to scroll into view.
const pending = new WeakMap();

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        ${TABLE_SELECTOR} td.${CELL_CLASS} {
            font-size: 12px;
            min-width: 200px;
            max-width: 320px;
            overflow-wrap: anywhere;
        }

        ${TABLE_SELECTOR} td.${CELL_CLASS} .cdd-plate-protocols-run {
            display: block;
        }

        /* Each date stays whole; a long list of runs wraps between dates
           instead of widening the column. */
        ${TABLE_SELECTOR} td.${CELL_CLASS} .cdd-plate-protocols-dates a {
            white-space: nowrap;
        }

        ${TABLE_SELECTOR} td.${CELL_CLASS} .cdd-plate-protocols-dates,
        ${TABLE_SELECTOR} td.${CELL_CLASS} .cdd-plate-protocols-muted {
            opacity: 0.6;
        }
    `;

    document.head.appendChild(style);
}

function muted(text, title) {
    const span = document.createElement("span");
    span.className = "cdd-plate-protocols-muted";
    span.textContent = text;
    span.title = title;
    return span;
}

function link(href, text) {
    const a = document.createElement("a");
    a.href = href;
    a.textContent = text;
    return a;
}

// One line per protocol, its runs' dates after it:
//     GloSensor optimization · 2026-02-13, 2026-03-01
function renderRuns(cell, runs) {
    cell.replaceChildren();

    if (runs === null) {
        cell.appendChild(muted("?", "Could not read the plate page"));
        return;
    }
    if (runs.length === 0) {
        cell.appendChild(muted("—", "Plate has not been assayed"));
        return;
    }

    const byProtocol = new Map();
    for (const run of runs) {
        if (!byProtocol.has(run.protocolHref)) {
            byProtocol.set(run.protocolHref, { name: run.protocol, runs: [] });
        }
        byProtocol.get(run.protocolHref).runs.push(run);
    }

    for (const [href, { name, runs: protocolRuns }] of byProtocol) {
        const line = document.createElement("span");
        line.className = "cdd-plate-protocols-run";
        line.appendChild(link(href, name));

        const dated = protocolRuns.filter((run) => run.date && run.runHref);
        if (dated.length) {
            const dates = document.createElement("span");
            dates.className = "cdd-plate-protocols-dates";
            dates.append(" · ");
            dated.forEach((run, i) => {
                if (i) dates.append(", ");
                dates.appendChild(link(run.runHref, run.date));
            });
            line.appendChild(dates);
        }

        cell.appendChild(line);
    }
}

async function fillCell(cell, platePath) {
    const { runs } = await withSlot(() => getPlateInfo(platePath));
    // Torn out mid-fetch (Turbo navigation): the result is cached, so the
    // replacement row fills instantly.
    if (cell.isConnected) renderRuns(cell, runs);
}

function onIntersect(entries) {
    for (const entry of entries) {
        if (!entry.isIntersecting) continue;

        const cell = entry.target;
        observer.unobserve(cell);
        const platePath = pending.get(cell);
        pending.delete(cell);

        fillCell(cell, platePath).catch((err) =>
            console.warn(`${LOG_PREFIX} plate protocols failed`, { platePath, err })
        );
    }
}

// Right after "Name", like the Plates list columns.
function ensureHeader(table) {
    const headerRow = table.tHead?.rows?.[0];
    if (!headerRow || headerRow.querySelector(`.${HEADER_CLASS}`)) return;

    const nameHeader = headerRow.cells[0];
    if (!nameHeader) return;

    const th = document.createElement("th");
    th.className = HEADER_CLASS;
    th.textContent = "Protocols";
    nameHeader.after(th);
}

function ensureRow(row) {
    if (row.hasAttribute(ROW_ATTR)) return;
    row.setAttribute(ROW_ATTR, "");

    // A batch's continuation row: the plate's cells above already span it.
    const nameCell = row.cells[0];
    if (nameCell?.tagName !== "TH") return;

    const cell = document.createElement("td");
    cell.className = `${CELL_CLASS} text__wrap`;
    const rowspan = nameCell.getAttribute("rowspan");
    if (rowspan) cell.setAttribute("rowspan", rowspan);
    nameCell.after(cell);

    const platePath = nameCell.querySelector('a[href*="/plates/"]')?.getAttribute("href");
    if (!platePath) return;

    cell.innerHTML = '<span class="cdd-plate-protocols-muted"><span class="fa fa-spin fa-circle-o-notch"></span></span>';
    pending.set(cell, platePath);
    observer.observe(cell);
}

function ensureProtocolsColumn() {
    const table = document.querySelector(TABLE_SELECTOR);
    if (!table) return;

    ensureHeader(table);

    for (const row of table.tBodies[0]?.rows ?? []) {
        ensureRow(row);
    }
}

export function initMoleculePlateProtocols() {
    if (started) return;
    started = true;

    injectStyles();
    observer = new IntersectionObserver(onIntersect, { rootMargin: "400px 0px" });

    const run = watchDocument(ensureProtocolsColumn);
    run();
}
