// src/content/features/ui-fixes/filter-default.js

const DEBUG = true;
const OBSERVER_KEY = "__CDD_FILTER_DEFAULT_OBSERVER__";

function log(...args) {
    if (DEBUG) console.log("[FILTER DEFAULT]", ...args);
}

export function initFilterDefaultFix() {
    if (window[OBSERVER_KEY]) return;

    const observer = new MutationObserver(() => {
        scheduleFixFilters();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });

    window[OBSERVER_KEY] = observer;
    scheduleFixFilters();
}

let fixTimer = null;
let isSelecting = false;

function scheduleFixFilters() {
    if (isSelecting) return;

    window.clearTimeout(fixTimer);
    fixTimer = window.setTimeout(fixFilters, 250);
}

function fixFilters() {
    if (isSelecting) return;

    const filterItems = document.querySelectorAll('[data-testid="filter-item"]');

    filterItems.forEach((filterItem) => {
        const inputs = Array.from(
            filterItem.querySelectorAll('[data-autotest-id="select-box-input"]')
        );

        if (inputs.length < 2) return;

        const fieldInput = inputs[0];
        const operatorInput = inputs[1];

        const fieldName = fieldInput.value?.trim();
        const operatorValue = operatorInput.value?.trim();

        if (!fieldName) return;
        if (operatorValue !== "Any value") return;

        if (operatorInput.dataset.cddDefaultOperatorAttempted === "1") return;
        operatorInput.dataset.cddDefaultOperatorAttempted = "1";

        selectSecondOption(operatorInput);
    });
}

function clickAt(x, y) {
    const target = document.elementFromPoint(x, y);
    if (!target) return;

    const options = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y,
        button: 0,
    };

    target.dispatchEvent(new MouseEvent("mousedown", options));
    target.dispatchEvent(new MouseEvent("mouseup", options));
    target.dispatchEvent(new MouseEvent("click", options));
}

function clickCenter(element) {
    const rect = element.getBoundingClientRect();
    clickAt(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2
    );
}

function getVisibleOptionLabels() {
    return Array.from(
        document.querySelectorAll('[data-autotest-id="option-label"]')
    )
        .map((label) => {
            const rect = label.getBoundingClientRect();
            return {
                label,
                text: label.textContent?.trim(),
                rect,
            };
        })
        .filter((item) => {
            if (!item.text) return false;
            return !(item.rect.width === 0 || item.rect.height === 0);

        })
        .sort((a, b) => a.rect.top - b.rect.top);
}

function selectSecondOption(operatorInput) {
    isSelecting = true;

    const selectBox =
        operatorInput.closest('[data-component="SelectBox"]') ||
        operatorInput;

    log("opening dropdown for:", operatorInput.value);

    clickCenter(selectBox);

    window.setTimeout(() => {
        const options = getVisibleOptionLabels();

        log("visible option labels:", options.map((o) => o.text));

        const second = options[1];

        if (!second) {
            log("second option not found");
            isSelecting = false;
            return;
        }

        log("clicking second option:", second.text);

        clickCenter(second.label);

        window.setTimeout(() => {
            log("final value:", operatorInput.value);
            isSelecting = false;
        }, 300);
    }, 250);
}