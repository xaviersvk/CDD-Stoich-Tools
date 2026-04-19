import { doseResponseOverrideConfig, doseResponseOverrideState as state } from "./state.js";
import { viewUrlToEditUrl } from "../../utils/url.js";
import { decodeHtmlEntities } from "../../utils/dom.js";
import { removeAllActionMenus, scanDoseResponseOverride } from "./scanner.js";

export function extractEditUrlFromReactProps(el) {
    const raw = el.getAttribute("react_props");
    if (!raw) return null;

    const decoded = decodeHtmlEntities(raw);

    const editMatch = decoded.match(/"editUrl":"([^"]+)"/);
    if (editMatch) {
        return editMatch[1].replace(/\\u0026/g, "&");
    }

    const showMatch = decoded.match(/"showUrl":"([^"]+)"/);
    if (showMatch) {
        return viewUrlToEditUrl(showMatch[1].replace(/\\u0026/g, "&"));
    }

    return null;
}

export function extractEditUrlFromHiddenForms(scopeEl) {
    if (!scopeEl) return null;

    const forms = scopeEl.querySelectorAll('form[action*="/dose_response_plot/view"]');
    for (const form of forms) {
        const action = form.getAttribute("action");
        if (action) return viewUrlToEditUrl(action);
    }

    return null;
}

export function extractEditUrl(plotRoot) {
    return (
        extractEditUrlFromReactProps(plotRoot) ||
        extractEditUrlFromHiddenForms(plotRoot) ||
        null
    );
}

export function findPlotRoots() {
    return Array.from(
        document.querySelectorAll('div[id^="dose_response_plot_"]:not([id^="dose_response_plot_image_"])')
    );
}

export function findOverrideLink(plotRoot) {
    const links = plotRoot.querySelectorAll("a");

    for (const link of links) {
        const text = (link.textContent || "").trim();
        if (text.includes("Flag outliers") && text.includes("Override")) {
            return link;
        }
    }

    return null;
}

export function findSearchResultsActions() {
    return document.querySelector("#search_results_actions_links");
}

export function updateEasyOverrideToggleUi(button) {
    if (!button) return;

    const enabled = !!state.easyOverrideEnabled;
    const desiredText = enabled ? "Easy Override: ON" : "Easy Override: OFF";

    if (button.textContent !== desiredText) {
        button.textContent = desiredText;
    }

    button.classList.toggle("enabled", enabled);
}

export function createEasyOverrideToggle() {
    const button = document.createElement("a");
    button.href = "#";
    button.setAttribute(doseResponseOverrideConfig.topbarToggleAttr, "1");
    button.className = "search_results_action_link cdd-easy-override-toggle";

    updateEasyOverrideToggleUi(button);

    button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        state.easyOverrideEnabled = !state.easyOverrideEnabled;
        updateEasyOverrideToggleUi(button);

        if (!state.easyOverrideEnabled) {
            removeAllActionMenus();
        } else {
            scanDoseResponseOverride();
        }
    });

    return button;
}

export function ensureEasyOverrideToggle() {
    const container = findSearchResultsActions();
    if (!container) return;

    const existing = container.querySelector(
        `[${doseResponseOverrideConfig.topbarToggleAttr}]`
    );
    if (existing) {
        updateEasyOverrideToggleUi(existing);
        return;
    }

    const separator = document.createElement("span");
    separator.className = "cdd-separator";

    const toggle = createEasyOverrideToggle();

    container.appendChild(separator);
    container.appendChild(toggle);
}