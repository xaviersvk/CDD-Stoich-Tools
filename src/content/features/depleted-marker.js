// content/features/depleted-marker.js
import { STATE } from "../state.js";

const STYLE_ID = "cdd-stoich-depleted-style";
const MARK_ATTR = "data-cdd-depleted-marked";

function normalizeText(value) {
    return String(value || "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}

function getDepletedSet() {
    return new Set(
        (STATE.depletedIdentifiers || [])
            .map(normalizeText)
            .filter(Boolean)
    );
}

function textContainsDepletedIdentifier(text, depletedSet) {
    const normalized = normalizeText(text);
    if (!normalized) return false;

    for (const depletedId of depletedSet) {
        if (!depletedId) continue;
        if (normalized.includes(depletedId)) return true;
    }

    return false;
}

function markElement(el) {
    if (!el || el.getAttribute(MARK_ATTR) === "1") return;

    el.setAttribute(MARK_ATTR, "1");
    el.classList.add("cdd-stoich-depleted");

    // jemný fallback inline styling, keby CSS class nebola aplikovaná dosť vysoko
    el.style.textDecoration = "line-through";
    el.style.textDecorationThickness = "2px";
    el.style.textDecorationColor = "#b91c1c";
    el.style.opacity = "0.72";
}

function clearOldMarks() {
    document.querySelectorAll(`[${MARK_ATTR}="1"]`).forEach((el) => {
        el.removeAttribute(MARK_ATTR);
        el.classList.remove("cdd-stoich-depleted");

        el.style.textDecoration = "";
        el.style.textDecorationThickness = "";
        el.style.textDecorationColor = "";
        el.style.opacity = "";
    });
}

function collectCandidateElements() {
    const selectors = [
        "label",
        "button",
        "[role='button']",
        "[role='option']",
        "[role='radio']",
        "[role='menuitem']",
        ".inventory-sample",
        ".sample",
        ".sample-row",
        ".sample-option",
        ".Select-option",
        ".react-select__option",
        "[data-testid*='sample']",
        "[data-testid*='inventory']",
        "[class*='sample']",
        "[class*='inventory']"
    ];

    const out = [];
    const seen = new Set();

    selectors.forEach((selector) => {
        document.querySelectorAll(selector).forEach((el) => {
            if (seen.has(el)) return;
            seen.add(el);
            out.push(el);
        });
    });

    return out;
}

function findBestMarkTarget(el) {
    if (!el) return null;

    return (
        el.closest("label") ||
        el.closest("[role='option']") ||
        el.closest("[role='radio']") ||
        el.closest("button") ||
        el
    );
}

export function ensureDepletedStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        .cdd-stoich-depleted {
            text-decoration: line-through !important;
            text-decoration-thickness: 2px !important;
            text-decoration-color: #b91c1c !important;
            opacity: 0.72 !important;
        }

        .cdd-stoich-depleted * {
            text-decoration: inherit !important;
        }
    `;

    document.head.appendChild(style);
}

export function markDepletedSamplesInSelector() {
    ensureDepletedStyle();
    clearOldMarks();

    const depletedSet = getDepletedSet();
    if (!depletedSet.size) return;

    const candidates = collectCandidateElements();

    candidates.forEach((el) => {
        const text = el.innerText || el.textContent || "";
        if (!textContainsDepletedIdentifier(text, depletedSet)) return;

        const target = findBestMarkTarget(el);
        markElement(target);
    });
}