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

// A run's Run Definition prints its values in plain <td>s beside a <th>
// label, so it needs a bare `td` selector — kept in its OWN pair rather than
// added to VALUE_SELECTORS, where it would quietly make every table cell on
// the molecule pages copyable too.
//
// Nothing extra is needed to leave the editor alone: in edit mode those same
// cells hold inputs, and the interactive-content guard already refuses any
// cell containing one. The batch links (Probe, Protein) are refused by the
// same guard, which is what keeps them navigable.
const RUN_DEFINITION_CONTAINERS = [".protocolAnnotator"];
const RUN_DEFINITION_VALUE_SELECTOR = "tr > td";

// Sample header title (e.g. "IXX-NUC-0000009-001-SM003059"). Lives in a
// `.label-text` span that also contains the collapse/expand toggle button, so it
// can't go through the generic path (labels are excluded, and the button trips
// the interactive-content guard). Handled separately below.
const SAMPLE_NAME_CONTAINER = "#molecule-inventory_samples";
const SAMPLE_NAME_SELECTOR = ".sticky-header > .label-text";

// The page heading of a molecule (e.g. "PHA-0334382"): #pageHeader > h1 >
// span.title. Not a dd/value cell, so it needs its own selector; the text is
// clean (no nested controls), so the generic click path serves it.
const PAGE_TITLE_SELECTOR = "#pageHeader h1 > .title";

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

    document.querySelectorAll(PAGE_TITLE_SELECTOR).forEach((node) => nodes.push(node));

    RUN_DEFINITION_CONTAINERS.forEach((containerSelector) => {
        document.querySelectorAll(containerSelector).forEach((container) => {
            nodes.push(...container.querySelectorAll(RUN_DEFINITION_VALUE_SELECTOR));
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

    // <html>, not <body>: Turbo swaps <body> on in-app navigation.
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
    });

   log("MutationObserver started");
}