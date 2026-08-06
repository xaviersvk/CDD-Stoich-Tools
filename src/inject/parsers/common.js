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

// The entry body (a serialized editor document) is the only place that knows
// the order reactions are actually displayed in — feature_map has numeric
// keys, which JS always iterates in ascending id (= creation) order, so after
// reactions are moved within an entry the two orders diverge.
function getBodyReactionOrder(payload) {
    const body = payload?.eln_entry?.body;
    if (typeof body !== "string" || !body) return null;

    let doc;
    try {
        doc = JSON.parse(body);
    } catch (_) {
        return null;
    }

    const order = [];

    (function walk(nodes) {
        if (!Array.isArray(nodes)) return;
        for (const node of nodes) {
            if (!node || typeof node !== "object") continue;
            if (node.type === "reaction") {
                const featureId = node?.data?.feature_id;
                if (featureId != null) order.push(String(featureId));
            }
            walk(node.children);
        }
    })(doc);

    return order.length ? order : null;
}

export function getReactionFeatures(payload) {
    const featureMap = payload?.eln_entry?.feature_map;
    if (!featureMap || typeof featureMap !== "object") return [];

    const entries = Array.isArray(featureMap)
        ? featureMap.map((feature, index) => [String(index), feature])
        : Object.entries(featureMap);

    const reactions = entries.filter(
        ([, f]) => f?.type === "reaction" && f?.data?.stoichiometryTable
    );

    const displayOrder = getBodyReactionOrder(payload);
    if (displayOrder) {
        const position = new Map(displayOrder.map((id, i) => [id, i]));
        // Features missing from the body sort last, keeping their id order.
        reactions.sort(([keyA], [keyB]) => {
            const a = position.has(keyA) ? position.get(keyA) : Number.MAX_SAFE_INTEGER;
            const b = position.has(keyB) ? position.get(keyB) : Number.MAX_SAFE_INTEGER;
            return a - b;
        });
    }

    return reactions.map(([, feature]) => feature);
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