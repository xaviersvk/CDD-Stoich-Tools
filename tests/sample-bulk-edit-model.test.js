import { test } from "node:test";
import assert from "node:assert/strict";

import {
    buildSampleEntries,
    currentValue,
    editableFields,
    previewRows,
    sameValue,
    sampleUrl,
} from "../src/content/features/sample-bulk-edit/model.js";

// Vault 6885's inventory sample fields, as the definitions endpoint served them.
const DEFS = [
    { id: 150260, name: "Date", data_type_name: "Date" },
    { id: 157452, name: "Expiration Date", data_type_name: "Date" },
    { id: 150250, name: "Sample Number", data_type_name: "Text" },
    { id: 150254, name: "Barcode", data_type_name: "Text" },
    { id: 150251, name: "Solvent", data_type_name: "Text" },
    { id: 150252, name: "Concentration", data_type_name: "Number" },
    {
        id: 150253, name: "Concentration Unit", data_type_name: "PickList",
        pick_list_values: [{ value: "mM" }, { value: "old", hidden: true }, { value: "uM" }],
    },
    { id: 150299, name: "Spectrum", data_type_name: "File" },
];

const SAMPLE = {
    id: 1000162492,
    name: "RGT-0001968-001-I004889",
    units: "µL",
    batch_id: 193742714,
    depleted: false,
    fields: { "Sample Number": "I004889", Concentration: 10, "Concentration Unit": "uM", Date: "2026-10-20" },
};

const UNIT = { id: 150253, name: "Concentration Unit", type: "PickList", options: ["mM", "uM"] };

test("editableFields leaves out per-sample ids, files and hidden pick list values", () => {
    const fields = editableFields({ inventory_sample_field_definitions: DEFS });
    assert.deepEqual(fields.map((f) => f.name),
        ["Date", "Expiration Date", "Solvent", "Concentration", "Concentration Unit"]);
    assert.deepEqual(fields.find((f) => f.name === "Concentration Unit").options, ["mM", "uM"]);
    assert.deepEqual(editableFields(null), []);
});

test("currentValue reads by name, objects by their value", () => {
    assert.equal(currentValue(SAMPLE, "Concentration Unit"), "uM");
    assert.equal(currentValue(SAMPLE, "concentration"), "10");
    assert.equal(currentValue(SAMPLE, "Solvent"), "");
    assert.equal(currentValue({ fields: { Solvent: { value: "DMSO" } } }, "Solvent"), "DMSO");
});

test("sameValue compares numbers as numbers", () => {
    assert.ok(sameValue("10", "10.0", "Number"));
    assert.ok(!sameValue("10", "10.0", "Text"));
    assert.ok(!sameValue("", "0", "Number"));
});

test("previewRows marks samples that already hold the value", () => {
    const other = { ...SAMPLE, id: 2, fields: { ...SAMPLE.fields, "Concentration Unit": "mM" } };
    const rows = previewRows([SAMPLE, other], UNIT, "mM");
    assert.deepEqual(rows.map((r) => [r.from, r.to, r.unchanged]), [["uM", "mM", false], ["mM", "mM", true]]);
});

test("buildSampleEntries sends every field with the edited one replaced", () => {
    const { entries, error } = buildSampleEntries(SAMPLE, DEFS, UNIT, "mM");
    assert.equal(error, undefined);
    assert.deepEqual(entries, [
        ["inventory_sample[id]", "1000162492"],
        ["inventory_sample[name]", "RGT-0001968-001-I004889"],
        ["inventory_sample[units]", "µL"],
        ["inventory_sample[batch_id]", "193742714"],
        ["inventory_sample[depleted]", "false"],
        ["inventory_sample[fields_attributes][0][field_definition_id]", "150250"],
        ["inventory_sample[fields_attributes][0][value]", "I004889"],
        ["inventory_sample[fields_attributes][1][field_definition_id]", "150252"],
        ["inventory_sample[fields_attributes][1][value]", "10"],
        ["inventory_sample[fields_attributes][2][field_definition_id]", "150253"],
        ["inventory_sample[fields_attributes][2][value]", "mM"],
        ["inventory_sample[fields_attributes][3][field_definition_id]", "150260"],
        ["inventory_sample[fields_attributes][3][value]", "2026-10-20"],
    ]);
});

test("buildSampleEntries adds a field the sample lacks, and clears with an empty value", () => {
    const solvent = { id: 150251, name: "Solvent", type: "Text", options: [] };
    const added = buildSampleEntries(SAMPLE, DEFS, solvent, " DMSO ").entries;
    assert.deepEqual(added.slice(-2), [
        ["inventory_sample[fields_attributes][4][field_definition_id]", "150251"],
        ["inventory_sample[fields_attributes][4][value]", "DMSO"],
    ]);

    const cleared = buildSampleEntries(SAMPLE, DEFS, UNIT, "").entries;
    assert.deepEqual(cleared.find(([k]) => k === "inventory_sample[fields_attributes][2][value]"),
        ["inventory_sample[fields_attributes][2][value]", ""]);
});

test("buildSampleEntries sends a file's uploaded_file_id", () => {
    const sample = { ...SAMPLE, fields: { Spectrum: { uploaded_file_id: 77, value: "a.pdf" } } };
    const { entries } = buildSampleEntries(sample, DEFS, UNIT, "mM");
    assert.ok(entries.some(([k, v]) => k === "inventory_sample[fields_attributes][0][value]" && v === "77"));
});

test("buildSampleEntries refuses a sample holding an unknown field", () => {
    const sample = { ...SAMPLE, fields: { ...SAMPLE.fields, Mystery: "x" } };
    assert.match(buildSampleEntries(sample, DEFS, UNIT, "mM").error, /Mystery/);
});

test("sampleUrl", () => {
    assert.equal(sampleUrl(6885, 166626302, 1), "/vaults/6885/molecules/166626302/inventory_samples/1");
});
