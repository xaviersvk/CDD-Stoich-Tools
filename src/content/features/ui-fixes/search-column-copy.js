// content/features/ui-fixes/search-column-copy.js
//
// Ctrl+click (or Cmd+click) a column header on a search results table and the
// whole column lands on the clipboard, one value per line, ready to paste into
// Excel. Ctrl+click a single cell instead and just that one value is copied —
// the way to lift one id, batch name or IP address out of the results without
// selecting it by hand. The copied cells flash so it is obvious what was taken.
//
// Both result tables are covered: Explore's search results and the Inventory
// search grid. The inventory grid hangs an event row under each sample, empty
// until the row is expanded, so it joins the copy only once it is opened.
//
// Inside these tables the modifier means COPY, links included: Ctrl+clicking a
// molecule id copies the id rather than opening it in a new tab. Cells holding
// a real control — the select column's checkbox — keep their own click.
//
// The table cannot be read with `row.cells[n]`: CDD merges the select and
// molecule columns across all of a molecule's batches (`rowSpan`, up to 828 in
// a real vault), so only the FIRST row of each molecule has 7 cells and every
// continuation row has 5 — `cellIndex` and the visual column drift apart after
// the first molecule. Both the header and the body are therefore mapped onto a
// proper grid that honours colspan/rowspan.

import { copyText } from "../../utils/clipboard.js";
import { PLATE_LINK_SELECTOR } from "./plate-location-tooltip.js";

const STYLE_ID = "cdd-search-column-copy-style";
const FLASH_CLASS = "cdd-column-copied";
const TOAST_ID = "cdd-column-copy-toast";
// Two tables answer to this: Explore's Rails-rendered search results, and the
// Inventory search's MUI grid, whose expandable event rows sit in the same
// column grid as the sample row above them.
const TABLE_SELECTORS = ["table.search_results_table", "table.NestedExpandableDataTable"];
const TABLE_SELECTOR = TABLE_SELECTORS.join(", ");
const CELL_SELECTOR = "tbody td, tbody th";

// An inventory row that has not been expanded still keeps its event row in the
// DOM, with every cell empty. Copied as it stands it would drop a blank line
// between two samples and pull every value below it out of step with the other
// columns, so it is left out until the user opens it.
const COLLAPSED_ROW_SELECTOR = "tr.collapsed-table-row";

// Long values (an IUPAC name, a comment field) would push the toast off both
// edges of the screen, so the confirmation shows only the start of one.
const TOAST_VALUE_LIMIT = 60;

let started = false;

// The gesture has to be taken away from CDD completely: the headers carry its
// sort handler, and both headers and cells are full of links — either would
// fire alongside the copy.
function swallow(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
}

// Lay a section's rows onto a grid, repeating a cell across every slot it
// spans. grid[row][col] is the cell covering that slot, so a value read per row
// naturally repeats a merged cell down its rows — which is what keeps two
// copied columns aligned when they are pasted side by side.
function buildGrid(rows) {
    const grid = [];

    rows.forEach((row, r) => {
        if (!grid[r]) grid[r] = [];

        let c = 0;
        for (const cell of row.cells) {
            while (grid[r][c]) c += 1;

            // rowSpan 0 means "to the end of the section"; clamp both spans so a
            // malformed table cannot blow the grid up.
            const rowSpan = cell.rowSpan > 0 ? Math.min(cell.rowSpan, rows.length - r) : rows.length - r;
            const colSpan = Math.max(1, cell.colSpan);

            for (let dr = 0; dr < rowSpan; dr += 1) {
                const rr = r + dr;
                if (!grid[rr]) grid[rr] = [];
                for (let dc = 0; dc < colSpan; dc += 1) {
                    grid[rr][c + dc] = cell;
                }
            }

            c += colSpan;
        }
    });

    return grid;
}

function getBodyRows(table) {
    const rows = [];
    for (const body of table.tBodies) {
        for (const row of body.rows) {
            if (row.matches(COLLAPSED_ROW_SELECTOR)) continue;
            rows.push(row);
        }
    }
    return rows;
}

// Which grid columns a header cell covers. A leaf header ("Batch Name") spans
// one; a section header ("Properties", "Batch Fields") spans all of its
// columns, so clicking it copies the whole block.
// Returns { start, span, labels } or null.
// The select column's checkbox — and anything else CDD puts a control in — has
// its own job on click. Everything else in the body is data worth copying.
// CDD's row selector is not an <input>: it is a link styled as a switch,
// `td.selector` holding a `.toggleSwitch`. Ctrl+clicking it has to keep ticking
// the row, so a cell counts as a control by either sign.
const CONTROL_SELECTOR = "button, input, select, textarea, .toggleSwitch";

