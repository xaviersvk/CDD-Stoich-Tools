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
    const panel = getPanel();
    if (!panel) return;

    const open = isKetcherDialogOpen();
    STATE.isKetcherOpen = open;

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