// content/features/ui-fixes/inventory-location-scan/tree-model.js
//
// The parts of the scan panel that are only data: what the location tree looks
// like once dialog-dom.js has read it, which nodes may take a box, and whether
// a scanned code is one we already have. No DOM and no imports here — that is
// what lets the duplicate rule be checked with `node` instead of a vault.

export const SCAN_OK = "ok";
export const SCAN_IN_TREE = "in-tree";
export const SCAN_IN_LIST = "in-list";

// CDD gives the ROOT a parent of the literal string "undefined". Everything
// else carries a real id.
function parentOf(raw) {
    if (raw == null || raw === "undefined" || raw === "") return null;
    return String(raw);
}

export function normalizeScan(raw) {
    return String(raw ?? "").replace(/\s+/g, " ").trim();
}

function key(name) {
    return normalizeScan(name).toLowerCase();
}

// Box versus location is not a typed field in CDD's tree. Nine node shapes
// were measured (saved and pending, organized and not, root, saved and
// pending location) and this is the rule that holds for all of them: a
// saved location is `organized: true, num_columns: 0`, a pending location
// has neither key, and every box is either unorganized or has columns.
export function isBoxNode(raw) {
    if (!raw || typeof raw !== "object") return false;
    if (raw.organized === false) return true;
    return Number(raw.num_columns) > 0;
}

export function buildNodes(rows) {
    const nodes = (rows || []).map((row) => ({
        id: String(row.id),
        parentId: parentOf(row.parentId),
        name: String(row.name ?? "").trim(),
        canTakeBox: row.canTakeBox === true,
        isBox: row.isBox === true,
        path: "",
        depth: 0,
    }));

    const byId = new Map(nodes.map((node) => [node.id, node]));

    for (const node of nodes) {
        const parts = [];
        // A tree that came back malformed is a bug, not a reason to hang the
        // dialog — the guard bounds the walk at one visit per node.
        const seen = new Set();
        let cursor = node;
        while (cursor && !seen.has(cursor.id)) {
            seen.add(cursor.id);
            parts.unshift(cursor.name);
            cursor = cursor.parentId ? byId.get(cursor.parentId) : null;
        }
        node.path = parts.join(" > ");
        node.depth = parts.length - 1;
    }

    return nodes;
}

export function boxTargets(nodes) {
    return (nodes || []).filter((node) => node.canTakeBox);
}

// Every box whose name another box carries, mapped to where the others are.
// Locations are neither keys nor twins: a rack barcode names a rack, and a
// shelf called the same thing is not a second rack.
export function duplicateBoxNames(nodes) {
    const groups = new Map();
    for (const node of nodes || []) {
        if (!node.isBox) continue;
        const k = key(node.name);
        if (!k) continue;
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(node);
    }

    const twins = new Map();
    for (const group of groups.values()) {
        if (group.length < 2) continue;
        for (const node of group) {
            twins.set(node.id, group.filter((other) => other !== node).map((other) => other.path));
        }
    }
    return twins;
}

// The whole tree, not just the target location. A rack barcode belongs to one
// rack; the same code twice means a double scan or a rack already shelved
// somewhere else, and neither should quietly become a second box.
export function classifyScan(raw, nodes, scans) {
    const name = normalizeScan(raw);
    if (!name) return null;

    const k = key(name);

    const inTree = (nodes || []).find((node) => key(node.name) === k);
    if (inTree) return { name, status: SCAN_IN_TREE, where: inTree.path };

    if ((scans || []).some((scan) => key(scan.name) === k)) {
        return { name, status: SCAN_IN_LIST, where: null };
    }

    return { name, status: SCAN_OK, where: null };
}

export function acceptedScans(scans) {
    return (scans || []).filter((scan) => scan.status === SCAN_OK);
}
