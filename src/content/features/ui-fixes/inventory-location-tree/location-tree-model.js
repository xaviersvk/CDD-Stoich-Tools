// content/features/ui-fixes/inventory-location-tree/location-tree-model.js
//
// SINGLE SOURCE OF TRUTH for "how a flat CDD location option list becomes a tree".
//
// Why this file exists
// --------------------
// CDD's plate form offers inventory locations as one flat MUI autocomplete list:
// 425 rows, each the FULL breadcrumb ("PharmTheon > MedChem Lab > 01-12: Fume
// Hoods > 01 > 01A"). The part that identifies the location is the last segment,
// and it sits at the far right of a line that is otherwise identical to its 300
// neighbours. This module turns that list back into the tree it always was, so
// the view can show one level at a time.
//
// The one subtlety that shapes the whole model
// --------------------------------------------
// A node can be BOTH a branch and a selectable option. "PharmTheon" is an option
// in its own right AND the parent of 306 others; so are two second-level nodes.
// So `optionIndex` is independent of `children`: either, neither, or both may be
// set. A view that assumes "has children => not selectable" WILL hide real
// choices from the user.
//
// What it must NOT do
// -------------------
//   - No DOM, no MUI, no selection state, no rendering. Pure data in, data out.
//   - It never reorders: siblings keep CDD's own option order, because that
//     order is the vault's location order and the user reads it that way.

// CDD joins breadcrumb segments with this exact string.
export const PATH_SEPARATOR = " > ";

// A path is only tree-shaped if it actually has separators somewhere in the list.
// Used by discovery to tell a location list apart from any other autocomplete.
export function looksLikePathList(paths) {
    if (paths.length < 2) return false;
    const withSeparator = paths.filter((p) => p.includes(PATH_SEPARATOR)).length;
    return withSeparator / paths.length >= 0.5;
}

export function splitPath(path) {
    return String(path)
        .split(PATH_SEPARATOR)
        .map((segment) => segment.trim())
        .filter(Boolean);
}

// options: [{ index, path }] in CDD's own order. `index` is the value the view
// gives back to us to click the original <li> — we never invent location ids.
//
// Returns { roots, byPath } where a node is:
//   { label, path, depth, children: [], optionIndex: number|null, selectableBelow: number }
export function buildLocationTree(options) {
    const roots = [];
    const byPath = new Map();

    for (const option of options) {
        const segments = splitPath(option.path);
        if (!segments.length) continue;

        let siblings = roots;
        let prefix = "";

        for (let depth = 0; depth < segments.length; depth++) {
            const label = segments[depth];
            prefix = depth === 0 ? label : prefix + PATH_SEPARATOR + label;

            let node = byPath.get(prefix);
            if (!node) {
                node = {
                    label,
                    path: prefix,
                    depth,
                    children: [],
                    optionIndex: null,
                    selectableBelow: 0,
                };
                byPath.set(prefix, node);
                siblings.push(node);
            }

            // Last segment: this exact path is itself a choosable option.
            if (depth === segments.length - 1) node.optionIndex = option.index;

            siblings = node.children;
        }
    }

    annotateCounts(roots);
    return { roots, byPath };
}

// How many selectable options live BELOW a node (not counting the node itself).
// The view shows this on collapsed branches so "PharmTheon 306" and "IOCB 3"
// tell you which way is the long walk before you commit to it.
function annotateCounts(nodes) {
    for (const node of nodes) {
        annotateCounts(node.children);
        node.selectableBelow = node.children.reduce(
            (total, child) =>
                total + child.selectableBelow + (child.optionIndex === null ? 0 : 1),
            0,
        );
    }
}

// Every ancestor path of `path`, root first, excluding `path` itself.
// Used to auto-open the branch holding the location a plate already has.
export function ancestorPaths(path) {
    const segments = splitPath(path);
    const ancestors = [];
    for (let i = 1; i < segments.length; i++) {
        ancestors.push(segments.slice(0, i).join(PATH_SEPARATOR));
    }
    return ancestors;
}
