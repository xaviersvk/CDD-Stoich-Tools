// content/overlay-watcher.js
import { STATE } from "./state.js";
import { PANEL_ID } from "../shared/plugin-constants.js";

// Set on the panel whenever it is hidden here, so CSS keyed on the panel
// (eln-shift-left.js) can tell "open" from "open but hidden".
export const OVERLAY_HIDDEN_CLASS = "cdd-overlay-hidden";

function getPanel() {
    return document.getElementById(PANEL_ID);
}

export function isKetcherDialogOpen() {
    return !!document.querySelector(
        '[role="dialog"], .dialog, .modal, .ketcher, iframe[src*="ketcher"]'
    );
}

/* ------------------------------------------------------------------ *
 * CDD's own ELN sidebars.
 *
 * Table of contents (left) and Comments (right) are both always in the
 * DOM; closed, they are simply 0px wide. Comments sits exactly where the
 * panel does, so while either is open the panel steps aside entirely.
 * Their width is followed with a ResizeObserver rather than read on every
 * mutation — the observer below fires dozens of times a second on a live
 * entry, and a layout read in it would force a reflow each time.
 * ------------------------------------------------------------------ */

const SIDEBAR_SELECTORS = [
    '[data-autotest-id="toc-sidebar-content"]',
    '[data-autotest-id="comments-sidebar-header"]',
];

// Observed element -> is it open (width > 0)?
const sidebarOpen = new Map();
let sidebarObserver = null;

function isCddSidebarOpen() {
    for (const open of sidebarOpen.values()) if (open) return true;
    return false;
}

// Picks up sidebar elements CDD has (re)rendered, and drops the ones it
// has thrown away. Cheap: two querySelector calls, no layout.
function trackSidebars() {
    if (typeof ResizeObserver === "undefined") return;
    if (!sidebarObserver) {
        sidebarObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                sidebarOpen.set(entry.target, entry.contentRect.width > 0);
            }
            updatePanelVisibilityForOverlays();
        });
    }
    for (const el of [...sidebarOpen.keys()]) {
        if (el.isConnected) continue;
        sidebarObserver.unobserve(el);
        sidebarOpen.delete(el);
    }
    for (const selector of SIDEBAR_SELECTORS) {
        const el = document.querySelector(selector);
        if (!el || sidebarOpen.has(el)) continue;
        sidebarOpen.set(el, false);  // the first callback reports the real width
        sidebarObserver.observe(el);
    }
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

    // A CDD sidebar only hides the panel; it does not stop it being built,
    // so the panel is current the moment the sidebar closes again.
    const hidden = open || isCddSidebarOpen();
    panel.style.display = hidden ? "none" : "";
    panel.classList.toggle(OVERLAY_HIDDEN_CLASS, hidden);
}

export function watchKetcherDialog() {
    const observer = new MutationObserver(() => {
        trackSidebars();
        updatePanelVisibilityForOverlays();
    });

    // <html>, not <body>: Turbo swaps <body> on in-app navigation.
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: false
    });

    trackSidebars();
    updatePanelVisibilityForOverlays();
}
