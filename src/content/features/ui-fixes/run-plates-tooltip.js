// content/features/ui-fixes/run-plates-tooltip.js
//
// The names of a run's plates in a hover bubble over its "Plates" count — the
// runs table of a protocol page, where the cell is only
// <a href="/vaults/<v>/runs/<r>/heat_maps">1 <img alt="plates"></a>.
//
// The names come from the heat map viewer the link opens (api/run-heat-maps.js:
// one div#heat_map_plate_<id> per plate, the name in its <h4>), fetched once
// per run and cached for the page.
//
// Same bubble behaviour as plate-location-tooltip.js: one delegated mouseover
// listener, one reused floating <div>, and a slow answer is dropped unless
// the pointer is still on the run it was asked for.

import { fetchRunHeatMapIndex } from "../../api/run-heat-maps.js";
import { positionAtCursor } from "../../utils/dom.js";

const LOG_PREFIX = "[CDD run plates]";

const STYLE_ID = "cdd-run-plates-tooltip-style";
const BUBBLE_ID = "cdd-run-plates-tooltip";

const LINK_SELECTOR = 'a[href$="/heat_maps"]';
const PATH_RE = /^\/vaults\/(\d+)\/runs\/(\d+)\/heat_maps$/;

let started = false;
let bubble = null;
// The heat map path the bubble is showing or loading: the race guard.
let activePath = null;
// path → Promise<string[]>
const cache = new Map();

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        #${BUBBLE_ID} {
            position: fixed;
            z-index: 2147483647;
            max-width: 320px;
            max-height: 60vh;
            overflow: hidden;
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

        #${BUBBLE_ID} .cdd-run-plates-label {
            opacity: 0.7;
        }

        #${BUBBLE_ID}.cdd-run-plates-muted {
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

function showMuted(text) {
    const el = ensureBubble();
    el.classList.add("cdd-run-plates-muted");
    el.textContent = text;
    el.hidden = false;
}

function showNames(names) {
    const el = ensureBubble();
    el.classList.remove("cdd-run-plates-muted");
    el.replaceChildren();

    const label = document.createElement("div");
    label.className = "cdd-run-plates-label";
    label.textContent = names.length === 1 ? "Plate" : `${names.length} plates`;
    el.append(label);

    for (const name of names) {
        const line = document.createElement("div");
        line.textContent = name;
        el.append(line);
    }
    el.hidden = false;
}

function hideBubble() {
    activePath = null;
    if (bubble) bubble.hidden = true;
}

function plateNames(path) {
    if (!cache.has(path)) {
        const [, vaultId, runId] = path.match(PATH_RE);
        const request = fetchRunHeatMapIndex(vaultId, runId).then(({ plates }) => plates.map((plate) => plate.name));
        // A failed fetch is not remembered: the next hover asks again.
        request.catch(() => cache.delete(path));
        cache.set(path, request);
    }
    return cache.get(path);
}

function runLink(target) {
    const link = target.closest?.(LINK_SELECTOR);
    return link && PATH_RE.test(link.getAttribute("href")) ? link : null;
}

async function onEnter(link, event) {
    const path = link.getAttribute("href");
    activePath = path;
    showMuted("Loading plates…");
    positionAtCursor(ensureBubble(), event);

    let names;
    try {
        names = await plateNames(path);
    } catch (error) {
        if (activePath === path) showMuted("Could not load the plates");
        throw error;
    }
    // Race guard: only paint if the pointer is still on the same run.
    if (activePath !== path) return;

    if (names.length) showNames(names);
    else showMuted("No plates");
    positionAtCursor(ensureBubble(), event);
}

export function initRunPlatesTooltip() {
    if (started) return;
    started = true;

    injectStyles();

    // Delegated on document so it survives Turbo's <body> swaps and React
    // re-rendering the runs table.
    document.addEventListener("mouseover", (event) => {
        const link = runLink(event.target);
        if (!link) return;
        if (link.getAttribute("href") === activePath) return; // already showing it
        onEnter(link, event).catch((err) => console.warn(`${LOG_PREFIX} tooltip failed`, err));
    });

    document.addEventListener("mouseout", (event) => {
        const link = runLink(event.target);
        if (!link) return;
        // Ignore moves that stay within the same link (e.g. onto its icon).
        if (link.contains(event.relatedTarget)) return;
        hideBubble();
    });

    // Keep the bubble next to the cursor while hovering the link.
    document.addEventListener("mousemove", (event) => {
        if (activePath === null || bubble?.hidden) return;
        if (!runLink(event.target)) return;
        positionAtCursor(ensureBubble(), event);
    });

    // A Turbo navigation can tear out the body (and our bubble) mid-hover.
    document.addEventListener("turbo:visit", hideBubble);
}
