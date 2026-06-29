// content/features/box-selection/overlay.js
//
// DOM integration for the Box Selection Framework: turn a CDD box grid into a
// multi-selectable surface and hand the caller a rich SelectionContext.
//
// The SelectionContext is the framework's ONE public abstraction. Every future
// consumer (Create Samples, Move, Duplicate, Delete, Export, Labels, …) reads
// the box and its wells through this object and NEVER touches the DOM itself.
// That is what keeps consumers decoupled from CDD's markup: if CDD restyles the
// grid, only box-grid.js changes, and every consumer keeps working.
//
//   const ctx = attachBoxSelection(gridOrPicker, {
//       allowFilled: false,      // future: allow selecting occupied wells
//       mode: "empty-only",      // reserved; only "empty-only" is implemented
//       showCounter: true,       // render the "N positions selected" bar
//       actionLabel: null,       // if set, render an action button with this text
//       onAction: null,          // fn(ctx) when the action button is clicked
//       onChange: null,          // fn(ctx) on any selection change
//   });
//
//   SelectionContext:
//     ctx.boxId                      // best-effort box id (getter, string|null)
//     ctx.selectedPositions          // getter -> ["16","17",...] (sorted)
//     ctx.occupiedPositions          // getter -> filled wells (sorted)
//     ctx.emptyPositions             // getter -> non-filled wells (sorted)
//     ctx.allPositions               // getter -> every well (sorted)
//     ctx.count()                    // selected count
//     ctx.has(position)              // is a position selected
//     ctx.isOccupied(position)       // occupancy helpers (no DOM for consumers)
//     ctx.isEmpty(position)
//     ctx.clear()
//     ctx.onChange(cb)               // cb(ctx) -> unsubscribe fn
//     ctx.destroy()
//
// ── Click modes ────────────────────────────────────────────────────────────────
//
//   Normal click       clear previous selection; select the clicked well; set
//                      anchor to the clicked position.
//
//   Ctrl / Cmd click   toggle the clicked well; keep the rest of the selection
//                      unchanged. Anchor is NOT changed (the next Shift-click
//                      always rectangles from the last normal-click anchor).
//
//   Shift-click        rectangle from anchor → clicked well (inclusive). Only
//                      empty wells inside the rectangle are selected; occupied
//                      ones are silently skipped. The whole selection is REPLACED
//                      with the rectangle contents (not added to it). Anchor is
//                      NOT changed. If there is no anchor yet, behaves like a
//                      normal click and sets the anchor.
//
//   Deselection rule   if the clicked well is ALREADY in the selection set, it
//                      is always removed — regardless of the modifier key, and
//                      regardless of whether the well has since become occupied.
//                      Selection state has priority over occupancy blocking.
//
// ── Rectangle algorithm ────────────────────────────────────────────────────────
//
//   CDD positions are 1-based row-major integers (e.g. position 43 in a 9-col
//   grid = row 5 col 7). Given anchor A and clicked position B:
//
//     rowA = ⌊(A−1)/cols⌋    colA = (A−1) mod cols
//     rowB = ⌊(B−1)/cols⌋    colB = (B−1) mod cols
//     rect = all (r,c) with min(rowA,rowB) ≤ r ≤ max(rowA,rowB)
//                         and min(colA,colB) ≤ c ≤ max(colA,colB)
//
//   Each (r,c) → position = r*cols + c + 1. Only positions whose DOM cell
//   passes isSelectable() are included; occupied ones are dropped silently.
//   A toast shows the final count once after the selection is applied.
//
// ── Occupancy validation ───────────────────────────────────────────────────────
//
//   On every grid repaint (MUI may re-render cells when a box is switched),
//   validateSelection() compares the model's selected positions against the live
//   DOM. Any position that is now occupied is removed from the model. The
//   consumer's onChange fires so the action bar counter updates in sync.
//
// Why getters (not frozen fields): occupancy and selection change over time
// (box switch, user clicks). A getter always reflects the live grid; a snapshot
// field would go stale. Consumers read them on demand.
//
// What it must NOT do
//   - No network, no sample/inventory logic, no payload knowledge.
//   - Never let a filled/occupied well enter the selection (fail-safe).
//   - Never mutate CDD's own markup beyond adding/removing our own classes and
//     appending our own bar (fully reversible in destroy()).
//
// Connects to: box-grid.js (all DOM reading), selection-model.js (pure state),
// styles.js (the classes used here). init.js calls this per discovered grid.

