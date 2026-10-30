import { test } from "node:test";
import assert from "node:assert/strict";

import { describeField } from "../src/content/features/ui-fixes/field-clipboard/field-model.js";
import {
    PLAN_MISSING_FIELDS,
    missingFields,
    neutralize,
    planForms,
    usedFieldDefinitions,
} from "../src/content/features/ui-fixes/registration-form-clipboard/form-model.js";

const SOURCE = {
    defs: {
        molecule: [
            { id: 1, name: "Project code", data_type_name: "Text", required_group_number: 3 },
            { id: 2, name: "Unused", data_type_name: "Text" },
        ],
        batch: [
            {
                id: 10,
                name: "Salt",
                data_type_name: "PickList",
                pick_list_values: [{ id: 100, value: "HCl" }, { id: 101, value: "TFA" }],
            },
            { id: 11, name: "Purity", data_type_name: "Number" },
        ],
        sample: [{ id: 20, name: "Solvent", data_type_name: "Text" }],
        inventory: [],
    },
    systems: [{ id: 7, prefix: "I25-SM" }],
};

function row(fieldID, extra = {}) {
    return { layoutType: "row", contents: [{ span: 1, label: "x", layoutType: "cell" }, { span: 5, fieldID, layoutType: "cell", ...extra }] };
}

function section(...rows) {
    return { sections: [{ name: "", contents: [{ layoutType: "table", contents: rows }] }] };
}

const FORM = {
    name: "Small molecule",
    form_type: "registration_form",
    registration_system_id: 7,
    components: {
        molecule: section(row(1)),
        batch: section(row(10, { defaultValue: 101 }), row(11)),
        sample: section(row(20)),
        inventory: section(),
    },
};

function neutral() {
    const { form, unknownIds, missingNames } = neutralize(FORM, SOURCE);
    assert.deepEqual(unknownIds, []);
    assert.deepEqual(missingNames, []);
    return form;
}

test("usedFieldDefinitions carries the molecule, batch and sample fields the forms use", () => {
    const defs = usedFieldDefinitions([neutral()], SOURCE);
    assert.deepEqual(defs.molecule.map((field) => field.name), ["Project code"]);
    assert.equal(defs.molecule[0].required, "required");
    assert.deepEqual(defs.batch.map((field) => field.name), ["Salt", "Purity"]);
    assert.deepEqual(defs.batch[0].pickList, ["HCl", "TFA"]);
    assert.deepEqual(defs.sample.map((field) => field.name), ["Solvent"]);
    assert.deepEqual(defs.inventory, []);
});

test("missingFields lists what the target lacks, per page, with definitions", () => {
    const form = neutral();
    const target = {
        defs: { molecule: [], batch: [{ id: 50, name: "Purity", data_type_name: "Number" }], sample: [{ id: 60, name: "Solvent" }], inventory: [] },
        systems: [{ id: 9, prefix: "AHL-SM" }],
    };
    const plan = planForms([form], [], target);
    assert.equal(plan[0].status, PLAN_MISSING_FIELDS);

    const groups = missingFields(plan, usedFieldDefinitions([form], SOURCE));
    assert.deepEqual(groups.map((group) => group.kind), ["molecule", "batch"]);
    assert.deepEqual(groups[0].fields.map((field) => field.name), ["Project code"]);
    assert.deepEqual(groups[1].fields.map((field) => field.name), ["Salt"]);
    assert.equal(describeField(groups[1].fields[0].definition), "Pick List, 2 values");
});

test("missingFields without carried definitions still names the fields", () => {
    const empty = { defs: { molecule: [], batch: [], sample: [], inventory: [] }, systems: [{ id: 1, prefix: "X-SM" }] };
    const groups = missingFields(planForms([neutral()], [], empty), undefined);
    assert.deepEqual(groups.map((group) => group.kind), ["molecule", "batch", "sample"]);
    assert.ok(groups.every((group) => group.fields.every((field) => field.definition === null)));
});

test("a form held back only for want of a registration system lists no fields", () => {
    const noSystem = { defs: SOURCE.defs, systems: [] };
    const plan = planForms([neutral()], [], noSystem);
    assert.equal(plan[0].status, PLAN_MISSING_FIELDS);
    assert.deepEqual(missingFields(plan, usedFieldDefinitions([neutral()], SOURCE)), []);
});
