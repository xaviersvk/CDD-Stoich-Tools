let stylesInjected = false;
let observerStarted = false;

const WRAPPER_ID = "cdd-depleted-samples-wrapper";
const DEPLETED_CLASS = "cdd-depleted-sample-block";
const HIDDEN_CLASS = "cdd-depleted-sample-hidden";

export function injectDepletedSampleStyles() {
    if (stylesInjected) return;
    stylesInjected = true;

    const style = document.createElement("style");
    style.id = "cdd-depleted-samples-collapse-style";
    style.textContent = `
        #${WRAPPER_ID} {
            margin: 16px 0 0;
            border: 1px solid #d0d7de;
            border-radius: 6px;
            background: #f6f8fa;
        }

        #${WRAPPER_ID} > summary {
            cursor: pointer;
            padding: 10px 14px;
            font-weight: 600;
            user-select: none;
        }

        .${HIDDEN_CLASS} {
            display: none !important;
        }

        .${DEPLETED_CLASS} {
            margin: 0 !important;
            padding: 12px 14px !important;
            border-left: 1px solid #d0d7de !important;
            border-right: 1px solid #d0d7de !important;
            background: white !important;
        }

        .${DEPLETED_CLASS}:last-of-type {
            border-bottom: 1px solid #d0d7de !important;
            border-radius: 0 0 6px 6px !important;
            margin-bottom: 16px !important;
        }

        #${WRAPPER_ID}:not([open]) {
            margin-bottom: 16px;
        }

        #${WRAPPER_ID}[open] {
            border-radius: 6px 6px 0 0;
            border-bottom: none;
        }
    `;

    document.head.appendChild(style);
}

function findSampleContainerFromRestoreButton(button) {
    return (
        button.closest(".MuiCollapse-root")?.parentElement ||
        button.closest(".MuiPaper-root") ||
        button.closest(".SampleDataView") ||
        button.closest(".container-section-container")
    );
}

function getDepletedSampleBlocks() {
    const restoreButtons = Array.from(
        document.querySelectorAll(
            '[aria-label="Restore sample"], [data-title="Restore sample"]'
        )
    );

    return Array.from(
        new Set(
            restoreButtons
                .map(findSampleContainerFromRestoreButton)
                .filter(Boolean)
        )
    );
}

function cleanupOldMarks(currentBlocks) {
    const currentSet = new Set(currentBlocks);

    document.querySelectorAll(`.${DEPLETED_CLASS}`).forEach((block) => {
        if (!currentSet.has(block)) {
            block.classList.remove(DEPLETED_CLASS);
            block.classList.remove(HIDDEN_CLASS);
        }
    });
}

function createWrapper() {
    const wrapper = document.createElement("details");
    wrapper.id = WRAPPER_ID;
    wrapper.open = false;

    const summary = document.createElement("summary");
    summary.textContent = "Depleted samples (0)";

    wrapper.appendChild(summary);

    wrapper.addEventListener("toggle", updateHiddenState);

    return wrapper;
}

function updateHiddenState() {
    const wrapper = document.getElementById(WRAPPER_ID);
    const shouldHide = wrapper && !wrapper.open;

    document.querySelectorAll(`.${DEPLETED_CLASS}`).forEach((block) => {
        block.classList.toggle(HIDDEN_CLASS, shouldHide);
    });
}

function placeWrapperBeforeFirstDepletedBlock(wrapper, firstBlock) {
    if (!firstBlock?.parentNode) return;

    if (wrapper.parentNode !== firstBlock.parentNode) {
        firstBlock.parentNode.insertBefore(wrapper, firstBlock);
        return;
    }

    if (wrapper.nextElementSibling !== firstBlock) {
        firstBlock.parentNode.insertBefore(wrapper, firstBlock);
    }
}

export function collapseDepletedSamples() {
    injectDepletedSampleStyles();

    const depletedBlocks = getDepletedSampleBlocks();

    cleanupOldMarks(depletedBlocks);

    let wrapper = document.getElementById(WRAPPER_ID);

    if (!depletedBlocks.length) {
        wrapper?.remove();
        return;
    }

    if (!wrapper) {
        wrapper = createWrapper();
    }

    placeWrapperBeforeFirstDepletedBlock(wrapper, depletedBlocks[0]);

    const summary = wrapper.querySelector("summary");
    summary.textContent = `Depleted samples (${depletedBlocks.length})`;

    depletedBlocks.forEach((block) => {
        block.classList.add(DEPLETED_CLASS);
    });

    updateHiddenState();
}

export function watchDepletedSamples() {
    if (observerStarted) return;
    observerStarted = true;

    let scheduled = false;

    const run = () => {
        if (scheduled) return;
        scheduled = true;

        requestAnimationFrame(() => {
            scheduled = false;
            collapseDepletedSamples();
        });
    };

    const observer = new MutationObserver(run);

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["aria-label", "data-title", "class"],
    });

    run();
}