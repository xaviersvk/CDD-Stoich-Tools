// scripts/check-form-rows.mjs
//
// node scripts/check-form-rows.mjs — the cases behind form-rows/row-model.js,
// on shapes measured in vault 8289 (2026-10-01). Silent on success.

import assert from "node:assert/strict";
import {
    PLAN_ADD, PLAN_HAS_ALL, PLAN_NO_LAYOUT, PROTOCOL_SENT, REGISTRATION_SENT,
    buildRows, fileFieldIds, planForm, putBody, resolveChosen, sameDocument, verifySaved, withRows,
} from "../src/content/features/ui-fixes/form-rows/row-model.js";

const label = (text) => ({ span: 1, label: text, isRequired: false, layoutType: "cell" });
const row = (...contents) => ({ contents, layoutType: "row" });
const table = (...rows) => ({ sections: [{ name: "", contents: [{ context: 0, layoutType: "table", contents: rows }] }] });
const clone = (value) => JSON.parse(JSON.stringify(value));

/* ----- protocol form ----- */

const runDefs = [
    { id: 163158, name: "Person", data_type_name: "Text", pick_list_values: [] },
    { id: 900, name: "Raw data", data_type_name: "File", pick_list_values: [] },
    { id: 701, name: "Plate barcode", data_type_name: "Text", pick_list_values: [] },
    { id: 702, name: "Corrected", data_type_name: "PickList",
        pick_list_values: [{ id: 9661, value: "Yes", hidden: false }, { id: 9662, value: "No", hidden: false }] },
];
const protocolDefs = [
    { id: 501, name: "Category", data_type_name: "Text", pick_list_values: [] },
    { id: 502, name: "Description", data_type_name: "Text", pick_list_values: [] },
];
const ontologyRow = row(label("Assay format"), { span: 5, layoutType: "cell", ontologyAssn: { term: "BAO_0000219" }, allowedValues: [1, 2] });
const protocolForm = {
    id: 1, name: "ECHO Storage", data_set_id: 8289, form_type: "protocol_form",
    components: {
        protocol: table(ontologyRow, row(label("Category"), { span: 5, fieldID: 501, layoutType: "cell" })),
        run: table(
            row({ span: 1, label: "Run Date", isRequired: true, layoutType: "cell" }, { span: 5, fieldID: "run_date", isRequired: true, layoutType: "cell" }),
            row({ span: 6, label: "Conditions", layoutType: "cell" }),
            row(label("Person"), { span: 5, fieldID: 163158, isLocked: false, isRequired: true, layoutType: "cell" }),
            row(label("Raw data"), { span: 5, fieldID: 900, layoutType: "cell" }),
        ),
        readout: table(),
    },
};

// Run: two fields, one Pick List default, above the closing File row.
{
    const { cells } = resolveChosen([{ name: "Plate barcode" }, { name: "Corrected", default: "No" }], runDefs);
    const plan = planForm(protocolForm, cells, fileFieldIds(runDefs), "run");
    assert.equal(plan.status, PLAN_ADD);
    assert.match(plan.note, /above the file rows/);
    const next = withRows(protocolForm, cells, fileFieldIds(runDefs), "run");
    const rows = next.components.run.sections[0].contents[0].contents;
    assert.equal(rows.length, 5);
    assert.deepEqual(rows[3], buildRows(cells)[0]);
    assert.equal(rows[3].contents[3].defaultValue, 9662);
    assert.deepEqual(rows.slice(0, 3), protocolForm.components.run.sections[0].contents[0].contents.slice(0, 3));
    assert.ok(sameDocument(next.components.protocol, protocolForm.components.protocol));
    assert.ok(sameDocument(next.components.readout, protocolForm.components.readout));
}

// Run: a field it has already.
{
    const { cells } = resolveChosen([{ name: "Person" }], runDefs);
    assert.equal(planForm(protocolForm, cells, fileFieldIds(runDefs), "run").status, PLAN_HAS_ALL);
}

// Protocol: the ontology cells go back as they came.
{
    const { cells } = resolveChosen([{ name: "Description" }], protocolDefs);
    const plan = planForm(protocolForm, cells, fileFieldIds(protocolDefs), "protocol");
    assert.equal(plan.status, PLAN_ADD);
    const next = withRows(protocolForm, cells, fileFieldIds(protocolDefs), "protocol");
    const rows = next.components.protocol.sections[0].contents[0].contents;
    assert.deepEqual(rows[0], ontologyRow);
    assert.equal(rows.length, 3);
    assert.ok(sameDocument(next.components.run, protocolForm.components.run));
}

// Protocol PUT: name and components only; verify names the layout that moved.
{
    assert.deepEqual(Object.keys(putBody(protocolForm, PROTOCOL_SENT)), ["name", "components"]);
    assert.deepEqual(verifySaved(protocolForm, clone(protocolForm), PROTOCOL_SENT), []);
    const changed = clone(protocolForm);
    changed.components.run.sections[0].contents[0].contents.pop();
    assert.deepEqual(verifySaved(protocolForm, changed, PROTOCOL_SENT), ["the run layout is not what was sent"]);
}

/* ----- registration form ----- */

const moleculeDefs = [{ id: 301, name: "Chemist", data_type_name: "Text", pick_list_values: [] }];
const batchDefs = [{ id: 401, name: "Purity", data_type_name: "Number", pick_list_values: [] }];
const registrationForm = {
    id: 2, name: "Internal", registration_type: "CDD", structureless_image_name: null,
    allow_new_molecules: true, registration_system_id: 7,
    components: {
        molecule: table(row(label("Project"), { span: 5, fieldID: 300, layoutType: "cell" })),
        batch: table(row(label("Supplier"), { span: 5, fieldID: 400, layoutType: "cell" })),
        sample: table(),
        inventory: null,
    },
};

// Entity: added to the molecule table, batch untouched.
{
    const { cells } = resolveChosen([{ name: "Chemist" }], moleculeDefs);
    assert.equal(planForm(registrationForm, cells, new Set(), "molecule").status, PLAN_ADD);
    const next = withRows(registrationForm, cells, new Set(), "molecule");
    assert.equal(next.components.molecule.sections[0].contents[0].contents.length, 2);
    assert.ok(sameDocument(next.components.batch, registrationForm.components.batch));
}

// Inventory: no layout of its own — left alone, and the note says which.
{
    const plan = planForm(registrationForm, [{ name: "X", fieldID: 1, defaultValue: null }], new Set(), "inventory");
    assert.equal(plan.status, PLAN_NO_LAYOUT);
    assert.match(plan.note, /every inventory field/);
}

// Batch: the old call shape (no key, no sent) behaves as before.
{
    const { cells } = resolveChosen([{ name: "Purity" }], batchDefs);
    assert.equal(planForm(registrationForm, cells).status, PLAN_ADD);
    assert.equal(withRows(registrationForm, cells).components.batch.sections[0].contents[0].contents.length, 2);
    assert.deepEqual(Object.keys(putBody(registrationForm)), REGISTRATION_SENT);
}
