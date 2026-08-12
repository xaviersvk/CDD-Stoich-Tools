// content/features/ui-fixes/search-column-copy.js
//
// Ctrl+click (or Cmd+click) a column header on a search results table and the
// whole column lands on the clipboard, one value per line, ready to paste into
// Excel. The copied cells flash so it is obvious what was taken.
//
// The table cannot be read with `row.cells[n]`: CDD merges the select and
// molecule columns across all of a molecule's batches (`rowSpan`, up to 828 in
// a real vault), so only the FIRST row of each molecule has 7 cells and every
// continuation row has 5 — `cellIndex` and the visual column drift apart after
// the first molecule. Both the header and the body are therefore mapped onto a
// proper grid that honours colspan/rowspan.

import { copyText } from "../../utils/clipboard.js";

const STYLE_ID = "cdd-search-column-copy-style";
const FLASH_CLASS = "cdd-column-copied";
const TOAST_ID = "cdd-column-copy-toast";
const TABLE_SELECTOR = "table.search_results_table";

let started = false;

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
    for (const body of table.tBodies) rows.push(...body.rows);
    return rows;
}

// The leftmost grid column the header cell occupies.
function findColumnIndex(table, th) {
    if (!table.tHead) return -1;

    const grid = buildGrid([...table.tHead.rows]);

    for (const gridRow of grid) {
        if (!gridRow) continue;
        const index = gridRow.indexOf(th);
        if (index !== -1) return index;
    }

    return -1;
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
function readColumn(table, columnIndex) {
    const rows = getBodyRows(table);
    const grid = buildGrid(rows);

    const values = [];
    const cells = new Set();

    rows.forEach((_row, r) => {
        const cell = grid[r]?.[columnIndex];
        if (!cell) {
            values.push("");
            return;
        }
        cells.add(cell);
        values.push(readCellText(cell));
    });

    return { values, cells };
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

async function copyColumn(table, th) {
    const columnIndex = findColumnIndex(table, th);
    if (columnIndex === -1) return;

    const label = (th.innerText || "").replace(/\s+/g, " ").trim() || "column";
    const { values, cells } = readColumn(table, columnIndex);

    if (!values.some((value) => value !== "")) {
        showToast(`"${label}" has nothing to copy`);
        return;
    }

    const ok = await copyText(values.join("\n"));
    if (!ok) {
        showToast("Copy failed");
        return;
    }

    flashCells(cells);
    showToast(`Copied ${values.length} rows from "${label}"`);
}

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
    ${TABLE_SELECTOR} thead th { cursor: copy; }

    ${TABLE_SELECTOR} .${FLASH_CLASS} {
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
            if (!event.ctrlKey && !event.metaKey) return;

            const th = event.target?.closest?.("thead th");
            if (!th) return;

            const table = th.closest(TABLE_SELECTOR);
            if (!table) return;

            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            copyColumn(table, th).catch((err) =>
                console.warn("[CDD Stoich Tools] column copy failed", err)
            );
        },
        true
    );

    // Discoverability: the hint appears the first time a header is hovered,
    // and never overwrites a title CDD set itself.
    document.documentElement.addEventListener("mouseover", (event) => {
        const th = event.target?.closest?.("thead th");
        if (!th || th.title || !th.closest(TABLE_SELECTOR)) return;
        th.title = "Ctrl+click to copy this column";
    });
}
