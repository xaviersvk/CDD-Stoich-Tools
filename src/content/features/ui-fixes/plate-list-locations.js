// content/features/ui-fixes/plate-list-locations.js
//
// Adds a "Location" column to the Plates list table (Explore Data -> Plates,
// `table#plateList`). CDD shows the Inventory Location only on each plate's own
// page, so every row starts with a small spinner and the value streams in as it
// resolves -- same per-plate fetch + session cache as the hover bubble
// (api/plate-info.js), so a plate already hovered or exported fills instantly.
//
// Fetches are limited to a few in flight (the plate pages are full HTML), and
// each row is marked with a data attribute so the MutationObserver re-runs --
// Turbo body swaps, per-page changes, sort reloads -- stay idempotent.

import { getPlateInfo } from "../../api/plate-info.js";

const LOG_PREFIX = "[CDD plate plugin]";

const STYLE_ID = "cdd-plate-list-locations-style";
const TABLE_SELECTOR = "table#plateList";
const CELL_CLASS = "cdd-plate-location-cell";
const HEADER_CLASS = "cdd-plate-location-header";
// Marks a row whose location cell is already inserted (loading or done).
const ROW_ATTR = "data-cdd-location";

// Concurrent plate-page fetches: enough to be quick, polite to CDD. Matches
// plate-location-export.js.
const CONCURRENCY = 4;

let started = false;

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        ${TABLE_SELECTOR} td.${CELL_CLASS} {
            font-size: 12px;
            max-width: 260px;
            overflow-wrap: anywhere;
        }

        ${TABLE_SELECTOR} td.${CELL_CLASS} .cdd-plate-location-loading {
            opacity: 0.55;
        }

        ${TABLE_SELECTOR} td.${CELL_CLASS} .cdd-plate-location-empty {
            opacity: 0.55;
        }
    `;

    document.head.appendChild(style);
}

// Tiny semaphore so at most CONCURRENCY plate pages load at once, however many
// rows the observer enqueues (a 500-per-page list would otherwise fire 500
// parallel fetches on first paint).
let active = 0;
const waiters = [];

async function withSlot(task) {
    if (active >= CONCURRENCY) {
        await new Promise((resolve) => waiters.push(resolve));
    }
    active += 1;
    try {
        return await task();
    } finally {
        active -= 1;
        waiters.shift()?.();
    }
}

function renderLocation(cell, inventoryLocation) {
    cell.replaceChildren();

    if (inventoryLocation) {
        cell.textContent = inventoryLocation;
        return;
    }

    const empty = document.createElement("span");
    empty.className = "cdd-plate-location-empty";
    empty.textContent = "—";
    empty.title = "No inventory location set";
    cell.appendChild(empty);
}

async function fillCell(cell, platePath) {
    const { inventoryLocation } = await withSlot(() => getPlateInfo(platePath));

    // The row can be torn out mid-fetch (Turbo navigation, re-sort). The result
    // is cached, so the replacement row fills instantly on the next pass.
    if (!cell.isConnected) return;

    renderLocation(cell, inventoryLocation);
}

// Insert the "Location" header right after "Name" (the search box already says
// "Search plates by name and location", so the pairing reads naturally).
function ensureHeader(table) {
    const headerRow = table.tHead?.rows?.[0];
    if (!headerRow || headerRow.querySelector(`.${HEADER_CLASS}`)) return;

    const nameHeader = headerRow.cells[0];
    if (!nameHeader) return;

    const th = document.createElement("th");
    th.className = HEADER_CLASS;
    th.textContent = "Location";
    nameHeader.after(th);
}

function ensureRow(row) {
    if (row.hasAttribute(ROW_ATTR)) return;
    row.setAttribute(ROW_ATTR, "");

    const nameCell = row.cells[0];
    const link = nameCell?.querySelector('a[href*="/plates/"]');
    const platePath = link?.getAttribute("href");

    const cell = document.createElement("td");
    cell.className = `${CELL_CLASS} text__wrap`;

    if (!platePath) {
        // Row without a plate link (defensive): keep the column aligned, empty.
        nameCell?.after(cell);
        return;
    }

    const loading = document.createElement("span");
    loading.className = "cdd-plate-location-loading";
    loading.innerHTML = '<span class="fa fa-spin fa-circle-o-notch"></span>';
    cell.appendChild(loading);
    nameCell.after(cell);

    fillCell(cell, platePath).catch((err) =>
        console.warn(`${LOG_PREFIX} plate list location failed`, { platePath, err })
    );
}

function ensureLocationColumn() {
    const table = document.querySelector(TABLE_SELECTOR);
    if (!table) return;

    ensureHeader(table);

    for (const row of table.tBodies[0]?.rows ?? []) {
        ensureRow(row);
    }
}

export function initPlateListLocations() {
    if (started) return;
    started = true;

    injectStyles();

    let scheduled = false;
    const run = () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            ensureLocationColumn();
        });
    };

    // Observe <html>: Turbo swaps <body> on navigation and the table re-renders
    // on sort/per-page changes; row/header attrs keep re-runs idempotent.
    const observer = new MutationObserver(run);
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
    });

    run();
}
