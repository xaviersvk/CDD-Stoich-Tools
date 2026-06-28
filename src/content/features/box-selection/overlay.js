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
// How the MutationObserver attaches safely
//   - Discovery is init.js's job; this overlay observes only ITS OWN grid
//     subtree, because MUI re-renders the grid's cells (e.g. switching boxes)
//     which would otherwise drop our classes. On any child mutation we repaint
//     (debounced via rAF). destroy() disconnects it. Toggling a class does not
//     retrigger us: we watch childList/subtree, not attributes.
//   - Double-attach guard: the context is stored on the grid node, so calling
//     attachBoxSelection twice on the same grid returns the SAME context.
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

    // ----- selectability (the fail-safe core) -----------------------------
    function isSelectable(cell) {
        if (isFilledCell(cell)) return false;          // occupied: never
        if (opts.allowFilled) return true;             // (still not filled)
        if (usesEmptyClass && !cell.classList.contains("box-position-empty")) {
            return false;                              // grid tags empties, this isn't one
        }
        return true;
    }

    // ----- the counter / action bar ---------------------------------------
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

    // ----- painting --------------------------------------------------------
    function render() {
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

    // ----- click handling (delegated, survives cell re-render) -------------
    function onClick(event) {
        const cell = event.target.closest(CELL_SELECTOR);
        if (!cell || !grid.contains(cell)) return;

        if (!isSelectable(cell)) {
            // Make the refusal visible instead of silently ignoring the click.
            cell.classList.add(CLS_DENIED);
            setTimeout(() => cell.classList.remove(CLS_DENIED), 300);
            return;
        }

        const pos = readCellPosition(cell);
        if (pos == null) return;
        model.toggle(pos); // -> model emits -> our onChange -> render()
    }

    grid.addEventListener("click", onClick);

    // Repaint when MUI replaces the grid's cells (e.g. box switch) so our
    // selected/occupied classes are re-applied to the fresh nodes.
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

    // ----- SelectionContext (the one public abstraction) -------------------
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
            grid.removeEventListener("click", onClick);
            gridObserver.disconnect();
            unsubscribeModel();
            bar?.remove();
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
