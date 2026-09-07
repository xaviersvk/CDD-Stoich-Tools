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

import {
    isInventoryScanEnabled,
    onInventoryScanChanged,
} from "../../../../shared/inventory-scan.js";
import { findDialog, findFooter, footerAnchor } from "./dialog-dom.js";
import { closeScanPanel, openScanPanel } from "./scan-panel.js";
import { injectScanStyles } from "./styles.js";

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

function sync() {
    const dialog = findDialog();
    if (!dialog) {
        closeScanPanel();
        return;
    }

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

    function schedule() {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
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
        subtree: true,
    });

    onInventoryScanChanged(schedule);
    schedule(); // the dialog could already be open
}
