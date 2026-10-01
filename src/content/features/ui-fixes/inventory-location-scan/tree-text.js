// content/features/ui-fixes/inventory-location-scan/tree-text.js
//
// The location tree as text, both ways — the format Scan racks has always
// taken from Excel, one line per thing:
//
//   Locations > Lab 1 > Fridge 1 > Box 1 ⇥ 9 ⇥ 9    an organized box
//   Locations > Lab 1 > Bench 1 > UBox1 ⇥ 100       an unorganized box
//   Locations > Lab 2 > Freezer >                   an empty location
//
// Copy tree writes it from one vault's tree; a paste into Scan racks in
// another vault reads it back. TAB is the only column separator — a comma
// may sit inside a rack code. No DOM here, so `node` can check the round trip.

import { sanitizeBoxSide, sanitizeCapacity } from "../../../../shared/inventory-scan.js";

// A line is a name or a path, then optionally two numbers (columns and rows:
// an organized box) or one (capacity: an unorganized box). The numbers decide
// the box's kind; a line without them follows the panel's checkbox.
export function parsePastedLine(line) {
    const parts = String(line ?? "").split("\t").map((part) => part.trim());
    const name = parts.shift() || "";
    const columns = sanitizeBoxSide(parts[0], null);
    const rows = sanitizeBoxSide(parts[1], null);
    if (columns && rows) return { name, size: { columns, rows, organized: true } };
    const capacity = parts[1] === undefined || parts[1] === "" ? sanitizeCapacity(parts[0], null) : null;
    return { name, size: capacity ? { capacity, organized: false } : null };
}

// `nodes`: the bridge's flat list (inject/hooks/location-tree-bridge.js),
// depth first, root first with parentId null. Plates are not locations and
// are left out. Under one parent, locations go before boxes: CDD offers no
// "Create new location" on a location that already holds a box (measured on
// Bench 1, vault 1000000109), so built box-first the paste would stop.
// A location gets a line of its own only when nothing copied sits under it;
// the rest are path segments of their children.
export function treeToLines(nodes) {
    const list = (nodes || []).filter((node) => node && !node.isPlate);
    const children = new Map();
    for (const node of list) {
        const parent = node.parentId == null ? null : String(node.parentId);
        if (!children.has(parent)) children.set(parent, []);
        children.get(parent).push(node);
    }
    const root = list.find((node) => node.parentId == null);
    const lines = [];
    let locations = 0;
    let boxes = 0;
    if (!root) return { text: "", locations, boxes };

    const walk = (node, path) => {
        const kids = children.get(String(node.id)) || [];
        if (node !== root && !kids.length) lines.push(`${path} >`);
        for (const child of kids.filter((kid) => !kid.isBox)) {
            locations += 1;
            walk(child, `${path} > ${child.name}`);
        }
        for (const child of kids.filter((kid) => kid.isBox)) {
            boxes += 1;
            const at = `${path} > ${child.name}`;
            if (child.organized === false) lines.push(child.capacity > 0 ? `${at}\t${child.capacity}` : at);
            else lines.push(child.columns > 0 && child.rows > 0 ? `${at}\t${child.columns}\t${child.rows}` : at);
        }
    };
    walk(root, root.name);
    return { text: lines.join("\n"), locations, boxes };
}
