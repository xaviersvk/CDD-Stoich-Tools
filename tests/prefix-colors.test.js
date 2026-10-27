import { test } from "node:test";
import assert from "node:assert/strict";

import { extractPrefix, sanitizePrefixColorMap } from "../src/shared/prefix-colors.js";

test("Sample IDs give the part before the batch number", () => {
    assert.equal(extractPrefix("IXX-DEMO-0000048-001-SM000025"), "IXX-DEMO");
    assert.equal(extractPrefix("PHA-0265229-001-S001095"), "PHA");
    assert.equal(extractPrefix("I88-SM-0060050-005-I88S034537"), "I88-SM");
    assert.equal(extractPrefix("  RGT-0000012-001-S000001 "), "RGT");
});

test("molecule names are not Sample IDs", () => {
    assert.equal(extractPrefix("(E)-2-benzyl-1-phenyl-3-oxo-butanoate"), null);
    assert.equal(extractPrefix("tert-butyl (R)-2-[4-cyclopropyl-1H-1,3-benzimidazol-2-yl]-1-pyrrolidinecarboxylate"), null);
    assert.equal(extractPrefix("6-methylene-2,4-dioxo-1-2-3-x"), null);
});

test("batch-only ids and blanks have no prefix", () => {
    assert.equal(extractPrefix("PHA-0334442-001"), null);
    assert.equal(extractPrefix(""), null);
    assert.equal(extractPrefix(null), null);
});

test("colourless molecule names are cleaned out, coloured entries stay", () => {
    assert.deepEqual(
        sanitizePrefixColorMap({
            "IXX-DEMO": "",
            "PHA": "#43a047",
            "(E)-2-benzyl-1": "",
            "6-methylene-2,4": "",
            "my odd prefix": "#1976d2",
        }),
        { "IXX-DEMO": "", "PHA": "#43a047", "my odd prefix": "#1976d2" },
    );
});
