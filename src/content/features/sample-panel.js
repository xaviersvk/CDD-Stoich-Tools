import { copyTextWithFeedback } from "../utils/clipboard.js";
import { normalizeValue } from "../utils/format.js";
import { STATE } from "../state.js";
import {
    computeFillOffers,
    runFillOffer,
    markOfferFilled,
    offerUsesMemory,
} from "./fill-offers.js";
import {
    captureValuesFromSamples,
    touchValueUsed,
} from "../../shared/density-memory.js";
import { getPurityWarnThreshold } from "../../shared/purity-threshold.js";
import { isShowProductsEnabled } from "../../shared/show-products-flag.js";
import {
    isElnIdToBatchEnabled,
    getCarrySettings,
    composeBatchElnId,
} from "../../shared/eln-id-to-batch.js";
import { readFieldByLabel } from "../api/batch-registration-props.js";
import { writeElnIdToBatch } from "./eln-id-to-batch-write.js";
import { forgetMoleculePage } from "../api/molecule-page.js";
import { readElnEntryId } from "../utils/eln-entry-id.js";
import { isElnEntryPage } from "../../shared/page-detection.js";
import { isTableRowsEnabled } from "../../shared/panel-sources-flag.js";
import { PANEL_ID, REACTION_COLORS } from "../../shared/plugin-constants.js";
import { getMentionSamples } from "./mentions/state.js";
import { getPanelContents } from "./panel-contents.js";
import { updatePanelVisibilityForOverlays } from "../overlay-watcher.js";
import { printPanel } from "./panel-print.js";
import { exportPanelCsv } from "./panel-csv.js";
import {
    SAMPLE_PANEL_FIELDS,
    SAMPLE_PANEL_SETTINGS_KEY,
    resolveFieldValue,
    getDefaultVisibleFields,
    getSamplePanelSettings,
    getCustomFieldsFromSample,
    discoverCustomFields,
    getDiscoveredCustomFields,
    saveDiscoveredCustomFields,
    touchSeenCustomFields,
    pruneExpiredCustomFields,
    parsePurity,
} from "../../shared/sample-panel-fields.js";
import { recordSampleIdPrefix } from "../../shared/prefix-colors.js";
import { loadPanelState, savePanelState } from "./panel-state.js";
import { makePanelResizable, applySavedPanelSize, clampPanelIntoView } from "./panel-resize.js";
import {
    createHplcInjectionBlock,
    resetHplcInjectionBlocks,
    HPLC_BLOCK_STYLES,
} from "./hplc-injection-block.js";

// Visible-field map, kept in sync with chrome.storage by initSamplePanelFields().
// Starts from the registry defaults so the first paint is correct even before
// the async storage read resolves.
let visibleFields = getDefaultVisibleFields();

export function makePanelDraggable(panel) {
    const header = panel.querySelector(".cdd-stoich-header");
    if (!header) return;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    header.addEventListener("mousedown", (event) => {
        if (event.target.closest("button")) return;

        isDragging = true;

        const rect = panel.getBoundingClientRect();
        panel.style.left = `${rect.left}px`;
        panel.style.top = `${rect.top}px`;
        panel.style.right = "auto";

        startX = event.clientX;
        startY = event.clientY;
        startLeft = rect.left;
        startTop = rect.top;

        document.body.style.userSelect = "none";
        event.preventDefault();
    });

    document.addEventListener("mousemove", (event) => {
        if (!isDragging) return;

        const dx = event.clientX - startX;
        const dy = event.clientY - startY;

        let newLeft = startLeft + dx;
        let newTop = startTop + dy;

        const maxLeft = window.innerWidth - panel.offsetWidth;
        const maxTop = window.innerHeight - panel.offsetHeight;

        newLeft = Math.max(0, Math.min(newLeft, maxLeft));
        newTop = Math.max(0, Math.min(newTop, maxTop));

        panel.style.left = `${newLeft}px`;
        panel.style.top = `${newTop}px`;
    });

    document.addEventListener("mouseup", () => {
        if (!isDragging) return;

        isDragging = false;
        document.body.style.userSelect = "";

        savePanelState({
            left: panel.style.left,
            top: panel.style.top,
            right: "auto",
        });
    });
}

/**
 * Is there anything for the panel to show on this page?
 *
 * A stoichiometry table OR a batch/sample linked in the entry text. It used
 * to be the table alone, which meant an entry that only *writes about* its
 * materials got no panel at all — and that is exactly the entry the mention
 * cards were added for.
 *
 * The page check belongs HERE rather than in the callers: the panel hangs off
 * <html> so that Turbo's <body> swap cannot take it away, which also means
 * nothing removes it on its own when an in-app navigation leaves the entry.
 * Asking one question — "should this page have a panel?" — is what lets
 * ensurePanel refuse to build one off an entry and renderFromState take the
 * old one down.
 */
export function shouldShowPanel() {
    if (!isElnEntryPage()) return false;
    return STATE.hasReactionFeature || getMentionSamples().length > 0;
}

