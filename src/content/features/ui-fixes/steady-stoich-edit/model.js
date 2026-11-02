// steady-stoich-edit/model.js — the arithmetic behind keeping a clicked
// stoichiometry value still while CDD switches the table into (or out of)
// edit mode. DOM-free so it can be tested on its own.

/**
 * @typedef {{ left: number, top: number }} Box
 */

/**
 * The offset an element has to be drawn at so it still looks like it is at
 * its old position (the "invert" step of FLIP). `null` when it barely moved.
 *
 * @param {Box} before
 * @param {Box} after
 * @param {number} [minPx]
 * @returns {{ dx: number, dy: number } | null}
 */
export function flipOffset(before, after, minPx = 1) {
    const dx = before.left - after.left;
    const dy = before.top - after.top;
    if (Math.abs(dx) < minPx && Math.abs(dy) < minPx) return null;
    return { dx, dy };
}

/**
 * How far to scroll so a point that was at `wasTop` on screen is there again
 * now that layout put it at `isTop`. Sub-pixel drift is left alone, or the
 * page would creep by rounding errors frame after frame.
 *
 * @param {number} wasTop
 * @param {number} isTop
 * @returns {number}
 */
export function scrollToKeep(wasTop, isTop) {
    const d = isTop - wasTop;
    return Math.abs(d) < 1 ? 0 : d;
}

/**
 * Whether a block is worth animating: on screen, or within `range` viewport
 * heights of it. Blocks far away move unseen; animating them only costs.
 *
 * @param {{ top: number, bottom: number }} box
 * @param {number} viewportHeight
 * @param {number} [range]
 */
export function nearViewport(box, viewportHeight, range = 1) {
    const margin = viewportHeight * range;
    return box.bottom > -margin && box.top < viewportHeight + margin;
}
