let stylesInjected = false;
let observerStarted = false;

const WRAPPER_ID = "cdd-consumed-batches-wrapper";
const CONSUMED_CLASS = "cdd-consumed-batch-block";
const HIDDEN_CLASS = "cdd-consumed-batch-hidden";

function isMoleculeBatchesPage() {
    return (
        window.location.pathname.includes("/molecules/") &&
        window.location.hash === "#molecule-batches"
    );
}

export function injectConsumedBatchStyles() {
    if (stylesInjected) return;
    stylesInjected = true;

    const style = document.createElement("style");
    style.id = "cdd-consumed-batches-collapse-style";
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

.${CONSUMED_CLASS} {
    margin: 0 !important;
    padding: 12px 14px !important;
    border-left: 1px solid #d0d7de !important;
    border-right: 1px solid #d0d7de !important;
    background: #fff !important;
}

.${CONSUMED_CLASS} > * {
    background: #f6f6f6 !important;
    border: 1px solid #e1e4e8 !important;
    padding: 12px 14px !important;
}

    .${CONSUMED_CLASS}:last-of-type {
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

function getBatchBlockFromConsumedCell(cell) {
    return cell.closest(
        '.editableData.subcontainer[id^="list-batch-"]'
    );
}

function getConsumedBatchBlocks() {
    if (!isMoleculeBatchesPage()) return [];

    const consumedCells = Array.from(
        document.querySelectorAll(
            '#molecule-batches td[data-editable-cell-label="Consumed"]'
        )
    ).filter((cell) => {
        return cell.textContent.trim().toLowerCase() === "yes";
    });

    return Array.from(
        new Set(
            consumedCells
                .map(getBatchBlockFromConsumedCell)
                .filter(Boolean)
        )
    );
}

function cleanupOldMarks(currentBlocks) {
    const currentSet = new Set(currentBlocks);

    document.querySelectorAll(`.${CONSUMED_CLASS}`).forEach((block) => {
        if (!currentSet.has(block)) {
            block.classList.remove(CONSUMED_CLASS);
            block.classList.remove(HIDDEN_CLASS);
        }
    });
}

function createWrapper() {
    const wrapper = document.createElement("details");
    wrapper.id = WRAPPER_ID;
    wrapper.open = false;

    const summary = document.createElement("summary");
    summary.textContent = "Consumed batches (0)";

    wrapper.appendChild(summary);

    wrapper.addEventListener("toggle", updateHiddenState);

    return wrapper;
}

function updateHiddenState() {
    const wrapper = document.getElementById(WRAPPER_ID);

    const shouldHide = wrapper && !wrapper.open;

    document.querySelectorAll(`.${CONSUMED_CLASS}`).forEach((block) => {
        block.classList.toggle(HIDDEN_CLASS, shouldHide);
    });
}

function placeWrapperBeforeFirstConsumedBlock(wrapper, firstBlock) {
    if (!firstBlock?.parentNode) return;

    if (wrapper.parentNode !== firstBlock.parentNode) {
        firstBlock.parentNode.insertBefore(wrapper, firstBlock);
        return;
    }

    if (wrapper.nextElementSibling !== firstBlock) {
        firstBlock.parentNode.insertBefore(wrapper, firstBlock);
    }
}

export function collapseConsumedBatches() {
    if (!isMoleculeBatchesPage()) {
        document.getElementById(WRAPPER_ID)?.remove();
        return;
    }

    injectConsumedBatchStyles();

    const consumedBlocks = getConsumedBatchBlocks();

    cleanupOldMarks(consumedBlocks);

    let wrapper = document.getElementById(WRAPPER_ID);

    if (!consumedBlocks.length) {
        wrapper?.remove();
        return;
    }

    if (!wrapper) {
        wrapper = createWrapper();
    }

    placeWrapperBeforeFirstConsumedBlock(
        wrapper,
        consumedBlocks[0]
    );

    const summary = wrapper.querySelector("summary");

    summary.textContent =
        `Consumed batches (${consumedBlocks.length})`;

    consumedBlocks.forEach((block) => {
        block.classList.add(CONSUMED_CLASS);
    });

    updateHiddenState();
}

export function watchConsumedBatches() {
    if (observerStarted) return;

    observerStarted = true;

    let scheduled = false;

    const run = () => {
        if (scheduled) return;

        scheduled = true;

        requestAnimationFrame(() => {
            scheduled = false;
            collapseConsumedBatches();
        });
    };

    const observer = new MutationObserver(run);

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["class"],
    });

    window.addEventListener("hashchange", run);

    run();
}