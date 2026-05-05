let stylesInjected = false;
let observerStarted = false;

const STORAGE_KEY = "cdd-location-picker-tree-width";
const DEFAULT_WIDTH = 250;
const MIN_WIDTH = 120;
const MAX_WIDTH = 520;
const TREE_PANEL_SELECTOR = [
    ".LocationPicker .tree-container",
    ".LocationPickerDialog .tree-container",
    ".LocationPicker .tree-root",
    ".LocationPickerDialog .tree-root",
].join(", ");

function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;

    const style = document.createElement("style");
    style.id = "cdd-location-picker-resize-style";

    style.textContent = `
    .LocationPicker .tree-container,
    .LocationPickerDialog .tree-container,
    .LocationPicker .tree-root,
    .LocationPickerDialog .tree-root {
        flex: 0 0 var(--cdd-location-tree-width, 320px) !important;
        width: var(--cdd-location-tree-width, 320px) !important;
        min-width: 220px !important;
        max-width: 520px !important;
        position: relative !important;
    }

    .LocationPicker ul.MuiSimpleTreeView-root,
    .LocationPickerDialog ul.MuiSimpleTreeView-root,
    .LocationPicker [role="tree"],
    .LocationPickerDialog [role="tree"] {
        width: 100% !important;
        min-width: 100% !important;
        max-width: none !important;
    }

    .LocationPicker [role="treeitem"] .location-picker-tree-item-content,
    .LocationPickerDialog [role="treeitem"] .location-picker-tree-item-content {
        padding-left: calc(var(--TreeView-itemDepth, 0) * 18px) !important;
    }

    .cdd-location-tree-resizer {
        position: absolute;
        top: 0;
        right: -4px;
        width: 8px;
        height: 100%;
        cursor: col-resize;
        z-index: 9999;
    }

    .cdd-location-tree-resizer:hover {
        background: rgba(0, 119, 204, 0.18);
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
            .querySelectorAll(TREE_PANEL_SELECTOR)
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