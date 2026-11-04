import { test } from "node:test";
import assert from "node:assert/strict";

import { concentrationText, isWeightPercent } from "../src/shared/concentration-text.js";

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
    assert.deepEqual(concentrationText("5", "%w/v"), { text: "5 %w/v", molPerL: null });
    assert.deepEqual(concentrationText("5", "% w/v"), { text: "5 %w/v", molPerL: null });
});

test("a bare % is w/w: converted to w/v by the density, refused without one", () => {
    // Ammonia 28 % w/w, 0.90 g/mL → 25.2 g per 100 mL.
    assert.deepEqual(concentrationText("28", "%", "0.90"), { text: "25.2 %w/v", molPerL: null });
    assert.deepEqual(concentrationText("28", "% w/w", 0.9), { text: "25.2 %w/v", molPerL: null });
    assert.deepEqual(concentrationText("37", "wt%", "1,18"), { text: "43.66 %w/v", molPerL: null });
    assert.equal(concentrationText("28", "%"), null);
    assert.equal(concentrationText("28", "%", "0"), null);
});

test("isWeightPercent tells w/w from w/v", () => {
    for (const u of ["%", "%w/w", "% (w/w)", "wt%", "W/W %"]) assert.equal(isWeightPercent(u), true, u);
    for (const u of ["%w/v", "M", "", null]) assert.equal(isWeightPercent(u), false, String(u));
});

test("a unit CDD cannot take, or no number, is refused", () => {
    assert.equal(concentrationText("10", "mg/mL"), null);
    assert.equal(concentrationText("n/a", "mM"), null);
});
