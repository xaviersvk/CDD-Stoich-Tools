let stylesInjected = false;
let observerStarted = false;

const DEBUG = true;

function log(...args) {
    if (DEBUG) console.log("[LEFT-ELLIPSIS]", ...args);
}

function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;

    const style = document.createElement("style");
    style.id = "cdd-left-ellipsis-locations";

    style.textContent = `
    .cdd-left-ellipsis-location {
        direction: rtl !important;
        text-align: left !important;
        overflow: hidden !important;
        white-space: nowrap !important;
        text-overflow: ellipsis !important;
        display: block !important;
        min-width: 0 !important;
    }

    .cdd-left-ellipsis-location .text-contents {
        direction: rtl !important;
        text-align: left !important;
        overflow: hidden !important;
        white-space: nowrap !important;
        text-overflow: ellipsis !important;
        display: block !important;
        min-width: 0 !important;
    }
`;

    document.head.appendChild(style);
    log("Styles injected");
}

function isLocationLabel(labelElement) {
    const text = labelElement?.textContent?.trim().replace(":", "");
    return text === "Location";
}

function enhanceLocationEllipsis() {
    injectStyles();

    const tooltipNodes = document.querySelectorAll(".AutoEllipsisTooltip");

    log("AutoEllipsisTooltip count:", tooltipNodes.length);

    tooltipNodes.forEach((node) => {
        if (node.dataset.cddLeftEllipsisBound === "1") return;

        const previous = node.previousElementSibling;

        if (!previous?.classList?.contains("label-text")) return;
        if (!isLocationLabel(previous)) return;

        node.dataset.cddLeftEllipsisBound = "1";
        node.classList.add("cdd-left-ellipsis-location");

        log("Location ellipsis applied:", {
            text: node.textContent?.trim(),
            node,
        });
    });
}

export function injectLeftEllipsisForLocations() {
    enhanceLocationEllipsis();

    if (observerStarted) return;
    observerStarted = true;

    const observer = new MutationObserver(() => {
        enhanceLocationEllipsis();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });

    log("Observer started");
}