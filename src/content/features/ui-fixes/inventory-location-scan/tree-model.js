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

export function buildNodes(rows) {
    const nodes = (rows || []).map((row) => ({
        id: String(row.id),
        parentId: parentOf(row.parentId),
        name: String(row.name ?? "").trim(),
        canTakeBox: row.canTakeBox === true,
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
