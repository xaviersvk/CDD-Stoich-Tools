// inject/hooks/dose-response-drag.js
//
// Box-select outliers on a CDD Visualization dose-response plot. In Edit
// Outliers & Override, Shift-drag marks every point inside the box as an
// outlier and Ctrl-drag unmarks them. A Shift/Ctrl click with no drag acts on
// the point under the cursor. Nothing reaches the server: the points change in
// CDD's edit state exactly as a click on each would change them, and CDD's own
// Save / Cancel decide what happens next.
//
// What CDD gives us (measured on the plot page, MobX store + React fibers):
//   - The points are drawn on a <canvas> inside a <foreignObject>, so there is
//     no DOM node per point. The component above the canvas whose props carry
//     `scatterplotXScale` also carries `allPoints` and `xScale` / `yScale`,
//     which map a point's data x / y to pixels from the top-left of the plot
//     area — the `.brush-1 > rect` of the same <svg>.
//   - A point in edit mode has `type: "point"` or `type: "outlier"`.
//   - The store (props.value.store of a context provider above the plot) has
//     `mode` ("outliers" while editing) and `markPoint(point)`, which TOGGLES
//     that point's type. A click on a point calls exactly that; so do we, and
//     only for points not already in the wanted state.
//   - A plain drag on the plot is CDD's zoom brush. A drag with Shift/Ctrl is
//     taken over here — pointerdown is cancelled, which also cancels the
//     compatibility mouse events the brush listens to — and the click that
//     follows is swallowed so CDD does not reset the zoom.
//
// If any of that is missing the drag is left to CDD untouched.

import { post } from "../bus.js";
import { EVENTS, EVENT_SOURCE } from "../../shared/event-types.js";

const BRUSH_RECT_SELECTOR = 'g[class^="brush"] > rect';
const MAX_WALK = 80;
// Below this many pixels in both directions a drag counts as a click.
const CLICK_SLOP = 3;
// A click acts on points whose centre is this close to the cursor.
const CLICK_RADIUS = 6;

let enabled = true;
let drag = null;

function fiberOf(element) {
    if (!element) return null;
    const key = Object.keys(element).find((k) => k.startsWith("__reactFiber$"));
    return key ? element[key] : null;
}

// React keeps two copies of every fiber and swaps them on each render, but the
// DOM node's `__reactFiber$` expando is set once, when the node is created. So
// after an odd number of renders it points into the OLD tree, whose props
// still hold the points as they were before the last change — measured: a
// Ctrl-drag right after a Shift-drag found no outliers until something else
// re-rendered the plot. Whichever copy's tree ends in the root's `current`
// HostRoot is the live one.
function currentFiber(fiber) {
    let top = fiber;
    while (top.return) top = top.return;
    if (top.tag !== 3 || top.stateNode?.current === top) return fiber;
    return fiber.alternate || fiber;
}

function findUp(element, test) {
    const own = fiberOf(element);
    let fiber = own && currentFiber(own);
    for (let i = 0; fiber && i < MAX_WALK; i++, fiber = fiber.return) {
        const found = test(fiber.memoizedProps);
        if (found) return found;
    }
    return null;
}

function plotProps(canvas) {
    return findUp(canvas, (p) =>
        p?.scatterplotXScale && typeof p.xScale === "function" &&
        typeof p.yScale === "function" && Array.isArray(p.allPoints)
            ? p
            : null
    );
}

function storeOf(canvas) {
    return findUp(canvas, (p) => {
        const store = p?.value?.store;
        return store && typeof store.markPoint === "function" ? store : null;
    });
}

// The plot under (x, y) in edit mode: its brush rect, canvas and store.
function plotAt(x, y) {
    for (const rect of document.querySelectorAll(BRUSH_RECT_SELECTOR)) {
        const box = rect.getBoundingClientRect();
        if (x < box.left || x > box.right || y < box.top || y > box.bottom) continue;

        const canvas = rect.ownerSVGElement?.querySelector("canvas");
        const store = canvas && storeOf(canvas);
        if (!store || store.mode !== "outliers") return null;
        if (!plotProps(canvas)) return null;
        return { rect, canvas, store };
    }
    return null;
}

function makeBox(markOutliers) {
    const box = document.createElement("div");
    box.setAttribute("data-cdd-dose-response-drag", "1");
    const colour = markOutliers ? "#c62828" : "#455a64";
    Object.assign(box.style, {
        position: "fixed",
        zIndex: "2147483647",
        pointerEvents: "none",
        border: `1.5px dashed ${colour}`,
        background: markOutliers ? "rgba(198, 40, 40, 0.06)" : "rgba(69, 90, 100, 0.06)",
        boxSizing: "border-box",
    });

    const label = document.createElement("span");
    label.textContent = markOutliers ? "Mark outliers" : "Unmark outliers";
    Object.assign(label.style, {
        position: "absolute",
        left: "0",
        top: "-18px",
        font: "600 11px/16px system-ui, sans-serif",
        color: colour,
        whiteSpace: "nowrap",
    });
    box.appendChild(label);
    document.body.appendChild(box);
    return box;
}

