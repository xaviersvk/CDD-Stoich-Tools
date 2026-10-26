import { test } from "node:test";
import assert from "node:assert/strict";

import { concentrationText } from "../src/shared/concentration-text.js";

test("mM is written as mmol/l and shows as mol/L", () => {
    assert.deepEqual(concentrationText("15", "mM"), { text: "15 mmol/l", molPerL: 0.015 });
});

test("M and mM are told apart by case", () => {
    assert.deepEqual(concentrationText("2", "M"), { text: "2 mol/l", molPerL: 2 });
    assert.deepEqual(concentrationText("2", "mmol/L"), { text: "2 mmol/l", molPerL: 0.002 });
});

test("units CDD has no word for are scaled into mmol/l", () => {
    assert.deepEqual(concentrationText("50", "µM"), { text: "0.05 mmol/l", molPerL: 0.00005 });
    assert.deepEqual(concentrationText("10", "nM"), { text: "0.00001 mmol/l", molPerL: 1e-8 });
});

test("per-mL units stay per mL", () => {
    assert.deepEqual(concentrationText("0.5", "mmol/mL"), { text: "0.5 mmol/ml", molPerL: 0.5 });
});

test("no unit is a bare number, which CDD reads as mol/L", () => {
    assert.deepEqual(concentrationText("0.1", null), { text: "0.1", molPerL: 0.1 });
});

test("a decimal comma is read", () => {
    assert.deepEqual(concentrationText("1,5", "M"), { text: "1.5 mol/l", molPerL: 1.5 });
});

test("%w/v passes through and is not a molarity", () => {
    assert.deepEqual(concentrationText("5", "%"), { text: "5 %w/v", molPerL: null });
});

test("a unit CDD cannot take, or no number, is refused", () => {
    assert.equal(concentrationText("10", "mg/mL"), null);
    assert.equal(concentrationText("n/a", "mM"), null);
});
