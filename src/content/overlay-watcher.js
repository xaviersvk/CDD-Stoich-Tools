// content/overlay-watcher.js
import { STATE } from "./state.js";
import { PANEL_ID } from "../shared/plugin-constants.js";

function getPanel() {
    return document.getElementById(PANEL_ID);
}

export function isKetcherDialogOpen() {
    return !!document.querySelector(
        '[role="dialog"], .dialog, .modal, .ketcher, iframe[src*="ketcher"]'
    );
}

export function updatePanelVisibilityForOverlays() {
    // The flag is read even when there is no panel — renderFromState checks it
    // before building one — so it is updated BEFORE the panel is looked up.
    // Skipping the update while the panel is gone used to leave it stuck at
    // `true`: close the editor on a page with no panel and the next entry
    // would never get one.
    const open = isKetcherDialogOpen();
    STATE.isKetcherOpen = open;

    const panel = getPanel();
    if (!panel) return;

    panel.style.display = open ? "none" : "";
}

export function watchKetcherDialog() {
    const observer = new MutationObserver(() => {
        updatePanelVisibilityForOverlays();
    });

    // <html>, not <body>: Turbo swaps <body> on in-app navigation.
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: false
    });

    updatePanelVisibilityForOverlays();
}