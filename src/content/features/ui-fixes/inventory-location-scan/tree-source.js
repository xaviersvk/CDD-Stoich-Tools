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
// could not read the tree. `scope` names the dialog: "edit" (Edit Locations,
// the default) or "picker" (Pick Location) — see location-tree-bridge.js.
function requestBridge(scope = "edit") {
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
            { source: EVENT_SOURCE, type: EVENTS.LOCATION_TREE_REQUEST, payload: { requestId, scope } },
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

    const rendered = new Map(domRows.map((row) => [String(row.id), row]));
    const nodes = buildNodes(bridged.nodes.map((node) => {
        const row = rendered.get(String(node.id));
        return {
            id: node.id,
            parentId: node.parentId,
            name: node.name,
            isBox: node.isBox,
            rendered: Boolean(row),
            canTakeBox: row?.canTakeBox === true,
            canTakeLocation: row?.canTakeLocation === true,
        };
    }));
    return { nodes, expanded: bridged.expanded };
}

export async function readTreeNodes(dialog) {
    return (await readTreeState(dialog)).nodes;
}

// The bridge's own list — sizes and plates included — for Copy tree, or null
// when the bridge is silent. No DOM fallback: the DOM shows only what is
// expanded, and half a tree copied without a word is worse than none.
export async function readRawTree() {
    return (await requestBridge())?.nodes ?? null;
}

// The Pick Location dialog's tree, for the filter. Its rows carry no
// data-nodeid — the item id is the tail of the row's MUI id — so the DOM
// fallback reads ids from there and parents from the nesting.
export async function readPickerTreeState(dialog) {
    const bridged = await requestBridge("picker");
    if (bridged) {
        const nodes = buildNodes(bridged.nodes.filter((node) => !node.isPlate));
        return { nodes, expanded: bridged.expanded };
    }
    if (!warned) {
        warned = true;
        console.warn("[CDD scan-racks] tree bridge silent; collapsed branches are not checked");
    }
    const rows = treeItemRows(dialog);
    return { nodes: buildNodes(rows), expanded: [] };
}

// `mui-tree-view-1-25573` → "25573", measured on the Pick Location tree.
export function treeItemId(item) {
    if (item.dataset.nodeid != null) return String(item.dataset.nodeid);
    const match = /^mui-tree-view-[^-]*-(.+)$/.exec(item.id || "");
    return match ? match[1] : null;
}

function treeItemRows(dialog) {
    return [...(dialog?.querySelectorAll('li[role="treeitem"]') || [])].map((item) => {
        const parent = item.parentElement?.closest('li[role="treeitem"]');
        const label = item.querySelector(":scope > .MuiTreeItem-content .MuiTreeItem-label");
        return {
            id: treeItemId(item),
            parentId: parent ? treeItemId(parent) : null,
            name: label ? label.textContent.trim() : "",
            rendered: true,
        };
    }).filter((row) => row.id != null);
}

// Fire and forget: the tree repaints, and the discovery pass sees that.
export function expandTree(ids, scope = "edit") {
    window.postMessage(
        {
            source: EVENT_SOURCE,
            type: EVENTS.LOCATION_TREE_EXPAND,
            payload: { ids: (ids || []).map(String), scope },
        },
        "*",
    );
}