function isCopyableCell(cell) {
    return !cell.matches(".selector") && !cell.querySelector(CONTROL_SELECTOR);
}

function findColumnSpan(table, th) {
    if (!table.tHead) return null;

    const grid = buildGrid([...table.tHead.rows]);
    const lastRow = grid[grid.length - 1] || [];
    const totalColumns = lastRow.length;

    let start = -1;
    for (const gridRow of grid) {
        if (!gridRow) continue;
        const index = gridRow.indexOf(th);
        if (index !== -1) {
            start = index;
            break;
        }
    }
    if (start === -1) return null;

    // The toolbar row ("N Selected: Launch Visualization · Export · …") lives in
    // the thead too and spans every column. It holds real controls, so treat a
    // full-width cell — or any cell carrying a form control — as "not a column
    // header" and let the click through untouched.
    const span = Math.max(1, Math.min(th.colSpan, totalColumns - start));
    if (span >= totalColumns) return null;
    if (th.querySelector(CONTROL_SELECTOR)) return null;

    // Nor is a column whose BODY is controls a column of values: the select
    // column carries a checkbox per row, and its "all · none" header would
    // otherwise swallow the two links that tick them. One body row settles it —
    // rowSpan merging means the first row of a section covers every column.
    const firstBodyRow = getBodyRows(table)[0];
    if (firstBodyRow) {
        const bodyRow = buildGrid([firstBodyRow])[0] || [];
        let holdsValues = false;
        for (let c = start; c < start + span; c += 1) {
            const cell = bodyRow[c];
            if (cell && isCopyableCell(cell)) {
                holdsValues = true;
                break;
            }
        }
        if (!holdsValues) return null;
    }

    // The leaf labels under the section, for the header line of a block copy.
    const labels = [];
    for (let c = start; c < start + span; c += 1) {
        const cell = lastRow[c];
        labels.push(cell ? (cell.innerText || "").replace(/\s+/g, " ").trim() : "");
    }

    return { start, span, labels };
}

// The Molecule cell holds the structure image, the molecule link and the
// project chips, so its raw text reads "TEST-0260386 ITR Sandbox". The link is
// the identifier worth pasting, so prefer it when the cell has exactly one.
function readCellText(cell) {
    const links = cell.querySelectorAll('a[href*="/molecules/"]');
    if (links.length === 1) {
        const text = (links[0].innerText || "").replace(/\s+/g, " ").trim();
        if (text) return text;
    }
    return (cell.innerText || "").replace(/\s+/g, " ").trim();
}

// One line per body ROW. Newlines inside a cell are collapsed to spaces: a cell
// that broke into two lines would otherwise shift every following value out of
// step with the other columns.
function readColumns(table, start, span) {
    const rows = getBodyRows(table);
    const grid = buildGrid(rows);

    const lines = [];
    const cells = new Set();

    rows.forEach((_row, r) => {
        const line = [];
        for (let c = start; c < start + span; c += 1) {
            const cell = grid[r]?.[c];
            if (!cell) {
                line.push("");
                continue;
            }
            cells.add(cell);
            line.push(readCellText(cell));
        }
        lines.push(line);
    });

    return { lines, cells };
}

function flashCells(cells) {
    for (const cell of cells) cell.classList.add(FLASH_CLASS);
    setTimeout(() => {
        for (const cell of cells) cell.classList.remove(FLASH_CLASS);
    }, 700);
}

function showToast(message) {
    let toast = document.getElementById(TOAST_ID);
    if (!toast) {
        toast = document.createElement("div");
        toast.id = TOAST_ID;
        document.documentElement.appendChild(toast);
    }

    toast.textContent = message;
    toast.classList.add("visible");

    clearTimeout(toast.dataset.timer);
    toast.dataset.timer = setTimeout(() => toast.classList.remove("visible"), 1800);
}

async function copyColumns(table, th) {
    const span = findColumnSpan(table, th);
    if (!span) return false;

    const label = (th.innerText || "").replace(/\s+/g, " ").trim() || "column";
    const { lines, cells } = readColumns(table, span.start, span.span);

    if (!lines.some((line) => line.some((value) => value !== ""))) {
        showToast(`"${label}" has nothing to copy`);
        return true;
    }

    // Tab-separated, which is what a spreadsheet splits into columns. A block
    // copy leads with the leaf labels — pasting 30 unlabelled property columns
    // would be unreadable — while a single column stays pure data, so a list of
    // IDs pastes without a stray heading.
    const body = lines.map((line) => line.join("\t"));
    const text = span.span > 1 ? [span.labels.join("\t"), ...body].join("\n") : body.join("\n");

    const ok = await copyText(text);
    if (!ok) {
        showToast("Copy failed");
        return true;
    }

    flashCells(cells);
    showToast(
        span.span > 1
            ? `Copied ${lines.length} rows × ${span.span} columns from "${label}"`
            : `Copied ${lines.length} rows from "${label}"`
    );
    return true;
}

