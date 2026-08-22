// ui-fixes/eln-shift-left.js — give the sample panel the room CDD leaves empty.
//
// CDD renders an ELN entry at a fixed ~1 190px and centres it with
// `margin: 0 auto`, so on a laptop the panel (300px, pinned to the right)
// lands on the entry's right-hand columns while the same width sits unused on
// the left. While the panel is open, the entry is pushed to the left edge
// instead; on a full-HD 14" display that is enough for the two to sit side
// by side. Collapsed or absent panel → CDD's own centring, untouched.
//
// One stylesheet, keyed on the panel through `:has()`, so there is nothing to
// keep in sync with the panel's own lifecycle. Injected on every CDD page:
// the rule only bites where the panel exists, and the panel only exists on an
// entry — and the entry may be reached by in-app navigation, long after init.

import { PANEL_ID } from "../../../shared/plugin-constants.js";
import { initElnShift, onElnShiftChanged } from "../../../shared/eln-shift-flag.js";

const STYLE_ID = "cdd-stoich-eln-shift-left";

const STYLES = `
  body:has(#${PANEL_ID}:not(.collapsed)) #content-inner {
    margin-left: 0;
    margin-right: auto;
  }
`;

function applyElnShift(enabled) {
    const existing = document.getElementById(STYLE_ID);
    if (!enabled) {
        if (existing) existing.remove();
        return;
    }
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
