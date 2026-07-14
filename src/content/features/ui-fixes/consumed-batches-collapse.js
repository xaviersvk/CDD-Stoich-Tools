let stylesInjected = false;
let observerStarted = false;

const WRAPPER_ID = "cdd-consumed-batches-wrapper";
const CONSUMED_CLASS = "cdd-consumed-batch-block";

function isMoleculeBatchesPage() {
    return (
        window.location.pathname.includes("/molecules/") &&
        window.location.hash === "#molecule-batches"
    );
}

function restoreConsumedBlocks() {
    const wrapper = document.getElementById(WRAPPER_ID);
    if (!wrapper) return;

    const container = getBatchContainer();
    const body = wrapper.querySelector(".cdd-consumed-batches-body");
    const blocks = Array.from(body?.querySelectorAll(`.${CONSUMED_CLASS}`) || []);

    blocks.forEach((block) => {
        block.classList.remove(CONSUMED_CLASS);
        container?.appendChild(block);
    });

    wrapper.remove();
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

        #${WRAPPER_ID} .cdd-consumed-batches-header {
            cursor: pointer;
            padding: 10px 14px;
            font-weight: 600;
            user-select: none;
        }

        #${WRAPPER_ID} .cdd-consumed-batches-body {
            display: none;
        }

        #${WRAPPER_ID}[data-open="true"] .cdd-consumed-batches-body {
            display: block;
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
    `;

    document.head.appendChild(style);
}

function getBatchContainer() {
    return document.getElementById("molecule-batches-container");
}

function getBatchBlockFromConsumedCell(cell) {
    return cell.closest('.editableData.subcontainer[id^="list-batch-"]');
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
        }
    });
}

function createWrapper() {
    const wrapper = document.createElement("div");
    wrapper.id = WRAPPER_ID;
    wrapper.dataset.open = "false";

    const header = document.createElement("div");
    header.className = "cdd-consumed-batches-header";

    const body = document.createElement("div");
    body.className = "cdd-consumed-batches-body";

    header.addEventListener("click", () => {
        const isOpen = wrapper.dataset.open === "true";
        wrapper.dataset.open = String(!isOpen);
        updateHeaderText(wrapper);
    });

    wrapper.appendChild(header);
    wrapper.appendChild(body);

    return wrapper;
}

function updateHeaderText(wrapper) {
    const header = wrapper.querySelector(".cdd-consumed-batches-header");
    if (!header) return;

    const title = header.dataset.title || "Consumed batches (0)";
    const arrow = wrapper.dataset.open === "true" ? "▾" : "▸";

    header.textContent = `${arrow} ${title}`;
}

function placeWrapperAtEndOfBatchContainer(wrapper) {
    const container = getBatchContainer();
    if (!container) return;

    if (wrapper.parentNode !== container) {
        container.appendChild(wrapper);
    }
}

function moveConsumedBlocksIntoWrapper(wrapper, blocks) {
    const body = wrapper.querySelector(".cdd-consumed-batches-body");
    if (!body) return;

    blocks.forEach((block) => {
        if (block.parentNode !== body) {
            body.appendChild(block);
        }
    });
}

export function collapseConsumedBatches() {
    if (!isMoleculeBatchesPage()) {
        restoreConsumedBlocks();
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

    placeWrapperAtEndOfBatchContainer(wrapper);

    consumedBlocks.forEach((block) => {
        block.classList.add(CONSUMED_CLASS);
    });

    moveConsumedBlocksIntoWrapper(wrapper, consumedBlocks);

    const header = wrapper.querySelector(".cdd-consumed-batches-header");
    header.dataset.title = `Consumed batches (${consumedBlocks.length})`;

    updateHeaderText(wrapper);
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

    // <html>, not <body>: Turbo swaps <body> on in-app navigation.
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["class"],
    });

    window.addEventListener("hashchange", () => {
        if (!isMoleculeBatchesPage()) {
            restoreConsumedBlocks();
            return;
        }

        setTimeout(run, 100);
        setTimeout(run, 500);
        setTimeout(run, 1200);
    });

    run();
}