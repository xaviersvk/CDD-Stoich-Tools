// content/features/ui-fixes/inventory-well-structure.js
//
// Adds the molecule structure image + synonym to CDD's native "Pick Location"
// well tooltip (the dark MUI box showing sample name / amount / location path).
//
// CDD renders that tooltip itself; we only augment it. The tooltip already
// contains an anchor to the molecule, e.g.
//     <a href="/vaults/6884/molecules/164033088#...">PHA-0334477-001-S003467</a>
// so we read both the vault id and the molecule id straight from that href --
// no need to intercept the inventory payload or correlate by well position.
//
// The structure + synonym are fetched async (see api/molecule-image.js) and
// inserted only if the tooltip is still showing the same molecule when they
// resolve, so a delayed response can never land in the wrong (or closed) tooltip.

import { getMoleculeData } from "../../api/molecule-image.js";
import { recordSampleIdPrefix } from "../../../shared/prefix-colors.js";

const LOG_PREFIX = "[CDD inventory plugin]";

const TOOLTIP_SELECTOR = ".location-box-tooltip";
const HOLDER_CLASS = "cdd-well-structure";
const SYN_CLASS = "cdd-well-synonym";
const STYLE_ID = "cdd-well-structure-style";

let observerStarted = false;

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        .${HOLDER_CLASS} {
            margin-top: 6px;
        }

        .${SYN_CLASS} {
            opacity: 0.85;
        }

        .${HOLDER_CLASS}-state {
            font-size: 11px;
            font-style: italic;
            opacity: 0.7;
        }

        .${HOLDER_CLASS}-img {
            display: inline-block;
            background: #fff;
            border-radius: 6px;
            padding: 4px;
        }

        .${HOLDER_CLASS}-img svg {
            display: block;
            width: 180px;
            height: 180px;
        }
    `;

    document.head.appendChild(style);
}

// Read { vaultId, moleculeId } from the tooltip's molecule link, or null.
function parseMoleculeFromTooltip(tooltipEl) {
    const href =
        tooltipEl
            .querySelector('a[href*="/molecules/"]')
            ?.getAttribute("href") || "";

    const match = href.match(/\/vaults\/(\d+)\/molecules\/(\d+)/);
    if (!match) return null;

    return { vaultId: match[1], moleculeId: match[2] };
}

function setState(holder, text) {
    const el = document.createElement("div");
    el.className = `${HOLDER_CLASS}-state`;
    el.textContent = text;
    holder.replaceChildren(el);
}

// `svg` is a detached SVGElement (or null) from structure-render. We clone it so
// the cached element is never moved into the DOM, and we never touch innerHTML.
function renderStructure(holder, svg) {
    if (svg) {
        const box = document.createElement("div");
        box.className = `${HOLDER_CLASS}-img`;
        box.appendChild(svg.cloneNode(true));
        holder.replaceChildren(box);
    } else {
        setState(holder, "Structure unavailable");
    }
}

// Append the first synonym in parentheses to the amount line (e.g. "500 µL
// (MTAP_FP_Probe)") to save a row. The amount is the first direct-child <div>
// of the tooltip (the second is the location path); our own holder is excluded.
function applySynonym(tooltipEl, synonym) {
    const amount = tooltipEl.querySelector(`:scope > div:not(.${HOLDER_CLASS})`);
    if (!amount) return;

    amount.querySelector(`.${SYN_CLASS}`)?.remove();
    if (!synonym) return;

    const span = document.createElement("span");
    span.className = SYN_CLASS;
    span.textContent = ` (${synonym})`;
    amount.appendChild(span);
}

async function augmentTooltip(tooltipEl) {
    const info = parseMoleculeFromTooltip(tooltipEl);
    let holder = tooltipEl.querySelector(`.${HOLDER_CLASS}`);

    // No molecule in this tooltip (empty well / unexpected content): stay text-only.
    if (!info) {
        holder?.remove();
        return;
    }

    // Already showing (or loading) this exact molecule: nothing to do. This is
    // what makes repeated hovers free -- no duplicate node, no repeated request.
    if (holder && holder.dataset.moleculeId === info.moleculeId) return;

    if (!holder) {
        holder = document.createElement("div");
        holder.className = HOLDER_CLASS;
        tooltipEl.appendChild(holder);
    }

    holder.dataset.moleculeId = info.moleculeId;
    setState(holder, "Loading structure…");

    const requestedId = info.moleculeId;
    const data = await getMoleculeData(info.vaultId, info.moleculeId);

    // Race guard: only paint if this tooltip is still alive and still showing the
    // molecule we requested (the user may have moved to another well meanwhile).
    if (!tooltipEl.isConnected) return;
    if (holder.dataset.moleculeId !== requestedId) return;
    const current = parseMoleculeFromTooltip(tooltipEl);
    if (!current || current.moleculeId !== requestedId) return;

    renderStructure(holder, data.svg);
    applySynonym(tooltipEl, data.synonym);
}

// Register the Sample ID's prefix so it shows up in the popup for the user to
// colour. The Sample ID is the TEXT of the molecule link, e.g.
//     <a href="/vaults/6884/molecules/164033088#...">PHA-0334477-001-S003467</a>
// We only DISCOVER the prefix here; we never tint the identifier text itself
// (it stays the native colour). The actual colouring happens on the grid wells.
function recordTooltipPrefix(tooltipEl) {
    const link = tooltipEl.querySelector('a[href*="/molecules/"]');
    if (link) recordSampleIdPrefix(link.textContent);
}

function scan() {
    document.querySelectorAll(TOOLTIP_SELECTOR).forEach((el) => {
        recordTooltipPrefix(el);
        augmentTooltip(el).catch((err) => {
            const mol = parseMoleculeFromTooltip(el) ?? {};
            console.error(LOG_PREFIX, "Tooltip augment failed", {
                ...mol,
                errorName: err instanceof Error ? err.name : undefined,
                errorMessage: err instanceof Error ? err.message : String(err),
                errorStack: err instanceof Error ? err.stack : undefined,
            });
        });
    });
}

export function watchInventoryWellStructure() {
    if (observerStarted) return;
    observerStarted = true;

    injectStyles();

    let scheduled = false;
    const run = () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            scan();
        });
    };

    // Observe <html>, not <body>: Turbo Drive replaces the whole <body> on in-app
    // navigation, which would detach a body-scoped observer.
    // childList: catches the tooltip popper being added/removed.
    // attributes(href): catches MUI swapping the link when hovering a new well
    // while reusing the same tooltip node.
    const observer = new MutationObserver(run);
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["href"],
    });

    run();
}