export function ensurePanel() {
    if (!shouldShowPanel()) return null;

    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;

    const savedPanelState = loadPanelState();

    panel = document.createElement("div");
    panel.id = PANEL_ID;

    if (savedPanelState.left && savedPanelState.top) {
        panel.style.left = savedPanelState.left;
        panel.style.top = savedPanelState.top;
        panel.style.right = "auto";
    } else {
        panel.style.top = "16px";
        panel.style.right = "16px";
        panel.style.left = "auto";
    }

    applySavedPanelSize(panel);

    const header = document.createElement("div");
    header.className = "cdd-stoich-header";

    const title = document.createElement("div");
    title.className = "cdd-stoich-title";
    title.textContent = "CDD Samples";

    const actions = document.createElement("div");
    actions.className = "cdd-stoich-actions";

    const refreshBtn = document.createElement("button");
    refreshBtn.id = `${PANEL_ID}-refresh`;
    refreshBtn.type = "button";
    refreshBtn.textContent = "Refresh";

    const printBtn = document.createElement("button");
    printBtn.id = `${PANEL_ID}-print`;
    printBtn.type = "button";
    printBtn.textContent = "Print";

    // Split button: CSV exports the whole table as before, the caret opens
    // the narrower exports.
    const csvGroup = document.createElement("div");
    csvGroup.className = "cdd-csv-split";

    const csvBtn = document.createElement("button");
    csvBtn.id = `${PANEL_ID}-csv`;
    csvBtn.type = "button";
    csvBtn.textContent = "CSV";
    csvBtn.title = "Download this table as a CSV file (opens in Excel).";

    const csvMenuBtn = document.createElement("button");
    csvMenuBtn.id = `${PANEL_ID}-csv-menu`;
    csvMenuBtn.type = "button";
    csvMenuBtn.textContent = "▾";
    csvMenuBtn.title = "Other CSV exports";
    csvMenuBtn.setAttribute("aria-haspopup", "true");
    csvMenuBtn.setAttribute("aria-expanded", "false");

    // Fixed rather than absolute: the panel clips its overflow, and collapsed
    // it is no taller than the header — a menu placed inside its box would be
    // cut off. Fixed escapes that, and gets positioned from the caret's rect.
    const csvMenu = document.createElement("div");
    csvMenu.className = "cdd-csv-menu";
    csvMenu.hidden = true;
    // The header is the drag handle and this menu sits inside it.
    csvMenu.addEventListener("mousedown", (event) => event.stopPropagation());

    const csvProductsBtn = document.createElement("button");
    csvProductsBtn.id = `${PANEL_ID}-csv-products`;
    csvProductsBtn.type = "button";
    csvProductsBtn.textContent = "Products only";
    csvProductsBtn.title =
        "Download just the reaction product rows, whether or not the panel is showing them.";
    csvMenu.appendChild(csvProductsBtn);

    csvGroup.appendChild(csvBtn);
    csvGroup.appendChild(csvMenuBtn);
    csvGroup.appendChild(csvMenu);

    const toggleBtn = document.createElement("button");
    toggleBtn.id = `${PANEL_ID}-toggle`;
    toggleBtn.type = "button";
    toggleBtn.textContent = "−";

    if (savedPanelState.collapsed) {
        panel.classList.add("collapsed");
        toggleBtn.textContent = "+";
    }

    actions.appendChild(refreshBtn);
    actions.appendChild(printBtn);
    actions.appendChild(csvGroup);
    actions.appendChild(toggleBtn);

    header.appendChild(title);
    header.appendChild(actions);

    const body = document.createElement("div");
    body.className = "cdd-stoich-body";

    const status = document.createElement("div");
    status.className = "cdd-stoich-status";
    status.textContent = "Waiting for reaction data...";

    // "Fill all" — one deliberate click runs every offer the cards show,
    // sequentially. The conscious counterpart to the (new-rows-only)
    // auto-fill: existing rows are never written without this click.
    const fillAllBtn = document.createElement("button");
    fillAllBtn.id = `${PANEL_ID}-fill-all`;
    fillAllBtn.type = "button";
    fillAllBtn.className = "cdd-fill-all-btn";
    fillAllBtn.hidden = true;
    fillAllBtn.addEventListener("click", async (event) => {
        event.stopPropagation();
        await runAllOffers(fillAllBtn);
    });

    const list = document.createElement("div");
    list.className = "cdd-stoich-list";

    body.appendChild(status);
    body.appendChild(fillAllBtn);
    body.appendChild(list);

    panel.appendChild(header);
    panel.appendChild(body);

    const style = document.createElement("style");
    style.textContent = `
  #${PANEL_ID} {
    position: fixed;
    top: 16px;
    right: 16px;
    /* Both driven by panel-resize.js, which sets the custom properties from
       the remembered size. Unset, they fall back to the original geometry. */
    width: var(--cdd-panel-width, 300px);
    height: var(--cdd-panel-height, auto);
    display: flex;
    flex-direction: column;
    max-height: calc(100vh - 32px);
    background: #111827;
    color: #f9fafb;
    border: 1px solid #374151;
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.35);
    z-index: 2147483647;
    font-family: Arial, sans-serif;
    overflow: hidden;
    /* Lets the header react to the PANEL's width rather than the window's,
       which is the only width that matters here — see the @container rule
       below. */
    container-type: inline-size;
  }

  #${PANEL_ID} .cdd-stoich-header {
    display: flex;
    /* Never give up height to the body when the panel is dragged small. */
    flex: 0 0 auto;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    background: #1f2937;
    border-bottom: 1px solid #374151;
    cursor: move;
    user-select: none;
    /* WRAPS rather than clips. The panel is overflow:hidden, so anything the
       header cannot fit is not merely cramped, it is gone — which is how a
       narrow panel used to end up with its collapse toggle outside itself and
       no way back. Wrapping makes every control reachable at any width. */
    flex-wrap: wrap;
    row-gap: 6px;
  }

  #${PANEL_ID} .cdd-stoich-title {
    font-size: 14px;
    font-weight: 700;
    /* Shrinks before the buttons do, and truncates rather than pushing them
       onto another line. */
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* The title is the first thing to go: it is the only part of the header
     that is decoration rather than a control.
     330, not 300. Measured in the browser: with the title shown the header
     still fits on one row at 340px and wraps at 320. A threshold of 300 left
     a band where a 320px panel had a 66px header while a 300px one had 44 —
     a wider panel with a taller header, which is silly, and 300 is the
     default width so everyone would have sat on that edge. */
  @container (max-width: 330px) {
    #${PANEL_ID} .cdd-stoich-title {
      display: none;
    }
  }

  #${PANEL_ID} .cdd-stoich-actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    /* Keeps the actions against the right edge once the title is gone. */
    margin-left: auto;
  }

  #${PANEL_ID} button {
    background: #374151;
    color: #f9fafb;
    border: 1px solid #4b5563;
    border-radius: 6px;
    padding: 4px 8px;
    font-size: 12px;
    cursor: pointer;
  }

  #${PANEL_ID} button:hover {
    background: #4b5563;
  }

  #${PANEL_ID} .cdd-csv-split {
    display: flex;
  }

  #${PANEL_ID} .cdd-csv-split > button:first-child {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }

  #${PANEL_ID} .cdd-csv-split > button:nth-child(2) {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
    border-left: 1px solid #6b7280;
    padding: 4px 5px;
    font-size: 10px;
    line-height: 1.4;
  }

  #${PANEL_ID} .cdd-csv-menu {
    position: fixed;
    z-index: 2147483647;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 130px;
    padding: 4px;
    background: #1f2937;
    border: 1px solid #4b5563;
    border-radius: 8px;
    box-shadow: 0 8px 20px rgba(0,0,0,0.45);
  }

  #${PANEL_ID} .cdd-csv-menu[hidden] {
    display: none;
  }

  #${PANEL_ID} .cdd-csv-menu button {
    background: transparent;
    border: none;
    border-radius: 6px;
    padding: 6px 8px;
    text-align: left;
    white-space: nowrap;
  }

  #${PANEL_ID} .cdd-csv-menu button:hover {
    background: #374151;
  }

  /* The body is the part that gives: it takes whatever height the panel has
     left over and scrolls inside it. min-height:0 is what allows a flex child
     to shrink below its content and actually scroll. */
  #${PANEL_ID} .cdd-stoich-body {
    padding: 10px;
    overflow: auto;
    flex: 1 1 auto;
    min-height: 0;
  }

  #${PANEL_ID} .cdd-stoich-status {
    font-size: 12px;
    color: #cbd5e1;
    margin-bottom: 10px;
  }

  #${PANEL_ID} .cdd-stoich-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  #${PANEL_ID} .cdd-stoich-group {
    border: 1px solid #374151;
    border-radius: 12px;
    overflow: hidden;
    background: #0b1220;
  }

  #${PANEL_ID} .cdd-stoich-group-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 10px;
    font-size: 12px;
    font-weight: 700;
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }

  #${PANEL_ID} .cdd-stoich-group-count {
    font-size: 11px;
    opacity: 0.85;
  }

${HPLC_BLOCK_STYLES.replace(/^ {2}\./gm, `  #${PANEL_ID} .`)}

  #${PANEL_ID} .cdd-stoich-group-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
  }

  #${PANEL_ID} .cdd-stoich-card {
    border: 1px solid #374151;
    border-left-width: 4px;
    border-radius: 10px;
    padding: 10px;
    background: #0f172a;
    /* isolate, not just relative: the watermark below sits at z-index -1 so
       it paints UNDER the card's text, and without a stacking context here
       it would slide under the card's own background and vanish. */
    position: relative;
    isolation: isolate;
    overflow: hidden;
  }

  /* The reaction, as a watermark instead of a badge. It says the same thing
     the old "Reaction 1" pill did and costs no height, because it is not in
     the layout at all.
     --cdd-reaction-watermark is the knob: raise it to make the letters more
     present, lower it if a long value wrapping across the card becomes hard
     to read over them. Long values DO reach this far, so this is a real
     trade and not only a matter of taste. */
  #${PANEL_ID} .cdd-stoich-card[data-cdd-reaction]::after {
    content: attr(data-cdd-reaction);
    position: absolute;
    right: 6px;
    bottom: 2px;
    z-index: -1;
    font-size: 34px;
    font-weight: 800;
    line-height: 1;
    letter-spacing: -0.03em;
    color: var(--cdd-reaction-color, #64748b);
    opacity: var(--cdd-reaction-watermark, 0.13);
    pointer-events: none;
    user-select: none;
  }

  #${PANEL_ID} .cdd-stoich-card-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 6px;
  }

  #${PANEL_ID} .cdd-stoich-row {
    margin-bottom: 4px;
    font-size: 12px;
    line-height: 1.4;
    word-break: break-word;
  }

  #${PANEL_ID} .cdd-stoich-row:last-child {
    margin-bottom: 0;
  }

  #${PANEL_ID} .cdd-stoich-label {
    color: #93c5fd;
    font-weight: 700;
  }

  #${PANEL_ID} .cdd-stoich-row-copyable {
    font-size: 12px;
    margin-bottom: 6px;
    line-height: 1.4;
    word-break: break-word;
  }

  #${PANEL_ID} .cdd-stoich-copy-value {
    cursor: pointer;
    margin-left: 6px;
    color: #f9fafb;
    padding: 1px 4px;
    border-radius: 4px;
  }

  #${PANEL_ID} .cdd-stoich-copy-value:hover {
    background: rgba(255,255,255,0.08);
  }

  #${PANEL_ID} .cdd-copy-flash {
    background: rgba(52, 211, 153, 0.35);
  }

  #${PANEL_ID}.collapsed .cdd-stoich-body {
    display: none;
  }

  /* Collapsed means "just the header". A remembered height would otherwise
     keep the panel its full size with nothing in it. */
  #${PANEL_ID}.collapsed {
    height: auto;
  }

  /* #ef4444 on this tint measured 4.12:1 — the LEAST legible text in the
     panel, on the one badge that must never be missed, and below the 4.5
     WCAG AA needs for 10px bold. #f87171 on the same tint is 5.62:1. The
     border and background keep the old red so the badge still reads as red
     at a glance; only the glyphs move. */
  #${PANEL_ID} .cdd-low-purity-badge {
    background: rgba(239, 68, 68, 0.15);
    color: #f87171;
    font-weight: 700;
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 999px;
    border: 1px solid rgba(239, 68, 68, 0.35);
  }

  #${PANEL_ID} .cdd-no-sample-badge {
    background: rgba(245, 158, 11, 0.15);
    color: #f59e0b;
    font-weight: 700;
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 999px;
    border: 1px solid rgba(245, 158, 11, 0.35);
  }

  #${PANEL_ID} .cdd-no-sample-quote {
    margin-top: 4px;
    font-size: 12px;
    font-style: italic;
    line-height: 1.35;
    color: #f59e0b;
    opacity: 0.95;
  }

  /* A NEUTRAL note. The amber quote above is a warning, and "Internal ID is
     already set" is a perfectly normal state — dressed in amber it would read
     as a problem. Same muted grey as .cdd-stoich-status, at the 11px of the
     card rows rather than the quote's 12px. */
  #${PANEL_ID} .cdd-batch-field-note {
    margin-top: 4px;
    font-size: 11px;
    line-height: 1.35;
    color: #cbd5e1;
    opacity: 0.85;
  }

  #${PANEL_ID} .cdd-density-fill-btn {
    margin-top: 6px;
    width: 100%;
    padding: 4px 8px;
    font-size: 11px;
    font-weight: 600;
    border-radius: 6px;
    border: 1px solid rgba(56, 189, 248, 0.4);
    background: rgba(56, 189, 248, 0.12);
    color: #38bdf8;
    cursor: pointer;
  }

  #${PANEL_ID} .cdd-density-fill-btn:hover:not(:disabled) {
    background: rgba(56, 189, 248, 0.25);
  }

  #${PANEL_ID} .cdd-density-fill-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  #${PANEL_ID} .cdd-product-badge {
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.4px;
    background: rgba(74, 222, 128, 0.15);
    color: #4ade80;
    border: 1px solid rgba(74, 222, 128, 0.4);
  }

  #${PANEL_ID} .cdd-products-divider {
    margin: 8px 2px 2px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    color: #4ade80;
    opacity: 0.9;
  }

  /* The footnote about a remembered value, as a mark on the offer it is
     about rather than a sentence under the card. Costs no height at all. */
  #${PANEL_ID} .cdd-fill-memory-mark {
    margin-left: 6px;
    font-size: 12px;
    opacity: 0.75;
    cursor: help;
  }

  #${PANEL_ID} .cdd-fill-all-btn {
    margin: 0 10px 8px;
    padding: 5px 8px;
    font-size: 11px;
    font-weight: 600;
    border-radius: 6px;
    border: 1px solid rgba(56, 189, 248, 0.55);
    background: rgba(56, 189, 248, 0.18);
    color: #7dd3fc;
    cursor: pointer;
  }

  #${PANEL_ID} .cdd-fill-all-btn:hover:not(:disabled) {
    background: rgba(56, 189, 248, 0.3);
  }

  #${PANEL_ID} .cdd-fill-all-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }
