let stylesInjected = false;
let observerStarted = false;

const WRAPPER_ID = "cdd-depleted-samples-wrapper";

export function injectDepletedSampleStyles() {
    if (stylesInjected) return;
    stylesInjected = true;

    const style = document.createElement("style");
    style.id = "cdd-depleted-samples-collapse-style";
    style.textContent = `
        #${WRAPPER_ID} {
            margin: 16px 0;
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

        #${WRAPPER_ID} .cdd-depleted-samples-content {
            padding: 8px 14px 14px;
            background: white;
        }

        #${WRAPPER_ID} .SampleDataView,
        #${WRAPPER_ID} .container-section-container {
            margin-bottom: 12px;
        }
    `;

    document.head.appendChild(style);
}

function findSampleContainerFromDepletedTable(table) {
    const sampleBlock =
        table.closest(".MuiCollapse-root")?.parentElement ||
        table.closest(".MuiPaper-root");

    if (!sampleBlock) return null;

    const hasDepletedTable = sampleBlock.querySelector(
        "table.SimpleDataTable.depleted"
    );

    if (!hasDepletedTable) return null;

    return sampleBlock;
}

export function collapseDepletedSamples() {
    injectDepletedSampleStyles();

    const depletedTables = Array.from(
        document.querySelectorAll("table.SimpleDataTable.depleted")
    );

    if (!depletedTables.length) return;

    const sampleBlocks = depletedTables
        .map(findSampleContainerFromDepletedTable)
        .filter(Boolean)
        .filter((block) => !block.closest(`#${WRAPPER_ID}`));

    if (!sampleBlocks.length) return;

    let wrapper = document.getElementById(WRAPPER_ID);

    if (!wrapper) {
        wrapper = document.createElement("details");
        wrapper.id = WRAPPER_ID;
        wrapper.open = false;

        const summary = document.createElement("summary");
        summary.textContent = `Depleted samples (${sampleBlocks.length})`;

        const content = document.createElement("div");
        content.className = "cdd-depleted-samples-content";

        wrapper.appendChild(summary);
        wrapper.appendChild(content);

        const firstBlock = sampleBlocks[0];
        firstBlock.parentNode.insertBefore(wrapper, firstBlock);
    }

    const content = wrapper.querySelector(".cdd-depleted-samples-content");
    const summary = wrapper.querySelector("summary");

    sampleBlocks.forEach((block) => {
        content.appendChild(block);
    });

    const count = content.children.length;
    summary.textContent = `Depleted samples (${count})`;
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
    });

    run();
}