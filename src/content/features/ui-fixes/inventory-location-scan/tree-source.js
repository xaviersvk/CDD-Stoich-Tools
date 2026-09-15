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

function requestBridgeNodes() {
    return new Promise((resolve) => {
        const requestId = `cdd-loc-tree-${++requestCounter}`;
        let settled = false;

        const finish = (nodes) => {
            if (settled) return;
            settled = true;
            window.removeEventListener("message", onMessage);
            clearTimeout(timer);
            resolve(nodes);
        };
        const onMessage = (event) => {
            if (event.source !== window) return;
            const data = event.data;
            if (!data || data.source !== EVENT_SOURCE || data.type !== EVENTS.LOCATION_TREE) return;
            if (data.payload?.requestId !== requestId) return;
            finish(Array.isArray(data.payload.nodes) ? data.payload.nodes : null);
        };
        const timer = setTimeout(() => finish(null), BRIDGE_TIMEOUT_MS);

        window.addEventListener("message", onMessage);
        window.postMessage(
            { source: EVENT_SOURCE, type: EVENTS.LOCATION_TREE_REQUEST, payload: { requestId } },
            "*",
        );
    });
}

export async function readTreeNodes(dialog) {
    const domRows = readTreeRows(dialog);
    const bridged = await requestBridgeNodes();

    if (!bridged) {
        if (!warned) {
            warned = true;
            console.warn("[CDD scan-racks] tree bridge silent; collapsed branches are not checked");
        }
        return buildNodes(domRows);
    }

    const canTakeBox = new Map(domRows.map((row) => [String(row.id), row.canTakeBox]));
    return buildNodes(bridged.map((node) => ({
        id: node.id,
        parentId: node.parentId,
        name: node.name,
        isBox: node.isBox,
        canTakeBox: canTakeBox.get(String(node.id)) === true,
    })));
}
