// content/features/control-layout/init.js
//
// Discovery for the control-layout tools. Attaches the toolbar to every
// control-layout EDIT grid CDD renders, wherever it renders one: the run's
// "Run Default 96/384/1536-well Control Layout" sections, a plate-specific
// layout added with "Add a plate-specific control layout", and the same editor
// on any other page that uses it. The test is the DOM shape (a plate table with
// submittable well inputs), never a URL or a section id.
//
// Why the scan sweeps before it attaches
// --------------------------------------
// Re-opening a saved layout ("Edit this layout" -> cancel -> "Edit this layout")
// makes CDD swap the <table> INSIDE the <form> while keeping the form. Our
// toolbar is a child of that form, so it survives the swap as an orphan sitting
// next to nothing, and the fresh table then gets a toolbar of its own — that is
// how the second and third "Paint wells" bar appeared. So every scan first
// removes toolbars that no longer sit in front of a live grid, then adds one
// wherever a grid has none.
//
// There is no WeakSet and no "already attached" flag: the DOM is the only
// bookkeeping. Nothing can go stale, and a SECOND copy of the extension (a
// store install plus an unpacked build) sees the first copy's toolbar and
// leaves it be instead of stacking another one — expando-based bookkeeping
// cannot do that, because isolated worlds cannot read each other's expandos.
//
// Costs nothing on pages without a control layout: the scan is two
// querySelectorAll calls, for `table.plateLayout` and our own toolbar class,
// which most pages do not have.

import {
    attachControlLayoutTools,
    isStaleToolbar,
    isOwnToolbar,
    destroyToolbar,
} from "./toolbar.js";
import { LAYOUT_TABLE_SELECTOR, isControlLayoutEditTable } from "./layout-grid.js";
import { ROOT_CLASS } from "./styles.js";

// Replacing a toolbar we did not build is normal exactly once per grid: it is
// how a re-parsed clone gets swapped for a working one. Doing it over and over
// for the SAME grid node means something is putting its own toolbar back — a
// second installed copy of the extension — so we stand down rather than trade
// toolbars with it forever.
const MAX_FOREIGN_REPLACEMENTS = 3;
const foreignReplacements = new WeakMap();

let started = false;

export function initControlLayoutTools() {
    if (started) return;
    started = true;

    let scheduled = false;

    function scan() {
        scheduled = false;

        for (const root of document.querySelectorAll(`.${ROOT_CLASS}`)) {
            if (!isStaleToolbar(root)) continue;

            // A foreign toolbar still sitting in front of a grid is a clone we
            // are about to replace — count it against that grid.
            const grid = root.nextElementSibling;
            if (!isOwnToolbar(root) && isControlLayoutEditTable(grid)) {
                const tries = (foreignReplacements.get(grid) || 0) + 1;
                if (tries > MAX_FOREIGN_REPLACEMENTS) continue;
                foreignReplacements.set(grid, tries);
            }

            try {
                destroyToolbar(root);
            } catch (err) {
                console.warn("[CDD plate plugin] control layout toolbar cleanup failed", err);
            }
        }

        for (const table of document.querySelectorAll(LAYOUT_TABLE_SELECTOR)) {
            if (!isControlLayoutEditTable(table)) continue;
            try {
                attachControlLayoutTools(table);
            } catch (err) {
                console.warn("[CDD plate plugin] control layout tools failed", err);
            }
        }
    }

    function schedule() {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(scan);
    }

    // <html>, not <body>: Turbo swaps <body> on in-app navigation, which would
    // silently kill an observer attached to the old body.
    new MutationObserver(schedule).observe(document.documentElement, {
        childList: true,
        subtree: true,
    });

    schedule(); // a grid already in the DOM at load time
}
