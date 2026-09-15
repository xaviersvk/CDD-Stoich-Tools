// content/features/ui-fixes/inventory-location-scan/init.js
//
// Discovery + wiring. The only thing content/main.js imports from this feature.
//
// CDD is a Turbo SPA and MUI mounts the Edit Locations dialog fresh every time,
// so the watcher sits on `document.documentElement` (which survives <body>
// swaps) and rescans, rAF-debounced. The button is a child of the dialog's own
// footer, so React removing the dialog removes the button with it — and the
// panel too, which is a child of the dialog's content box.
//
// The switch is read from the sync cache on every scan rather than once at
// start-up, so flipping it in the options page adds or removes the button on a
// dialog that is already open.
//
// Independently of the switch, every sync also runs the duplicate-name pass:
// the whole tree from the bridge, the twins from tree-model, the colour from
// name-marks. A rename typed into CDD's name field repaints the label — as a
// characterData mutation, measured: React rewrites the text node in place
// and adds no element — so the observer watches text as well as children,
// and the row turns orange while the user is still typing. With childList
// alone the pass ran only when something ELSE on the page changed shape,
// which read as "the colour takes a while".

import {
    isInventoryScanEnabled,
    onInventoryScanChanged,
} from "../../../../shared/inventory-scan.js";
import { findDialog, findFooter, footerAnchor, nextFrame } from "./dialog-dom.js";
import { markDuplicateNames } from "./name-marks.js";
import { closeScanPanel, openScanPanel } from "./scan-panel.js";
import { injectScanStyles } from "./styles.js";
import { mountTreeFilter, paintTreeFilter, unmountTreeFilter } from "./tree-filter.js";
import { duplicateBoxNames } from "./tree-model.js";
import { readTreeNodes } from "./tree-source.js";

const BUTTON_CLASS = "cdd-scan-open";

let started = false;

function mount(dialog) {
    const footer = findFooter(dialog);
    if (!footer) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = BUTTON_CLASS;
    button.textContent = "Scan racks";
    button.addEventListener("click", () => openScanPanel(dialog));

    const anchor = footerAnchor(footer);
    if (anchor) footer.insertBefore(button, anchor);
    else footer.prepend(button);
}

// One pass in flight at a time; a mutation that lands during one asks for a
// single follow-up rather than a queue of them. The marks are attributes and
// the observer does not watch attributes, so a pass never re-triggers itself.
let marking = false;
let markAgain = false;

async function markPass(dialog) {
    if (marking) {
        markAgain = true;
        return;
    }
    marking = true;
    try {
        const nodes = await readTreeNodes(dialog);
        if (dialog.isConnected) {
            markDuplicateNames(dialog, duplicateBoxNames(nodes));
            // React may have repainted rows the filter had hidden.
            paintTreeFilter(dialog);
        }
    } catch (error) {
        // A missed colour must never cost the user the dialog.
        console.warn("[CDD scan-racks] duplicate-name pass failed", error);
    } finally {
        marking = false;
        if (markAgain) {
            markAgain = false;
            if (dialog.isConnected) markPass(dialog);
        }
    }
}

function sync() {
    const dialog = findDialog();
    if (!dialog) {
        closeScanPanel();
        unmountTreeFilter();
        return;
    }

    // Always on: a colour in a dialog and a filter box above the tree, no
    // switch. Both run whether or not the scan button is mounted.
    mountTreeFilter(dialog);
    markPass(dialog);

    const existing = dialog.querySelector(`.${BUTTON_CLASS}`);
    if (isInventoryScanEnabled()) {
        if (!existing) mount(dialog);
    } else if (existing) {
        existing.remove();
        closeScanPanel();
    }
}

export function initInventoryLocationScan() {
    injectScanStyles();

    if (started) return;
    started = true;

    let scheduled = false;

    // nextFrame rather than a bare requestAnimationFrame: rAF is paused in a
    // hidden tab, and the button would then not appear until the tab was
    // looked at. Measured — a dialog opened in a background tab kept an empty
    // footer through any number of mutations.
    function schedule() {
        if (scheduled) return;
        scheduled = true;
        nextFrame().then(() => {
            scheduled = false;
            try {
                sync();
            } catch (error) {
                // A broken button must never cost the user the dialog.
                console.warn("[CDD scan-racks] mount failed", error);
            }
        });
    }

    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, {
        childList: true,
        characterData: true,
        subtree: true,
    });

    onInventoryScanChanged(schedule);
    schedule(); // the dialog could already be open
}
