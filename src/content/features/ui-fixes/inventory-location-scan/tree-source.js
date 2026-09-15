// content/features/ui-fixes/inventory-location-scan/tree-source.js
//
// Where the tree comes from. The DOM shows only the expanded part of it —
// MUI does not render a collapsed node's children at all — so the list is
// asked of the page-world bridge, which reads it from React props and sees
// every node, pending ones included. The DOM still supplies `canTakeBox`:
// that is a style question on a rendered row, and a target has to be
// clickable anyway, so a node that is not on screen cannot take a box.
//
// If the bridge does not answer, or answers null, the DOM read is the
// answer, exactly as it was before the bridge existed.

import { EVENTS, EVENT_SOURCE } from "../../../../shared/event-types.js";
import { readTreeRows } from "./dialog-dom.js";
import { buildNodes } from "./tree-model.js";

const BRIDGE_TIMEOUT_MS = 500;
let requestCounter = 0;
let warned = false;

// Resolves with { nodes, expanded }, or null when the bridge is silent or
// could not read the tree.
function requestBridge() {
    return new Promise((resolve) => {
        const requestId = `cdd-loc-tree-${++requestCounter}`;
        let settled = false;

        const finish = (answer) => {
            if (settled) return;
            settled = true;
            window.removeEventListener("message", onMessage);
            clearTimeout(timer);
            resolve(answer);
        };
        const onMessage = (event) => {
            if (event.source !== window) return;
            const data = event.data;
            if (!data || data.source !== EVENT_SOURCE || data.type !== EVENTS.LOCATION_TREE) return;
            if (data.payload?.requestId !== requestId) return;
            const nodes = data.payload.nodes;
            if (!Array.isArray(nodes)) return finish(null);
            const expanded = Array.isArray(data.payload.expanded) ? data.payload.expanded.map(String) : [];
            finish({ nodes, expanded });
        };
        const timer = setTimeout(() => finish(null), BRIDGE_TIMEOUT_MS);

        window.addEventListener("message", onMessage);
        window.postMessage(
            { source: EVENT_SOURCE, type: EVENTS.LOCATION_TREE_REQUEST, payload: { requestId } },
            "*",
        );
    });
}

// The nodes plus which of them are expanded — the filter needs both, to put
// the user's expansion back when the box is cleared. On fallback `expanded`
// is empty: the DOM cannot say what is folded.
export async function readTreeState(dialog) {
    const domRows = readTreeRows(dialog);
    const bridged = await requestBridge();

    if (!bridged) {
        if (!warned) {
            warned = true;
            console.warn("[CDD scan-racks] tree bridge silent; collapsed branches are not checked");
        }
        return { nodes: buildNodes(domRows), expanded: [] };
    }

    const canTakeBox = new Map(domRows.map((row) => [String(row.id), row.canTakeBox]));
    const nodes = buildNodes(bridged.nodes.map((node) => ({
        id: node.id,
        parentId: node.parentId,
        name: node.name,
        isBox: node.isBox,
        canTakeBox: canTakeBox.get(String(node.id)) === true,
    })));
    return { nodes, expanded: bridged.expanded };
}

export async function readTreeNodes(dialog) {
    return (await readTreeState(dialog)).nodes;
}

// Fire and forget: the tree repaints, and the discovery pass sees that.
export function expandTree(ids) {
    window.postMessage(
        { source: EVENT_SOURCE, type: EVENTS.LOCATION_TREE_EXPAND, payload: { ids: (ids || []).map(String) } },
        "*",
    );
}
