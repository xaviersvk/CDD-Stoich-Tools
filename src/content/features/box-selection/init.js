// content/features/box-selection/init.js
//
// Framework wiring + discovery. This is the only part the rest of the extension
// imports directly. It does two things:
//
//   1. initBoxSelection()  - called once from content/main.js. Injects the
//      stylesheet and (for development/manual verification while there is not
//      yet a real consumer) exposes the framework on `window.__CDD_BOX_SELECTION__`
//      so it can be driven from the DevTools console. It does NOT auto-attach a
//      selection UI anywhere — a framework with no consumer must add no UI.
//
//   2. observeBoxGrids(handler) - the API a CONSUMER (e.g. multi-position sample
//      create) calls to be notified when a CDD box grid appears, so it can decide
//      whether to attach selection to it. The framework stays agnostic; the
//      consumer owns the policy ("only on the create form", what action button,
//      etc.).
//
// Why discovery lives here (and how the observer is safe)
//   - CDD is a Turbo SPA: it swaps <body> on navigation and MUI re-mounts the
//     box grid when a box is opened. So we observe `document.documentElement`
//     (survives <body> swaps), debounce via rAF, and de-dupe per grid node with
//     a WeakSet so a handler runs once per real grid. attachBoxSelection itself
//     is idempotent too (controller stored on the node), so even a missed de-dupe
//     cannot stack overlays.
//   - We return a disconnect function so a consumer can stop observing.
//
// What it must NOT do: no sample/inventory logic, no network, no payload work.

import { injectBoxSelectionStyles } from "./styles.js";
import { attachBoxSelection } from "./overlay.js";
import { GRID_ANY_SELECTOR, isBoxGrid } from "./box-grid.js";

let stylesReady = false;

// Observe the page for CDD box grids. `handler(grid)` is invoked once per newly
// seen grid; the handler typically calls attachBoxSelection(grid, options) and
// then works through the returned SelectionContext — it must not read the grid
// DOM itself. Returns a function that stops the observation.
export function observeBoxGrids(handler) {
    if (typeof handler !== "function") return () => {};

    if (!stylesReady) {
        injectBoxSelectionStyles();
        stylesReady = true;
    }

    const seen = new WeakSet();

    let scheduled = false;
    function scan() {
        scheduled = false;
        for (const grid of document.querySelectorAll(GRID_ANY_SELECTOR)) {
            if (!isBoxGrid(grid)) continue;
            if (seen.has(grid)) continue;
            seen.add(grid);
            try {
                handler(grid);
            } catch (err) {
                console.warn("[CDD box-selection] grid handler failed", err);
            }
        }
    }
    function schedule() {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(scan);
    }

    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
    });

    schedule(); // catch a grid already present at call time

    return () => observer.disconnect();
}

// Called once from main.js. Styles + a console-only handle for manual M1
// verification. No UI is attached until a real consumer calls observeBoxGrids.
export function initBoxSelection() {
    if (!stylesReady) {
        injectBoxSelectionStyles();
        stylesReady = true;
    }

    if (typeof window !== "undefined" && !window.__CDD_BOX_SELECTION__) {
        // Debug handle (M1): in the console, on a page showing a box grid, run
        //   __CDD_BOX_SELECTION__.attachBoxSelection(
        //     document.querySelector('.LocationBoxPicker .positions'),
        //     { actionLabel: 'Test',
        //       onAction: ctx => console.log(ctx.boxId, ctx.selectedPositions,
        //                                    ctx.emptyPositions, ctx.occupiedPositions) }
        //   )
        // to verify selecting empty wells, blocking occupied ones, the counter,
        // and the SelectionContext. Remove this handle once a real consumer exists.
        window.__CDD_BOX_SELECTION__ = { attachBoxSelection, observeBoxGrids };
    }
}
