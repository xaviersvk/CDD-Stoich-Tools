// content/features/box-selection/box-grid.js
//
// SINGLE SOURCE OF TRUTH for "how to read a CDD inventory box grid from the DOM".
//
// Why this file exists
// --------------------
// Two features now need to understand the same grid:
//   1. inventory-grid-colors.js  (tints occupied wells by prefix colour)
//   2. the Box Selection Framework (lets the user multi-select empty wells)
// Rather than copy the selectors/parsing into both, every piece of grid DOM
// knowledge lives here and is imported by both. If CDD renames a class or
// changes how a well encodes its position, THIS is the one file to fix.
//
// What it must NOT do
// -------------------
//   - No selection state, no highlighting, no network, no UI.
//   - It only *reads* the DOM and returns plain values. It never mutates cells.
//
// Assumptions about CDD's DOM (verified against the live "Pick Location" box view)
// -------------------------------------------------------------------------------
//   - The grid root is `.LocationBoxPicker .positions`.
//   - Each well is a `.box-position-element`.
//   - An OCCUPIED well additionally carries `.box-position-filled`.
//   - An EMPTY well is a `.box-position-element` WITHOUT `.box-position-filled`.
//     (CDD *may* also tag empties with `.box-position-empty`; we treat that as a
//      confirmation signal when present — see `gridTagsEmpties()` — but we never
//      *require* it, because the occupied/empty truth we rely on is the
//      filled class, which the existing colour feature already depends on.)
//   - Each well contains a `<label>` whose text is the 1-based, row-major
//     position number, and that number IS `inventory_location_position`
//     (proven by inventory-grid-colors.js matching the API position to it).
//   - The selected box in the location tree is the `[role="treeitem"]` with
//     `aria-checked="true"` carrying `data-nodeid`.
//
// What breaks if CDD changes its frontend
// ---------------------------------------
//   - Renamed grid/well classes  -> selection + colouring stop finding cells.
//   - `<label>` no longer the position -> position mapping is wrong (DANGEROUS
//     for the create feature: would write samples to the wrong wells). The
//     create feature must therefore never trust this mapping blindly; it uses
//     the value CDD itself wrote into the form (see the request-replay contract).
//   - `data-nodeid` no longer the box id -> `getSelectedBoxId()` returns the
//     wrong id; this is why box id is treated as best-effort and cross-checked.

export const GRID_SELECTOR = ".LocationBoxPicker .positions";
export const CELL_SELECTOR = ".box-position-element";
export const FILLED_CLASS = "box-position-filled";
export const EMPTY_CLASS = "box-position-empty";

// True if the grid uses an explicit empty class on at least one cell. When it
// does, callers may tighten "empty" to "has EMPTY_CLASS"; when it doesn't, the
// fail-safe definition (a non-filled position element) is used instead.
export function gridTagsEmpties(gridEl) {
    return !!gridEl.querySelector("." + EMPTY_CLASS);
}

export function isFilledCell(cell) {
    return cell.classList.contains(FILLED_CLASS);
}

// The well's 1-based row-major position as a STRING (matches the API/payload
// value, e.g. "43"), or null if the label is missing.
export function readCellPosition(cell) {
    const text = cell.querySelector("label")?.textContent?.trim();
    return text || null;
}

// Sort position strings numerically when all are numeric (the common box case),
// otherwise lexically — one definition so every accessor orders identically.
export function sortPositions(list) {
    const arr = Array.from(list).map(String);
    return arr.every((p) => /^\d+$/.test(p))
        ? arr.sort((a, b) => Number(a) - Number(b))
        : arr.sort();
}

// Enumerate the grid's wells by OCCUPANCY (DOM truth), returning position
// STRINGS. This is the single place that turns the grid into position sets, so
// consumers of SelectionContext never query the DOM themselves.
//   occupied = cells carrying FILLED_CLASS
//   empty    = the remaining cells (fail-safe definition; see file header)
//   all      = every well that has a readable position
export function readGridPositions(gridEl) {
    const all = [];
    const occupied = [];
    const empty = [];
    for (const cell of gridEl.querySelectorAll(CELL_SELECTOR)) {
        const pos = readCellPosition(cell);
        if (pos == null) continue;
        all.push(pos);
        if (isFilledCell(cell)) occupied.push(pos);
        else empty.push(pos);
    }
    return {
        all: sortPositions(all),
        occupied: sortPositions(occupied),
        empty: sortPositions(empty),
    };
}

// Number of columns in the live grid (cells in the first `.row`). 0 if unknown.
export function readColumnCount(gridEl) {
    const firstRow = gridEl.querySelector(".row");
    if (firstRow) {
        const n = firstRow.querySelectorAll(CELL_SELECTOR).length;
        if (n > 0) return n;
    }
    return 0;
}

// The id of the box whose grid is currently shown = the selected tree node's
// `data-nodeid` (a leaf box has aria-checked="true"; parent rows are "mixed").
// Best-effort: returns a string id or null. Callers MUST treat a mismatch
// between this and the location id CDD puts in the form as a hard stop, never a
// guess (see the multi-position request-replay contract).
export function getSelectedBoxId() {
    const scope = document.querySelector(".locations-tree") || document;
    const node = scope.querySelector(
        '[role="treeitem"][aria-checked="true"][data-nodeid]'
    );
    return node?.getAttribute("data-nodeid") || null;
}

/* ------------------------------------------------------------------ *
 * Position normalisation
 *
 * The grid's <label> is a 1-based, row-major index (1..N). An API
 * `inventory_location_position` may be that same number, a "A1" well
 * coordinate, or "1/A1". Normalise every form to the row-major index string so
 * it matches the cell label. `cols` (read from the live grid) converts "A1".
 * Kept here so both the colour feature and any future occupancy cross-check
 * normalise positions identically.
 * ------------------------------------------------------------------ */

// "A" -> 0, "B" -> 1, ... "Z" -> 25, "AA" -> 26 (base-26, no DOM/clock).
export function lettersToRowIndex(letters) {
    let n = 0;
    for (const ch of letters.toUpperCase()) {
        n = n * 26 + (ch.charCodeAt(0) - 64); // 'A' is 65
    }
    return n - 1;
}

export function normalizePositionKey(raw, cols) {
    if (raw == null) return null;
    let s = String(raw).trim();
    if (!s) return null;

    // "1/A1" -> take the well-coordinate part after the slash.
    if (s.includes("/")) s = s.split("/").pop().trim();

    // Already a row-major number.
    if (/^\d+$/.test(s)) return s;

    // "A1" / "B12" style coordinate.
    const m = s.match(/^([A-Za-z]+)\s*(\d+)$/);
    if (m && cols > 0) {
        const row = lettersToRowIndex(m[1]);
        const col = parseInt(m[2], 10) - 1;
        if (row >= 0 && col >= 0) return String(row * cols + col + 1);
    }

    return s;
}
