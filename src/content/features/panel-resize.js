// content/features/panel-resize.js
//
// Drag-to-resize for the floating "CDD Samples" panel. The size lands in the
// same localStorage record as the position, so a panel comes back exactly as
// it was left.
//
// Both side edges are grabbable, not just one: the panel starts anchored to
// the top RIGHT of the window, where the natural way to make it wider is to
// pull its LEFT edge — but once it has been dragged somewhere else the right
// edge is just as likely to be the one facing free space.
//
// Size is applied through CSS custom properties rather than inline width /
// height so the stylesheet keeps the last word. That is what lets the collapsed
// panel ignore a remembered height (`.collapsed` resets it) and shrink to its
// header, instead of staying a tall empty box.

import { PANEL_ID } from "../../shared/plugin-constants.js";
import { loadPanelState, savePanelState } from "./panel-state.js";

const WIDTH_VAR = "--cdd-panel-width";
const HEIGHT_VAR = "--cdd-panel-height";

// 100px is a sliver — deliberately, so the panel can be shoved aside without
// being collapsed outright.
//
// It used to be 240, which was worse than it sounds: the header needs 275 for
// its six controls and the panel is `overflow: hidden`, so at 240 the collapse
// toggle sat entirely outside the panel, unclickable, and there was no way
// back. Going NARROWER than that is only safe because the header now wraps
// instead of clipping and drops its title under 300px — see the @container
// rule in sample-panel.js. Every control stays reachable at 100px; the header
// simply grows taller.
const MIN_WIDTH = 100;
const MIN_HEIGHT = 160;

// Room left around the panel so a resize can never park an edge exactly on the
// window border, where the last pixels are awkward to grab back.
const VIEWPORT_MARGIN = 16;

const HANDLE_CLASS = "cdd-panel-resize";
const STYLE_ID = "cdd-panel-resize-styles";

// name → which edges the handle moves. "left" also moves the panel itself, so
// the opposite edge stays put while the width changes.
const HANDLES = [
    { name: "w", edges: { left: true } },
    { name: "e", edges: { right: true } },
    { name: "s", edges: { bottom: true } },
    { name: "sw", edges: { left: true, bottom: true } },
    { name: "se", edges: { right: true, bottom: true } },
];

function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
  /* A resize edge nobody can see is a resize edge nobody uses. The hit area
     is deliberately wider than the mark it draws: 10px is grabbable without
     aiming, while the visible tint stays a thin hint that only shows up under
     the cursor. */
  #${PANEL_ID} .${HANDLE_CLASS} {
    position: absolute;
    z-index: 2;
    background: transparent;
    transition: background-color 120ms ease;
  }

  #${PANEL_ID} .${HANDLE_CLASS}:hover,
  #${PANEL_ID} .${HANDLE_CLASS}.is-resizing {
    background: rgba(96, 165, 250, 0.45);
  }

  #${PANEL_ID} .${HANDLE_CLASS}--w,
  #${PANEL_ID} .${HANDLE_CLASS}--e {
    top: 0;
    bottom: 0;
    width: 10px;
    cursor: ew-resize;
  }

  #${PANEL_ID} .${HANDLE_CLASS}--w { left: 0; }
  #${PANEL_ID} .${HANDLE_CLASS}--e { right: 0; }

  #${PANEL_ID} .${HANDLE_CLASS}--s {
    left: 0;
    right: 0;
    bottom: 0;
    height: 10px;
    cursor: ns-resize;
  }

  /* Corners sit above the edges they overlap, so the diagonal wins there. */
  #${PANEL_ID} .${HANDLE_CLASS}--sw,
  #${PANEL_ID} .${HANDLE_CLASS}--se {
    bottom: 0;
    width: 18px;
    height: 18px;
    z-index: 3;
  }

  #${PANEL_ID} .${HANDLE_CLASS}--sw { left: 0; cursor: nesw-resize; }
  #${PANEL_ID} .${HANDLE_CLASS}--se { right: 0; cursor: nwse-resize; }

  /* The bottom-right corner gets a permanent grip: one visible mark that says
     the whole panel can be resized, without outlining every edge. */
  #${PANEL_ID} .${HANDLE_CLASS}--se::after {
    content: "";
    position: absolute;
    /* Kept clear of the panel's 12px corner radius, which clips anything
       nearer the tip than this. */
    right: 5px;
    bottom: 5px;
    width: 8px;
    height: 8px;
    border-right: 2px solid #6b7280;
    border-bottom: 2px solid #6b7280;
    border-bottom-right-radius: 3px;
  }

  #${PANEL_ID} .${HANDLE_CLASS}--se:hover::after {
    border-color: #f9fafb;
  }

  /* Collapsed, the panel is only its header — there is no height to drag. */
  #${PANEL_ID}.collapsed .${HANDLE_CLASS}--s,
  #${PANEL_ID}.collapsed .${HANDLE_CLASS}--sw,
  #${PANEL_ID}.collapsed .${HANDLE_CLASS}--se {
    display: none;
  }
