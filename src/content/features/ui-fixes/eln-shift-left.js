// ui-fixes/eln-shift-left.js — give the sample panel the room CDD leaves empty.
//
// CDD renders an ELN entry at a fixed ~1 190px and centres it with
// `margin: 0 auto`, so on a laptop the panel (300px, pinned to the right)
// lands on the entry's right-hand columns while the same width sits unused on
// the left. While the panel is open, the strip it occupies is taken out of
// the page (`padding-right` on #content), so CDD's own `margin: 0 auto`
// centres the entry in what is left — equal gaps on the left and towards the
// panel. Where that strip leaves too little room, the entry keeps its width
// and simply starts at the left edge: `flex-shrink: 0` stops it being
// squeezed into a horizontal scrollbar, and auto margins with no free space
// collapse to 0. Collapsed, absent, or hidden while CDD's Comments / Table of
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
const RESERVE_VAR = "--cdd-stoich-panel-reserve";

// `:root`, not `body`: sample-panel.js appends the panel to <html>, so
// `body:has(#panel)` never matched and the rule shipped dead in 15.1.0.
const OPEN = `:root:has(#${PANEL_ID}:not(.collapsed):not(.${OVERLAY_HIDDEN_CLASS}))`;
const STYLES = `
  ${OPEN} #content {
    padding-right: var(${RESERVE_VAR}, 0px);
    box-sizing: border-box;
  }
  ${OPEN} #content-inner {
    flex-shrink: 0;
  }
`;

// The strip from the panel's left edge to the page's right edge. A panel
// dragged into the left half reserves nothing: the entry stays centred.
function measureReserve() {
    const panel = document.getElementById(PANEL_ID);
    const pageWidth = document.documentElement.clientWidth;
    let reserve = 0;
    if (panel) {
        const left = panel.getBoundingClientRect().left;
        if (left > pageWidth / 2) reserve = Math.round(pageWidth - left);
    }
    document.documentElement.style.setProperty(RESERVE_VAR, `${reserve}px`);
}

// The panel is a direct child of <html> and is rebuilt per entry; drag and
// resize both land in its `style` attribute (left, --cdd-panel-width).
let panelWatch = null;
let watchedPanel = null;

function watchPanel() {
    const panel = document.getElementById(PANEL_ID);
    if (panel === watchedPanel) return;
    watchedPanel = panel;
    if (panelWatch) panelWatch.disconnect();
    if (panel) panelWatch.observe(panel, { attributes: true, attributeFilter: ["style"] });
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