// One cell. Read the same way a column is, so the value that lands on the
// clipboard is the value the column copy would have put on that line.
async function copyCell(cell) {
    const text = readCellText(cell);

    if (!text) {
        showToast("Nothing to copy");
        return;
    }

    const ok = await copyText(text);
    if (!ok) {
        showToast("Copy failed");
        return;
    }

    flashCells([cell]);
    showToast(
        text.length > TOAST_VALUE_LIMIT
            ? `Copied "${text.slice(0, TOAST_VALUE_LIMIT)}…"`
            : `Copied "${text}"`
    );
}

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    // The selector is a list, so it cannot be pasted in front of a descendant
    // combinator: "a, b thead th" would scope the second half only.
    const scoped = (suffix) => TABLE_SELECTORS.map((sel) => `${sel} ${suffix}`).join(",\n    ");

    style.textContent = `
    ${scoped("thead th")} { cursor: copy; }

    ${scoped(`.${FLASH_CLASS}`)} {
        background: rgba(34, 197, 94, 0.28) !important;
        transition: background 120ms ease-out;
    }

    #${TOAST_ID} {
        position: fixed;
        left: 50%;
        bottom: 24px;
        transform: translateX(-50%);
        z-index: 2147483647;
        background: #111827;
        color: #f9fafb;
        border-radius: 8px;
        padding: 8px 14px;
        font: 13px Arial, sans-serif;
        box-shadow: 0 8px 24px rgba(0,0,0,0.35);
        pointer-events: none;
        opacity: 0;
        transition: opacity 150ms ease-out;
    }

    #${TOAST_ID}.visible { opacity: 1; }
`;

    document.head.appendChild(style);
}

export function initSearchColumnCopy() {
    if (started) return;
    started = true;

    injectStyles();

    // Capture phase on documentElement: the headers are <a> links AND carry
    // CDD's sort handler, so the modifier click has to be intercepted before it
    // reaches either — otherwise the column copy also re-sorts the table or
    // opens the search in a new tab. Delegated so it survives Turbo body swaps.
    document.documentElement.addEventListener(
        "click",
        (event) => {
            // Alt is left out so it stays free for whatever the browser does
            // with it.
            if ((!event.ctrlKey && !event.metaKey) || event.altKey) return;

            const th = event.target?.closest?.("thead th");
            if (th) {
                const table = th.closest(TABLE_SELECTOR);
                if (!table) return;

                // Resolve the columns BEFORE swallowing the event: on a header
                // cell that is not a column heading (the toolbar row) this is
                // null, and the click has to reach CDD's own control untouched.
                if (!findColumnSpan(table, th)) return;

                swallow(event);

                copyColumns(table, th).catch((err) =>
                    console.warn("[CDD Stoich Tools] column copy failed", err)
                );
                return;
            }

            const cell = event.target?.closest?.(CELL_SELECTOR);
            if (!cell || !cell.closest(TABLE_SELECTOR)) return;
            if (!isCopyableCell(cell)) return;

            swallow(event);

            copyCell(cell).catch((err) =>
                console.warn("[CDD Stoich Tools] cell copy failed", err)
            );
        },
        true
    );

    // Discoverability: the hint appears the first time a header or a cell is
    // hovered, and never overwrites a title CDD set itself — nor one of our
    // own hover bubbles.
    document.documentElement.addEventListener("mouseover", (event) => {
        const th = event.target?.closest?.("thead th");
        if (th) {
            if (th.title || th.dataset.cddNoColumnHint) return;
            const table = th.closest(TABLE_SELECTOR);
            if (!table) return;

            // The hint must promise exactly what the click keeps. The toolbar
            // row and the select column resolve to no column, and used to
            // advertise a copy that never happened. The answer is cached on the
            // cell so a mouse crossing them is not re-measured every event.
            if (!findColumnSpan(table, th)) {
                th.dataset.cddNoColumnHint = "1";
                return;
            }
            th.title = "Ctrl+click to copy this column";
            return;
        }

        const cell = event.target?.closest?.(CELL_SELECTOR);
        if (!cell || cell.title || !cell.closest(TABLE_SELECTOR)) return;
        if (!isCopyableCell(cell)) return;
        // The plate name cell answers a hover with our own location bubble
        // (plate-location-tooltip); a native title would draw over it a
        // second later. Ctrl+click still copies the cell — only the hint goes.
        if (cell.querySelector(PLATE_LINK_SELECTOR)) return;
        cell.title = "Ctrl+click to copy this value";
    });
}