function selection(d) {
    return {
        left: Math.min(d.x0, d.x1),
        right: Math.max(d.x0, d.x1),
        top: Math.min(d.y0, d.y1),
        bottom: Math.max(d.y0, d.y1),
    };
}

function drawBox(d) {
    const s = selection(d);
    Object.assign(d.box.style, {
        left: `${s.left}px`,
        top: `${s.top}px`,
        width: `${s.right - s.left}px`,
        height: `${s.bottom - s.top}px`,
    });
}

// Mark (or unmark) every point whose centre lies in `area`. Returns how many
// points changed.
function apply(plot, area, markOutliers) {
    const props = plotProps(plot.canvas);
    if (!props) return 0;
    const origin = plot.rect.getBoundingClientRect();
    const from = markOutliers ? "point" : "outlier";

    let changed = 0;
    for (const point of props.allPoints) {
        if (point?.type !== from) continue;
        const x = origin.left + props.xScale(point.x);
        const y = origin.top + props.yScale(point.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        if (x < area.left || x > area.right || y < area.top || y > area.bottom) continue;
        plot.store.markPoint(point);
        changed++;
    }
    return changed;
}

function swallow(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
}

// The click that ends a drag would reach CDD's plot handler, which resets the
// zoom when no point was hit. Eat exactly that one.
function swallowNextClick() {
    const onClick = (event) => {
        swallow(event);
        window.removeEventListener("click", onClick, true);
    };
    window.addEventListener("click", onClick, true);
    setTimeout(() => window.removeEventListener("click", onClick, true), 400);
}

function endDrag() {
    if (!drag) return;
    drag.box.remove();
    drag = null;
}

function onPointerDown(event) {
    if (!enabled || drag) return;
    if (event.button !== 0 || event.pointerType === "touch") return;

    const unmark = event.ctrlKey || event.metaKey;
    if (!unmark && !event.shiftKey) return;

    let plot;
    try {
        plot = plotAt(event.clientX, event.clientY);
    } catch (err) {
        console.debug("[CDD Stoich Tools] dose-response drag: plot lookup failed", err);
        return;
    }
    if (!plot) return;

    swallow(event);
    // So the pointerup still arrives when the drag ends outside the window.
    try {
        event.target.setPointerCapture?.(event.pointerId);
    } catch {
        /* the box still works while the pointer stays in the window */
    }
    const markOutliers = !unmark;
    drag = {
        plot,
        markOutliers,
        x0: event.clientX,
        y0: event.clientY,
        x1: event.clientX,
        y1: event.clientY,
        box: makeBox(markOutliers),
    };
    drawBox(drag);
}

function onPointerMove(event) {
    if (!drag) return;
    swallow(event);
    drag.x1 = event.clientX;
    drag.y1 = event.clientY;
    drawBox(drag);
}

function onPointerUp(event) {
    if (!drag) return;
    swallow(event);
    swallowNextClick();

    const d = drag;
    endDrag();
    d.x1 = event.clientX;
    d.y1 = event.clientY;

    let area = selection(d);
    if (area.right - area.left < CLICK_SLOP && area.bottom - area.top < CLICK_SLOP) {
        area = {
            left: d.x1 - CLICK_RADIUS,
            right: d.x1 + CLICK_RADIUS,
            top: d.y1 - CLICK_RADIUS,
            bottom: d.y1 + CLICK_RADIUS,
        };
    }

    try {
        const changed = apply(d.plot, area, d.markOutliers);
        console.debug(
            `[CDD Stoich Tools] dose-response drag: ${d.markOutliers ? "marked" : "unmarked"} ${changed} point(s)`
        );
    } catch (err) {
        console.warn("[CDD Stoich Tools] dose-response drag failed:", err);
    }
}

function onCancel(event) {
    if (!drag) return;
    if (event.type === "keydown" && event.key !== "Escape") return;
    if (event.type === "keydown") swallow(event);
    endDrag();
}

export function installDoseResponseDrag() {
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("pointercancel", onCancel, true);
    window.addEventListener("keydown", onCancel, true);
    window.addEventListener("blur", onCancel);

    window.addEventListener("message", (event) => {
        if (event.source !== window) return;
        const data = event.data;
        if (!data || data.source !== EVENT_SOURCE) return;
        if (data.type !== EVENTS.DOSE_RESPONSE_DRAG_ENABLED) return;
        enabled = data.payload?.enabled !== false;
        if (!enabled) endDrag();
    });

    post(EVENTS.DOSE_RESPONSE_DRAG_HELLO, {});
}
