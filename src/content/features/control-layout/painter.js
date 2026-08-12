// content/features/control-layout/painter.js
//
// Turns a control-layout edit grid into a selection surface while a brush is
// armed. Without an armed brush this module is completely inert and CDD's own
// click-to-cycle behaviour is untouched.
//
// Interaction (brush armed)
//   - drag across the grid     -> RUBBER BAND: every well in the rectangle
//                                 between the well you pressed on and the well
//                                 under the pointer takes the armed state,
//                                 live, and the rectangle follows the pointer
//                                 in every direction until you release
//   - click a single well      -> that one well (a 1x1 rectangle)
//   - shift+click a well       -> rectangle from the last well you painted
//   - click a row/column head  -> that whole row/column
//   - click the corner header  -> the whole plate
//
// Live preview without losing state
// ---------------------------------
// While a band is being dragged, every well it covers is written immediately so
// the user sees the result rather than an outline. Shrinking the band must put
// the wells it no longer covers back exactly as they were, so each well's prior
// state is remembered in `bandOriginal` the first time the band touches it and
// restored the moment the band leaves it. Only wells the band actually touched
// are ever written.
//
// How CDD's native handler is kept out of the way
// -----------------------------------------------
// CDD delegates `click` on `.well-control-cell`, `.well-row-header` and
// `.well-column-header` from `document` (jQuery, bubble phase). A capture-phase
// listener on the TABLE therefore runs before the event ever reaches the well
// itself, and stopPropagation() there ends propagation for good — including the
// target phase. So while a brush is armed the native cycle never fires, and the
// moment the brush is disarmed CDD behaves exactly as it always did.
//
// Nothing here reads or writes the DOM directly: every cell lookup and state
// change goes through layout-grid.js.

import {
    isWellCell,
    readCellState,
    writeCellState,
    cellsInRowHeader,
    cellsInColumnHeader,
    cellsInRect,
    allCells,
    COLUMN_HEADER_SELECTOR,
    ROW_HEADER_SELECTOR,
} from "./layout-grid.js";
import { PAINTING_CLASS } from "./styles.js";

/**
 * attachPainter(table, { onPaint }) -> controller
 *
 * `onPaint(count)` is called when a gesture finishes, with the number of wells
 * it actually changed, so the toolbar can show feedback.
 *
 * controller.setBrush(state | null)  arm a state, or null to disarm
 * controller.getBrush()              the armed state, or null
 * controller.destroy()               remove every listener and the cursor class
 */
export function attachPainter(table, { onPaint } = {}) {
    let brush = null;

    // The well the current rubber band started from; null when not dragging.
    let bandAnchor = null;
    // Map<cell, stateBeforeTheBandTouchedIt> for the wells the band currently covers.
    let bandOriginal = null;
    // The last well painted by a finished gesture — the origin of shift+click.
    let lastAnchor = null;

    // Paint a set of wells outright (headers, shift+click): no undo bookkeeping,
    // the gesture is over the moment it happens.
    function paintOnce(cells) {
        let changed = 0;
        for (const cell of cells) {
            if (writeCellState(cell, brush)) changed += 1;
        }
        report(changed);
    }

    function report(changed) {
        if (changed && typeof onPaint === "function") onPaint(changed);
    }

    // Move the live rubber band to the rectangle anchor..cell.
    function updateBand(cell) {
        const wanted = new Set(cellsInRect(table, bandAnchor, cell));

        // Wells the band has left go back to what they were.
        for (const [touched, priorState] of bandOriginal) {
            if (wanted.has(touched)) continue;
            writeCellState(touched, priorState);
            bandOriginal.delete(touched);
        }

        // Wells the band has just reached remember their state, then take the brush.
        for (const target of wanted) {
            if (!bandOriginal.has(target)) bandOriginal.set(target, readCellState(target));
            writeCellState(target, brush);
        }
    }

    function endBand() {
        if (!bandOriginal) return;

        let changed = 0;
        for (const priorState of bandOriginal.values()) {
            if (priorState !== brush) changed += 1;
        }
        bandAnchor = null;
        bandOriginal = null;
        report(changed);
    }

    function onMouseDown(event) {
        if (brush === null || event.button !== 0) return;

        const cell = event.target.closest?.("td, th");
        if (!cell || !table.contains(cell)) return;

        // Swallow the gesture before CDD's delegated handler can cycle the well.
        event.preventDefault();
        event.stopPropagation();

        if (isWellCell(cell)) {
            if (event.shiftKey && lastAnchor && lastAnchor !== cell) {
                const rect = cellsInRect(table, lastAnchor, cell);
                if (rect.length) {
                    paintOnce(rect);
                    lastAnchor = cell;
                    return;
                }
            }
            // Start a rubber band. A plain click is just a band that never grew.
            bandAnchor = cell;
            bandOriginal = new Map();
            lastAnchor = cell;
            updateBand(cell);
            return;
        }

        if (cell.matches(ROW_HEADER_SELECTOR)) {
            paintOnce(cellsInRowHeader(table, cell));
        } else if (cell.matches(COLUMN_HEADER_SELECTOR)) {
            paintOnce(cellsInColumnHeader(table, cell));
        } else if (cell.tagName === "TH" && cell.cellIndex === 0 && cell.parentElement?.rowIndex === 0) {
            // The blank corner header: the whole plate.
            paintOnce(allCells(table));
        }
    }

    function onMouseOver(event) {
        if (brush === null || !bandAnchor) return;

        const cell = event.target.closest?.("td");
        if (!isWellCell(cell) || !table.contains(cell)) return;

        lastAnchor = cell;
        updateBand(cell);
    }

    // CDD listens for `click`, not `mousedown`, so the click that follows a
    // painted mousedown must be swallowed too.
    function onClick(event) {
        if (brush === null) return;
        const cell = event.target.closest?.("td, th");
        if (!cell || !table.contains(cell)) return;
        event.preventDefault();
        event.stopPropagation();
    }

    function onMouseUp() {
        endBand();
    }

    table.addEventListener("mousedown", onMouseDown, true);
    table.addEventListener("mouseover", onMouseOver, true);
    table.addEventListener("click", onClick, true);
    // On window, so releasing the button outside the grid still ends the band.
    window.addEventListener("mouseup", onMouseUp, true);

    return {
        getBrush: () => brush,
        setBrush(state) {
            // A brush swap mid-drag would paint the band in two colours.
            endBand();
            brush = state ?? null;
            lastAnchor = null;
            table.classList.toggle(PAINTING_CLASS, brush !== null);
        },
        destroy() {
            table.removeEventListener("mousedown", onMouseDown, true);
            table.removeEventListener("mouseover", onMouseOver, true);
            table.removeEventListener("click", onClick, true);
            window.removeEventListener("mouseup", onMouseUp, true);
            table.classList.remove(PAINTING_CLASS);
        },
    };
}
