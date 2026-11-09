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
//   LOCATION_TREE_REQUEST { requestId, scope? }
//     -> LOCATION_TREE    { requestId, nodes: [{ id, parentId, name, isBox, isPlate,
//                           organized, columns, rows, capacity }] | null,
//                           expanded: string[] }
//   LOCATION_TREE_EXPAND  { ids: string[], scope? }   (no answer)
//
// `null` means "could not read it" — no dialog, no fiber, or a shape this
// file does not recognise — and the content side falls back to the DOM.
//
// Both requests take an optional `scope`: "edit" (default) is the Edit
// Locations dialog, "picker" is the Pick Location dialog opened from Create
// a New Sample. The two trees are built differently, measured:
//
//   - edit:   one component carries `nodes` AND `expandedItems` /
//             `onExpandedItemsChange`.
//   - picker: the SimpleTreeView carries `expandedItems` /
//             `onExpandedItemsChange`, and a component further up carries the
//             whole tree as `locations` (every node loaded, `children` all the
//             way down; plates ride along in `plates` and are not tree rows).
//
// The tree is a controlled MUI SimpleTreeView: `expandedItems` holds STRING
// ids — a number in that array expands nothing, measured — and calling
// `onExpandedItemsChange(event, ids)` is what a click on a chevron does, minus
// the chevron. The picker's handler reads `event.nativeEvent.type` (to ignore
// a collapse that a click on the label would cause), so the event we pass
// carries itself as its own `nativeEvent`.

import { post } from "../bus.js";
import { EVENTS, EVENT_SOURCE } from "../../shared/event-types.js";

const DIALOG_SELECTORS = {
    edit: ".edit-locations-dialog-paper",
    picker: ".location-picker-dialog-paper",
};
// `locations` sits 19 levels above the picker's <ul>, measured.
const MAX_WALK = 60;

function fiberOf(element) {
    if (!element) return null;
    const key = Object.keys(element).find((k) => k.startsWith("__reactFiber$"));
    return key ? element[key] : null;
}

// Up the `return` chain from the <ul>. Two things are wanted and in the
// picker they live on different components: the tree's data (`nodes` in the
// Edit Locations dialog, `locations` in the picker — the root of CDD's tree,
// with `children` all the way down) and the view's expansion handler.
function findTreeProps(fiber) {
    let data = null;
    let view = null;
    let cursor = fiber;
    for (let step = 0; cursor && step < MAX_WALK && !(data && view); step += 1) {
        const props = cursor.memoizedProps;
        if (props && typeof props === "object") {
            if (!view && typeof props.onExpandedItemsChange === "function") view = props;
            if (!data && Array.isArray(props.nodes)) data = { props, roots: props.nodes };
            if (!data && Array.isArray(props.locations)) data = { props, roots: props.locations };
        }
        cursor = cursor.return;
    }
    if (!data) return null;
    // Edit Locations: the component with `nodes` is the controlled one, as it
    // always was here; prefer it over whatever it hands down.
    const own = typeof data.props.onExpandedItemsChange === "function";
    return { roots: data.roots, view: own ? data.props : view || data.props };
}

function treeProps(scope) {
    const selector = DIALOG_SELECTORS[scope] || DIALOG_SELECTORS.edit;
    const tree = document.querySelector(`${selector} ul[role="tree"]`);
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
            // A plate sits in the tree like a location but is not one: it has
            // plate_id and neither organized nor num_columns (measured, vault
            // 1000000109). Copy tree leaves it out.
            isPlate: node.plate_id != null,
            organized: node.organized !== false,
            columns: Number(node.num_columns) || 0,
            rows: Number(node.num_rows) || 0,
            // An unorganized box's size; measured `capacity: 100` on UBox1.
            capacity: Number(node.capacity) || 0,
        });
        for (const child of node.children || []) walk(child, id);
    };
    for (const root of roots) walk(root, null);
    return out;
}

function readTree(scope) {
    const props = treeProps(scope);
    if (!props) return { nodes: null, expanded: [] };
    return {
        nodes: flatten(props.roots),
        expanded: (props.view.expandedItems || []).map(String),
    };
}

function expandTree(ids, scope) {
    const props = treeProps(scope);
    const handler = props?.view?.onExpandedItemsChange;
    if (typeof handler !== "function") return;
    const event = new Event("cdd-tree-filter");
    event.nativeEvent = event;
    handler(event, (ids || []).map(String));
}

export function installLocationTreeBridge() {
    window.addEventListener("message", (event) => {
        if (event.source !== window) return;
        const data = event.data;
        if (!data || data.source !== EVENT_SOURCE) return;
        if (data.type === EVENTS.LOCATION_TREE_EXPAND) {
            try {
                expandTree(data.payload?.ids, data.payload?.scope);
            } catch (err) {
                console.warn("[CDD Stoich Tools] location tree expand failed:", err);
            }
            return;
        }

        if (data.type !== EVENTS.LOCATION_TREE_REQUEST) return;

        const requestId = data.payload?.requestId;
        let answer = { nodes: null, expanded: [] };
        try {
            answer = readTree(data.payload?.scope);
        } catch (err) {
            console.warn("[CDD Stoich Tools] location tree read failed:", err);
        }
        post(EVENTS.LOCATION_TREE, { requestId, ...answer });
    });
}
