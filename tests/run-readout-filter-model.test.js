import { test } from "node:test";
import assert from "node:assert/strict";

import {
    columnIndexes,
    matchesQuery,
    parseQuery,
} from "../src/content/features/ui-fixes/run-readout-filter/model.js";

const row = (molecule, plate, well) => ({ molecule, plate, well });
const hit = (query, r) => matchesQuery(r, parseQuery(query));

const tracer = row("PHA-0334303", "1059", "H01");
const other = row("PHA-0334468", "1059", "A01");

test("an empty query shows every row", () => {
    assert.deepEqual(parseQuery("  "), []);
    assert.equal(hit("", other), true);
});

test("a molecule name matches with or without its dash, in any case", () => {
    assert.equal(hit("PHA-0334303", tracer), true);
    assert.equal(hit("pha-0334303", tracer), true);
    assert.equal(hit("PHA 0334303", tracer), true); // two words, both in the name
    assert.equal(hit("0334303", tracer), true);
    assert.equal(hit("PHA-0334303", other), false);
});

test("a plate matches exactly", () => {
    assert.equal(hit("1059", tracer), true);
    assert.equal(hit("105", row("PHA-1", "1059", "A01")), false);
});

test("a well matches with or without the leading zero", () => {
    assert.equal(hit("H01", tracer), true);
    assert.equal(hit("h1", tracer), true);
    assert.equal(hit("H02", tracer), false);
});

test("a bare row letter or row* matches the whole row, not molecules", () => {
    assert.equal(hit("H", tracer), true);
    assert.equal(hit("H*", tracer), true);
    assert.equal(hit("H", other), false); // PHA contains H, but H is a well row here
    assert.equal(hit("A*", other), true);
});

test("words in a group must all match; groups are alternatives", () => {
    assert.equal(hit("1059 H*", tracer), true);
    assert.equal(hit("1059 H*", other), false);
    assert.equal(hit("PHA-0334303, A01", other), true);
    assert.equal(hit("PHA-0334303; A01", tracer), true);
    assert.equal(hit("PHA-0334303 A01", tracer), false);
});

test("* is a wildcard over a whole field", () => {
    assert.equal(hit("*4303", tracer), true);
    assert.equal(hit("10*", tracer), true);
    assert.equal(hit("PHA-03343*", tracer), true);
    assert.equal(hit("*4303", other), false);
});

test("columnIndexes reads the header text", () => {
    assert.deepEqual(columnIndexes(["", " Molecule ", "Batch", "Plate", "Well", "Sample Name"]), {
        molecule: 1,
        plate: 3,
        well: 4,
    });
    assert.deepEqual(columnIndexes(["Molecule"]), { molecule: 0, plate: -1, well: -1 });
});