`;

    document.documentElement.appendChild(style);
    document.documentElement.appendChild(panel);

    makePanelDraggable(panel);
    makePanelResizable(panel);

    // AFTER the panel is in the document: this measures the panel to decide
    // how far right it may sit, and a detached node measures as zero. Pulls a
    // remembered position back into the window, which is what stopped a panel
    // placed on a wide monitor from reopening off-screen on a laptop.
    clampPanelIntoView(panel);

    refreshBtn.addEventListener("click", () => {
        renderFromState();
    });

    printBtn.addEventListener("click", () => {
        printPanel(visibleFields);
    });

    csvBtn.addEventListener("click", () => {
        exportPanelCsv(visibleFields);
    });

    // Document-level listeners live only while the menu is open, so a panel
    // that is torn down and rebuilt cannot accumulate them.
    const closeCsvMenuOnOutside = (event) => {
        if (csvGroup.contains(event.target)) return;
        closeCsvMenu();
    };

    const closeCsvMenuOnEscape = (event) => {
        if (event.key === "Escape") closeCsvMenu();
    };

    function closeCsvMenu() {
        if (csvMenu.hidden) return;
        csvMenu.hidden = true;
        csvMenuBtn.setAttribute("aria-expanded", "false");
        document.removeEventListener("mousedown", closeCsvMenuOnOutside, true);
        document.removeEventListener("keydown", closeCsvMenuOnEscape, true);
        window.removeEventListener("scroll", closeCsvMenu, true);
        window.removeEventListener("resize", closeCsvMenu);
    }

    function openCsvMenu() {
        csvMenu.hidden = false;
        csvMenuBtn.setAttribute("aria-expanded", "true");

        // Right-aligned to the caret so the menu grows inward, away from the
        // screen edge the panel usually sits against. Measured after the
        // unhide, or offsetWidth would be zero.
        const rect = csvMenuBtn.getBoundingClientRect();
        csvMenu.style.top = `${rect.bottom + 4}px`;
        csvMenu.style.left = `${Math.max(4, rect.right - csvMenu.offsetWidth)}px`;

        document.addEventListener("mousedown", closeCsvMenuOnOutside, true);
        document.addEventListener("keydown", closeCsvMenuOnEscape, true);
        window.addEventListener("scroll", closeCsvMenu, true);
        window.addEventListener("resize", closeCsvMenu);
    }

    csvMenuBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        if (csvMenu.hidden) openCsvMenu();
        else closeCsvMenu();
    });

    csvProductsBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        closeCsvMenu();
        exportPanelCsv(visibleFields, { productsOnly: true });
    });

    toggleBtn.addEventListener("click", () => {
        const collapsed = panel.classList.toggle("collapsed");
        toggleBtn.textContent = collapsed ? "+" : "−";

        savePanelState({
            collapsed,
        });
    });

    updatePanelVisibilityForOverlays();
    return panel;
}

export function removePanel() {
    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.remove();
}

// The panel's own root, or null before it exists. The mention scan uses it
// to exclude itself from the search for entity links.
export function getPanelRoot() {
    return document.getElementById(PANEL_ID);
}

export function getPanelParts() {
    const panel = ensurePanel();
    if (!panel) {
        return {
            panel: null,
            status: null,
            list: null,
        };
    }

    return {
        panel,
        status: panel.querySelector(".cdd-stoich-status"),
        list: panel.querySelector(".cdd-stoich-list"),
    };
}

function createCopyableRow(label, value, options = {}) {
    if (value == null || value === "") return null;

    const row = document.createElement("div");
    row.className = "cdd-stoich-row-copyable";

    const labelEl = document.createElement("span");
    labelEl.className = "cdd-stoich-label";
    labelEl.textContent = `${label}:`;

    const valueEl = document.createElement("span");
    valueEl.className = "cdd-stoich-copy-value";

    const valueText = String(value);
    const copyText =
        options.copyValue != null && options.copyValue !== ""
            ? String(options.copyValue)
            : valueText;

    valueEl.textContent = valueText;

    row.appendChild(labelEl);
    row.appendChild(document.createTextNode(" "));
    row.appendChild(valueEl);

    if (options.highlight) {
        valueEl.style.color = "#ef4444";
        valueEl.style.fontWeight = "700";
    }

    valueEl.addEventListener("click", async () => {
        await copyTextWithFeedback(valueEl, copyText);
    });

    return row;
}

export function setStatus(text) {
    const { status } = getPanelParts();
    if (!status) return;
    status.textContent = text;
}

export function getReactionColor(index) {
    return REACTION_COLORS[index % REACTION_COLORS.length];
}

export function groupSamplesByReaction(samples) {
    const groups = new Map();

    for (const sample of samples) {
        const key = sample.reactionIndex ?? 0;
        if (!groups.has(key)) {
            groups.set(key, {
                reactionIndex: key,
                reactionLabel: sample.reactionLabel || `Reaction ${key + 1}`,
                items: [],
            });
        }
        groups.get(key).items.push(sample);
    }

    return [...groups.values()].sort((a, b) => a.reactionIndex - b.reactionIndex);
}

/* ------------------------------------------------------------------ *
 * Configurable field rendering
 * ------------------------------------------------------------------ */

// Build a single panel row from a registry field, or null when the sample has
// no value for it. All value/format logic lives in the shared registry.
function renderFieldRow(field, sample) {
    const resolved = resolveFieldValue(field, sample);
    if (!resolved) return null;

    const row = createCopyableRow(field.label, resolved.text, {
        copyValue: resolved.copyValue,
        highlight: resolved.highlight,
    });

    // The "Name" field IS the Sample ID. We only DISCOVER its prefix (so it
    // appears in the popup); we do NOT tint the identifier text — colouring
    // happens on the grid wells, not here.
    if (row && field.key === "name") {
        recordSampleIdPrefix(resolved.text);
    }

    return row;
}

// Build the rows for one sample: enabled static registry fields first, then
// any enabled dynamic custom fields that this sample actually carries.
function renderConfiguredFields(sample) {
    const rows = [];

    for (const field of SAMPLE_PANEL_FIELDS) {
        if (!visibleFields[field.key]) continue;
        const row = renderFieldRow(field, sample);
        if (row) rows.push(row);
    }

    for (const field of getCustomFieldsFromSample(sample)) {
        if (!visibleFields[field.key]) continue;
        const row = createCopyableRow(field.label, field.value);
        if (row) rows.push(row);
    }

    return rows;
}

// Custom-field options we have already refreshed this session, so repeated
// renders don't churn chrome.storage.
const persistedCustomFieldKeys = new Set();
let prunedCustomFieldsThisSession = false;

// Maintain the discovered-custom-field list: refresh `lastSeen` for fields seen
// now, and drop fields unseen for longer than the TTL (keeping enabled ones).
// Runs at most once per session unless a new field appears. Writes a different
// storage key than the settings, so it never re-triggers the settings listener.
function persistDiscoveredCustomFields(samples) {
    const found = discoverCustomFields(samples);
    const hasUnseen = found.some((field) => !persistedCustomFieldKeys.has(field.key));
    if (!hasUnseen && prunedCustomFieldsThisSession) return;

    getDiscoveredCustomFields().then((existing) => {
        const now = Date.now();

        const touched = touchSeenCustomFields(existing, found, now);
        const pruned = pruneExpiredCustomFields(touched.list, visibleFields, now);

        found.forEach((field) => persistedCustomFieldKeys.add(field.key));
        prunedCustomFieldsThisSession = true;

        if (touched.changed || pruned.changed) {
            saveDiscoveredCustomFields(pruned.list);
        }
    });
}

// Is a panel field enabled right now? Asked by the enrichment modules that
// only do work — network work — for a field the user actually shows. Reading
// the live map rather than storage keeps the gate and the render in agreement.
export function isPanelFieldVisible(key) {
    return !!visibleFields[key];
}

// Notified whenever `visibleFields` is (re)loaded, so a field that was just
// switched on can fetch what it needs for the entry ALREADY on screen instead
// of staying blank until the next one is opened.
const fieldsChangedListeners = new Set();

export function onPanelFieldsChanged(listener) {
    fieldsChangedListeners.add(listener);
}

function applyVisibleFields(map) {
    visibleFields = map;
    renderFromState();

    for (const listener of fieldsChangedListeners) {
        try {
            listener();
        } catch {
            /* one bad listener must not stop the others */
        }
    }
}

// Load the saved field visibility and keep it live across popup changes.
// Safe to call once at content-script startup.
export function initSamplePanelFields() {
    getSamplePanelSettings()
        .then(applyVisibleFields)
        .catch(() => {
            /* keep registry defaults */
        });

    if (chrome?.storage?.onChanged) {
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== "local" || !changes[SAMPLE_PANEL_SETTINGS_KEY]) return;

            getSamplePanelSettings().then(applyVisibleFields);
        });
    }
}

function isSampleDepleted(sample) {
    const depleted = STATE.depletedIdentifiers instanceof Set
        ? STATE.depletedIdentifiers
        : new Set();

    const candidates = [
        sample?.name,
        sample?.sampleId,
        sample?.internalID,
    ]
        .map(normalizeValue)
        .filter(Boolean);

    for (const candidate of candidates) {
        if (depleted.has(candidate)) {
            return true;
        }
    }

    return false;
}

// One fill button per offer (density / purity / concentration) — from the
// authoritative record (batch/sample) or from density-memory (a value the
// user typed for this batch before). One click, one write, visible
// outcome; the DOM automation lives in row-fill.js.
// "R1" for Reaction 1, set as a card attribute so CSS can draw it as a
// watermark. The mentions group is not a reaction and gets nothing.
function reactionMark(group) {
    if (!group || group.reactionLabel == null) return null;
    const number = /\d+/.exec(group.reactionLabel);
    return number ? `R${number[0]}` : null;
}

function buildFillButton(sample, offer) {
    const withUnits = offer.units ? `${offer.value} ${offer.units}` : offer.value;
    // A concentration fill makes the solution and picks its solvent in one
    // go — the label has to say so, or the row gains a solvent nobody
    // clicked for.
    const shown = offer.solvent ? `${withUnits} in ${offer.solvent}` : withUnits;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cdd-density-fill-btn";
    btn.textContent =
        offer.source === "memory"
            ? `⤵ Fill remembered ${offer.field} (${shown}) into table`
            : `⤵ Fill ${offer.field} (${shown}) into table`;
    btn.title =
        offer.source === "memory"
            ? `Writes the ${offer.field} you previously typed for this batch into the row, exactly as if you typed it.`
            : `Writes this ${offer.field} into the row, exactly as if you typed it.`;

    // "Some of these values aren't saved on the batch/sample record" used to
    // be a two-line sentence under the card, on every card that had a
    // remembered offer. It is a footnote about THIS offer, so it becomes a
    // mark on this offer: the sentence moves into the tooltip and the note
    // stops costing two lines of a panel that already scrolls a long way.
    if (offer.source === "memory") {
        const mark = document.createElement("span");
        mark.className = "cdd-fill-memory-mark";
        mark.textContent = "ⓘ";
        mark.title =
            `This ${offer.field} is remembered from what you typed before — it is not ` +
            `saved on the batch or sample record. Add it there and it will fill in ` +
            `automatically from then on.`;
        btn.appendChild(mark);
    }

    btn.addEventListener("click", async (event) => {
        // The table enters edit mode on a row click and leaves it on any
        // click outside — and this very button IS outside the table. Stop
        // the click from reaching CDD's document-level handlers, then let it
        // finish propagating before the fill sequence starts, or the edit
        // mode we just opened is closed again by our own trigger click.
        event.stopPropagation();

        btn.disabled = true;
        btn.textContent = "Filling…";

        await new Promise((resolve) => setTimeout(resolve, 60));

        const result = await runFillOffer(sample, offer);

        if (result.ok) {
            markOfferFilled(sample, offer, result);
            if (offerUsesMemory(offer)) touchValueUsed(sample.batchId);
            // A concentration fill reports a solvent it could not pick
            // rather than failing over it — say so instead of a bare ✓.
            btn.textContent = result.note
                ? `✓ ${offer.field} filled — solvent: ${result.note}`
                : `✓ ${offer.field} filled`;
        } else {
            btn.textContent = `✗ ${result.reason || "couldn't fill"} — edit the row manually`;
            btn.disabled = false;
        }
    });

    return btn;
}

// Sequential run of every offer on every card — the "Fill all" button.
// One deliberate click, many writes, each through CDD's own editor with
// per-step verification; a failed offer skips the rest of its row.
async function runAllOffers(btn) {
    if (btn.dataset.running === "1") return;
    btn.dataset.running = "1";
    btn.disabled = true;

    // Chrome throttles timers in a background tab to about one per minute:
    // the run still completes correctly (waits are attempt-based) but takes
    // minutes instead of seconds. Say so rather than looking frozen.
    if (document.hidden) {
        setStatus("Fill all: keep this tab in the foreground — a background tab makes Chrome throttle the run to a crawl.");
    }

    let filled = 0;
    let failed = 0;

    const samples = STATE.lastPayload?.samples || [];
    for (const sample of samples) {
        for (const offer of computeFillOffers(sample)) {
            btn.textContent = `Filling ${offer.field} — ${sample.name}…`;
            const result = await runFillOffer(sample, offer);
            if (result.ok) {
                filled += 1;
                markOfferFilled(sample, offer, result);
                if (offerUsesMemory(offer)) touchValueUsed(sample.batchId);
                if (result.note) {
                    setStatus(`Fill all: ${sample.name} — solvent: ${result.note}`);
                }
            } else {
                failed += 1;
                setStatus(`Fill all: ${offer.field} for ${sample.name}: ${result.reason || "failed"}`);
                break;   // skip the rest of this row, continue with the next
            }
            await new Promise((resolve) => setTimeout(resolve, 400));
        }
    }

    delete btn.dataset.running;
    btn.disabled = false;
    // Render first — renderFromState() writes its own "Loaded …" status,
    // which would otherwise swallow the summary.
    renderFromState();
    setStatus(`Fill all: ${filled} value(s) filled${failed ? `, ${failed} failed` : ""}.`);
}

// Keep the "Fill all (N)" label in sync with what the cards offer; hidden
// when there is nothing to fill. No-ops mid-run so progress text survives
// re-renders.
/* ------------------------------------------------------------------ *
 * Writing this entry's ID onto a product's existing batch
 * ------------------------------------------------------------------ */

// What, if anything, a product card should say about its batch's ELN ID
// field. Returns one of:
//   { kind: "offer", … }  -> the button
//   { kind: "set", … }    -> "already set to X", no button
//   null                  -> say nothing at all
//
// "set" is a state rather than an early return on purpose: a card that simply
// lacks the button, with no reason given, reads as a bug.
function elnIdToBatchState(sample) {
    if (!isElnIdToBatchEnabled()) return null;
    if (!sample?.isProduct) return null;
    if (!sample.batchId || !sample.moleculeId) return null;

    // Enrichment has not answered yet. Saying nothing beats offering a button
    // whose only guard has not run.
    if (!sample.batchFieldsEnriched) return null;

    const { enabled, fieldLabel, format } = getCarrySettings();
    if (!enabled || !fieldLabel) return null;

    const existing = readFieldByLabel(sample.batchFieldMap, fieldLabel);
    if (existing) return { kind: "set", fieldLabel, value: existing };

    const entryId = readElnEntryId();
    if (!entryId) return null;

    const value = composeBatchElnId(entryId, format, sample.reactionIndex);
    if (!value) return null;

    return {
        kind: "offer",
        value,
        fieldLabel,
        vaultId: sample.batchVaultId,
        moleculeId: sample.moleculeId,
        batchId: sample.batchId,
    };
}

function buildElnIdToBatchButton(sample, state) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cdd-density-fill-btn";
    btn.textContent = `⤴ Write ${state.value} into ${state.fieldLabel} on this batch`;
    btn.title =
        `Saves ${state.value} to the batch record — not to the table. It runs ` +
        `only while ${state.fieldLabel} is empty, and closing the tab does not ` +
        `undo it.`;

    btn.addEventListener("click", async (event) => {
        // The table enters edit mode on a row click and leaves it on any click
        // outside — and this button IS outside the table.
        event.stopPropagation();

        btn.disabled = true;
        btn.textContent = "Writing…";

        const result = await writeElnIdToBatch({
            vaultId: state.vaultId,
            moleculeId: state.moleculeId,
            batchId: state.batchId,
            fieldLabel: state.fieldLabel,
            value: state.value,
            onStage: (text) => { btn.textContent = text; },
        });

        if (result.ok) {
            btn.textContent = `✓ ${state.fieldLabel} set to ${state.value}`;

            // The panel's copy of this batch is now a lie, and so is the
            // cached molecule page behind it. Without both of these the card
            // keeps offering a button whose work is done, and a second click
            // dies on "already set" — which reads as the failure it is not.
            sample.batchFieldMap = {
                ...(sample.batchFieldMap || {}),
                [state.fieldLabel]: state.value,
            };
            forgetMoleculePage(sample.moleculeId);
        } else {
            btn.textContent = `✗ ${result.reason || "could not write it"}`;
            btn.disabled = false;
        }
    });

    return btn;
}

function updateFillAllButton() {
    const btn = document.getElementById(`${PANEL_ID}-fill-all`);
    if (!btn || btn.dataset.running === "1") return;

    const samples = STATE.lastPayload?.samples || [];
    const count = samples.reduce((n, s) => n + computeFillOffers(s).length, 0);
    btn.hidden = count === 0;
    btn.textContent = `⤵ Fill all missing values (${count})`;
}

// Amber nudge under memory-sourced fill buttons: the right long-term home
// for these values is the batch/sample record, not this extension's
// storage.

// A batch-only card gets a random bit of inventory education. The pool mixes
// factual reminders with gentle mockery on purpose — the point is that the
// message stays fresh enough to be read, not muted as wallpaper.
// Every badge in a card's top strip is the same three lines of DOM. Four of
// them lived here spelled out, which is what the clone check was pointing at
// once the reaction badge — the part the two card builders used to share —
// was removed.
function cardTopBadge(className, text, title) {
    const badge = document.createElement("div");
    badge.className = className;
    badge.textContent = text;
    if (title) badge.title = title;
    return badge;
}

function pickNoSampleQuote(sample) {
    const purity = sample?.purity != null && sample.purity !== ""
        ? String(sample.purity)
        : null;

    const quotes = [
        "This purity is from registration day, not from the bottle on your shelf.",
        purity
            ? `Batch says ${purity} %. The bottle? Nobody knows — no sample.`
            : "Batch data looks fine. The bottle? Nobody knows — no sample.",
        "Samples keep inventory honest. Batch data is just a rumor about a bottle.",
        "No sample, no trace: nobody knows where this bottle is or how much is left.",
        "Someone skipped inventory day.",
        "This reagent is homeless — give it a sample.",
        "Working sampleless. Brave. Untraceable, but brave.",
        "No sample, no location, no amount — create a sample to track this bottle.",
        "Schrödinger's reagent: both full and empty until someone makes a sample.",
        "Location: unknown. Amount: unknown. Confidence: high, apparently.",
        "Somewhere in the lab, this bottle exists. Probably.",
        "No sample means the amount is vibes-based.",
        "Inventory ghosts are real. This is one of them.",
        "Batch fields don't age. Bottles do. Make a sample.",
        "Your future self is looking for this bottle right now. Help them out — make a sample.",
        "A sample a day keeps the audit away.",
        "This bottle has no paper trail. Very noir. Very untraceable.",
        "Trust the batch, but verify with a sample.",
        "This batch exists on paper. The bottle exists in theory.",
        "Yield: recorded. Purity: recorded. Location: thoughts and prayers.",
        "The batch record is immortal. The bottle evaporated in 2023.",
        "Untracked reagents are how lab legends begin.",
        "This compound has commitment issues — it never registered a sample.",
        "Dark matter: 27 % of the universe. This bottle: 100 % of your shelf, allegedly.",
        "Every unsampled bottle is a future 'has anyone seen…?' email.",
        "Auditors love this one weird trick: bottles with no samples.",
        "An unsampled bottle never expires. Officially.",
        "Inventory status: it's complicated.",
        "If a bottle sits on a shelf and no sample records it, does it exist?",
        "GPS for cars, samples for bottles. Yours has neither.",
        "Whoever finishes this bottle won't tell anyone. They can't — there's no sample.",
        "Somebody weighed from this bottle yesterday. History will never know who.",
        "Make a sample now, or play hide-and-seek with a bottle later.",
        "Free-range reagent: roams the lab, answers to no one.",
        "This bottle is off the grid. Very independent. Very lost.",
        "The PI knows this bottle exists. The database disagrees.",
        "Last seen: registration day. Current whereabouts: ask around.",
        "This bottle survived three lab moves. The record of it didn't.",
        "Fume hood? Fridge? Fourth floor? A sample would know.",
        "Expiry date unknown. Smell test not a valid substitute.",
        "A bottle without a sample is just a rumor with a cap.",
        "All bottles are equal, but sampled bottles are more equal.",
        "History is written by those who create samples.",
        "The lab remembers what the database forgets. Unfortunately, the lab retires.",
        "Your labmate 'borrowed' this bottle. No sample, no evidence.",
        "This reagent ghosted the inventory system.",
        "Bold strategy: trusting a bottle nobody has tracked since registration.",
        "Someone will order a new one next month. The old one is right there. Somewhere.",
        "This bottle plays hide and seek professionally. Undefeated.",
        "Vibes are not an inventory system.",
        "Sample it before you regret it.",
        "Untracked. Unbothered. Unfindable.",
        "The shelf knows. The shelf won't tell.",
        "Cold case: one bottle, zero records, no witnesses.",
        "The bottle was last seen entering the lab in 2024. Then the trail goes cold.",
        "No sample, no alibi.",
        "Missing: one reagent. Reward: not having to order a new one.",
        "Interrogate the shelf all you want — without a sample, nobody talks.",
        "This bottle and the inventory system broke up. It's not tracking anyone right now.",
        "Relationship status with inventory: never met.",
        "The batch record loves this bottle. The bottle never calls back.",
        "Commitment level: registered once, never sampled. Classic.",
        "Here we see the wild reagent in its natural habitat: undocumented.",
        "The untagged bottle migrates freely between benches. Scientists are unable to track it.",
        "An invasive species: spreads across shelves, appears in no records.",
        "This bottle has been living off-record since registration. A true survivalist.",
        "This bottle works remotely. Location undisclosed.",
        "Per my last email: where is this bottle?",
        "The bottle has no manager, no badge, and no address. HR has questions.",
        "Quiet quitting, reagent edition: present in the database, absent from the shelf.",
        "Zero samples, infinite mystery.",
        "A legend lives on this shelf. Allegedly.",
        "Tracked by no one. Missed by everyone.",
        "The database believes. The shelf doubts.",
    ];

    // Stable per card per day: the panel re-renders often (storage sync,
    // enrichment, autosave payloads) and a random pick would visibly
    // shuffle the text under the user's eyes. A day in the seed keeps the
    // rotation alive without the jitter.
    const seedText = `${sample?.batchId ?? sample?.name ?? ""}:${new Date().toDateString()}`;
    let seed = 0;
    for (let i = 0; i < seedText.length; i += 1) {
        seed = (seed * 31 + seedText.charCodeAt(i)) | 0;
    }
    return quotes[Math.abs(seed) % quotes.length];
}

export function renderSamples(payload) {
    const { list } = getPanelParts();
    if (!list) return;

    list.replaceChildren();
    resetHplcInjectionBlocks();

    const samples = payload?.samples || [];
    if (!samples.length) {
        const emptyCard = document.createElement("div");
        emptyCard.className = "cdd-stoich-card";
        emptyCard.textContent = "No samples found in reaction block.";
        list.appendChild(emptyCard);
        updateFillAllButton();
        return;
    }

    persistDiscoveredCustomFields(samples);
    // Passive capture: remember user-typed densities for batches that lack
    // one, drop entries whose batch now carries its own. No-ops when
    // nothing changed, so the enrichment re-render can't loop storage.
    captureValuesFromSamples(samples);

    const groups = groupSamplesByReaction(samples);

    for (const group of groups) {
        const color = getReactionColor(group.reactionIndex);

        const groupEl = document.createElement("div");
        groupEl.className = "cdd-stoich-group";
        groupEl.style.borderColor = color.border;
        groupEl.style.boxShadow = `0 0 0 1px ${color.glow} inset`;

        const groupHeader = document.createElement("div");
        groupHeader.className = "cdd-stoich-group-header";
        groupHeader.style.background = color.badgeBg;
        groupHeader.style.color = color.badgeText;

        const groupTitle = document.createElement("span");
        groupTitle.textContent = group.reactionLabel;

        // Products are opt-in and render in their own section below the
        // reagent cards.
        const regulars = group.items.filter((s) => !s.isProduct);
        const products = isShowProductsEnabled()
            ? group.items.filter((s) => s.isProduct)
            : [];

        const groupCount = document.createElement("span");
        groupCount.className = "cdd-stoich-group-count";
        // "3 sample(s)" is wrong for the mention group — nothing there came
        // out of a stoichiometry table.
        groupCount.textContent = group.items.every((s) => s.isMention)
            ? `${group.items.length} mention(s)`
            : `${regulars.length} sample(s)` +
            (products.length ? ` · ${products.length} product(s)` : "");

        groupHeader.appendChild(groupTitle);
        groupHeader.appendChild(groupCount);

        const groupBody = document.createElement("div");
        groupBody.className = "cdd-stoich-group-body";

        // Per-reaction, so it belongs to the group rather than to any card:
        // how much of the diluted aliquot to inject. Returns null (and
        // nothing renders) when the reaction has no solvent molarity.
        const hplcBlock = createHplcInjectionBlock(
            (payload?.reactions || []).find((r) => r.index === group.reactionIndex),
            color
        );
        if (hplcBlock) groupBody.appendChild(hplcBlock);

        for (const sample of regulars) {
            const card = document.createElement("div");
            card.className = "cdd-stoich-card";
            card.style.borderLeftColor = color.border;
            card.style.boxShadow = `0 0 0 1px ${color.glow} inset`;

            const mark = reactionMark(group);
            if (mark) {
                card.dataset.cddReaction = mark;
                card.style.setProperty("--cdd-reaction-color", color.border);
            }

            const purityValue = parsePurity(sample.purity);
            const lowPurity = !isNaN(purityValue) && purityValue <= getPurityWarnThreshold();
            const depletedSample = isSampleDepleted(sample);

            if (lowPurity || depletedSample) {
                card.style.borderLeftColor = "#ef4444";
                card.style.background = "rgba(239,68,68,0.05)";
            }

            // No "Reaction 1" badge. The group is already headed with the
            // reaction's name and every card in it carries that reaction's
            // colour on its edge, so the badge was a third statement of the
            // same fact on every card in the panel.
            const cardTop = document.createElement("div");
            cardTop.className = "cdd-stoich-card-top";

            if (lowPurity) {
                cardTop.appendChild(cardTopBadge("cdd-low-purity-badge", "⚠ LOW PURITY"));
            }

            if (depletedSample) {
                cardTop.appendChild(
                    cardTopBadge("cdd-low-purity-badge", "⚠ DEPLETED SAMPLE USED")
                );
            }

            if (sample.hasSample === false) {
                cardTop.appendChild(cardTopBadge(
                    "cdd-no-sample-badge",
                    "⚠ NO SAMPLE",
                    "This row uses a registered batch without an inventory sample. " +
                    "Creating a sample is the right way — it tracks location, amount and depletion."
                ));
            }

            // Without the reaction badge the card top holds only warnings, so
            // most cards have none — an empty one would still cost its bottom
            // margin on every card in the panel.
            if (cardTop.childElementCount) card.appendChild(cardTop);

            for (const rowEl of renderConfiguredFields(sample)) {
                card.appendChild(rowEl);
            }

            if (sample.hasSample === false) {
                const quote = document.createElement("div");
                quote.className = "cdd-no-sample-quote";
                quote.textContent = pickNoSampleQuote(sample);
                card.appendChild(quote);
            }

            // Offer a fill wherever a table value is missing and a source
            // exists — authoritative record first, remembered value second.
            // Cards with neither get no buttons.
            const offers = computeFillOffers(sample);
            for (const offer of offers) {
                card.appendChild(buildFillButton(sample, offer));
            }

            groupBody.appendChild(card);
        }

        if (products.length) {
            const divider = document.createElement("div");
            divider.className = "cdd-products-divider";
            divider.textContent = "Products";
            groupBody.appendChild(divider);

            for (const sample of products) {
                const card = document.createElement("div");
                card.className = "cdd-stoich-card";
                card.style.borderLeftColor = color.border;
                card.style.boxShadow = `0 0 0 1px ${color.glow} inset`;

                const mark = reactionMark(group);
                if (mark) {
                    card.dataset.cddReaction = mark;
                    card.style.setProperty("--cdd-reaction-color", color.border);
                }

                const cardTop = document.createElement("div");
                cardTop.className = "cdd-stoich-card-top";

                cardTop.appendChild(cardTopBadge("cdd-product-badge", "PRODUCT"));

                card.appendChild(cardTop);

                for (const rowEl of renderConfiguredFields(sample)) {
                    card.appendChild(rowEl);
                }

                const idState = elnIdToBatchState(sample);

                if (idState?.kind === "offer") {
                    card.appendChild(buildElnIdToBatchButton(sample, idState));
                } else if (idState?.kind === "set") {
                    const note = document.createElement("div");
                    note.className = "cdd-batch-field-note";
                    note.textContent =
                        `${idState.fieldLabel} on this batch: ${idState.value}`;
                    card.appendChild(note);
                }

                groupBody.appendChild(card);
            }
        }

        groupEl.appendChild(groupHeader);
        groupEl.appendChild(groupBody);
        list.appendChild(groupEl);
    }

    updateFillAllButton();
}

export function renderFromState() {
    // Losing the last reason to exist takes the panel away — a leftover
    // panel over an entry with neither a table nor a link, or over the
    // Search page the user just navigated to, would just be a stale box.
    // This runs BEFORE the Ketcher check on purpose: leaving an entry with
    // the structure editor open must still take the panel down, and the
    // editor belongs to the page we are leaving anyway.
    if (!shouldShowPanel()) {
        removePanel();
        return;
    }

    if (STATE.isKetcherOpen) return;

    ensurePanel();

    // Writing a bottle into the text AND putting it in the table is the
    // normal way to record an experiment; showing it twice is not. The CSV
    // and print flows read this same function, so all three agree.
    const { tableSamples, mentions, hidden, samples } = getPanelContents();

    if (!STATE.lastPayload && !samples.length) {
        setStatus("No reaction data captured yet. Wait for page API response.");
        return;
    }

    const reactionCount = STATE.lastPayload?.reactionCount || 0;
    const parts = [];
    if (isTableRowsEnabled()) {
        parts.push(`${tableSamples.length} sample(s) from ${reactionCount} reaction(s)`);
    }
    if (mentions.length) parts.push(`${mentions.length} mentioned in text`);
    // Said out loud: a card that is simply gone is indistinguishable from a
    // scan that failed.
    if (hidden) parts.push(`${hidden} mention(s) already in the table`);

    setStatus(parts.length ? `Loaded ${parts.join(" · ")}.` : "Nothing to show — check the panel sources in the settings.");
    renderSamples({ ...STATE.lastPayload, samples });
}


