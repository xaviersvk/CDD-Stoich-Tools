let observerStarted = false;
let scheduled = false;
let isApplying = false;

const DEBUG = true;
const MAX_LENGTH = 40;

function log(...args) {
    if (DEBUG) console.log("[LEFT-ELLIPSIS]", ...args);
}

function shortenLocation(location, maxLength = MAX_LENGTH) {
    if (!location || location.length <= maxLength) return location;
    return "…" + location.slice(-maxLength);
}

function normalizeLabel(text) {
    return text?.trim().replace(":", "") ?? "";
}

function findLocationValueNodes() {
    const result = [];

    document.querySelectorAll(".label-text").forEach((label) => {
        if (normalizeLabel(label.textContent) !== "Location") return;

        let next = label.nextElementSibling;

        while (next) {
            if (next.classList?.contains("AutoEllipsisTooltip")) {
                result.push(next);
                break;
            }

            next = next.nextElementSibling;
        }
    });

    return result;
}

function applyLeftLocationText() {
    if (isApplying) return;
    isApplying = true;

    try {
        const nodes = findLocationValueNodes();

        log("location value nodes:", nodes.length);

        nodes.forEach((node) => {
            const textElement = node.querySelector(".text-contents");
            if (!textElement) {
                log("skip: no .text-contents", node);
                return;
            }

            const current = textElement.textContent?.trim() ?? "";

            if (!node.dataset.cddOriginalLocation) {
                node.dataset.cddOriginalLocation = current;
            }

            const original = node.dataset.cddOriginalLocation;
            const shortened = shortenLocation(original);

            log("location candidate:", {
                current,
                original,
                shortened,
                node,
            });

            if (!original || current === shortened) return;

            node.setAttribute("title", original);
            textElement.textContent = shortened;

            log("applied:", shortened);
        });
    } finally {
        isApplying = false;
    }
}

function scheduleApply() {
    if (scheduled || isApplying) return;

    scheduled = true;

    window.requestAnimationFrame(() => {
        scheduled = false;
        applyLeftLocationText();
    });
}

export function injectLeftEllipsisForLocations() {
    applyLeftLocationText();

    if (observerStarted) return;
    observerStarted = true;

    const observer = new MutationObserver(scheduleApply);

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });

    log("observer started");
}