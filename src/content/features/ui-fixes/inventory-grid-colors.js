// content/features/ui-fixes/inventory-grid-colors.js
//
// Tints the BACKGROUND of each occupied well in the inventory box grid
// (the "Pick Location" / Location Tree box view) by the prefix colour of the
// compound sitting in that well. Empty wells and wells whose prefix has no
// colour keep their native appearance.
//
// Where the data comes from (NO DOM text scraping):
//   The box-contents API response is intercepted on the page side
//   (inject/main.js -> maybePostInventoryMolecules) and forwarded as
//   EVENTS.INVENTORY_BOX = { positions: [{ position, moleculeId, name }] }.
//   message-router.js hands that array to updateBoxData() below. We derive the
//   prefix from `name` (the Sample ID) via the shared service and look up its
//   colour.
//
// Where the colour lands:
//   The grid renders one <div class="box-position-element box-position-filled">
//   per well, each with a <label> carrying its 1-based position number (row
//   major). We match each API record's position to that label and set the
//   cell's inline background-color.
//
// Grid DOM knowledge (selectors, position normalisation, selected-box id) lives
// in ../box-selection/box-grid.js and is imported here so the colour feature and
// the Box Selection Framework can never drift apart. If CDD changes the grid
// markup, fix box-grid.js once.

import {
    getColorForSampleId,
    recordSampleIdPrefix,
    onPrefixColorsChanged,
} from "../../../shared/prefix-colors.js";
import {
    GRID_SELECTOR,
    CELL_SELECTOR,
    FILLED_CLASS,
    getSelectedBoxId,
    readColumnCount,
    normalizePositionKey,
} from "../box-selection/box-grid.js";

// Background for an occupied well whose prefix has no colour assigned yet (or
// whose substance we have no record for). Configured prefixes override this.
const DEFAULT_FILLED_COLOR = "rgb(10, 98, 230)";

// Box contents cached PER BOX: boxId -> [{ position, moleculeId, name }].
//
// Why per box (not one global list): position "1" is a different compound in
// every box, and CDD caches a box's contents client-side — re-selecting a box
// it already loaded fires NO new API call, so no fresh INVENTORY_BOX arrives.
// If we kept only the last box's positions we'd repaint the returned box with
// the wrong box's data (everything falls to the default colour). Keyed by the
// selected tree node's id, recolour always uses the right box — even when the
// data came from a previous visit.
const boxByNodeId = new Map();
// Fallback positions (most recent event) for when we can't read the selection.
let lastReceived = [];
let observerStarted = false;

// Positions to paint the currently-shown grid with: the selected box's cached
// records, falling back to the most recent event if the selection is unreadable.
function currentPositions() {
    const boxId = getSelectedBoxId();
    if (boxId && boxByNodeId.has(boxId)) return boxByNodeId.get(boxId);
    return lastReceived;
}

/* ------------------------------------------------------------------ *
 * Painting
 * ------------------------------------------------------------------ */

function recolor() {
    const grid = document.querySelector(GRID_SELECTOR);
    if (!grid) return;

    const cols = readColumnCount(grid);

    // position-key -> colour (or null when the prefix has no colour yet), for
    // the box currently displayed in the grid.
    const colorByPosition = new Map();
    for (const entry of currentPositions()) {
        const key = normalizePositionKey(entry.position, cols);
        if (key == null) continue;
        colorByPosition.set(key, getColorForSampleId(entry.name));
    }

    for (const cell of grid.querySelectorAll(CELL_SELECTOR)) {
        // Empty wells stay native; also clears any stale tint if a well emptied.
        if (!cell.classList.contains(FILLED_CLASS)) {
            if (cell.style.backgroundColor) cell.style.backgroundColor = "";
            continue;
        }

        const key = cell.querySelector("label")?.textContent?.trim();
        const color = key ? colorByPosition.get(key) : null;

        // color may be undefined (no record) or null (record but the prefix has
        // no colour yet) -> fall back to the default "filled" colour so every
        // occupied well is visibly tinted. A configured prefix colour wins.
        cell.style.backgroundColor = color || DEFAULT_FILLED_COLOR;
    }
}

let scheduled = false;
function scheduleRecolor() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
        scheduled = false;
        recolor();
    });
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

// Called by message-router when a box's contents arrive. Caches the records
// under the box currently selected in the tree, registers each prefix for the
// popup, and repaints.
export function updateBoxData(positions) {
    const list = Array.isArray(positions) ? positions : [];
    lastReceived = list;

    // The freshly fetched contents belong to the box the user just selected.
    const boxId = getSelectedBoxId();
    if (boxId) boxByNodeId.set(boxId, list);

    // Auto-discover the prefixes so they show up in the popup to be coloured.
    for (const entry of list) {
        if (entry?.name) recordSampleIdPrefix(entry.name);
    }

    scheduleRecolor();
}

// Start watching the page so we repaint when the grid (re)renders and when the
// user edits the colour map in the popup. Safe to call once at startup.
export function initInventoryGridColors() {
    if (observerStarted) return;
    observerStarted = true;

    // Observe <html>: Turbo swaps <body>, and MUI re-renders the box grid when a
    // different box is selected. childList/subtree catches the grid appearing or
    // its cells being replaced; we repaint on the next frame (debounced).
    const observer = new MutationObserver(scheduleRecolor);
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
    });

    // Repaint when the user assigns/clears a prefix colour in the popup.
    onPrefixColorsChanged(scheduleRecolor);
}
