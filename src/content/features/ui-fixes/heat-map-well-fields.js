// content/features/ui-fixes/heat-map-well-fields.js
//
// Appends extra rows to CDD's OWN hover popup on run heat maps
// (/vaults/<v>/runs/<r>/heat_maps/<p>). Hovering a `td.heat-map-well` makes
// CDD show its "balloon" (#balloon > .details-popup) with the molecule link,
// batch name, well and readouts — we add the rows the user configured in the
// options page (shared/heat-map-fields.js): batch fields like "Internal ID",
// and the molecule's synonym via the special "Synonyms" label.
//
// Data comes from the molecule page HTML (api/batch-fields.js, fetched once
// and cached per molecule). Because the popup only appears after CDD's 500 ms
// hover delay, the fetch usually races ahead of it; neighbouring wells are
// prefetched from CDD.HeatMap.wellDetails — an inline-script JSON blob we can
// read from the content script because the DOM (script text included) is
// shared with the page world.

import { getBatchFieldData, prefetchBatchFieldData } from "../../api/batch-fields.js";
import {
    getCachedHeatMapFields,
    isSynonymLabel,
    normalizeFieldLabel,
} from "../../../shared/heat-map-fields.js";

const LOG_PREFIX = "[CDD plate plugin]";

const STYLE_ID = "cdd-heat-map-extra-style";
const EXTRA_CLASS = "cdd-heat-map-extra";
const WELL_SELECTOR = "td.heat-map-well";
const WELL_ID_RE = /^plate_(\d+)_well_(\d+)_(\d+)$/;
const MOLECULE_HREF_RE = /\/vaults\/(\d+)\/molecules\/(\d+)/;

// Wells within this many rows/columns of the hovered one are prefetched, same
// radius as the plate-map structure tooltip.
const PREFETCH_RADIUS = 2;

// CDD sizes the balloon to its own content, which on a heat map well leaves the
// popup body around 140 px wide. That is narrow enough that the extra batch
// rows wrap onto a second line almost every time — even short ones like
// "Batch name: 001" — so give the balloon this much more room.
const BALLOON_WIDTH_FACTOR = 1.4;

let started = false;

/* ------------------------------------------------------------------ *
 * CDD.HeatMap.wellDetails — the page serves every well's molecule url in an
 * inline script (`CDD.HeatMap.wellDetails['<plateId>'] = {...};`, one
 * assignment per line). Parsed once per page render and cached against the
 * script element, so a Turbo navigation (new <body>, new script) re-parses.
 * ------------------------------------------------------------------ */

let wellDetailsCache = null; // { script, map: Map<plateId, rows> }

function getWellDetails() {
    if (wellDetailsCache?.script?.isConnected) return wellDetailsCache.map;

    const map = new Map();
    let source = null;

    for (const script of document.querySelectorAll("script:not([src])")) {
        const text = script.textContent;
        if (!text.includes("CDD.HeatMap.wellDetails")) continue;
        source = script;

        for (const line of text.split("\n")) {
            const match = line.match(
                /CDD\.HeatMap\.wellDetails\['(\d+)']\s*=\s*(\{.*});?\s*$/
            );
            if (!match) continue;
            try {
                map.set(match[1], JSON.parse(match[2]));
            } catch {
                // Format drifted — prefetch quietly degrades, the popup rows
                // still work off the balloon content alone.
            }
        }
    }

    wellDetailsCache = source ? { script: source, map } : null;
    return map;
}

// Hovering a well: warm the cache for it and its neighbourhood.
function onWellHover(td) {
    if (!getCachedHeatMapFields().length) return;

    const match = td.id.match(WELL_ID_RE);
    if (!match) return;

    const details = getWellDetails().get(match[1]);
    if (!details) return;

    const row = Number(match[2]);
    const col = Number(match[3]);

    const targets = [];
    for (let r = row - PREFETCH_RADIUS; r <= row + PREFETCH_RADIUS; r += 1) {
        for (let c = col - PREFETCH_RADIUS; c <= col + PREFETCH_RADIUS; c += 1) {
            const href = details[r]?.[c]?.url;
            const hrefMatch = href?.match(MOLECULE_HREF_RE);
            if (!hrefMatch) continue;
            const target = { vaultId: hrefMatch[1], moleculeId: hrefMatch[2] };
            // The hovered well goes first in the queue.
            if (r === row && c === col) targets.unshift(target);
            else targets.push(target);
        }
    }

    prefetchBatchFieldData(targets, { concurrency: 2 });
}

/* ------------------------------------------------------------------ *
 * Balloon augmentation
 * ------------------------------------------------------------------ */

// "Batch name: 001" -> "001", from the popup's own list items.
function readBatchName(popup) {
    for (const li of popup.querySelectorAll("li")) {
        const text = li.textContent.trim();
        if (/^Batch name:/i.test(text)) {
            return text.replace(/^Batch name:/i, "").trim() || null;
        }
    }
    return null;
}

// Prefer the batch the popup names; with a single batch the name row can be
// missing entirely, so fall back to it rather than show nothing.
function pickBatch(batches, batchName) {
    if (batchName) {
        const named = batches.find((b) => b.name === batchName);
        if (named) return named;
    }
    return batches.length === 1 ? batches[0] : null;
}

