import { fetchJson } from "../../api/cdd-api.js";
import { absoluteUrl, editUrlToPutUrl } from "../../utils/url.js";
import { extractEditUrl } from "./dom.js";
import {
    buildDoNotCalculatePayload,
    buildDoNotOverwritePayload,
    buildIc50GreaterThanMaxPayload,
    buildIc50LessThanMinPayload
} from "./payload.js";

export async function applyPayloadBuilder(plotRoot, payloadBuilder) {
    const editUrlRaw = extractEditUrl(plotRoot);
    if (!editUrlRaw) {
        throw new Error("Could not determine edit URL.");
    }

    const editUrl = absoluteUrl(editUrlRaw);
    const putUrl = editUrlToPutUrl(editUrl);

    const editResponse = await fetchJson(editUrl, { method: "GET" });
    const payload = payloadBuilder(editResponse);

    await fetchJson(putUrl, {
        method: "PUT",
        body: JSON.stringify(payload)
    });
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