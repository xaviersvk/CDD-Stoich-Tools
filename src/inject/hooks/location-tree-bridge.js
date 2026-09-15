// inject/hooks/location-tree-bridge.js
//
// Page-world access to the Edit Locations tree for the content script.
//
// MUI's tree renders only the children of EXPANDED nodes — collapsing a
// location removes its boxes from the DOM outright. The whole tree, pending
// nodes included, lives in the props of the component behind ul[role="tree"],
// and React's fiber tree hangs off DOM nodes as `__reactFiber$…` expandos that
// only the page world can read. This bridge flattens that tree on request.
//
// Protocol (window.postMessage, source EVENT_SOURCE):
//   LOCATION_TREE_REQUEST { requestId }
//     -> LOCATION_TREE    { requestId, nodes: [{ id, parentId, name, isBox }] | null,
//                           expanded: string[] }
//   LOCATION_TREE_EXPAND  { ids: string[] }   (no answer)
//
// `null` means "could not read it" — no dialog, no fiber, or a shape this
// file does not recognise — and the content side falls back to the DOM.
//
// The tree is a controlled MUI SimpleTreeView: its props carry
// `expandedItems` (STRING ids — a number in that array expands nothing,
// measured) and `onExpandedItemsChange(event, ids)`. Calling the handler is
// what a click on a chevron does, minus the chevron.

import { post } from "../bus.js";
import { EVENTS, EVENT_SOURCE } from "../../shared/event-types.js";

const DIALOG_SELECTOR = ".edit-locations-dialog-paper";
const MAX_WALK = 40;

function fiberOf(element) {
    if (!element) return null;
    const key = Object.keys(element).find((k) => k.startsWith("__reactFiber$"));
    return key ? element[key] : null;
}

// Up the `return` chain from the <ul> to the first component whose props carry
// a `nodes` array — measured: the root of CDD's tree, one entry, with
// `children` all the way down and a `parent` back-pointer on every node.
function findTreeProps(fiber) {
    let cursor = fiber;
    for (let step = 0; cursor && step < MAX_WALK; step += 1) {
        const props = cursor.memoizedProps;
        if (props && Array.isArray(props.nodes)) return props;
        cursor = cursor.return;
    }
    return null;
}

function treeProps() {
    const tree = document.querySelector(`${DIALOG_SELECTOR} ul[role="tree"]`);
    return findTreeProps(fiberOf(tree));
}

// The same rule as content/.../tree-model.js isBoxNode. Repeated because the
// inject bundle must not pull content modules in; keep the two identical.
function isBoxNode(raw) {
    if (!raw || typeof raw !== "object") return false;
    if (raw.organized === false) return true;
    return Number(raw.num_columns) > 0;
}

function flatten(roots) {
    const out = [];
    const seen = new Set();
    const walk = (node, parentId) => {
        if (!node || typeof node !== "object" || node.id == null) return;
        const id = String(node.id);
        if (seen.has(id)) return; // a malformed tree must not hang the page
        seen.add(id);
        out.push({
            id,
            parentId,
            name: String(node.value ?? "").trim(),
            isBox: isBoxNode(node),
        });
        for (const child of node.children || []) walk(child, id);
    };
    for (const root of roots) walk(root, null);
    return out;
}

function readTree() {
    const props = treeProps();
    if (!props) return { nodes: null, expanded: [] };
    return {
        nodes: flatten(props.nodes),
        expanded: (props.expandedItems || []).map(String),
    };
}

function expandTree(ids) {
    const props = treeProps();
    if (!props || typeof props.onExpandedItemsChange !== "function") return;
    props.onExpandedItemsChange(new Event("cdd-tree-filter"), (ids || []).map(String));
}

export function installLocationTreeBridge() {
    window.addEventListener("message", (event) => {
        if (event.source !== window) return;
        const data = event.data;
        if (!data || data.source !== EVENT_SOURCE) return;
        if (data.type === EVENTS.LOCATION_TREE_EXPAND) {
            try {
                expandTree(data.payload?.ids);
            } catch (err) {
                console.warn("[CDD Stoich Tools] location tree expand failed:", err);
            }
            return;
        }

        if (data.type !== EVENTS.LOCATION_TREE_REQUEST) return;

        const requestId = data.payload?.requestId;
        let answer = { nodes: null, expanded: [] };
        try {
            answer = readTree();
        } catch (err) {
            console.warn("[CDD Stoich Tools] location tree read failed:", err);
        }
        post(EVENTS.LOCATION_TREE, { requestId, ...answer });
    });
}
