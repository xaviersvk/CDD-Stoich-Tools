import { test } from "node:test";
import assert from "node:assert/strict";

import { batchFieldDefs, definitionsUrl } from "../src/content/api/field-definitions.js";
import { reduceProps } from "../src/content/api/registration-form-fields.js";
import {
    fieldIdFromErrorId,
    picklistsFromDefinitions,
} from "../src/content/features/ui-fixes/slurp-picklist-defaults.js";
import {
    findDefId,
    readBatchFieldsByName,
    readBatchProps,
    readFieldByLabel,
} from "../src/content/api/batch-registration-props.js";

// The shape of /api/internal/v1/vaults/{v}/data_sets/{v}/registration_form_definitions,
// trimmed to what the readers look at.
const definitions = {
    molecule_field_definitions: [
        {
            id: 159492,
            name: "Origin",
            data_type_name: "PickList",
            pick_list_values: [
                { value: "Commercial" },
                { value: "Old", hidden: true },
                { value: "Synthesized" },
                { value: "  " },
            ],
        },
        { id: 11, name: "Comments", data_type_name: "Text" },
    ],
    batch_field_definitions: [
        { id: 21, name: "Batch Name", is_batch_name_field: true },
        { id: 22, name: "*Internal ID" },
        { id: 23, name: "Purity [%]" },
        { id: 24, data_type_name: "PickList", pick_list_values: [{ value: "Final" }] },
    ],
    inventory_sample_field_definitions: [{ id: 31, name: "Solvent" }],
    registration_form_definitions: [
        {
            name: " Molecule ",
            components: {
                molecule: { sections: [{ contents: [{ fieldID: 159492 }, { fieldID: 11 }] }] },
                batch: [{ fieldID: 22 }, { contents: [{ fieldID: 23 }] }],
            },
        },
        { name: "Empty", components: {} },
        { name: "No layout" },
    ],
};

test("definitionsUrl is the vault's data set endpoint", () => {
    assert.equal(
        definitionsUrl(6772),
        "/api/internal/v1/vaults/6772/data_sets/6772/registration_form_definitions"
    );
});

test("batchFieldDefs keeps id and name of named batch fields", () => {
    assert.deepEqual(batchFieldDefs(definitions), [
        { id: 21, name: "Batch Name" },
        { id: 22, name: "*Internal ID" },
        { id: 23, name: "Purity [%]" },
    ]);
    assert.deepEqual(batchFieldDefs(null), []);
});

test("reduceProps maps each form to the field names it lays out", () => {
    const map = reduceProps(definitions);
    assert.deepEqual(map.forms.Molecule, {
        entity: ["Origin", "Comments"],
        batch: ["*Internal ID", "Purity [%]"],
        sample: [],
    });
    assert.deepEqual(map.forms.Empty, { entity: [], batch: [], sample: [] });
    assert.ok(!("No layout" in map.forms));
    assert.deepEqual(map.known.sample, ["Solvent"]);
    assert.equal(typeof map.fetchedAt, "number");
});

test("reduceProps returns null without forms", () => {
    assert.equal(reduceProps({ ...definitions, registration_form_definitions: [] }), null);
    assert.equal(reduceProps(null), null);
});

test("picklistsFromDefinitions keeps visible, non-blank values", () => {
    const map = picklistsFromDefinitions(definitions);
    assert.deepEqual(map.get("159492"), ["Commercial", "Synthesized"]);
    assert.deepEqual(map.get("24"), ["Final"]);
    assert.equal(map.has("11"), false);
    assert.equal(picklistsFromDefinitions(null).size, 0);
});

test("fieldIdFromErrorId reads CDD's dialog id", () => {
    assert.equal(fieldIdFromErrorId("provide159492-dialog"), "159492");
    assert.equal(fieldIdFromErrorId("provide-dialog"), null);
    assert.equal(fieldIdFromErrorId(undefined), null);
});

// A stand-in for a parsed molecule page: just the renderers' react_props.
function fakeDoc(propsList) {
    const elements = propsList.map((props) => ({
        getAttribute: (name) => (name === "react_props" ? JSON.stringify(props) : null),
    }));
    return { querySelectorAll: () => elements };
}

// Today's renderers: data rows, no batch_field_definitions.
const lot = {
    resource_type: "batch",
    object_id: 900,
    data: {
        a: { batch_field_definition_id: 21, text_value: "001" },
        b: { batch_field_definition_id: 22, text_value: "" },
        c: { batch_field_definition_id: 23, float_value: 98.5 },
    },
};
const blank = { resource_type: "batch", object_id: null, data: {} };

test("readBatchProps names a lot's values from the vault's definitions", () => {
    const props = readBatchProps(fakeDoc([blank, lot]), "900", batchFieldDefs(definitions));
    assert.deepEqual(props.fieldMap, { "Batch Name": "001", "Purity [%]": 98.5 });
    assert.equal(findDefId(props.defs, "Internal ID"), 22);
    assert.equal(readFieldByLabel(props.fieldMap, "Internal ID"), null);
    assert.equal(readFieldByLabel(props.fieldMap, "purity [%]"), "98.5");
});

test("readBatchProps without definitions names nothing", () => {
    const props = readBatchProps(fakeDoc([lot]), 900);
    assert.deepEqual(props.fieldMap, {});
    assert.equal(readBatchProps(fakeDoc([lot]), 901), null);
});

test("definitions still embedded in the props win over the fallback", () => {
    const old = { ...lot, batch_field_definitions: [{ id: 23, name: "Purity" }] };
    const props = readBatchProps(fakeDoc([old]), 900, batchFieldDefs(definitions));
    assert.deepEqual(props.fieldMap, { Purity: 98.5 });
});

test("readBatchFieldsByName keys saved lots by their batch name", () => {
    const byName = readBatchFieldsByName(fakeDoc([blank, lot]), batchFieldDefs(definitions));
    assert.deepEqual([...byName.keys()], ["001"]);
    assert.equal(byName.get("001")["Purity [%]"], 98.5);
});
