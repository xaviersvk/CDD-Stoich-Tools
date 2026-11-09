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
// Clearing the box puts the old expansion back plus the path down to the
// selected row, so a box picked from the filtered list stays on screen.
//
// Enter in this box would be Save (or OK). It is swallowed on `window` in the
// capture phase, the same way the scan panel guards its own box.
//
// The same filter serves two dialogs, one instance each: Edit Locations
// (`mountTreeFilter`, rows carry data-nodeid) and Pick Location, opened from
// Create a New Sample (`mountPickerTreeFilter`, rows carry the id in their MUI
// id). What differs is where the tree is and how its state is read.

import { findLeftColumn, nextFrame, treeItems } from "./dialog-dom.js";
import { normalizeScan } from "./tree-model.js";
import { expandTree, readPickerTreeState, readTreeState, treeItemId } from "./tree-source.js";

export const FILTER_CLASS = "cdd-tree-filter";
const FILTERED_ATTR = "data-cdd-filtered";

function keyOf(name) {
    return normalizeScan(name).toLowerCase();
}

function allTreeItems(dialog) {
    return dialog ? [...dialog.querySelectorAll('li[role="treeitem"]')] : [];
}

function selectedItemId(dialog, itemId) {
    const item = allTreeItems(dialog).find((node) =>
        node.querySelector(":scope > .MuiTreeItem-content")?.classList.contains("Mui-selected"));
    return item ? itemId(item) : null;
}

function ancestorsOf(id, byId) {
    const out = [];
    const seen = new Set();
    let cursor = byId.get(id);
    cursor = cursor?.parentId ? byId.get(cursor.parentId) : null;
    while (cursor && !seen.has(cursor.id)) {
        seen.add(cursor.id);
        out.push(cursor.id);
        cursor = cursor.parentId ? byId.get(cursor.parentId) : null;
    }
    return out;
}

function createTreeFilter({ findTree, readState, expand, items, itemId }) {
    let mounted = null; // { dialog, input, onKeyDown }
    let query = "";
    let snapshot = null; // expansion before the first keystroke
    let visible = null; // Set of ids to show, or null when no query

    let applying = false;
    let applyAgain = false;

    function paint(dialog) {
        if (!mounted || mounted.dialog !== dialog) return;
        for (const item of items(dialog)) {
            const hide = visible !== null && !visible.has(String(itemId(item)));
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
            const { nodes, expanded } = await readState(dialog);
            if (!dialog.isConnected) return;
            const byId = new Map(nodes.map((node) => [node.id, node]));

            if (!q) {
                visible = null;
                if (snapshot) {
                    const restore = new Set(snapshot);
                    const selected = selectedItemId(dialog, itemId);
                    if (selected) for (const id of ancestorsOf(selected, byId)) restore.add(id);
                    expand([...restore]);
                    snapshot = null;
                }
                paint(dialog);
                return;
            }

            if (!snapshot) snapshot = expanded;

            const show = new Set();
            const toExpand = new Set(expanded);
            let unfolds = false;
            for (const node of nodes) {
                if (!keyOf(node.name).includes(q)) continue;
                show.add(node.id);
                for (const id of ancestorsOf(node.id, byId)) {
                    show.add(id);
                    if (!toExpand.has(id)) {
                        toExpand.add(id);
                        unfolds = true;
                    }
                }
            }

            visible = show;
            if (unfolds) expand([...toExpand]);
            paint(dialog);
        } catch (error) {
            // Callers fire and forget; a failed filter pass must never cost the
            // user the dialog (same rule as markPass in init.js).
            console.warn("[CDD scan-racks] tree filter pass failed", error);
        } finally {
            applying = false;
            if (applyAgain) {
                applyAgain = false;
                if (dialog.isConnected) void apply(dialog);
            }
        }
    }

    function schedule(dialog) {
        nextFrame().then(() => {
            if (mounted?.dialog === dialog) void apply(dialog);
        });
    }

    function unmount() {
        if (!mounted) return;
        window.removeEventListener("keydown", mounted.onKeyDown, true);
        mounted.input.remove();
        mounted = null;
        query = "";
        snapshot = null;
        visible = null;
    }

    function mount(dialog) {
        if (mounted?.dialog === dialog && mounted.input.isConnected) return;
        unmount();

        const tree = findTree(dialog);
        if (!tree?.parentElement) return;

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
                // Escape would also close the dialog; here it only clears.
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

    return { mount, unmount, paint };
}

// ---- Edit Locations --------------------------------------------------------

const editFilter = createTreeFilter({
    findTree: (dialog) => findLeftColumn(dialog)?.querySelector('ul[role="tree"]') || null,
    readState: (dialog) => readTreeState(dialog),
    expand: (ids) => expandTree(ids, "edit"),
    items: (dialog) => treeItems(dialog),
    itemId: (item) => item.dataset.nodeid,
});

export const mountTreeFilter = editFilter.mount;
export const unmountTreeFilter = editFilter.unmount;
export const paintTreeFilter = editFilter.paint;

// ---- Pick Location (Create a New Sample) -----------------------------------

export const PICKER_DIALOG_SELECTOR = ".location-picker-dialog-paper";

const pickerFilter = createTreeFilter({
    findTree: (dialog) => dialog?.querySelector('.LocationPicker ul[role="tree"]')
        || dialog?.querySelector('ul[role="tree"]')
        || null,
    readState: (dialog) => readPickerTreeState(dialog),
    expand: (ids) => expandTree(ids, "picker"),
    items: allTreeItems,
    itemId: treeItemId,
});

export const mountPickerTreeFilter = pickerFilter.mount;
export const unmountPickerTreeFilter = pickerFilter.unmount;
export const paintPickerTreeFilter = pickerFilter.paint;
