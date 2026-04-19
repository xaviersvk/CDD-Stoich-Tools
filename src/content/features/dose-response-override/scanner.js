import { extractEditUrl, findOverrideLink, findPlotRoots } from "./dom.js";
import {
    doseResponseOverrideConfig as config,
    doseResponseOverrideState as state
} from "./state.js";
import { logOverride } from "../../utils/log.js";
import { createActionMenu } from "./menu.js";

let loggedPlotRootsOnce = false;

export function cleanupExistingUi(plotRoot) {
    if (!plotRoot) return;

    plotRoot
        .querySelectorAll(".cdd-dose-response-actionbar")
        .forEach((el) => el.remove());
}

export function enhancePlot(plotRoot) {
    const wrapperAttr = config.wrapperAttr;

    if (!plotRoot) return;
    if (!state.easyOverrideEnabled) return;
    if (plotRoot.hasAttribute(wrapperAttr)) return;

    const editUrl = extractEditUrl(plotRoot);
    if (!editUrl) return;

    const overrideLink = findOverrideLink(plotRoot);
    if (!overrideLink) return;

    cleanupExistingUi(plotRoot);

    const actionMenu = createActionMenu(plotRoot);

    overrideLink.classList.add("cdd-dose-response-override-link");
    overrideLink.parentNode.insertBefore(actionMenu, overrideLink.nextSibling);

    plotRoot.setAttribute(wrapperAttr, "1");
    logOverride("Action menu inserted.");
}

export function removeAllActionMenus() {
    document.querySelectorAll(".cdd-dose-response-actionbar").forEach((el) => {
        el.remove();
    });

    document
        .querySelectorAll(`[${config.wrapperAttr}]`)
        .forEach((plotRoot) => plotRoot.removeAttribute(config.wrapperAttr));
}

export function scanDoseResponseOverride() {
    const plots = findPlotRoots();

    if (!loggedPlotRootsOnce) {
        logOverride("Found plot roots:", plots.length);
        loggedPlotRootsOnce = true;
    }

    if (!state.easyOverrideEnabled) return;

    for (const plot of plots) {
        enhancePlot(plot);
    }
}