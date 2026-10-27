import { test } from "node:test";
import assert from "node:assert/strict";

import { describeField } from "../src/content/features/ui-fixes/field-clipboard/field-model.js";
import {
    PLAN_ADD,
    PLAN_MISSING_FIELDS,
    missingFields,
    neutralize,
    planForms,
    usedFieldDefinitions,
} from "../src/content/features/ui-fixes/form-clipboard/form-model.js";

const SOURCE = {
    protocol: [
        { id: 1, name: "Description", data_type_name: "LongText", disabled: true },
        { id: 2, name: "Target", data_type_name: "Text" },
    ],
    run: [
        { id: 10, name: "Temperature", data_type_name: "Number", required_group_number: 1 },
        {
            id: 11,
            name: "Solvent",
            data_type_name: "PickList",
            pick_list_values: [{ value: "DMSO" }, { value: "MeOH" }, { value: "old", hidden: true }],
        },
        { id: 12, name: "Operator", data_type_name: "Text" },
    ],
};

const FORM = {
    name: "Kinetics",
    form_type: "protocol_form",
    components: {
        protocol: [[{ fieldID: 1 }], [{ fieldID: 2 }]],
        run: [[{ fieldID: 10 }], [{ fieldID: 11 }]],
    },
};

function neutral() {
    return neutralize(FORM, SOURCE).form;
}

test("usedFieldDefinitions carries only the fields the forms use, built-ins left out", () => {
    const defs = usedFieldDefinitions([neutral()], SOURCE);
    assert.deepEqual(defs.protocol.map((field) => field.name), ["Target"]);
    assert.deepEqual(defs.run.map((field) => field.name), ["Temperature", "Solvent"]);
    assert.equal(defs.run[0].required, "required");
    assert.deepEqual(defs.run[1].pickList, ["DMSO", "MeOH"]);
});

test("missingFields lists what the target lacks, per page, with definitions", () => {
    const form = neutral();
    const target = { protocol: [{ id: 5, name: "Description" }, { id: 6, name: "Target" }], run: [{ id: 7, name: "Temperature" }] };
    const plan = planForms([form], [], target);
    assert.equal(plan[0].status, PLAN_MISSING_FIELDS);

    const groups = missingFields(plan, usedFieldDefinitions([form], SOURCE));
    assert.equal(groups.length, 1);
    assert.equal(groups[0].kind, "run");
    assert.deepEqual(groups[0].fields.map((field) => field.name), ["Solvent"]);
    assert.equal(describeField(groups[0].fields[0].definition), "Pick List, 2 values");
});

test("missingFields without carried definitions still names the fields", () => {
    const plan = planForms([neutral()], [], { protocol: [], run: [] });
    const groups = missingFields(plan, undefined);
    assert.deepEqual(groups.map((group) => group.kind), ["protocol", "run"]);
    assert.ok(groups.every((group) => group.fields.every((field) => field.definition === null)));
});

test("missingFields ignores forms that will be made", () => {
    const plan = [{ status: PLAN_ADD, missing: [] }];
    assert.deepEqual(missingFields(plan, {}), []);
});

test("describeField words a field the way the settings page does", () => {
    assert.equal(describeField({ type: "Number", pickList: [] }), "Number");
    assert.equal(describeField({ type: "LongText", pickList: [] }), "Long Text");
    assert.equal(describeField({ type: "PickList", pickList: ["a"] }), "Pick List, 1 value");
});
