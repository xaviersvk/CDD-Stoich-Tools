// content/features/ui-fixes/inventory-location-scan/tree-filter.js
//
// A text box above the location tree: type a name, see the rows that match
// and the path above each, and nothing else.
//
// Two things make this more than a CSS rule. Collapsed children are not in
// the DOM, so a match inside a folded branch has to be unfolded first — the
// bridge asks the tree's own onExpandedItemsChange to do that, with the
// expansion the user had before typing kept aside and put back when the box
// is cleared. And React repaints rows as it pleases, so the hiding is an
// attribute React does not manage, re-applied by the discovery pass after
// every mutation.
//
// Enter in this box would be Save. It is swallowed on `window` in the capture
// phase, the same way the scan panel guards its own box.

import { findLeftColumn, nextFrame, treeItems } from "./dialog-dom.js";
import { normalizeScan } from "./tree-model.js";
import { expandTree, readTreeState } from "./tree-source.js";

export const FILTER_CLASS = "cdd-tree-filter";
const FILTERED_ATTR = "data-cdd-filtered";

let mounted = null; // { dialog, input, onKeyDown }
let query = "";
let snapshot = null; // expansion before the first keystroke
let visible = null; // Set of ids to show, or null when no query

let applying = false;
let applyAgain = false;

function keyOf(name) {
    return normalizeScan(name).toLowerCase();
}

export function paintTreeFilter(dialog) {
    if (!mounted || mounted.dialog !== dialog) return;
    for (const item of treeItems(dialog)) {
        const hide = visible !== null && !visible.has(String(item.dataset.nodeid));
        if (hide) item.setAttribute(FILTERED_ATTR, "");
        else if (item.hasAttribute(FILTERED_ATTR)) item.removeAttribute(FILTERED_ATTR);
    }
}

async function apply(dialog) {
    if (applying) {
        applyAgain = true;
        return;
    }
    applying = true;
    try {
        const q = keyOf(query);
        const { nodes, expanded } = await readTreeState(dialog);
        if (!dialog.isConnected) return;

        if (!q) {
            visible = null;
            if (snapshot) {
                expandTree(snapshot);
                snapshot = null;
            }
            paintTreeFilter(dialog);
            return;
        }

        if (!snapshot) snapshot = expanded;

        const byId = new Map(nodes.map((node) => [node.id, node]));
        const show = new Set();
        const toExpand = new Set(expanded);
        let unfolds = false;
        for (const node of nodes) {
            if (!keyOf(node.name).includes(q)) continue;
            show.add(node.id);
            const seen = new Set();
            let cursor = node.parentId ? byId.get(node.parentId) : null;
            while (cursor && !seen.has(cursor.id)) {
                seen.add(cursor.id);
                show.add(cursor.id);
                if (!toExpand.has(cursor.id)) {
                    toExpand.add(cursor.id);
                    unfolds = true;
                }
                cursor = cursor.parentId ? byId.get(cursor.parentId) : null;
            }
        }

        visible = show;
        if (unfolds) expandTree([...toExpand]);
        paintTreeFilter(dialog);
    } finally {
        applying = false;
        if (applyAgain) {
            applyAgain = false;
            if (dialog.isConnected) apply(dialog);
        }
    }
}

function schedule(dialog) {
    nextFrame().then(() => {
        if (mounted?.dialog === dialog) apply(dialog);
    });
}

export function mountTreeFilter(dialog) {
    if (mounted?.dialog === dialog && mounted.input.isConnected) return;
    unmountTreeFilter();

    const left = findLeftColumn(dialog);
    const tree = left?.querySelector('ul[role="tree"]');
    if (!left || !tree) return;

    const input = document.createElement("input");
    input.type = "text";
    input.className = FILTER_CLASS;
    input.placeholder = "Filter locations and boxes";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.addEventListener("input", () => {
        query = input.value;
        schedule(dialog);
    });

    const onKeyDown = (event) => {
        if (event.target !== input) return;
        if (event.key === "Enter") {
            event.preventDefault();
            event.stopImmediatePropagation();
        } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopImmediatePropagation();
            input.value = "";
            query = "";
            schedule(dialog);
        }
    };
    window.addEventListener("keydown", onKeyDown, true);

    tree.parentElement.insertBefore(input, tree);
    mounted = { dialog, input, onKeyDown };
    query = "";
    snapshot = null;
    visible = null;
}

export function unmountTreeFilter() {
    if (!mounted) return;
    window.removeEventListener("keydown", mounted.onKeyDown, true);
    mounted.input.remove();
    mounted = null;
    query = "";
    snapshot = null;
    visible = null;
}
