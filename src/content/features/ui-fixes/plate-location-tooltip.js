// content/features/ui-fixes/plate-location-tooltip.js
//
// Shows the plate's Inventory Location in a small hover bubble when the mouse is
// over a plate link in the search results (the "Plate Fields -> Name" column,
// e.g. <a href="/vaults/<v>/plates/<p>">platenew123</a>).
//
// CDD renders no tooltip for these links, so unlike inventory-well-structure
// (which augments CDD's own well tooltip) we own the bubble end to end: one
// delegated mouseover listener on document, one reused floating <div>, and the
// value fetched + cached via api/plate-info.js.
//
// The bubble follows the same anchor until the pointer leaves it. A delayed
// fetch result is dropped unless the pointer is still on the plate it was
// requested for, so a slow response can never paint into the wrong (or hidden)
// bubble.

import { getPlateInfo } from "../../api/plate-info.js";

const LOG_PREFIX = "[CDD plate plugin]";

const STYLE_ID = "cdd-plate-location-tooltip-style";
const BUBBLE_ID = "cdd-plate-location-tooltip";

// Plate links live inside `.plate_name` on the results table; scoping to that
// container keeps us off the many other `/plates/` links elsewhere in the app.
const PLATE_LINK_SELECTOR = '.plate_name a[href*="/plates/"]';

let started = false;
let bubble = null;
// The plate path the bubble is currently showing/loading, used as a race guard.
let activePath = null;

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        #${BUBBLE_ID} {
            position: fixed;
            z-index: 2147483647;
            max-width: 320px;
            padding: 6px 10px;
            background: #2b2b2b;
            color: #fff;
            font-size: 12px;
            line-height: 1.4;
            border-radius: 6px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
            pointer-events: none;
            overflow-wrap: anywhere;
        }

        #${BUBBLE_ID} .cdd-plate-tooltip-label {
            opacity: 0.7;
            margin-right: 4px;
        }

        #${BUBBLE_ID}.cdd-plate-tooltip-muted {
            font-style: italic;
            opacity: 0.85;
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
// it would overflow the viewport edge.
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
        top = event.clientY - rect.height - 12;
    }

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
}

function showMuted(text) {
    const el = ensureBubble();
    el.classList.add("cdd-plate-tooltip-muted");
    el.textContent = text;
    el.hidden = false;
}

function showLocation(location) {
    const el = ensureBubble();
    el.classList.remove("cdd-plate-tooltip-muted");
    el.replaceChildren();

    const label = document.createElement("span");
    label.className = "cdd-plate-tooltip-label";
    label.textContent = "Inventory Location:";

    const value = document.createElement("span");
    value.textContent = location;

    el.append(label, value);
    el.hidden = false;
}

function hideBubble() {
    activePath = null;
    if (bubble) bubble.hidden = true;
}

async function onEnter(link, event) {
    const path = link.getAttribute("href");
    if (!path) return;

    activePath = path;
    showMuted("Loading location…");
    positionBubble(event);

    const requestedPath = path;
    const { inventoryLocation } = await getPlateInfo(path);

    // Race guard: only paint if the pointer is still on the same plate link.
    if (activePath !== requestedPath) return;

    if (inventoryLocation) {
        showLocation(inventoryLocation);
    } else {
        showMuted("No inventory location set");
    }
    positionBubble(event);
}

export function initPlateLocationTooltip() {
    if (started) return;
    started = true;

    injectStyles();

    // Delegated on document so it survives Turbo's <body> swaps and covers rows
    // added by "Load next 100 results…" without per-link wiring.
    document.addEventListener("mouseover", (event) => {
        const link = event.target.closest?.(PLATE_LINK_SELECTOR);
        if (!link) return;
        if (link.getAttribute("href") === activePath) return; // already showing it
        onEnter(link, event).catch((err) =>
            console.warn(`${LOG_PREFIX} tooltip failed`, err)
        );
    });

    document.addEventListener("mouseout", (event) => {
        const link = event.target.closest?.(PLATE_LINK_SELECTOR);
        if (!link) return;
        // Ignore moves that stay within the same link (e.g. onto its text node).
        if (link.contains(event.relatedTarget)) return;
        hideBubble();
    });

    // Keep the bubble next to the cursor while hovering the link.
    document.addEventListener("mousemove", (event) => {
        if (activePath === null || bubble?.hidden) return;
        if (!event.target.closest?.(PLATE_LINK_SELECTOR)) return;
        positionBubble(event);
    });

    // A Turbo navigation can tear out the body (and our bubble) mid-hover.
    document.addEventListener("turbo:visit", hideBubble);
}
