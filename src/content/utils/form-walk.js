// content/utils/form-walk.js
//
// The one walk over a CDD form definition's component tree, shared by the
// protocol and registration form clipboards. No DOM, no storage.

// Keys whose numeric values are layout, not references.
const LAYOUT_NUMBERS = new Set(["context", "span"]);
// A cell's own reference and its placeholders: handed to `onCell`, never
// reported as a stray id.
const CELL_KEYS = ["fieldID", "$field", "$component"];

function looksLikeId(key) {
    return /(^|_)id$|ID$|_ids?$|template/i.test(key);
}

// A walk over a component's tree, calling `onCell` for every object that has
// a fieldID (or a $field placeholder), and `onNumber` for every other numeric
// value keyed like an id. `onCell` also gets the label of the label cell
// before it in its row, if any. `cellKeys` are further keys a cell owns and
// the caller translates itself, so they are not reported by `onNumber`.
export function formWalker(cellKeys = []) {
    const skip = new Set([...CELL_KEYS, ...cellKeys]);

    function walk(node, onCell, onNumber, path = "", label = null) {
        if (Array.isArray(node)) {
            let lastLabel = null;
            node.forEach((child, index) => {
                if (child && typeof child.label === "string" && !("fieldID" in child)) lastLabel = child.label.trim();
                walk(child, onCell, onNumber, `${path}[${index}]`, lastLabel);
            });
            return;
        }
        if (!node || typeof node !== "object") return;
        if ("fieldID" in node || "$field" in node) onCell(node, path, label);
        for (const [key, value] of Object.entries(node)) {
            if (skip.has(key)) continue;
            if (typeof value === "number" && !LAYOUT_NUMBERS.has(key) && looksLikeId(key)) {
                onNumber(key, value, `${path}.${key}`);
            } else if (value && typeof value === "object") {
                walk(value, onCell, onNumber, `${path}.${key}`);
            }
        }
    }

    return walk;
}
