let stylesInjected = false;

const DEBUG = true;

const CONTAINER_SELECTORS = [
    "#molecule-batches-container",
    "#molecule-overview",
    "#molecule-properties",
];

const VALUE_SELECTORS = [
    "dd",
    "td[data-editable-cell-label]",
    ".fieldValue",
    ".text-contents",
];

function log(...args) {
    if (DEBUG) console.log("[COPYABLE-FIELDS]", ...args);
}

function injectCopyableFieldStyles() {
    if (stylesInjected) return;
    stylesInjected = true;

    // log("Injecting styles");

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

async function copyText(text) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "-9999px";

    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    document.execCommand("copy");
    textarea.remove();
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
            log("Container not found:", containerSelector);
            return;
        }

        VALUE_SELECTORS.forEach((valueSelector) => {
            const found = Array.from(container.querySelectorAll(valueSelector));
            nodes.push(...found);
        });
    });

    return nodes;
}

export function enhanceCopyableFields() {
    // log("Running enhanceCopyableFields");

    injectCopyableFieldStyles();

    const nodes = findCopyableFieldNodes();

    // log("Found candidate count:", nodes.length);

    nodes.forEach((node) => {
        if (node.dataset.cddCopyableBound === "1") return;

        const text = getCopyableText(node);

        // log("Inspecting:", {
        //     tag: node.tagName,
        //     className: node.className,
        //     label: node.getAttribute("data-editable-cell-label"),
        //     text,
        //     node,
        // });

        if (!text) return;

        node.dataset.cddCopyableBound = "1";
        node.classList.add("cdd-copyable-field");
        node.title = "Click to copy";

        node.addEventListener("click", async (event) => {
            event.stopPropagation();

            const currentText = getCopyableText(node);
            if (!currentText) return;

            try {
                await copyText(currentText);
                markCopied(node);
                // log("Copied:", currentText);
            } catch (error) {
                markCopyError(node);
                console.warn("[COPYABLE-FIELDS] Copy failed:", error);
            }
        });

        // log("Attached listener:", node);
    });
}

export function observeCopyableFields() {
    enhanceCopyableFields();

    const observer = new MutationObserver(() => {
        enhanceCopyableFields();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });

    log("MutationObserver started");
}