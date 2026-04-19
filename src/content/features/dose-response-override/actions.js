import { buildFormBody, fetchJson, fetchText } from "../../api/cdd-api.js";
import {absoluteUrl, editUrlToPutUrl, viewUrlToJsonUrl} from "../../utils/url.js";
import {extractEditUrl, extractShowUrl, replacePlotRootFromHtml, updatePlotUiFromJson} from "./dom.js";
import {
    buildDoNotCalculatePayload,
    buildDoNotOverwritePayload,
    buildIc50GreaterThanMaxPayload,
    buildIc50LessThanMinPayload,
    buildViewRefreshPayload
} from "./payload.js";
import { scanDoseResponseOverride } from "./scanner.js";

export async function applyPayloadBuilder(plotRoot, payloadBuilder) {
    const editUrlRaw = extractEditUrl(plotRoot);
    if (!editUrlRaw) {
        throw new Error("Could not determine edit URL.");
    }

    const showUrlRaw = extractShowUrl(plotRoot);
    if (!showUrlRaw) {
        throw new Error("Could not determine show URL.");
    }

    const editUrl = absoluteUrl(editUrlRaw);
    const putUrl = editUrlToPutUrl(editUrl);

    const editResponse = await fetchJson(editUrl, { method: "GET" });
    const payload = payloadBuilder(editResponse);

    await fetchJson(putUrl, {
        method: "PUT",
        body: JSON.stringify(payload)
    });

    const refreshPayload = buildViewRefreshPayload(editResponse, plotRoot);

    const refreshedHtml = await fetchText(absoluteUrl(showUrlRaw), {
        method: "POST",
        body: buildFormBody(refreshPayload)
    });

    console.log("[CDD Override] refreshed HTML", refreshedHtml);

    const newPlotRoot = replacePlotRootFromHtml(plotRoot, refreshedHtml);

    scanDoseResponseOverride();
    return newPlotRoot;
}

export async function handleIc50GreaterThanMax(plotRoot) {
    await applyPayloadBuilder(plotRoot, buildIc50GreaterThanMaxPayload);
}

export async function handleDoNotCalculate(plotRoot) {
    await applyPayloadBuilder(plotRoot, buildDoNotCalculatePayload);
}

export async function handleDoNotOverwrite(plotRoot) {
    await applyPayloadBuilder(plotRoot, buildDoNotOverwritePayload);
}

export async function handleIc50LessThanMin(plotRoot) {
    await applyPayloadBuilder(plotRoot, buildIc50LessThanMinPayload);
}