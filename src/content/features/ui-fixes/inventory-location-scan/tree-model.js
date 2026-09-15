// content/features/ui-fixes/inventory-location-scan/tree-model.js
//
// The parts of the scan panel that are only data: what the location tree looks
// like once dialog-dom.js has read it, which nodes may take a box, whether a
// scanned code is one we already have, and how a line such as
// `Shelf A > R-1` maps onto that tree. No DOM and no imports here — that is
// what lets every rule be checked with `node` instead of a vault.

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

export function rootOf(nodes) {
    return (nodes || []).find((node) => node.parentId === null) || null;
}

export function childNamed(nodes, parentId, name) {
    const k = key(name);
    return (nodes || []).find((node) => node.parentId === String(parentId) && key(node.name) === k) || null;
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

/* ----- paths ----- */

// `Shelf A > Bay 2 > R-1`: locations, then a box. A trailing `>` means the
// line is locations only. The first segment equal to the root's name makes
// the path absolute — the root's name is read from the tree, never assumed.
export function parsePath(raw, rootName) {
    const text = normalizeScan(raw);
    if (!text) return null;
    if (!text.includes(">")) return { segments: [], box: text, absolute: false };

    const parts = text.split(">").map((part) => part.trim());
    const locationsOnly = parts[parts.length - 1] === "";
    const segments = parts.filter(Boolean);
    if (!segments.length) return null;

    let absolute = false;
    if (rootName && key(segments[0]) === key(rootName)) {
        absolute = true;
        segments.shift();
    }

    const box = locationsOnly ? null : (segments.pop() ?? null);
    if (!box && !segments.length) return null;
    return { segments, box, absolute };
}

// Walk the segments down from the anchor. Stops at the first missing one —
// everything from there on is `missing` — or at a segment that names a box,
// which is an error: a box cannot hold anything.
export function resolvePath(nodes, anchorId, segments) {
    let nodeId = String(anchorId);
    const missing = [];
    for (const segment of segments || []) {
        if (missing.length) {
            missing.push(segment);
            continue;
        }
        const child = childNamed(nodes, nodeId, segment);
        if (!child) {
            missing.push(segment);
            continue;
        }
        if (child.isBox) {
            return { nodeId, missing: [], error: `"${child.name}" is a box, not a location` };
        }
        nodeId = child.id;
    }
    return { nodeId, missing, error: null };
}

function anchorFor(parsed, nodes, context) {
    if (parsed.absolute) return rootOf(nodes)?.id ?? null;
    return context?.targetId == null ? null : String(context.targetId);
}

// The whole tree, not just the target location. A rack barcode belongs to one
// rack; the same code twice means a double scan or a rack already shelved
// somewhere else, and neither should quietly become a second box.
export function classifyScan(raw, nodes, scans, context = {}) {
    const root = rootOf(nodes);
    const parsed = parsePath(raw, root?.name);
    if (!parsed) return null;

    const { segments, box, absolute } = parsed;
    const anchorId = anchorFor(parsed, nodes, context);
    const base = { segments, box, absolute, pathLabel: segments.join(" > "), where: null };

    if (box) {
        const k = key(box);
        const inTree = (nodes || []).find((node) => key(node.name) === k);
        if (inTree) return { ...base, name: box, status: SCAN_IN_TREE, where: inTree.path };
        if ((scans || []).some((scan) => scan.box && key(scan.box) === k)) {
            return { ...base, name: box, status: SCAN_IN_LIST };
        }
        return { ...base, name: box, status: SCAN_OK };
    }

    // Locations only: refused when the whole path is already there, or when
    // another row in the list already promises it.
    const name = segments[segments.length - 1];
    const pathKey = `${anchorId}/${segments.map(key).join(">")}`;
    const resolved = anchorId == null ? null : resolvePath(nodes, anchorId, segments);
    if (resolved && !resolved.error && !resolved.missing.length) {
        const node = (nodes || []).find((candidate) => candidate.id === resolved.nodeId);
        return { ...base, name, status: SCAN_IN_TREE, where: node?.path ?? base.pathLabel };
    }
    if ((scans || []).some((scan) => !scan.box && scan.pathKey === pathKey)) {
        return { ...base, name, status: SCAN_IN_LIST };
    }
    return { ...base, name, status: SCAN_OK, pathKey };
}

export function acceptedScans(scans) {
    return (scans || []).filter((scan) => scan.status === SCAN_OK);
}

// How many locations the run will make: the distinct missing prefixes over
// every accepted row, so two racks on one new shelf count the shelf once.
export function locationsToCreate(scans, nodes, targetId) {
    const pending = new Set();
    for (const scan of acceptedScans(scans)) {
        const anchorId = anchorFor(scan, nodes, { targetId });
        if (anchorId == null) continue;
        const resolved = resolvePath(nodes, anchorId, scan.segments || []);
        if (resolved.error) continue;
        const prefix = [];
        for (const segment of resolved.missing) {
            prefix.push(key(segment));
            pending.add(`${resolved.nodeId}/${prefix.join(">")}`);
        }
    }
    return pending.size;
}

/* ----- presets ----- */

export function findPreset(presets, columns, rows) {
    const c = Number(columns);
    const r = Number(rows);
    return (presets || []).find((preset) => preset.columns === c && preset.rows === r) || null;
}
