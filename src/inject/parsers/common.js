// inject/parsers/common.js
export function normalizeFeatures(featureMap) {
    if (!featureMap) return [];
    if (Array.isArray(featureMap)) return featureMap;
    if (typeof featureMap === "object") return Object.values(featureMap);
    return [];
}

export function isElnPayload(payload) {
    return !!(
        payload &&
        typeof payload === "object" &&
        payload.eln_entry &&
        typeof payload.eln_entry === "object" &&
        payload.eln_entry.feature_map &&
        typeof payload.eln_entry.feature_map === "object"
    );
}

export function getReactionFeatures(payload) {
    const features = normalizeFeatures(payload?.eln_entry?.feature_map);
    return features.filter(
        (f) => f?.type === "reaction" && f?.data?.stoichiometryTable
    );
}

export function hasAnyReactionFeature(payload) {
    const features = normalizeFeatures(payload?.eln_entry?.feature_map);
    return features.some((f) => f?.type === "reaction");
}

export function createTextParser(processJsonPayload) {
    return function tryParseText(text) {
        if (!text || typeof text !== "string") return;

        try {
            processJsonPayload(JSON.parse(text));
        } catch (_) {
            // ignore non-json responses
        }
    };
}