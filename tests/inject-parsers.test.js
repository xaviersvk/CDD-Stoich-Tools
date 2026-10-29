import { test } from "node:test";
import assert from "node:assert/strict";

import { isElnPayload, hasAnyReactionFeature, getReactionFeatures } from "../src/inject/parsers/common.js";
import { shortenLocation, resolveRowName, collectCustomFields } from "../src/inject/parsers/field-resolvers.js";
import { extractAllReactionRows } from "../src/inject/parsers/sample-data.js";
import { extractPrintData } from "../src/inject/parsers/print-data.js";

// Hand-built eln/v2 payloads: only the fields the parsers read, in the shape
// the comments in src/inject/parsers describe.

const sampleRow = (over = {}) => ({
    role: "reactant",
    uid: over.uid ?? "u1",
    sample: {
        id: 11,
        sample_identifier: "RGT-0001-001-S1",
        url: "/vaults/6884/inventory_samples/11",
        location: "Lab 1 > Fridge A > Box 3",
    },
    ...over,
});

const reaction = (id, rows) => ({ id, type: "reaction", data: { stoichiometryTable: { rows } } });

const entry = (featureMap, body) => ({
    eln_entry: { id: 1, title: "Test entry", identifier: "MDX-0001", feature_map: featureMap, body },
});

test("an ELN payload is recognised by its feature_map", () => {
    assert.equal(isElnPayload(entry({})), true);
    assert.equal(isElnPayload({ eln_entry: {} }), false);
    assert.equal(isElnPayload(null), false);
    assert.equal(hasAnyReactionFeature(entry({ 1: { type: "text" } })), false);
    assert.equal(hasAnyReactionFeature(entry({ 1: reaction(1, []) })), true);
});

test("reactions follow the order of the entry body, not of feature ids", () => {
    const body = JSON.stringify([
        { type: "reaction", data: { feature_id: 20 }, children: [] },
        { type: "paragraph", children: [{ type: "reaction", data: { feature_id: 10 } }] },
    ]);
    const features = getReactionFeatures(entry({ 10: reaction(10, []), 20: reaction(20, []), 30: reaction(30, []) }, body));
    assert.deepEqual(features.map((f) => f.id), [20, 10, 30]);
});

test("row numbers group reactants, agents, products, and honour displayIndex", () => {
    const rows = [
        { role: "product", uid: "p", batchId: 5, moleculeName: "PROD" },
        { role: "agent", uid: "b", batchId: 2, displayIndex: 1 },
        { role: "agent", uid: "a", batchId: 1, displayIndex: 0 },
        sampleRow({ uid: "r" }),
    ];
    const { samples } = extractAllReactionRows(entry({ 1: reaction(1, rows) }));
    assert.deepEqual(samples.map((s) => [s.rowUid, s.rowNumber]), [["r", 1], ["a", 2], ["b", 3], ["p", 4]]);
});

test("rows with neither sample nor batch are dropped, unregistered products kept", () => {
    const rows = [
        { role: "solvent", uid: "s" },
        { role: "product", uid: "p", iupacName: "drawn product" },
    ];
    const { samples } = extractAllReactionRows(entry({ 1: reaction(1, rows) }));
    assert.deepEqual(samples.map((s) => s.rowUid), ["p"]);
    assert.equal(samples[0].name, "drawn product");
});

test("a parallel reaction drops the Variable product and letters its pairs", () => {
    const rows = [
        { role: "product", uid: "variable" },
        { role: "parallelReagent", uid: "ra", batchId: 1, parallelReactionsPairId: "x" },
        { role: "parallelProduct", uid: "pa", batchId: 2, parallelReactionsPairId: "x" },
        { role: "parallelReagent", uid: "rb", batchId: 3, parallelReactionsPairId: "y" },
    ];
    const { samples } = extractAllReactionRows(entry({ 1: reaction(1, rows) }));
    assert.deepEqual(samples.map((s) => [s.rowUid, s.parallelLetter, s.parallelOrdinal]), [
        ["ra", "A", 1],
        ["pa", "A", 1],
        ["rb", "B", 1],
    ]);
});

test("table values: purity is a fraction, 1 means untyped; vault from the sample url", () => {
    const rows = [
        sampleRow({ uid: "a", purity: 0.982, userInput: { density: "1.2" }, name: "DIPEA", concentration: 0.5 }),
        sampleRow({ uid: "b", purity: 1, sample: { id: 12, sample_identifier: "S-2" } }),
    ];
    const [a, b] = extractAllReactionRows(entry({ 1: reaction(1, rows) })).samples;
    assert.equal(a.tablePurity, "98.2");
    assert.equal(a.typedDensity, "1.2");
    assert.equal(a.tableName, "DIPEA");
    assert.equal(a.tableConcentration, "0.5");
    assert.equal(a.tableConcentrationUnits, "mol/L");
    assert.equal(a.sampleVaultId, "6884");
    assert.equal(a.location, "Fridge A > Box 3");
    assert.equal(b.tablePurity, null);
    assert.equal(b.sampleVaultId, null);
});

test("the same sample in the same row is listed once", () => {
    const row = sampleRow({ uid: "dup" });
    const { samples } = extractAllReactionRows(entry({ 1: reaction(1, [row, row]) }));
    assert.equal(samples.length, 1);
});

test("field resolvers", () => {
    assert.equal(shortenLocation("A > B > C"), "B > C");
    assert.equal(shortenLocation("Only"), "Only");
    assert.equal(resolveRowName({ moleculeName: "RGT-0001620", batch: { name: "001" } }), "RGT-0001620-001");
    assert.equal(resolveRowName({ moleculeName: "RGT-1", batch: { name: "Unspecified Batch" } }), "RGT-1");
    assert.deepEqual(collectCustomFields({ a: { value: 3 }, b: "", c: { nested: 1 }, d: "x" }), { a: 3, d: "x" });
});

test("print data carries one payload per reaction, with the entry identifier", () => {
    const data = extractPrintData(entry({ 1: reaction(1, [sampleRow()]), 2: reaction(2, [sampleRow({ uid: "z" })]) }));
    assert.equal(data.reactionPayloads.length, 2);
    assert.equal(data.reactionPayloads[0].identifier, "MDX-0001");
    assert.equal(data.reactionPayloads[0].title, "Test entry");
    assert.ok(Array.isArray(data.reactionPayloads[0].rows));
});
