// content/features/ui-fixes/plate-map-export.js
//
// Adds an "Export Plate Map (CSV)" link to the tab bar of a plate page
// (Plate Details / Projects / Plate Map). It reads the rendered
// `.plateLayout` grid -- the same table the structure tooltip hovers -- and
// downloads one row per occupied well:
//     Barcode, Well, Name, Batch ID, Sample ID
// "Barcode" is the plate's barcode field when the vault shows one, otherwise
// the plate name (vaults without a barcode field use the name as the barcode).
// "Name" is the well's full entity id (the well link text); Batch ID/Sample ID
// come from the shared splitBatchAndSample(), so the id shape stays defined in
// exactly one place (shared/prefix-colors.js).
//
// Everything is already in the DOM, so the export is instant -- no fetches.
// Heat maps in search results render the same `.plateLayout` table but have no
// plate tab bar, so keying the link off the #plate-mapLink toolbar keeps us
// off those pages.

import { buildCsv, downloadCsv } from "../../utils/csv.js";
import { splitBatchAndSample } from "../../../shared/prefix-colors.js";

const LOG_PREFIX = "[CDD plate plugin]";

const STYLE_ID = "cdd-plate-map-export-style";
const LINK_ID = "cdd-plate-map-export-link";
const TABLE_SELECTOR = "table.plateLayout";

// Only real plate pages, e.g. /vaults/6884/plates/1952907.
const PLATE_PATH_RE = /\/vaults\/\d+\/plates\/\d+/;

let started = false;

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        #${LINK_ID} {
            margin-left: 12px;
            white-space: nowrap;
        }
    `;

    document.head.appendChild(style);
}

// The barcode column: explicit barcode field when the vault has one, else the
// plate name (same cell plate-info.js reads its fields from), else the <h1>.
function readBarcode() {
    return (
        document.querySelector("#plate_data_table_barcode")?.textContent.trim() ||
        document.querySelector("#plate_data_table_name")?.textContent.trim() ||
        document.querySelector("h1")?.textContent.trim() ||
        ""
    );
}

// Walk the plate grid: rows[0] holds the column labels (01..24) in THs, each
// data row starts with its letter TH (A..P); cellIndex lines the two up (no
// colspans in CDD's plate table). Empty wells are skipped.
function collectRows(table, barcode) {
    const header = table.rows[0];
    if (!header) return [];

    const rows = [];
    for (let r = 1; r < table.rows.length; r += 1) {
        const row = table.rows[r];
        const rowLabel = row.cells[0]?.textContent.trim() || "";

        for (const cell of row.cells) {
            if (!cell.classList.contains("well")) continue;

            const name = (cell.querySelector("a") || cell).textContent.trim();
            if (!name) continue;

            const colLabel = header.cells[cell.cellIndex]?.textContent.trim() || "";
            const { batchId, sampleId } = splitBatchAndSample(name);
            rows.push([barcode, `${rowLabel}${colLabel}`, name, batchId, sampleId]);
        }
    }

    return rows;
}

function runExport(status) {
    const table = document.querySelector(TABLE_SELECTOR);
    if (!table) return;

    const barcode = readBarcode();
    const rows = collectRows(table, barcode);

    if (!rows.length) {
        status.textContent = "No occupied wells";
        return;
    }

    const safeName = (barcode || "plate").replace(/[^\w.-]+/g, "_");
    downloadCsv(
        `cdd-plate-map-${safeName}.csv`,
        buildCsv(["Barcode", "Well", "Name", "Batch ID", "Sample ID"], rows)
    );
    status.textContent = `Exported ${rows.length} well(s)`;
}

// Add our link into the empty `.right` half of the plate page's tab bar. The
// toolbar is found via #plate-mapLink so heat maps and other .container-toolbar
// bars elsewhere in the app are never touched.
function ensureLink() {
    if (!PLATE_PATH_RE.test(location.pathname)) return;

    const table = document.querySelector(TABLE_SELECTOR);
    if (!table || !table.querySelector("td.well")) return;

    const bar = document
        .querySelector("#plate-mapLink")
        ?.closest(".container-toolbar")
        ?.querySelector(".right");
    if (!bar || bar.querySelector(`#${LINK_ID}`)) return;

    const link = document.createElement("a");
    link.id = LINK_ID;
    link.href = "#";
    link.textContent = "Export Plate Map (CSV)";

    const status = document.createElement("span");
    status.className = "cdd-plate-map-export-status";
    status.style.marginLeft = "8px";
    status.style.fontSize = "12px";
    status.style.opacity = "0.8";

    link.addEventListener("click", (event) => {
        event.preventDefault();
        try {
            runExport(status);
        } catch (err) {
            console.warn(`${LOG_PREFIX} plate map export failed`, err);
            status.textContent = `Failed: ${err?.message || err}`;
        }
    });

    bar.append(link, status);
}

export function initPlateMapExport() {
    if (started) return;
    started = true;

    injectStyles();

    let scheduled = false;
    const run = () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            ensureLink();
        });
    };

    // Observe <html>: Turbo swaps <body> on navigation and the plate map React
    // component mounts after us; ensureLink() is idempotent per render.
    const observer = new MutationObserver(run);
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
    });

    run();
}
