// content/features/ui-fixes/plate-map-structure-tooltip.js
//
// Shows a hover bubble with the molecule's synonym + structure when the mouse
// is over a well on a plate's Plate Map (and heat maps, which render the same
// `.plateLayout` table). Each well is an anchor to the molecule, e.g.
//     <a href="/vaults/<v>/molecules/<m>#molecule-batches/...">IXX-DEMO-0000828-001</a>
// so we read both ids off the href, exactly like inventory-well-structure does
// for CDD's own inventory tooltip.
//
// CDD renders no tooltip here, so like plate-location-tooltip we own the bubble
// end to end: one delegated mouseover listener, one reused floating <div>, and
// the data fetched + cached via api/molecule-image.js (shared with the
// inventory tooltip -- a molecule already hovered anywhere fills instantly).
// A delayed fetch result is dropped unless the pointer is still on the well it
// was requested for.

import { getMoleculeData, prefetchMolecules } from "../../api/molecule-image.js";

const LOG_PREFIX = "[CDD plate plugin]";

const STYLE_ID = "cdd-plate-well-tooltip-style";
const BUBBLE_ID = "cdd-plate-well-tooltip";

// Well links live inside `.plateLayout td.well`; scoping to that table keeps us
// off the many other `/molecules/` links elsewhere in the app.
const WELL_LINK_SELECTOR = '.plateLayout td.well a[href*="/molecules/"]';

// Wells within this many rows/columns of the hovered one are prefetched in the
// background, so sweeping the mouse across the plate feels instant.
const PREFETCH_RADIUS = 2;

let started = false;
let bubble = null;
// The molecule href the bubble is currently showing/loading, used as a race guard.
let activeHref = null;

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        #${BUBBLE_ID} {
            position: fixed;
            z-index: 2147483647;
            max-width: 260px;
            padding: 8px 10px;
            background: #2b2b2b;
            color: #fff;
            font-size: 12px;
            line-height: 1.4;
            border-radius: 6px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
            pointer-events: none;
            overflow-wrap: anywhere;
        }

        #${BUBBLE_ID} .cdd-plate-well-tooltip-synonym {
            opacity: 0.85;
            margin-bottom: 4px;
        }

        #${BUBBLE_ID} .cdd-plate-well-tooltip-state {
            font-style: italic;
            opacity: 0.8;
        }

        #${BUBBLE_ID} .cdd-plate-well-tooltip-img {
            display: inline-block;
            background: #fff;
            border-radius: 6px;
            padding: 4px;
        }

        #${BUBBLE_ID} .cdd-plate-well-tooltip-img svg {
            display: block;
            width: 180px;
            height: 180px;
        }
    `;

    document.head.appendChild(style);
}

function ensureBubble() {
    if (bubble && bubble.isConnected) return bubble;

    bubble = document.createElement("div");
    bubble.id = BUBBLE_ID;
    bubble.hidden = true;
    document.body.appendChild(bubble);
    return bubble;
}

// Position the bubble just below-right of the cursor, nudged back on-screen if
// it would overflow the viewport edge. Same approach as plate-location-tooltip,
// just with a taller bubble (the structure image) flipping above the cursor.
function positionBubble(event) {
    const el = ensureBubble();
    const pad = 12;
    const rect = el.getBoundingClientRect();

    let left = event.clientX + 14;
    let top = event.clientY + 16;

    if (left + rect.width + pad > window.innerWidth) {
        left = Math.max(pad, window.innerWidth - rect.width - pad);
    }
    if (top + rect.height + pad > window.innerHeight) {
        top = Math.max(pad, event.clientY - rect.height - 12);
    }

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
}

function showState(text) {
    const el = ensureBubble();
    const state = document.createElement("div");
    state.className = "cdd-plate-well-tooltip-state";
    state.textContent = text;
    el.replaceChildren(state);
    el.hidden = false;
}

// `svg` is a detached SVGElement (or null) from structure-render. We clone it so
// the cached element is never moved into the DOM.
function showMoleculeData({ svg, synonym }) {
    const el = ensureBubble();
    el.replaceChildren();

    if (synonym) {
        const syn = document.createElement("div");
        syn.className = "cdd-plate-well-tooltip-synonym";
        syn.textContent = synonym;
        el.appendChild(syn);
    }

    if (svg) {
        const box = document.createElement("div");
        box.className = "cdd-plate-well-tooltip-img";
        box.appendChild(svg.cloneNode(true));
        el.appendChild(box);
    } else {
        const state = document.createElement("div");
        state.className = "cdd-plate-well-tooltip-state";
        state.textContent = "Structure unavailable";
        el.appendChild(state);
    }

    el.hidden = false;
}

function hideBubble() {
    activeHref = null;
    if (bubble) bubble.hidden = true;
}

// Warm the cache for the wells around the hovered one (a (2r+1) x (2r+1) block
// clipped to the plate edges). prefetchMolecules skips anything already cached
// or queued and runs on idle with a small concurrency cap, so calling this on
// every hover is cheap and never competes with the hovered well's own fetch.
function prefetchNeighbours(link) {
    const cell = link.closest("td");
    const row = cell?.parentElement;
    const table = row?.closest("table");
    if (!cell || !row || !table) return;

    const ids = [];
    for (let r = row.rowIndex - PREFETCH_RADIUS; r <= row.rowIndex + PREFETCH_RADIUS; r += 1) {
        const cells = table.rows[r]?.cells;
        if (!cells) continue;
        for (let c = cell.cellIndex - PREFETCH_RADIUS; c <= cell.cellIndex + PREFETCH_RADIUS; c += 1) {
            const href = cells[c]
                ?.querySelector?.('a[href*="/molecules/"]')
                ?.getAttribute("href");
            const match = href?.match(/\/molecules\/(\d+)/);
            if (match) ids.push(match[1]);
        }
    }

    prefetchMolecules(ids, { concurrency: 2 });
}

async function onEnter(link, event) {
    const href = link.getAttribute("href") || "";
    const match = href.match(/\/vaults\/(\d+)\/molecules\/(\d+)/);
    if (!match) return;

    activeHref = href;
    showState("Loading structure…");
    positionBubble(event);

    prefetchNeighbours(link);

    const data = await getMoleculeData(match[1], match[2]);

    // Race guard: only paint if the pointer is still on the same well.
    if (activeHref !== href) return;

    showMoleculeData(data);
    positionBubble(event);
}

export function initPlateMapStructureTooltip() {
    if (started) return;
    started = true;

    injectStyles();

    // Delegated on document so it survives Turbo's <body> swaps and the React
    // plate map mounting after us, without per-link wiring.
    document.addEventListener("mouseover", (event) => {
        const link = event.target.closest?.(WELL_LINK_SELECTOR);
        if (!link) return;
        if (link.getAttribute("href") === activeHref) return; // already showing it
        onEnter(link, event).catch((err) =>
            console.warn(`${LOG_PREFIX} well structure tooltip failed`, err)
        );
    });

    document.addEventListener("mouseout", (event) => {
        const link = event.target.closest?.(WELL_LINK_SELECTOR);
        if (!link) return;
        // Ignore moves that stay within the same link (e.g. onto its text node).
        if (link.contains(event.relatedTarget)) return;
        hideBubble();
    });

    // Keep the bubble next to the cursor while hovering the link.
    document.addEventListener("mousemove", (event) => {
        if (activeHref === null || bubble?.hidden) return;
        if (!event.target.closest?.(WELL_LINK_SELECTOR)) return;
        positionBubble(event);
    });

    // A Turbo navigation can tear out the body (and our bubble) mid-hover.
    document.addEventListener("turbo:visit", hideBubble);
}
