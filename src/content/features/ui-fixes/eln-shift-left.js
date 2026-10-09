// ui-fixes/eln-shift-left.js — give the sample panel the room CDD leaves empty.
//
// CDD renders an ELN entry at a fixed ~1 190px and centres it with
// `margin: 0 auto`, so on a laptop the panel (300px, pinned to the right)
// lands on the entry's right-hand columns while the same width sits unused on
// the left. While the panel is open, the strip it occupies is taken out of
// the page (padding on that side of #content), so CDD's own `margin: 0 auto`
// centres the entry in what is left — equal gaps towards the page edge and
// towards the panel. Either side: a panel dragged into the left half
// reserves its strip on the left. Where that leaves too little room, the
// entry keeps its width (`flex-shrink: 0` stops it being squeezed into a
// horizontal scrollbar) and the strip is cut down to what fits, so the
// entry sits against the far page edge and the panel overlaps its near
// side — never pushed off the page. Collapsed, absent, or hidden while CDD's Comments / Table of
// contents sidebar is open (overlay-watcher.js) → CDD's own layout, untouched.
//
// The CSS is keyed on the panel through `:has()`; only the strip's width is
// measured, because the panel can be dragged and resized. Injected on every
// CDD page: the rule only bites where the panel exists, and the panel only
// exists on an entry — reached, possibly, by in-app navigation long after
// init.

import { PANEL_ID } from "../../../shared/plugin-constants.js";
import { initElnShift, onElnShiftChanged } from "../../../shared/eln-shift-flag.js";
import { OVERLAY_HIDDEN_CLASS } from "../../overlay-watcher.js";

const STYLE_ID = "cdd-stoich-eln-shift-left";
const RESERVE_LEFT_VAR = "--cdd-stoich-panel-reserve-left";
const RESERVE_RIGHT_VAR = "--cdd-stoich-panel-reserve-right";

// `:root`, not `body`: sample-panel.js appends the panel to <html>, so
// `body:has(#panel)` never matched and the rule shipped dead in 15.1.0.
const OPEN = `:root:has(#${PANEL_ID}:not(.collapsed):not(.${OVERLAY_HIDDEN_CLASS}))`;
const STYLES = `
  ${OPEN} #content {
    padding-left: var(${RESERVE_LEFT_VAR}, 0px);
    padding-right: var(${RESERVE_RIGHT_VAR}, 0px);
    box-sizing: border-box;
  }
  ${OPEN} #content-inner {
    flex-shrink: 0;
  }
`;

// The strip between the panel and the nearer page edge, decided by which
// half the panel's centre is in: right half → from its left edge to the
// right of the page, left half → from the left of the page to its right
// edge. Capped at the room the entry leaves, or a left-side strip would
// push the entry off the right of the page.
function measureReserve() {
    const panel = document.getElementById(PANEL_ID);
    const entry = document.getElementById("content-inner");
    const pageWidth = document.documentElement.clientWidth;
    let left = 0;
    let right = 0;
    if (panel && entry) {
        const rect = panel.getBoundingClientRect();
        const room = Math.max(0, pageWidth - entry.getBoundingClientRect().width);
        if (rect.left + rect.width / 2 > pageWidth / 2) right = Math.min(room, Math.round(pageWidth - rect.left));
        else left = Math.min(room, Math.round(rect.right));
    }
    const root = document.documentElement.style;
    root.setProperty(RESERVE_LEFT_VAR, `${Math.max(0, left)}px`);
    root.setProperty(RESERVE_RIGHT_VAR, `${Math.max(0, right)}px`);
}

// The panel is a direct child of <html> and is rebuilt per entry; drag and
// resize both land in its `style` attribute (left, --cdd-panel-width).
// `class` too: collapsing, or a CDD sidebar hiding it, changes the entry's
// width, and the cap above must be measured while the rule applies.
let panelWatch = null;
let watchedPanel = null;

function watchPanel() {
    const panel = document.getElementById(PANEL_ID);
    if (panel === watchedPanel) return;
    watchedPanel = panel;
    if (panelWatch) panelWatch.disconnect();
    if (panel) panelWatch.observe(panel, { attributes: true, attributeFilter: ["style", "class"] });
    measureReserve();
}

let started = false;

function startMeasuring() {
    if (started) return;
    started = true;
    panelWatch = new MutationObserver(measureReserve);
    new MutationObserver(watchPanel).observe(document.documentElement, { childList: true });
    window.addEventListener("resize", measureReserve);
    watchPanel();
}

function applyElnShift(enabled) {
    const existing = document.getElementById(STYLE_ID);
    if (!enabled) {
        if (existing) existing.remove();
        return;
    }
    startMeasuring();
    if (existing) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = STYLES;
    (document.head || document.documentElement).appendChild(style);
}

export function initElnShiftLeft() {
    initElnShift().then(applyElnShift);
    onElnShiftChanged(applyElnShift);
}
