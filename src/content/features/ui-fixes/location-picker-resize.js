let stylesInjected = false;
let observerStarted = false;

const STORAGE_KEY = "cdd-location-picker-tree-width";
const DEFAULT_WIDTH = 320;
const MIN_WIDTH = 220;
const MAX_WIDTH = 520;

function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;

    const style = document.createElement("style");
    style.id = "cdd-location-picker-resize-style";

    style.textContent = `
    .LocationPicker .tree-container {
        flex: 0 0 var(--cdd-location-tree-width, 220px) !important;
        width: var(--cdd-location-tree-width, 220px) !important;
        min-width: 220px !important;
        max-width: 520px !important;
        position: relative;
    }

    .LocationPicker ul.MuiSimpleTreeView-root,
    .LocationPicker [role="tree"] {
        width: 100% !important;
        min-width: 100% !important;
        max-width: none !important;
    }

    .cdd-location-tree-resizer {
        position: absolute;
        top: 0;
        right: -4px;
        width: 8px;
        height: 100%;
        cursor: col-resize;
        z-index: 20;
    }
`;

    document.head.appendChild(style);
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function getSavedWidth() {
    const saved = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(saved) ? clamp(saved, MIN_WIDTH, MAX_WIDTH) : DEFAULT_WIDTH;
}

function applyWidth(treeContainer, width) {
    treeContainer.style.setProperty("--cdd-location-tree-width", `${width}px`);
}

function enhanceTreeContainer(treeContainer) {
    if (treeContainer.dataset.cddResizable === "true") return;
    treeContainer.dataset.cddResizable = "true";

    applyWidth(treeContainer, getSavedWidth());

    const resizer = document.createElement("div");
    resizer.className = "cdd-location-tree-resizer";
    treeContainer.appendChild(resizer);

    let startX = 0;
    let startWidth = 0;

    resizer.addEventListener("mousedown", (event) => {
        event.preventDefault();

        startX = event.clientX;
        startWidth = treeContainer.getBoundingClientRect().width;

        document.body.classList.add("cdd-location-resizing");

        function onMouseMove(moveEvent) {
            const delta = moveEvent.clientX - startX;
            const newWidth = clamp(startWidth + delta, MIN_WIDTH, MAX_WIDTH);

            applyWidth(treeContainer, newWidth);
            localStorage.setItem(STORAGE_KEY, String(newWidth));
        }

        function onMouseUp() {
            document.body.classList.remove("cdd-location-resizing");
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
        }

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
    });
}

export function initLocationPickerResize() {
    injectStyles();

    if (observerStarted) return;
    observerStarted = true;

    const observer = new MutationObserver(() => {
        document
            .querySelectorAll(".LocationPicker .tree-container")
            .forEach(enhanceTreeContainer);
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });

    document
        .querySelectorAll(".LocationPicker .tree-container")
        .forEach(enhanceTreeContainer);
}