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


export function extractShowUrlFromReactProps(el) {
    const raw = el.getAttribute("react_props");
    if (!raw) return null;

    const decoded = decodeHtmlEntities(raw);
    const showMatch = decoded.match(/"showUrl":"([^"]+)"/);

    if (!showMatch) return null;
    return showMatch[1].replace(/\\u0026/g, "&");
}

export function extractShowUrlFromHiddenForms(scopeEl) {
    if (!scopeEl) return null;

    const form = scopeEl.querySelector('form[action*="/dose_response_plot/view"]');
    return form?.getAttribute("action") || null;
}

export function extractShowUrl(plotRoot) {
    return (
        extractShowUrlFromReactProps(plotRoot) ||
        extractShowUrlFromHiddenForms(plotRoot) ||
        null
    );
}

export function replacePlotRootFromHtml(currentPlotRoot, htmlText) {
    if (!currentPlotRoot || !htmlText) {
        throw new Error("Missing plot root or HTML.");
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, "text/html");

    const exactReplacement =
        doc.querySelector(`#${CSS.escape(currentPlotRoot.id)}`) ||
        doc.querySelector('div[id^="dose_response_plot_"]:not([id^="dose_response_plot_image_"])');

    if (exactReplacement) {
        const cloned = exactReplacement.cloneNode(true);
        currentPlotRoot.replaceWith(cloned);
        return cloned;
    }

    const fallbackHtml = (doc.body && doc.body.innerHTML || "").trim();
    if (fallbackHtml) {
        currentPlotRoot.innerHTML = fallbackHtml;
        return currentPlotRoot;
    }

    console.error("[CDD Override] Refresh HTML:", htmlText.slice(0, 2000));
    throw new Error("Refreshed HTML did not contain a usable replacement node.");
}


function findSeriesForPlot(json, plotRoot) {
    const raw = plotRoot.getAttribute("react_props");
    if (!raw) return json?.data_serieses?.[0] || null;

    const decoded = decodeHtmlEntities(raw);
    const match = decoded.match(/"batch_run_aggregate_row_ids":"([^"]+)"/);

    // fallback: zober prvú sériu
    return json?.data_serieses?.[0] || null;
}

function getPrimaryInterceptReadout(series) {
    return series?.intercept_readouts?.[0] || null;
}

function getFormattedInterceptValue(readout) {
    return (
        readout?.formatted_value?.value ||
        readout?.value?.value ||
        "—"
    );
}

export function updateInterceptCell(plotRoot, value) {
    const row = plotRoot.closest("tr");
    if (!row) return;

    const cells = row.querySelectorAll('td[id^="search_readout_"]');
    if (!cells.length) return;

    // teraz berieme poslednú hodnotovú bunku, lebo to tak máš v tom DOM screenshote
    const targetCell = cells[cells.length - 1];
    if (targetCell) {
        targetCell.textContent = value;
    }
}

export function updateOverrideLinkLabel(plotRoot, readout) {
    const link = findOverrideLink(plotRoot);
    if (!link) return;

    const selected = readout?.override?.selected;
    if (selected === null || selected === undefined) {
        link.title = "Override";
        return;
    }

    const selectedOption = (readout?.override?.values || []).find(
        (item) => item?.value === selected
    );

    if (selectedOption?.label) {
        link.title = selectedOption.label;
    }
}

export function updatePlotUiFromJson(plotRoot, json) {
    const series = findSeriesForPlot(json, plotRoot);
    if (!series) {
        throw new Error("No data series found in refreshed plot JSON.");
    }

    const readout = getPrimaryInterceptReadout(series);
    const formattedValue = getFormattedInterceptValue(readout);

    updateInterceptCell(plotRoot, formattedValue);
    updateOverrideLinkLabel(plotRoot, readout);

    // bonus: uložíme nové react_props ako raw cache
    try {
        plotRoot.setAttribute("data-cdd-refreshed-json", JSON.stringify(json));
    } catch (_) {
        // ignore
    }
}