import {
    GRID_ANY_SELECTOR,
    CELL_SELECTOR,
    isBoxGrid,
    isFilledCell,
    readCellPosition,
    readGridPositions,
    readColumnCount,
    gridTagsEmpties,
    getSelectedBoxId,
} from "./box-grid.js";
import { createSelectionModel } from "./selection-model.js";

const CONTEXT_PROP = "__cddSelectionContext";

const CLS_SELECTABLE = "cdd-box-pos-selectable";
const CLS_OCCUPIED = "cdd-box-pos-occupied";
const CLS_SELECTED = "cdd-box-pos-selected";
const CLS_DENIED = "cdd-box-pos-denied";

// Resolve the actual box grid from whatever the caller passed (the grid itself,
// or a containing picker/dialog element). Ancestor-agnostic via isBoxGrid().
function resolveGrid(target) {
    if (!target || !target.querySelector) return null;
    if (isBoxGrid(target)) return target;
    for (const el of target.querySelectorAll(GRID_ANY_SELECTOR)) {
        if (isBoxGrid(el)) return el;
    }
    return null;
}

export function attachBoxSelection(gridOrPicker, options = {}) {
    const grid = resolveGrid(gridOrPicker);
    if (!grid) return null;

    // Idempotent: never stack two overlays on one grid.
    if (grid[CONTEXT_PROP]) return grid[CONTEXT_PROP];

    const opts = {
        allowFilled: false,
        mode: "empty-only",
        showCounter: true,
        actionLabel: null,
        onAction: null,
        onChange: null,
        ...options,
    };

    const model = createSelectionModel();

    // Whether THIS grid explicitly marks empties. Captured once at attach time;
    // if it does, "selectable" tightens to "explicitly empty AND not filled".
    const usesEmptyClass = gridTagsEmpties(grid);

    // Anchor position for shift-click rectangle selection. Set by normal clicks;
    // NOT changed by Ctrl-click or Shift-click (so Shift always rects from the
    // last unmodified click, matching spreadsheet behaviour).
    let anchor = null;

    // ----- selectability (the fail-safe core) --------------------------------
    function isSelectable(cell) {
        if (isFilledCell(cell)) return false;
        if (opts.allowFilled) return true;
        if (usesEmptyClass && !cell.classList.contains("box-position-empty")) {
            return false;
        }
        return true;
    }

    // ----- rectangle helpers -------------------------------------------------

    // All row-major position strings in the rectangle defined by two corners.
    // Falls back to just [clickedPos] when column count is unavailable or
    // positions are not pure integers.
    function computeRectPositions(anchorPos, clickedPos) {
        const cols = readColumnCount(grid);
        const a = parseInt(anchorPos, 10);
        const b = parseInt(clickedPos, 10);
        if (cols <= 0 || !Number.isFinite(a) || !Number.isFinite(b)) {
            return [clickedPos];
        }
        const aRow = Math.floor((a - 1) / cols);
        const aCol = (a - 1) % cols;
        const bRow = Math.floor((b - 1) / cols);
        const bCol = (b - 1) % cols;
        const minRow = Math.min(aRow, bRow), maxRow = Math.max(aRow, bRow);
        const minCol = Math.min(aCol, bCol), maxCol = Math.max(aCol, bCol);
        const result = [];
        for (let r = minRow; r <= maxRow; r++) {
            for (let c = minCol; c <= maxCol; c++) {
                result.push(String(r * cols + c + 1));
            }
        }
        return result;
    }

    // From a list of candidate position strings, return only those whose DOM
    // cell currently passes isSelectable(). Iterates the live grid so it's
    // always accurate even after a box switch.
    function selectableSubset(positions) {
        const inSet = new Set(positions);
        const result = [];
        for (const cell of grid.querySelectorAll(CELL_SELECTOR)) {
            const p = readCellPosition(cell);
            if (p && inSet.has(p) && isSelectable(cell)) result.push(p);
        }
        return result;
    }

    // ----- occupancy validation ----------------------------------------------

    // Remove any selected positions that have since become occupied. Called on
    // every grid repaint so the store never silently holds occupied wells.
    function validateSelection() {
        const selected = model.getSelectedPositions();
        if (!selected.length) return;
        const cellMap = new Map();
        for (const cell of grid.querySelectorAll(CELL_SELECTOR)) {
            const p = readCellPosition(cell);
            if (p) cellMap.set(p, cell);
        }
        const valid = [];
        const removed = [];
        for (const pos of selected) {
            const cell = cellMap.get(pos);
            if (cell && isFilledCell(cell)) {
                removed.push(pos);
            } else {
                valid.push(pos);
            }
        }
        if (removed.length) {
            console.debug("[CDD box-selection] validateSelection: removed occupied", removed);
            model.replaceSelection(valid);
        }
    }

    // ----- toast feedback ----------------------------------------------------

    function showToast(msg) {
        const existing = document.getElementById("cdd-box-selection-toast");
        if (existing) existing.remove();
        const toast = document.createElement("div");
        toast.id = "cdd-box-selection-toast";
        toast.className = "cdd-box-selection-toast";
        toast.textContent = msg;
        document.body.appendChild(toast);
        // Animate in, then out
        requestAnimationFrame(() => {
            toast.classList.add("cdd-box-selection-toast--visible");
            setTimeout(() => {
                toast.classList.remove("cdd-box-selection-toast--visible");
                setTimeout(() => toast.remove(), 350);
            }, 2200);
        });
    }

    // ----- the counter / action bar ------------------------------------------
    let bar = null;
    let countEl = null;
    let actionBtn = null;

    function buildBar() {
        if (!opts.showCounter && !opts.actionLabel) return;
        bar = document.createElement("div");
        bar.className = "cdd-box-selection-bar";

        countEl = document.createElement("span");
        countEl.className = "cdd-box-selection-bar__count";
        bar.appendChild(countEl);

        if (opts.actionLabel) {
            actionBtn = document.createElement("button");
            actionBtn.type = "button";
            actionBtn.className = "cdd-box-selection-bar__action";
            actionBtn.textContent = opts.actionLabel;
            actionBtn.addEventListener("click", () => {
                if (actionBtn.disabled) return;
                try {
                    opts.onAction?.(context);
                } catch (err) {
                    console.warn("[CDD box-selection] onAction failed", err);
                }
            });
            bar.appendChild(actionBtn);
        }

        const clearBtn = document.createElement("button");
        clearBtn.type = "button";
        clearBtn.className = "cdd-box-selection-bar__clear";
        clearBtn.textContent = "Clear";
        clearBtn.addEventListener("click", () => model.clear());
        bar.appendChild(clearBtn);

        grid.insertAdjacentElement("afterend", bar);
    }

    // ----- painting ----------------------------------------------------------
    function render() {
        // Validate first: remove selected positions that became occupied since
        // the last render (e.g. after a box switch in the picker).
        validateSelection();

        for (const cell of grid.querySelectorAll(CELL_SELECTOR)) {
            const filled = isFilledCell(cell);
            const selectable = isSelectable(cell);
            const pos = readCellPosition(cell);

            cell.classList.toggle(CLS_OCCUPIED, filled);
            cell.classList.toggle(CLS_SELECTABLE, selectable);
            cell.classList.toggle(CLS_SELECTED, !!pos && model.has(pos));
        }

        const n = model.count();
        if (countEl) {
            countEl.textContent =
                n === 1 ? "1 position selected" : `${n} positions selected`;
        }
        if (bar) bar.style.display = n > 0 ? "flex" : "none";
        if (actionBtn) actionBtn.disabled = n === 0;
    }

    let scheduled = false;
    function scheduleRender() {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            render();
        });
    }

    // ----- click handling (delegated, survives cell re-render) ---------------
    function onClick(event) {
        const cell = event.target.closest(CELL_SELECTOR);
        if (!cell || !grid.contains(cell)) return;

        const pos = readCellPosition(cell);
        if (pos == null) return;

        // Deselection always wins — even if the well has since become occupied,
        // the user must be able to remove it from the selection set.
        if (model.has(pos)) {
            model.deselect(pos);
            return; // anchor unchanged: a deselect doesn't reset the origin point
        }

        // At this point the cell is not selected. Block occupied wells.
        if (!isSelectable(cell)) {
            cell.classList.add(CLS_DENIED);
            setTimeout(() => cell.classList.remove(CLS_DENIED), 300);
            return;
        }

        const shiftKey = event.shiftKey;
        const ctrlKey = event.ctrlKey || event.metaKey;

        if (shiftKey && anchor != null) {
            // Rectangle: replace selection with all empty wells inside rect.
            const allInRect = computeRectPositions(anchor, pos);
            const empties = selectableSubset(allInRect);
            model.replaceSelection(empties);
            // Anchor stays — repeated Shift-clicks keep the same origin.
            const n = model.count();
            showToast(`${n} position${n === 1 ? "" : "s"} selected`);
        } else if (ctrlKey) {
            // Toggle this well, keep everything else.
            model.toggle(pos);
            // Anchor NOT changed: Ctrl-clicks don't reset the rectangle origin.
        } else {
            // Normal click: clear and select just this one; become the new anchor.
            model.replaceSelection([pos]);
            anchor = pos;
        }
    }

    // Capture phase so the handler fires even when CDD calls stopPropagation()
    // at the target level (which would otherwise swallow the bubble phase).
    grid.addEventListener("click", onClick, true);

    // Repaint when MUI replaces the grid's cells (e.g. box switch) so our
    // selected/occupied classes are re-applied to the fresh nodes. Validation
    // runs inside render() so occupied wells are also evicted from the model.
    const gridObserver = new MutationObserver(scheduleRender);
    gridObserver.observe(grid, { childList: true, subtree: true });

    // Selection changes -> repaint + tell the consumer (with the context).
    const unsubscribeModel = model.onChange(() => {
        scheduleRender();
        try {
            opts.onChange?.(context);
        } catch (err) {
            console.warn("[CDD box-selection] onChange (option) failed", err);
        }
    });

    // ----- SelectionContext (the one public abstraction) ---------------------
    const context = {
        // Best-effort box id. Treated as advisory: a consumer that creates
        // records must cross-check it and hard-stop on mismatch, never guess.
        get boxId() {
            return getSelectedBoxId();
        },
        get selectedPositions() {
            return model.getSelectedPositions();
        },
        get occupiedPositions() {
            return readGridPositions(grid).occupied;
        },
        get emptyPositions() {
            return readGridPositions(grid).empty;
        },
        get allPositions() {
            return readGridPositions(grid).all;
        },

        count() {
            return model.count();
        },
        has(position) {
            return model.has(position);
        },
        isOccupied(position) {
            return readGridPositions(grid).occupied.includes(String(position));
        },
        isEmpty(position) {
            return readGridPositions(grid).empty.includes(String(position));
        },

        clear() {
            model.clear();
            anchor = null;
        },
        onChange(cb) {
            // Adapt the model's (positions) signature to (ctx) for consumers.
            return model.onChange(() => {
                try {
                    cb?.(context);
                } catch (err) {
                    console.warn("[CDD box-selection] onChange listener failed", err);
                }
            });
        },
        destroy() {
            grid.removeEventListener("click", onClick, true);
            gridObserver.disconnect();
            unsubscribeModel();
            bar?.remove();
            const toast = document.getElementById("cdd-box-selection-toast");
            toast?.remove();
            for (const cell of grid.querySelectorAll(CELL_SELECTOR)) {
                cell.classList.remove(
                    CLS_OCCUPIED,
                    CLS_SELECTABLE,
                    CLS_SELECTED,
                    CLS_DENIED
                );
            }
            try {
                delete grid[CONTEXT_PROP];
            } catch {
                grid[CONTEXT_PROP] = undefined;
            }
        },

        // Escape hatch for tests/advanced consumers; not part of the documented
        // surface. Lets selection state be driven without DOM coupling.
        _model: model,
    };

    grid[CONTEXT_PROP] = context;

    buildBar();
    render();

    return context;
}
