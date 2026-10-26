// shared/drag-box.js
//
// The dashed box every "drag to mark an area" gesture draws: outliers on heat
// maps (inject/hooks/heat-map-outlier-drag.js) and dose-response plots
// (inject/hooks/dose-response-drag.js), and positions in a box picker
// (content/features/box-selection/overlay.js). One drawing, so the three
// cannot drift apart.
//
// No imports and no chrome.*: loaded by both the page-world script and the
// content script. dragArea and touches are pure; createDragBox touches the DOM.

// Below this many pixels in both directions a drag counts as a click.
export const CLICK_SLOP = 3;

// Colour carries the state: red marks, grey unmarks, blue selects.
export const DRAG_TONES = {
    mark: { colour: "#c62828", tint: "rgba(198, 40, 40, 0.06)" },
    unmark: { colour: "#455a64", tint: "rgba(69, 90, 100, 0.06)" },
    select: { colour: "#0a62e6", tint: "rgba(10, 98, 230, 0.06)" },
};

// The area between the press and the current point. A click-sized area
// collapses to the end point, so it touches only what is under the cursor.
export function dragArea(x0, y0, x1, y1) {
    const area = {
        left: Math.min(x0, x1),
        right: Math.max(x0, x1),
        top: Math.min(y0, y1),
        bottom: Math.max(y0, y1),
        isClick: false,
    };
    if (area.right - area.left < CLICK_SLOP && area.bottom - area.top < CLICK_SLOP) {
        return { left: x1, right: x1, top: y1, bottom: y1, isClick: true };
    }
    return area;
}

// Whether a client rect (getBoundingClientRect) intersects the area; edges
// count.
export function touches(area, rect) {
    return !(rect.right < area.left || rect.left > area.right || rect.bottom < area.top || rect.top > area.bottom);
}

// A fixed-position box with its label above the top-left corner. `ownerAttr`
// is a data-* attribute naming the feature, for anyone looking at the DOM.
export function createDragBox(tone, label, ownerAttr) {
    const { colour, tint } = DRAG_TONES[tone] || DRAG_TONES.mark;
    const box = document.createElement("div");
    if (ownerAttr) box.setAttribute(ownerAttr, "1");
    Object.assign(box.style, {
        position: "fixed",
        zIndex: "2147483647",
        pointerEvents: "none",
        border: `1.5px dashed ${colour}`,
        background: tint,
        boxSizing: "border-box",
    });

    const text = document.createElement("span");
    text.textContent = label;
    Object.assign(text.style, {
        position: "absolute",
        left: "0",
        top: "-18px",
        font: "600 11px/16px system-ui, sans-serif",
        color: colour,
        whiteSpace: "nowrap",
    });
    box.appendChild(text);
    document.body.appendChild(box);

    return {
        draw(area) {
            Object.assign(box.style, {
                left: `${area.left}px`,
                top: `${area.top}px`,
                width: `${area.right - area.left}px`,
                height: `${area.bottom - area.top}px`,
            });
        },
        remove() {
            box.remove();
        },
    };
}