`;

    document.documentElement.appendChild(style);
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
}

function toPositiveNumber(value) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

// How much of the panel has to stay on screen for it to be draggable again.
// The header is the drag handle, so keeping that much visible is the
// difference between "awkwardly placed" and "gone, clear localStorage".
const HEADER_KEEP_PX = 44;

// Pull a panel back into the window it is actually in.
//
// The size was always clamped on restore; the POSITION was not, and there was
// no resize listener either — so a panel left near the right edge of a wide
// monitor reopened at the same absolute x on a laptop, entirely off-screen,
// with no way back. The same happens when a window is merely made smaller.
//
// A panel still in its default corner has `left: auto` and cannot drift, so
// it is left alone.
export function clampPanelIntoView(panel) {
    if (!panel) return;

    const left = parseFloat(panel.style.left);
    const top = parseFloat(panel.style.top);
    if (!Number.isFinite(left) || !Number.isFinite(top)) return;

    const rect = panel.getBoundingClientRect();

    // Math.max guards the case where the panel is wider or taller than the
    // window: the upper bound would otherwise fall below the lower one.
    const maxLeft = Math.max(
        VIEWPORT_MARGIN,
        window.innerWidth - rect.width - VIEWPORT_MARGIN
    );
    const maxTop = Math.max(VIEWPORT_MARGIN, window.innerHeight - HEADER_KEEP_PX);

    panel.style.left = `${clamp(left, VIEWPORT_MARGIN, maxLeft)}px`;
    panel.style.top = `${clamp(top, VIEWPORT_MARGIN, maxTop)}px`;
}

let viewportWatcherAttached = false;

// One listener for the life of the page. It looks the panel up by id rather
// than closing over it, so a panel torn down and rebuilt does not leave a
// listener holding a detached node.
function watchViewportResize() {
    if (viewportWatcherAttached) return;
    viewportWatcherAttached = true;

    window.addEventListener("resize", () => {
        clampPanelIntoView(document.getElementById(PANEL_ID));
    });
}

// Re-apply a remembered size, capped to the window the panel is opening in —
// a size saved on a wide monitor must not hand a laptop a panel wider than
// its screen. Position is clamped separately, by clampPanelIntoView.
export function applySavedPanelSize(panel) {
    const state = loadPanelState();

    const width = toPositiveNumber(state.width);
    if (width) {
        const maxWidth = Math.max(MIN_WIDTH, window.innerWidth - VIEWPORT_MARGIN);
        panel.style.setProperty(WIDTH_VAR, `${clamp(width, MIN_WIDTH, maxWidth)}px`);
    }

    const height = toPositiveNumber(state.height);
    if (height) {
        const maxHeight = Math.max(MIN_HEIGHT, window.innerHeight - VIEWPORT_MARGIN);
        panel.style.setProperty(HEIGHT_VAR, `${clamp(height, MIN_HEIGHT, maxHeight)}px`);
    }
}

export function makePanelResizable(panel) {
    watchViewportResize();

    if (!panel) return;

    ensureStyles();

    let active = null;

    function onMouseMove(event) {
        if (!active) return;

        const { edges, startX, startY, startLeft, startTop, startWidth, startHeight } = active;

        if (edges.right) {
            const maxWidth = window.innerWidth - startLeft - VIEWPORT_MARGIN;
            const width = clamp(
                startWidth + (event.clientX - startX),
                MIN_WIDTH,
                Math.max(MIN_WIDTH, maxWidth)
            );
            panel.style.setProperty(WIDTH_VAR, `${width}px`);
        }

        if (edges.left) {
            // The right edge is the fixed one here: every pixel the width gains
            // is a pixel the panel moves left, and vice versa.
            const rightEdge = startLeft + startWidth;
            const maxWidth = rightEdge - VIEWPORT_MARGIN;
            const width = clamp(
                startWidth - (event.clientX - startX),
                MIN_WIDTH,
                Math.max(MIN_WIDTH, maxWidth)
            );

            panel.style.setProperty(WIDTH_VAR, `${width}px`);
            panel.style.left = `${rightEdge - width}px`;
        }

        if (edges.bottom) {
            const maxHeight = window.innerHeight - startTop - VIEWPORT_MARGIN;
            const height = clamp(
                startHeight + (event.clientY - startY),
                MIN_HEIGHT,
                Math.max(MIN_HEIGHT, maxHeight)
            );
            panel.style.setProperty(HEIGHT_VAR, `${height}px`);
        }

        event.preventDefault();
    }

    function onMouseUp() {
        if (!active) return;

        active.handle.classList.remove("is-resizing");
        active = null;
        document.body.style.userSelect = "";

        const rect = panel.getBoundingClientRect();
        savePanelState({
            width: rect.width,
            height: rect.height,
            // A left-edge drag moves the panel; store where it ended up so the
            // position and the size can never come back contradicting each other.
            left: panel.style.left,
            top: panel.style.top,
            right: "auto",
        });
    }

    for (const { name, edges } of HANDLES) {
        const handle = document.createElement("div");
        handle.className = `${HANDLE_CLASS} ${HANDLE_CLASS}--${name}`;

        handle.addEventListener("mousedown", (event) => {
            if (event.button !== 0) return;

            const rect = panel.getBoundingClientRect();

            // Pin the panel to left/top first. It may still be anchored by
            // `right`, and resizing an element by the edge it is anchored to
            // moves it instead of growing it. Same normalisation the drag does.
            panel.style.left = `${rect.left}px`;
            panel.style.top = `${rect.top}px`;
            panel.style.right = "auto";

            handle.classList.add("is-resizing");

            active = {
                edges,
                handle,
                startX: event.clientX,
                startY: event.clientY,
                startLeft: rect.left,
                startTop: rect.top,
                startWidth: rect.width,
                startHeight: rect.height,
            };

            document.body.style.userSelect = "none";
            event.preventDefault();
            event.stopPropagation();
        });

        panel.appendChild(handle);
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
}
