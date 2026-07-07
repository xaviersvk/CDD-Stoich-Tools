import { copyText } from "../../utils/clipboard.js";

let stylesInjected = false;

const DEBUG = false

const CONTAINER_SELECTORS = [
    "#molecule-batches-container",
    "#molecule-overview",
    "#molecule-properties",
    "#molecule-inventory_samples",
];

const VALUE_SELECTORS = [
    "dd",
    "td[data-editable-cell-label]",
    ".fieldValue",
    ".text-contents",
    ".value-text",
];

// Sample header title (e.g. "IXX-NUC-0000009-001-SM003059"). Lives in a
// `.label-text` span that also contains the collapse/expand toggle button, so it
// can't go through the generic path (labels are excluded, and the button trips
// the interactive-content guard). Handled separately below.
const SAMPLE_NAME_CONTAINER = "#molecule-inventory_samples";
const SAMPLE_NAME_SELECTOR = ".sticky-header > .label-text";

function log(...args) {
    if (DEBUG) console.log("[COPYABLE-FIELDS]", ...args);
}

function injectCopyableFieldStyles() {
    if (stylesInjected) return;
    stylesInjected = true;


    const style = document.createElement("style");
    style.id = "cdd-copyable-fields-style";
    style.textContent = `
        .cdd-copyable-field {
            cursor: copy;
            border-radius: 4px;
            transition: background-color 0.15s ease;
        }

        .cdd-copyable-field:hover {
            background-color: rgba(0, 119, 204, 0.08);
        }

        .cdd-copyable-field.cdd-copy-ok {
            background-color: rgba(34, 197, 94, 0.18);
        }

        .cdd-copyable-field.cdd-copy-error {
            background-color: rgba(239, 68, 68, 0.18);
        }
    `;

    document.head.appendChild(style);
}

function markCopied(element) {
    element.classList.add("cdd-copy-ok");

    window.setTimeout(() => {
        element.classList.remove("cdd-copy-ok");
    }, 500);
}

function markCopyError(element) {
    element.classList.add("cdd-copy-error");

    window.setTimeout(() => {
        element.classList.remove("cdd-copy-error");
    }, 800);
}

function hasInteractiveContent(element) {
    return !!element.querySelector("a, button, input, textarea, select");
}

function getCopyableText(element) {
    if (!element) return "";

    if (hasInteractiveContent(element)) {
        return "";
    }

    const preferredTextElement = element.querySelector(".text-contents");
    const sourceElement = preferredTextElement ?? element;

    const text = sourceElement.textContent?.trim() ?? "";

    if (!text) return "";
    if (text === "—" || text === "-") return "";

    return text;
}

function findCopyableFieldNodes() {
    const nodes = [];

    CONTAINER_SELECTORS.forEach((containerSelector) => {
        const container = document.querySelector(containerSelector);

        if (!container) {
            return;
        }

        VALUE_SELECTORS.forEach((valueSelector) => {
            const found = Array.from(container.querySelectorAll(valueSelector));
            nodes.push(...found);
        });
    });

    return nodes;
}

// Reads only the direct text of the sample-name span, skipping the nested
// toggle button (which contains an SVG, no text).
function getSampleNameText(node) {
    let text = "";

    node.childNodes.forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
            text += child.textContent;
        }
    });

    return text.trim();
}

function enhanceSampleNames() {
    const container = document.querySelector(SAMPLE_NAME_CONTAINER);
    if (!container) return;

    const nameNodes = Array.from(container.querySelectorAll(SAMPLE_NAME_SELECTOR));

    nameNodes.forEach((node) => {
        if (node.dataset.cddCopyableBound === "1") return;

        const text = getSampleNameText(node);
        if (!text) return;

        node.dataset.cddCopyableBound = "1";
        node.classList.add("cdd-copyable-field");
        node.title = "Click to copy";

        node.addEventListener("click", async (event) => {
            // A click on the collapse/expand toggle should only collapse.
            if (event.target.closest("button")) return;

            event.stopPropagation();

            const currentText = getSampleNameText(node);
            if (!currentText) return;

            const ok = await copyText(currentText);
            if (ok) {
                markCopied(node);
            } else {
                markCopyError(node);
            }
        });
    });
}

export function enhanceCopyableFields() {


    injectCopyableFieldStyles();

    enhanceSampleNames();

    const nodes = findCopyableFieldNodes();



    nodes.forEach((node) => {
        if (node.dataset.cddCopyableBound === "1") return;

        const text = getCopyableText(node);



        if (!text) return;

        node.dataset.cddCopyableBound = "1";
        node.classList.add("cdd-copyable-field");
        node.title = "Click to copy";

        node.addEventListener("click", async (event) => {
            event.stopPropagation();

            const currentText = getCopyableText(node);
            if (!currentText) return;

            const ok = await copyText(currentText);
            if (ok) {
                markCopied(node);
            } else {
                markCopyError(node);
            }
        });


    });
}

let enhanceTimer = null;

export function observeCopyableFields() {
    enhanceCopyableFields();

    const observer = new MutationObserver(() => {
        window.clearTimeout(enhanceTimer);

        enhanceTimer = window.setTimeout(() => {
            enhanceCopyableFields();
        }, 200);
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });

   log("MutationObserver started");
}