// src/content/features/ui-fixes/filter-default.js

const DEBUG = false;
const OBSERVER_KEY = "__CDD_FILTER_DEFAULT_OBSERVER__";

function log(...args) {
    if (DEBUG) console.log("[FILTER DEFAULT]", ...args);
}

export function initFilterDefaultFix() {
    if (window[OBSERVER_KEY]) return;

    const observer = new MutationObserver(() => {
        scheduleFixFilters();
    });

    // <html>, not <body>: Turbo swaps <body> on in-app navigation, which would
    // silently kill this observer — the filter fix would then only work after a
    // hard refresh of the Inventory page.
    observer.observe(document.documentElement, {
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

    fixElnFilters();
    fixInventoryFilters();
}

/**
 * ELN filters - CDD custom SelectBox
 */
function fixElnFilters() {
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

        const lastFixedField = operatorInput.dataset.cddLastFixedField || "";

        if (lastFixedField === fieldName) return;

        operatorInput.dataset.cddLastFixedField = fieldName;

        selectSecondCddOption(operatorInput);
    });
}

/**
 * Inventory filters - MUI Select
 */
function fixInventoryFilters() {
    const filterItems = document.querySelectorAll(
        '[data-testid="filter-item"], .search-bar__filters__item'
    );

    filterItems.forEach((filterItem) => {
        const hiddenInput = filterItem.querySelector(
            'input[name="filterStyle"].MuiSelect-nativeInput'
        );

        const combobox = filterItem.querySelector(
            '.filter-style-select [role="combobox"]'
        );

        if (!hiddenInput || !combobox) return;

        const value = hiddenInput.value?.trim()?.toLowerCase();

        if (value !== "any") return;

        const fieldValue =
            filterItem.querySelector('input[name="search_field"]')?.value ||
            filterItem.querySelector('[name="filterField"]')?.value ||
            filterItem.querySelector('.filter-field-select [role="combobox"]')?.textContent?.trim() ||
            "";

        const lastFixedField = hiddenInput.dataset.cddLastFixedField || "";

        if (lastFixedField === fieldValue) return;

        hiddenInput.dataset.cddLastFixedField = fieldValue;

        selectSecondMuiOption(combobox, hiddenInput);
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
                element: label,
                text: label.textContent?.trim(),
                rect,
            };
        })
        .filter((item) => {
            if (!item.text) return false;
            if (item.rect.width === 0 || item.rect.height === 0) return false;

            return true;
        })
        .sort((a, b) => a.rect.top - b.rect.top);
}

function selectSecondCddOption(operatorInput) {
    isSelecting = true;

    const selectBox =
        operatorInput.closest('[data-component="SelectBox"]') ||
        operatorInput;

    log("ELN opening dropdown:", operatorInput.value);

    clickCenter(selectBox);

    window.setTimeout(() => {
        const options = getVisibleOptionLabels();

        log("ELN visible options:", options.map((o) => o.text));

        const second = options[1];

        if (!second) {
            log("ELN second option not found");
            isSelecting = false;
            return;
        }

        log("ELN clicking second option:", second.text);

        clickCenter(second.element);

        window.setTimeout(() => {
            log("ELN final value:", operatorInput.value);
            isSelecting = false;
        }, 300);
    }, 250);
}

function directMouseClick(element) {
    if (!element) return;

    const rect = element.getBoundingClientRect();

    const options = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        button: 0,
    };

    element.dispatchEvent(new MouseEvent("mousedown", options));
    element.dispatchEvent(new MouseEvent("mouseup", options));
    element.dispatchEvent(new MouseEvent("click", options));
}

function getVisibleMuiOptions() {
    return Array.from(
        document.querySelectorAll('[role="presentation"] li[role="option"][data-value], li.MuiMenuItem-root[role="option"][data-value]')
    )
        .map((option) => {
            const rect = option.getBoundingClientRect();

            return {
                element: option,
                text: option.textContent?.trim(),
                value: option.getAttribute("data-value"),
                rect,
            };
        })
        .filter((item) => {
            if (!item.text) return false;
            if (!item.value) return false;
            if (item.rect.width === 0 || item.rect.height === 0) return false;
            return true;
        })
        .sort((a, b) => a.rect.top - b.rect.top);
}

function selectSecondMuiOption(combobox, hiddenInput) {
    isSelecting = true;

    log("Inventory opening dropdown:", hiddenInput.value);

    combobox.focus();
    directMouseClick(combobox);

    window.setTimeout(() => {
        let options = getVisibleMuiOptions();

        log("Inventory visible options after click:", options.map((o) => `${o.text}=${o.value}`));

        if (!options.length) {
            log("Inventory menu not open, trying keyboard fallback");

            combobox.dispatchEvent(new KeyboardEvent("keydown", {
                bubbles: true,
                cancelable: true,
                key: "ArrowDown",
                code: "ArrowDown",
            }));
        }

        window.setTimeout(() => {
            options = getVisibleMuiOptions();

            log("Inventory visible options final:", options.map((o) => `${o.text}=${o.value}`));

            const second = options.find((option) => option.value !== "any");

            if (!second) {
                log("Inventory second option not found");
                isSelecting = false;
                return;
            }

            log("Inventory clicking option:", second.text, second.value);

            directMouseClick(second.element);

            window.setTimeout(() => {
                log("Inventory final value:", hiddenInput.value);
                isSelecting = false;
            }, 100);
        }, 100);
    }, 100);
}