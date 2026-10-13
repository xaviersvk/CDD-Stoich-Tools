import { test } from "node:test";
import assert from "node:assert/strict";

import {
    displayFormat,
    isGenerated,
    readoutCount,
    retargetFormula,
    toClipboard,
} from "../src/content/features/ui-fixes/readout-clipboard/model.js";

test("displayFormat turns CDD's precision pair into the editor's string", () => {
    assert.equal(displayFormat("significant figure", 1), "1 significant figure");
    assert.equal(displayFormat("significant figure", 3), "3 significant figures");
    assert.equal(displayFormat("decimal place", 0), "0 (integer)");
    assert.equal(displayFormat("decimal place", 1), "1 decimal place");
    assert.equal(displayFormat("decimal place", 2), "2 decimal places");
    assert.equal(displayFormat(null, null), "None");
    assert.equal(displayFormat("significant figure", 0), "None");
});

test("isGenerated spots a calculation's own outputs", () => {
    assert.equal(isGenerated({ parent_readout_definition_id: 5 }), true);
    assert.equal(isGenerated({ calculation_id: 7, calculation_type: null }), true);
    assert.equal(isGenerated({ calculation_id: 7, calculation_type: "CustomCalculation" }), false);
    assert.equal(isGenerated({ name: "plain" }), false);
});

test("retargetFormula renames only references to the source protocol", () => {
    const formula = "-log([Old -> IC50]/1e6) + [Other -> X]";
    assert.equal(retargetFormula(formula, "Old", "New"), "-log([New -> IC50]/1e6) + [Other -> X]");
    assert.equal(retargetFormula(formula, "Old", "Old"), formula);
    assert.equal(retargetFormula(formula, "", "New"), formula);
});

const readouts = [
    {
        id: 1,
        name: "Concentration",
        data_type_name: "Number",
        display_order: 1,
        precision_type: "significant figure",
        precision_number: 3,
        unit_label: "uM",
    },
    {
        id: 2,
        name: "Polarization",
        data_type_name: "Number",
        display_order: 0,
        normalized_calculations_attributes: [{ type: "PercentBoundFraction", name: "Polarization % bound", scope: "run" }],
    },
    {
        id: 3,
        name: "Hill slope",
        display_order: 2,
        calculation_id: 30,
        calculation_type: "DoseResponseCalculation",
    },
    { id: 4, name: "IC50 CI", display_order: 3, calculation_id: 30, calculation_type: null },
    {
        id: 5,
        name: "pIC50",
        display_order: 4,
        data_type_name: "Number",
        calculation_id: 50,
        calculation_type: "CustomCalculation",
    },
    { id: 6, name: "Odd one", display_order: 5, calculation_id: 60, calculation_type: "SomethingElse" },
];

const calculationsById = new Map([
    [
        "30",
        {
            dose_readout_definition_id: 1,
            response_readout_definition_id: 2,
            normalized: true,
            equation_type: 0,
            intercept_readout_definitions_attributes: [
                { name: "IC50", intercept: 50, precision_type: "decimal place", precision_number: 2, unit_label: "uM" },
            ],
        },
    ],
    ["50", { formatted_formula: "-log([Src -> IC50]/1e6)" }],
]);

test("toClipboard keeps what Protocol Details lists, in display order", () => {
    const entry = toClipboard({ vaultId: "1", vaultName: "V", protocolName: "Src", readouts, calculationsById });

    assert.deepEqual(entry.readouts.map((r) => r.name), ["Polarization", "Concentration"]);
    assert.equal(entry.readouts[1].display_format, "3 significant figures");
    assert.equal(entry.readouts[1].unit_label, "uM");
    assert.equal(entry.readouts[0].normalized_calculations_attributes[0].name, "Polarization % bound");

    assert.deepEqual(entry.calculations.map((c) => c.kind), ["dose-response", "custom"]);

    const fit = entry.calculations[0];
    assert.equal(fit.doseName, "Concentration");
    assert.equal(fit.responseName, "Polarization");
    assert.equal(fit.name, "IC50");
    assert.equal(fit.body.intercept_readout_definitions_attributes[0].display_format, "2 decimal places");

    const custom = entry.calculations[1];
    assert.equal(custom.body.formatted_formula, "-log([Src -> IC50]/1e6)");
    assert.equal(custom.body.aggregate_readouts_by, "batch and run");

    assert.deepEqual(entry.skipped, [{ name: "Odd one", type: "SomethingElse" }]);
    // the fit's own CI output is never copied
    assert.ok(!JSON.stringify(entry).includes("IC50 CI"));
});

test("toClipboard keeps a fit with no intercepts (linear equation)", () => {
    const entry = toClipboard({
        vaultId: "1",
        protocolName: "Src",
        readouts: [
            { id: 1, name: "Concentration", data_type_name: "Number", display_order: 0 },
            { id: 2, name: "Absorption", data_type_name: "Number", display_order: 1 },
            { id: 3, name: "Slope", display_order: 2, calculation_id: 40, calculation_type: "DoseResponseCalculation" },
            { id: 4, name: "Y-Intercept", display_order: 2, calculation_id: 40, calculation_type: null },
        ],
        calculationsById: new Map([
            [
                "40",
                {
                    dose_readout_definition_id: 1,
                    response_readout_definition_id: 2,
                    normalized: true,
                    equation_type: 1,
                    intercept_readout_definitions_attributes: [],
                },
            ],
        ]),
    });

    assert.deepEqual(entry.skipped, []);
    assert.equal(entry.calculations.length, 1);
    const fit = entry.calculations[0];
    assert.equal(fit.kind, "dose-response");
    assert.equal(fit.name, "Slope");
    assert.equal(fit.body.equation_type, 1);
    assert.deepEqual(fit.body.intercept_readout_definitions_attributes, []);
});

test("readoutCount counts readouts, normalisations and calculations", () => {
    const entry = toClipboard({ vaultId: "1", protocolName: "Src", readouts, calculationsById });
    assert.equal(readoutCount(entry), 2 + 1 + 2);
    assert.equal(readoutCount(null), 0);
});
