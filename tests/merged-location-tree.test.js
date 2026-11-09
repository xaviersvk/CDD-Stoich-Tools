import { test } from "node:test";
import assert from "node:assert/strict";

import {
    countBoxes,
    filterMergedTree,
    locateInLiveTree,
    mergeVaultTrees,
    nameKey,
} from "../src/shared/merged-location-tree.js";

const loc = (value, display_order, children = []) =>
    ({ value, display_order, organized: true, num_columns: 0, children, plates: [] });
const box = (value, display_order = 0) =>
    ({ value, display_order, organized: true, num_columns: 9, num_rows: 9, children: [], plates: [] });

test("nameKey ignores case and runs of spaces", () => {
    assert.equal(nameKey("  Fume  Hood 1 "), "fume hood 1");
});

test("the same path in two vaults becomes one node holding both vaults", () => {
    const roots = mergeVaultTrees([
        { id: 1, name: "A", roots: [loc("PharmTheon", 0, [loc("BIO Lab", 0, [box("R1")])])] },
        { id: 2, name: "B", roots: [loc("PharmTheon", 0, [loc("bio lab", 0, [box("R2")])])] },
    ]);
    assert.equal(roots.length, 1);
    assert.deepEqual(roots[0].vaults, ["1", "2"]);
    const lab = roots[0].children[0];
    assert.equal(lab.label, "BIO Lab"); // the first vault's spelling
    assert.deepEqual(lab.vaults, ["1", "2"]);
    assert.deepEqual(lab.children.map((n) => [n.label, n.vaults]), [["R1", ["1"]], ["R2", ["2"]]]);
});

test("a node carries its label path and a box its size", () => {
    const [root] = mergeVaultTrees([
        { id: 1, name: "A", roots: [loc("PharmTheon", 0, [box("R1"), { ...box("U1", 1), organized: false, num_columns: 0, position_limit: 100 }])] },
    ]);
    assert.deepEqual(root.children[0].labels, ["PharmTheon", "R1"]);
    assert.deepEqual(root.children[0].box, { organized: true, columns: 9, rows: 9, capacity: null });
    assert.deepEqual(root.children[1].box, { organized: false, columns: 0, rows: 0, capacity: 100 });
    assert.equal(root.box, null);
});

test("the same name under different parents stays apart", () => {
    const roots = mergeVaultTrees([
        { id: 1, name: "A", roots: [loc("X", 0, [box("01")]), loc("Y", 1, [box("01")])] },
    ]);
    assert.notEqual(roots[0].children[0].key, roots[1].children[0].key);
});

test("siblings follow the first vault's display order; others append", () => {
    const roots = mergeVaultTrees([
        { id: 1, name: "A", roots: [loc("Second", 1), loc("First", 0)] },
        { id: 2, name: "B", roots: [loc("Only B", 0), loc("First", 1)] },
    ]);
    assert.deepEqual(roots.map((n) => n.label), ["First", "Second", "Only B"]);
});

test("a box in any vault makes the merged node a box; plates are left out", () => {
    const roots = mergeVaultTrees([
        { id: 1, name: "A", roots: [{ ...loc("P", 0), plates: [{ id: 9, value: "Plate 1" }] }] },
        { id: 2, name: "B", roots: [{ ...box("P"), organized: false, num_columns: 0 }] },
    ]);
    assert.equal(roots[0].isBox, true);
    assert.equal(roots[0].children.length, 0);
});

test("filter keeps matches and the path above them", () => {
    const roots = mergeVaultTrees([
        { id: 1, name: "A", roots: [loc("PharmTheon", 0, [loc("Lab", 0, [box("Freezer 3")]), loc("Office", 1)])] },
    ]);
    const result = filterMergedTree(roots, "freezer");
    const lab = roots[0].children[0];
    assert.ok(result.show.has(roots[0].key));
    assert.ok(result.show.has(lab.key));
    assert.ok(result.matches.has(lab.children[0].key));
    assert.ok(!result.show.has(roots[0].children[1].key));
    assert.deepEqual([...result.open].sort(), [roots[0].key, lab.key].sort());
    assert.equal(filterMergedTree(roots, "  "), null);
});

test("locateInLiveTree finds the deepest existing node and what is missing", () => {
    const live = [
        { id: "1", parentId: null, name: "Locations" },
        { id: "2", parentId: "1", name: "PharmTheon" },
        { id: "3", parentId: "2", name: "BIO  lab" },
        { id: "9", parentId: "3", name: "Plate X", isPlate: true },
    ];
    assert.deepEqual(locateInLiveTree(live, ["PharmTheon", "BIO Lab", "Freezer 3", "R1"]),
        { rootId: "1", anchorId: "3", missing: ["Freezer 3", "R1"] });
    assert.deepEqual(locateInLiveTree(live, ["PharmTheon"]), { rootId: "1", anchorId: "2", missing: [] });
    assert.deepEqual(locateInLiveTree(live, ["IOCB"]), { rootId: "1", anchorId: "1", missing: ["IOCB"] });
    assert.deepEqual(locateInLiveTree(live, ["PharmTheon", "BIO Lab", "Plate X"]).missing, ["Plate X"]);
    assert.equal(locateInLiveTree([], ["A"]), null);
});

test("countBoxes counts every box below a node", () => {
    const [root] = mergeVaultTrees([
        { id: 1, name: "A", roots: [loc("R", 0, [box("a"), loc("L", 1, [box("b"), box("c")])])] },
    ]);
    assert.equal(countBoxes(root), 3);
});
