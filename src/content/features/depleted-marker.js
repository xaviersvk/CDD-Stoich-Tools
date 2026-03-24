const OBSERVER_KEY = "__CDD_DEPLETED_OBSERVER__";

import { STATE } from "../state.js";

const STYLE_ID = "cdd-depleted-style";

function normalizeValue(value) {
    return String(value || "")
        .replace(/\s+/g, " ")
        .trim();
}

function getDepletedSet() {
    const raw = Array.isArray(STATE.depletedIdentifiers)
        ? STATE.depletedIdentifiers
        : [];

    return new Set(raw.map(normalizeValue).filter(Boolean));
}

export function ensureDepletedStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
.cdd-depleted-sample {
    opacity: 0.5 !important;
}

.cdd-depleted-sample,
.cdd-depleted-sample * {
    text-decoration: line-through !important;
    color: #9ca3af !important;
}
    `;

    document.documentElement.appendChild(style);
}

function wrapperMatchesDepleted(wrapper, depleted) {
    const text = normalizeValue(wrapper?.innerText || wrapper?.textContent || "");
    if (!text) return false;

    for (const id of depleted) {
        if (text.includes(id)) return true;
    }

    return false;
}

export function markDepletedSamplesInSelector() {
    ensureDepletedStyle();

    const depleted = getDepletedSet();

    document.querySelectorAll('input[type="radio"][value]').forEach((input) => {
        const value = normalizeValue(input.value);

        const wrapper =
            input.closest('[data-autotest-id="radio-button"]')?.parentElement ||
            input.closest('[data-component="Box"]') ||
            input.parentElement;

        if (!wrapper) return;

        const wrapperText = normalizeValue(wrapper.innerText || wrapper.textContent || "");
        const directMatch = depleted.has(value);
        const textMatch = !directMatch && wrapperMatchesDepleted(wrapper, depleted);
        const matched = directMatch || textMatch;


        wrapper.classList.toggle("cdd-depleted-sample", matched);
    });
}
export function startDepletedMarkerObserver() {
    if (window[OBSERVER_KEY]) return;

    let scheduled = false;

    const rerun = () => {
        if (scheduled) return;
        scheduled = true;

        requestAnimationFrame(() => {
            scheduled = false;
            markDepletedSamplesInSelector();
        });
    };

    const observer = new MutationObserver(() => {
        rerun();
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });

    window[OBSERVER_KEY] = observer;

    // prvé spustenie
    rerun();
}