// ui-fixes/eln-shift-left.js — give the sample panel the room CDD leaves empty.
//
// CDD renders an ELN entry at a fixed ~1 190px and centres it with
// `margin: 0 auto`, so on a laptop the panel (300px, pinned to the right)
// lands on the entry's right-hand columns while the same width sits unused on
// the left. While the panel is open and would cover the entry, a strip on
// the panel's side is taken out of the page (padding on that side of
// #content), just wide enough that CDD's own `margin: 0 auto` re-centres the
// entry 24px clear of the panel. A wide screen where they do not meet is left
// alone. Either side: a panel dragged into the left half reserves its strip
// on the left. Where that leaves too little room, the
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

// Gap kept between the shifted entry and the panel.
const PANEL_GAP = 24;

// Only as much as keeps PANEL_GAP between the entry and the panel. The side
// is decided by which half the panel's centre is in. CDD centres the entry,
// so a reserve R on the right moves its right edge to (W − R + entryW) / 2;
// solving for an edge at panel.left − gap gives the reserve below (mirrored
// for the left). On a wide screen, where the centred entry already clears
// the panel, that is ≤ 0 → nothing moves; as the room shrinks the entry
// slides away smoothly instead of jumping. Capped at the room the entry
// leaves, or a left-side strip would push the entry off the right of the
// page. The entry's width does not depend on the reserve (`flex-shrink: 0`),
// so measuring it here cannot feed back.
function measureReserve() {
    watchEntry();
    const panel = document.getElementById(PANEL_ID);
    const entry = document.getElementById("content-inner");
    const pageWidth = document.documentElement.clientWidth;
    let left = 0;
    let right = 0;
    if (panel && entry) {
        const rect = panel.getBoundingClientRect();
        const entryWidth = entry.getBoundingClientRect().width;
        const room = Math.max(0, pageWidth - entryWidth);
        if (rect.left + rect.width / 2 > pageWidth / 2) {
            right = Math.min(room, Math.round(pageWidth + entryWidth - 2 * (rect.left - PANEL_GAP)));
        } else {
            left = Math.min(room, Math.round(pageWidth + entryWidth - 2 * (pageWidth - rect.right - PANEL_GAP)));
        }
    }
    const root = document.documentElement.style;
    root.setProperty(RESERVE_LEFT_VAR, `${Math.max(0, left)}px`);
    root.setProperty(RESERVE_RIGHT_VAR, `${Math.max(0, right)}px`);
}

// The panel is a direct child of <html> and is rebuilt per entry; drag and
// resize both land in its `style` attribute (left, --cdd-panel-width).
// `class` too: collapsing, or a CDD sidebar hiding it, changes the entry's
// width, and the cap above must be measured while the rule applies.
//
// Sizes as well, through a ResizeObserver on the panel and on the entry.
// On a fresh page load the panel can be up before CDD has rendered the
// entry, while #content-inner still spans the whole page — the cap then
// comes out 0 and, with nothing else changing, it stayed 0 (no shift until
// the panel was touched). The entry settling to its real width is what
// re-measures now.
let panelWatch = null;
let sizeWatch = null;
let watchedPanel = null;
let watchedEntry = null;

function watchPanel() {
    const panel = document.getElementById(PANEL_ID);
    if (panel === watchedPanel) return;
    if (watchedPanel && sizeWatch) sizeWatch.unobserve(watchedPanel);
    watchedPanel = panel;
    if (panelWatch) panelWatch.disconnect();
    if (panel) {
        panelWatch.observe(panel, { attributes: true, attributeFilter: ["style", "class"] });
        if (sizeWatch) sizeWatch.observe(panel);
    }
    measureReserve();
}

// #content-inner is replaced when Turbo swaps <body> on in-app navigation.
function watchEntry() {
    if (!sizeWatch) return;
    const entry = document.getElementById("content-inner");
    if (entry === watchedEntry) return;
    if (watchedEntry) sizeWatch.unobserve(watchedEntry);
    watchedEntry = entry;
    if (entry) sizeWatch.observe(entry);
}

let started = false;

function startMeasuring() {
    if (started) return;
    started = true;
    panelWatch = new MutationObserver(measureReserve);
    if (typeof ResizeObserver !== "undefined") sizeWatch = new ResizeObserver(measureReserve);
    // <html>'s own children: the panel, and <body> when Turbo swaps it.
    new MutationObserver(() => {
        watchPanel();
        measureReserve();
    }).observe(document.documentElement, { childList: true });
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
