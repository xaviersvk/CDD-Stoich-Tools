// content/features/active-reaction.js
//
// On an entry with several reactions, the panel marks the reaction you are
// looking at: its group gets a heavier frame and the panel scrolls to it.
// "Looking at" = the reaction block taking up the most of the viewport,
// followed with an IntersectionObserver rather than a scroll listener.
//
// The panel rebuilds its cards dozens of times a second on a live entry, so
// the active reaction lives here, in module scope, and the render reads it
// (markActiveReaction) — a class set on a card from outside would be gone
// on the next rebuild.
//
// Reaction block N on the page is reaction index N in the panel — the same
// display-order rule row-fill.js fills by. When the counts disagree (the
// page sometimes renders fewer blocks than reactions) nothing is marked:
// no highlight beats the wrong one.
//
// Settings → Panel fields switches it off (shared/active-reaction-flag.js,
// on by default).

import { PANEL_ID } from "../../shared/plugin-constants.js";
import { getReactionContainers } from "./row-fill.js";
import {
    initActiveReactionFlag,
    isActiveReactionEnabled,
    onActiveReactionChanged,
} from "../../shared/active-reaction-flag.js";

export const ACTIVE_GROUP_CLASS = "is-active-reaction";

// Below this many visible pixels a block does not count as "looked at".
const MIN_VISIBLE_PX = 40;

// Stickiness. Another reaction takes over only once it shows this much
// more of the viewport than the current one — with two blocks sharing the
// screen, that is about 70 % of it, not the halfway mark — so the
// panel does not jump while you scroll through the seam between them.
const SWITCH_MARGIN = 0.4;

let observer = null;
let blocks = [];
const visiblePx = new Map();  // block -> visible height in px
let activeIndex = null;

function pickActive() {
    let best = null;
    let bestPx = MIN_VISIBLE_PX;
    blocks.forEach((block, index) => {
        const px = visiblePx.get(block) || 0;
        if (px >= bestPx) {
            best = index;
            bestPx = px;
        }
    });
    // No reaction on screen (prose between them): keep the last one marked.
    if (best === null || best === activeIndex) return;
    const currentPx = activeIndex === null ? 0 : visiblePx.get(blocks[activeIndex]) || 0;
    if (currentPx >= MIN_VISIBLE_PX
        && bestPx - currentPx < SWITCH_MARGIN * window.innerHeight) return;
    activeIndex = best;
    markActiveReaction({ scroll: true });
}

function onIntersect(entries) {
    for (const entry of entries) {
        visiblePx.set(entry.target, entry.isIntersecting ? entry.intersectionRect.height : 0);
    }
    pickActive();
}

const THRESHOLDS = Array.from({ length: 21 }, (_, i) => i / 20);

// Called on every panel render: cheap when the blocks are unchanged (one
// querySelectorAll and a comparison), re-observes when CDD re-rendered them.
let flagStarted = false;

function startFlag() {
    if (flagStarted) return;
    flagStarted = true;
    initActiveReactionFlag();
    // Switching it on scrolls the panel to the reaction in view at once.
    onActiveReactionChanged((enabled) => markActiveReaction({ scroll: enabled }));
}

export function syncReactionBlocks() {
    startFlag();
    if (typeof IntersectionObserver === "undefined") return;
    const current = getReactionContainers();
    if (current.length === blocks.length && current.every((b, i) => b === blocks[i])) return;

    if (!observer) observer = new IntersectionObserver(onIntersect, { threshold: THRESHOLDS });
    for (const block of blocks) {
        if (!current.includes(block)) {
            observer.unobserve(block);
            visiblePx.delete(block);
        }
    }
    for (const block of current) {
        if (!blocks.includes(block)) observer.observe(block);
    }
    blocks = current;
}

// The panel's per-reaction groups; the "Mentioned in text" group carries no
// data-reaction-index and is never marked.
function reactionGroups(panel) {
    return [...panel.querySelectorAll(".cdd-stoich-group[data-reaction-index]")];
}

// Sets the class on the active group (and only there). With `scroll`, also
// brings that group into view inside the panel — on a change of reaction
// only, so a re-render never fights the user's own scrolling of the panel.
export function markActiveReaction({ scroll = false } = {}) {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    const groups = reactionGroups(panel);
    const usable = isActiveReactionEnabled()
        && groups.length >= 2 && groups.length === blocks.length;

    let target = null;
    for (const group of groups) {
        const on = usable && Number(group.dataset.reactionIndex) === activeIndex;
        group.classList.toggle(ACTIVE_GROUP_CLASS, on);
        if (on) target = group;
    }

    if (!scroll || !target) return;
    const body = panel.querySelector(".cdd-stoich-body");
    if (!body) return;
    // Inside the panel only: scrollIntoView would scroll the page as well.
    const offset = target.getBoundingClientRect().top - body.getBoundingClientRect().top;
    body.scrollTo({ top: body.scrollTop + offset - 10, behavior: "smooth" });
}