async function augment(popup, link) {
    const hrefMatch = link.getAttribute("href")?.match(MOLECULE_HREF_RE);
    if (!hrefMatch) return;

    const labels = getCachedHeatMapFields();
    if (!labels.length) return;

    const batchName = readBatchName(popup);
    const data = await getBatchFieldData(hrefMatch[1], hrefMatch[2]);

    // Race guards: the balloon is one reused element — by the time the fetch
    // resolves it may show another well (marker gone, different link) or be
    // gone entirely. Only append if it still shows OUR molecule, unprocessed.
    if (!popup.isConnected) return;
    if (popup.querySelector(`a[href*="/molecules/"]`) !== link) return;
    if (popup.dataset.cddExtraDone) return;
    popup.dataset.cddExtraDone = "1";

    const batch = pickBatch(data.batches, batchName);

    // Every configured row — batch fields and the synonym alike — goes
    // straight under the molecule link, in EXACTLY the order the user set in
    // the options card. Only labels the vault actually defines get a row; a
    // valueless field shows "—" so a configured field never silently vanishes.
    const rows = [];
    for (const label of labels) {
        if (isSynonymLabel(label)) {
            rows.push(["Synonym", data.synonym || "—"]);
            continue;
        }
        const key = normalizeFieldLabel(label);
        const field = batch?.fields.find((f) => normalizeFieldLabel(f.label) === key);
        if (!field) continue;
        // The vault's own label style, minus the "*" required marker.
        rows.push([label.replace(/\*/g, "").trim(), field.value || "—"]);
    }

    if (rows.length) {
        const box = document.createElement("div");
        box.className = `${EXTRA_CLASS} ${EXTRA_CLASS}-top`;
        for (const [label, value] of rows) {
            const row = document.createElement("div");
            const strong = document.createElement("strong");
            strong.textContent = `${label}: `;
            row.append(strong, document.createTextNode(value));
            box.appendChild(row);
        }
        const heading = link.closest("h3") || link;
        heading.insertAdjacentElement("afterend", box);
    }
}

// Widen CDD's balloon so the popup rows stop wrapping. Only `#balloon` needs
// the new width: its `#contents` child carries the visible box (background and
// border) and has no width of its own, so it follows. The sibling
// `#topRight` / `#bottomRight` / `#bottomLeft` divs are fully transparent
// remnants of the balloon skin — nothing visible hangs off them, so their now
// stale geometry can be left alone.
//
// The flag lives on the popup, not the balloon: `#balloon` is one reused
// element, while `.details-popup` is rebuilt for every well, which resets the
// guard exactly when CDD resets the width.
function widenBalloon(balloon, popup) {
    if (popup.dataset.cddWideDone) return;

    const natural = balloon.getBoundingClientRect().width;
    if (!natural) return;

    popup.dataset.cddWideDone = "1";
    balloon.style.width = `${Math.round(natural * BALLOON_WIDTH_FACTOR)}px`;

    // CDD placed the balloon while it was still narrow, so near the right edge
    // of the window the wider box would now hang off screen. (CDD's own
    // `max-width: 600px` still caps how wide it can get.)
    const rect = balloon.getBoundingClientRect();
    const overflow = rect.right - (document.documentElement.clientWidth - 8);
    if (overflow > 0) {
        const left = parseFloat(balloon.style.left);
        const current = Number.isFinite(left) ? left : rect.left;
        balloon.style.left = `${Math.max(8, current - overflow)}px`;
    }
}

// The balloon shows many things across CDD; only touch it when it holds a
// well details popup AND the page renders a heat map table.
function maybeAugment() {
    const balloon = document.getElementById("balloon");
    if (!balloon) return;

    const popup = balloon.querySelector(".details-popup");
    if (!popup) return;

    const link = popup.querySelector('a[href*="/molecules/"]');
    if (!link) return;

    if (!document.querySelector("table.plateLayout.heatMap")) return;

    // Before the extra rows go in, so they are laid out at the final width.
    // Runs whether or not any fields are configured — CDD's own rows wrap too.
    widenBalloon(balloon, popup);

    if (popup.dataset.cddExtraDone) return;

    augment(popup, link).catch((err) =>
        console.warn(`${LOG_PREFIX} heat map tooltip fields failed`, err)
    );
}

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        .${EXTRA_CLASS}-top {
            margin: 4px 0 6px;
        }

        .${EXTRA_CLASS}-top div {
            margin: 2px 0;
        }
    `;

    document.head.appendChild(style);
}

export function initHeatMapWellFields() {
    if (started) return;
    started = true;

    injectStyles();

    // Delegated on document so it survives Turbo's <body> swaps.
    document.addEventListener("mouseover", (event) => {
        const td = event.target.closest?.(WELL_SELECTOR);
        if (td) onWellHover(td);
    });

    // CDD builds the popup ~500 ms after hover; watch for it appearing. The
    // rAF debounce coalesces the balloon library's DOM churn.
    let scheduled = false;
    const observer = new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            maybeAugment();
        });
    });
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
    });
}
