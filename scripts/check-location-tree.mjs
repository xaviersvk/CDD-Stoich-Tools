// scripts/check-location-tree.mjs
//
// node scripts/check-location-tree.mjs — Copy tree and the paste it feeds,
// on the tree measured in vault 1000000109 (2026-10-01). Silent on success.

import assert from "node:assert/strict";
import { parsePastedLine, treeToLines } from "../src/content/features/ui-fixes/inventory-location-scan/tree-text.js";
import { SCAN_BLOCKED, SCAN_OK, buildNodes, classifyScan } from "../src/content/features/ui-fixes/inventory-location-scan/tree-model.js";

let next = 1;
const nodes = [];
const loc = (name, parentId) => { const id = String(next++); nodes.push({ id, parentId, name, isBox: false, isPlate: false, organized: true, columns: 0, rows: 0, capacity: 0 }); return id; };
const box = (name, parentId, columns, rows) => nodes.push({ id: String(next++), parentId, name, isBox: true, isPlate: false, organized: true, columns, rows, capacity: 0 });
const ubox = (name, parentId, capacity) => nodes.push({ id: String(next++), parentId, name, isBox: true, isPlate: false, organized: false, columns: 0, rows: 0, capacity });
const plate = (name, parentId) => nodes.push({ id: String(next++), parentId, name, isBox: false, isPlate: true, organized: true, columns: 0, rows: 0, capacity: 0 });

const root = loc("Locations", null);
const lab1 = loc("Lab 1", root);
const fridge1 = loc("Fridge 1", lab1);
box("Box 1", fridge1, 9, 9);
box("IOCB_1", fridge1, 24, 16);
box("IOCB_3", fridge1, 24, 16);
box("IOCB_2", fridge1, 24, 16);
plate("plate_35465", fridge1);
plate("IOCB_3", fridge1);
const hood1 = loc("Hood 1", lab1);
const bench1 = loc("Bench 1", hood1);
ubox("UBox1", bench1, 100);
loc("1 plate at this", bench1);
loc("1 plate at this lon", bench1);
loc("1 plate at this location", bench1);
plate("Plate002ABC", bench1);
const lab2 = loc("Lab 2", root);
const fridge2 = loc("Fridge 2", lab2);
box("Box 2", fridge2, 9, 9);
box("Box 3", fridge2, 9, 9);
plate("platenew123", fridge2);
const lab3 = loc("Lab 3", root);
const hood2 = loc("hood 2", lab3);
box("Box 4", hood2, 9, 9);

const expected = [
    "Locations > Lab 1 > Fridge 1 > Box 1\t9\t9",
    "Locations > Lab 1 > Fridge 1 > IOCB_1\t24\t16",
    "Locations > Lab 1 > Fridge 1 > IOCB_3\t24\t16",
    "Locations > Lab 1 > Fridge 1 > IOCB_2\t24\t16",
    "Locations > Lab 1 > Hood 1 > Bench 1 > 1 plate at this >",
    "Locations > Lab 1 > Hood 1 > Bench 1 > 1 plate at this lon >",
    "Locations > Lab 1 > Hood 1 > Bench 1 > 1 plate at this location >",
    "Locations > Lab 1 > Hood 1 > Bench 1 > UBox1\t100",
    "Locations > Lab 2 > Fridge 2 > Box 2\t9\t9",
    "Locations > Lab 2 > Fridge 2 > Box 3\t9\t9",
    "Locations > Lab 3 > hood 2 > Box 4\t9\t9",
].join("\n");

const copied = treeToLines(nodes);
assert.equal(copied.text, expected);
assert.equal(copied.locations, 11);
assert.equal(copied.boxes, 8);

// The paste side reads each line back with its own kind.
assert.deepEqual(parsePastedLine("A > B\t9\t9"), { name: "A > B", size: { columns: 9, rows: 9, organized: true } });
assert.deepEqual(parsePastedLine("A > U\t100"), { name: "A > U", size: { capacity: 100, organized: false } });
assert.deepEqual(parsePastedLine("A > B >"), { name: "A > B >", size: null });

// Pasted into an empty vault (the root alone, no Into): every copied line is
// accepted; a relative line is refused until Into is picked.
{
    const empty = buildNodes([{ id: "1", parentId: "undefined", name: "Locations", rendered: true, canTakeLocation: true, canTakeBox: false }]);
    const kept = [];
    for (const line of copied.text.split("\n")) {
        const scan = classifyScan(parsePastedLine(line).name, empty, kept, { targetId: null });
        assert.equal(scan.status, SCAN_OK, line);
        kept.push(scan);
    }
    assert.equal(kept.length, 11);
    assert.equal(classifyScan("Shelf A > R-1", empty, [], { targetId: null }).status, SCAN_BLOCKED);
}
