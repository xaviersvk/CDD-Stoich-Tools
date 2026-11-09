// shared/merged-location-tree.js
//
// Several vaults' location trees folded into one. A location is the same
// location in two vaults when its whole path of names is the same — that is
// how a lab that keeps one physical building in several vaults reads it, and
// it is the rule of the management page's "Merge vaults" tree too. Each node
// remembers which vaults hold it, so the view can show where a location is
// missing.
//
// Input is CDD's own `inventory_locations.json` array per vault, untouched:
//   { id, value, organized, num_columns, num_rows, display_order,
//     children: [...], plates: [...] }
// Plates are left out, as Copy tree leaves them out: a plate sits in the tree
// but is not a location.
//
// Pure: no DOM, no fetch. Checked by tests/merged-location-tree.test.js.

// Names match ignoring case and runs of spaces: "Fume hood 1" and
// "Fume Hood  1" are the same hood typed twice. The label shown is the one
// met first, i.e. the current vault's spelling.
export function nameKey(name) {
    return String(name ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

// Same rule as inventory-location-scan/tree-model.js isBoxNode.
function isBox(raw) {
    if (raw.organized === false) return true;
    return Number(raw.num_columns) > 0;
}

function byDisplayOrder(a, b) {
    return (Number(a.display_order) || 0) - (Number(b.display_order) || 0);
}

// The size a box would be made with in another vault: the first vault's.
// An unorganized box's capacity is `position_limit` in this JSON.
function boxSpec(raw) {
    if (raw.organized === false) {
        return { organized: false, columns: 0, rows: 0, capacity: Number(raw.position_limit ?? raw.capacity) || null };
    }
    return { organized: true, columns: Number(raw.num_columns) || 0, rows: Number(raw.num_rows) || 0, capacity: null };
}

// vaults: [{ id, name, roots }] — the current vault FIRST. Its order of
// siblings wins; a location only other vaults have is appended after.
// Returns roots of
//   { key, label, labels, isBox, box, vaults: [vaultId], children }
// `key` is the path of name keys joined by "\u0000" — unique in the tree;
// `labels` is the path of labels, root first, for finding the same place in
// a live tree; `box` is a box's size (null for a location).
export function mergeVaultTrees(vaults) {
    const roots = [];
    const byKey = new Map();

    const visit = (rawNodes, parent, siblings, vaultId, seen) => {
        const ordered = [...(rawNodes || [])].sort(byDisplayOrder);
        for (const raw of ordered) {
            if (!raw || typeof raw !== "object") continue;
            const label = String(raw.value ?? "").trim();
            if (!label) continue;
            const key = parent ? `${parent.key}\u0000${nameKey(label)}` : nameKey(label);
            // A malformed tree that loops must not hang the page.
            if (seen.has(raw)) continue;
            seen.add(raw);

            let node = byKey.get(key);
            if (!node) {
                node = {
                    key,
                    label,
                    labels: parent ? [...parent.labels, label] : [label],
                    isBox: false,
                    box: null,
                    vaults: [],
                    children: [],
                };
                byKey.set(key, node);
                siblings.push(node);
            }
            if (isBox(raw)) {
                node.isBox = true;
                if (!node.box) node.box = boxSpec(raw);
            }
            if (!node.vaults.includes(vaultId)) node.vaults.push(vaultId);

            visit(raw.children, node, node.children, vaultId, seen);
        }
    };

    for (const vault of vaults) {
        visit(vault.roots, null, roots, String(vault.id), new Set());
    }
    return roots;
}

// Every node, depth first, with its ancestors' keys.
function walk(nodes, visitor, ancestors = []) {
    for (const node of nodes) {
        visitor(node, ancestors);
        walk(node.children, visitor, [...ancestors, node.key]);
    }
}

// What a filter query leaves on screen: the matching nodes and the path
// above each. `show` is every key to draw; `open` is every ancestor that has
// to be unfolded for a match to be seen. A match's own children are not in
// `show` — unfolding a match shows all of them, unfiltered.
// Returns null for an empty query: nothing is filtered.
export function filterMergedTree(roots, query) {
    const q = nameKey(query);
    if (!q) return null;
    const matches = new Set();
    const open = new Set();
    walk(roots, (node, ancestors) => {
        if (!nameKey(node.label).includes(q)) return;
        matches.add(node.key);
        for (const key of ancestors) open.add(key);
    });
    const show = new Set([...matches, ...open]);
    return { matches, open, show };
}

// Where a merged node's path is in ONE vault's live tree — the Edit
// Locations dialog's own, as the bridge reads it: [{ id, parentId, name }],
// with a single root ("Locations") whose parentId is null. Matched by name
// path, not id, so a location created but not saved yet counts.
// Returns { rootId, anchorId, missing }: `anchorId` is the deepest node of
// the path the tree has (the root when it has none of it), `missing` the
// labels below it still to create. null when the tree has no root.
export function locateInLiveTree(liveNodes, labels) {
    const nodes = liveNodes || [];
    const root = nodes.find((node) => node.parentId == null);
    if (!root) return null;
    const children = new Map();
    for (const node of nodes) {
        if (node.parentId == null || node.isPlate) continue;
        const list = children.get(String(node.parentId)) || [];
        list.push(node);
        children.set(String(node.parentId), list);
    }
    let anchorId = String(root.id);
    let found = 0;
    for (const label of labels) {
        const k = nameKey(label);
        const next = (children.get(anchorId) || []).find((node) => nameKey(node.name) === k);
        if (!next) break;
        anchorId = String(next.id);
        found += 1;
    }
    return { rootId: String(root.id), anchorId, missing: labels.slice(found) };
}

// How many boxes sit below a node, across the merged tree. Shown on a
// collapsed branch so the long walks read as long before you take them.
export function countBoxes(node) {
    let total = 0;
    for (const child of node.children) total += (child.isBox ? 1 : 0) + countBoxes(child);
    return total;
}
