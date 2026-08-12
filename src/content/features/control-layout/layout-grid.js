// content/features/control-layout/layout-grid.js
//
// SINGLE SOURCE OF TRUTH for "how to read and write a CDD control-layout
// editor grid". Everything the painter and the preset toolbar know about CDD's
// DOM lives here; if CDD renames a class or changes how a well stores its
// state, THIS is the one file to fix.
//
// Assumptions about CDD's DOM (verified on the run Run Details page, edit mode
// of "Run Default 96/384/1536-well Control Layout")
// -------------------------------------------------------------------------
//   - The grid is a `table.plateLayout`. The read-only ("show") copy of the
//     same layout is also a `table.plateLayout`, but ONLY the edit copy has
//     `td.well-control-cell` wells — hence isControlLayoutEditTable().
//   - Row 0 is headers: a blank corner `th`, then `th.well-column-header`
//     ("01".."12"). Every data row starts with `th.well-row-header` ("A".."H")
//     followed by the wells. There are no colspans, so `cellIndex` lines a well
//     up with its column header (the same assumption plate-map-export.js makes).
//   - A well's state lives in a hidden input named
//     `control_layout[control_states][row][col]`, whose value is "" (empty),
//     "+" (positive control / hit), "-" (negative control) or "#" (reference
//     molecule). That input is what the form POSTs — the classes below are
//     purely how CDD paints the well.
//   - The well's class is `well-control-cell empty` / `... control positive` /
//     `... control negative` / `... control reference`. The `span.contents`
//     inside the well is the same in every state, so state changes never touch
//     it.
//
// What this file must NOT do: no selection state, no UI, no storage, no
// network. It only reads and writes cells.

import {
    STATE_EMPTY,
    STATE_POSITIVE,
    STATE_NEGATIVE,
    STATE_REFERENCE,
} from "../../../shared/control-layout-presets.js";

export const LAYOUT_TABLE_SELECTOR = "table.plateLayout";
export const CELL_SELECTOR = "td.well-control-cell";
export const COLUMN_HEADER_SELECTOR = "th.well-column-header";
export const ROW_HEADER_SELECTOR = "th.well-row-header";

const CELL_BASE_CLASS = "well-control-cell";
const STATE_CLASS = {
    [STATE_EMPTY]: "empty",
    [STATE_POSITIVE]: "control positive",
    [STATE_NEGATIVE]: "control negative",
    [STATE_REFERENCE]: "control reference",
};

// The hidden input CDD actually submits.
const STATE_INPUT_SELECTOR = 'input[name^="control_layout[control_states]"]';

// True for the editable copy of a control layout: a plate table that holds at
// least one well with a submittable state input. The read-only copy has neither.
export function isControlLayoutEditTable(el) {
    return (
        !!el &&
        typeof el.matches === "function" &&
        el.matches(LAYOUT_TABLE_SELECTOR) &&
        !!el.querySelector(`${CELL_SELECTOR} ${STATE_INPUT_SELECTOR}`)
    );
}

export function isWellCell(el) {
    return !!el && typeof el.matches === "function" && el.matches(CELL_SELECTOR);
}

// The well's current state, read from the input CDD submits (never from the
// class — the class is presentation, the input is the truth).
export function readCellState(cell) {
    const raw = cell.querySelector(STATE_INPUT_SELECTOR)?.value ?? "";
    return raw === STATE_POSITIVE || raw === STATE_NEGATIVE || raw === STATE_REFERENCE
        ? raw
        : STATE_EMPTY;
}

// Set a well to `state`, exactly as a native CDD click would leave it: input
// value first (that is what gets POSTed), then the class that paints it.
// Returns true when the well actually changed.
export function writeCellState(cell, state) {
    const className = STATE_CLASS[state];
    if (className === undefined) return false;
    if (readCellState(cell) === state) return false;

    const input = cell.querySelector(STATE_INPUT_SELECTOR);
    if (input) input.value = state;
    cell.className = `${CELL_BASE_CLASS} ${className}`;
    return true;
}

// The grid as a matrix of well cells in visual order: matrix[row][col].
// Rows with no wells (the header row) are skipped, so matrix.length is the
// plate's row count and matrix[0].length its column count.
export function readCellMatrix(table) {
    const matrix = [];
    for (const row of table.rows) {
        const cells = [...row.cells].filter(isWellCell);
        if (cells.length) matrix.push(cells);
    }
    return matrix;
}

// { rowCount, colCount } of the plate, or zeros when the table holds no wells.
export function readGridSize(table) {
    const matrix = readCellMatrix(table);
    return {
        rowCount: matrix.length,
        colCount: matrix[0]?.length || 0,
    };
}

// The live states as a matrix, ready to be handed to the preset encoder.
export function readStateMatrix(table) {
    return readCellMatrix(table).map((row) => row.map(readCellState));
}

// Paint a whole matrix of states onto the grid. Extra rows/columns in either
// the grid or the matrix are ignored, so a preset written for a differently
// shaped plate can only ever under-fill — never write to the wrong well.
// Returns the number of wells that changed.
export function writeStateMatrix(table, states) {
    const cells = readCellMatrix(table);
    let changed = 0;
    for (let r = 0; r < cells.length; r += 1) {
        const stateRow = states[r] || [];
        for (let c = 0; c < cells[r].length; c += 1) {
            if (writeCellState(cells[r][c], stateRow[c] ?? STATE_EMPTY)) changed += 1;
        }
    }
    return changed;
}

/* ------------------------------------------------------------------ *
 * Cell groups — what a mousedown on a header (or a shift-click) covers.
 * Each returns an array of well cells belonging to `table`.
 * ------------------------------------------------------------------ */

export function cellsInRowHeader(table, header) {
    const row = header.parentElement;
    return row && row.closest("table") === table ? [...row.cells].filter(isWellCell) : [];
}

// Wells sharing the header's `cellIndex` — safe because CDD's plate table has
// no colspans (see the header note above).
export function cellsInColumnHeader(table, header) {
    const index = header.cellIndex;
    const out = [];
    for (const row of table.rows) {
        const cell = row.cells[index];
        if (isWellCell(cell)) out.push(cell);
    }
    return out;
}

export function allCells(table) {
    return [...table.querySelectorAll(CELL_SELECTOR)];
}

// The rectangle spanned by two wells, inclusive — used by shift-click.
export function cellsInRect(table, cellA, cellB) {
    const matrix = readCellMatrix(table);
    const a = locateCell(matrix, cellA);
    const b = locateCell(matrix, cellB);
    if (!a || !b) return [];

    const out = [];
    for (let r = Math.min(a.row, b.row); r <= Math.max(a.row, b.row); r += 1) {
        for (let c = Math.min(a.col, b.col); c <= Math.max(a.col, b.col); c += 1) {
            const cell = matrix[r]?.[c];
            if (cell) out.push(cell);
        }
    }
    return out;
}

function locateCell(matrix, cell) {
    for (let r = 0; r < matrix.length; r += 1) {
        const col = matrix[r].indexOf(cell);
        if (col >= 0) return { row: r, col };
    }
    return null;
}
