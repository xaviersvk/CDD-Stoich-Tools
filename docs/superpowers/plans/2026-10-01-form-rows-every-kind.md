# Add Fields to Forms — Every Kind, Both Form Pages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** *Add fields to forms* adds entity/batch/sample/inventory fields to registration forms and run/protocol fields to protocol forms, with a type switch in the card.

**Architecture:** The batch-only feature in `ui-fixes/registration-form-rows/` moves to `ui-fixes/form-rows/` and is generalised: `row-model.js` takes the `components` key and the list of keys the PUT sends; `panel.js` takes a page config (`pages.js`) holding the forms API, the field-definition source and the kinds for the switch; `init.js` mounts the bar on both pages. Protocol/run definitions come from the existing `form-store-bridge`, extended with type and pick list values.

**Tech Stack:** plain ES modules, Chrome MV3 content script + page-world inject script, Vite build, `node` for the DOM-free model check.

Spec: `docs/superpowers/specs/2026-10-01-form-rows-every-kind-design.md`.

## Global Constraints

- Registration PUT body keys (unchanged): `name, components, registration_type, structureless_image_name, allow_new_molecules, registration_system_id`.
- Protocol PUT: `PUT /api/internal/v1/vaults/{vault_id}/protocol_form_definitions/{form_definition_id}`, body `{ form_definition: { name, components } }` (the wrapper is added by `utils/form-definitions-api.js`).
- Switch order — registration: Entity (`molecule`), Batch (`batch`), Sample (`sample`), Inventory (`inventory`); protocol: Run (`run`), Protocol (`protocol`).
- Every cell the feature did not add or default goes back unchanged (`ontologyAssn`, `allowedValues`, string `fieldID`s, `L6` rows, dead ids).
- Safety unchanged: backup download first; re-list before each PUT (changed → stop); re-list after (not identical → stop); first failure stops the run.
- UI signals: the selected kind is **bold**, not coloured (memory: weight, not colour).
- New storage key `cddFormRowSelection`; the old `cddRegistrationFormRowSelection` is read as the `batch` entry when the new key has none.
- The working copy holds the unpacked extension (`dist/`): work in place on `main`, no worktree. Never push.

## File Structure

| File | Responsibility |
|---|---|
| `src/content/features/ui-fixes/form-rows/row-model.js` (moved + modified) | DOM-free: plan/apply/verify a row for any `components[key]` |
| `src/content/features/ui-fixes/form-rows/selection.js` (moved + rewritten) | remembered picks per key, last kind per page |
| `src/content/features/ui-fixes/form-rows/pages.js` (new) | the two page configs |
| `src/content/features/ui-fixes/form-rows/panel.js` (moved + rewritten) | the bar and the card, driven by a page config |
| `src/content/features/ui-fixes/form-rows/init.js` (moved + rewritten) | mounts the bar on both pages |
| `src/content/features/ui-fixes/form-clipboard/api.js` (modified) | + `updateForm` |
| `src/inject/hooks/form-store-bridge.js` (modified) | definitions carry type, pick list values, disabled |
| `src/content/features/ui-fixes/field-clipboard/styles.js` (modified) | the switch's style |
| `src/content/main.js` (modified) | `initFormRows` replaces `initRegistrationFormRows` |
| `scripts/check-form-rows.mjs` (new) | `node` check of `row-model.js` |

---

### Task 1: Move the feature folder and make `row-model.js` take the table key

**Files:**
- Move: `src/content/features/ui-fixes/registration-form-rows/` → `src/content/features/ui-fixes/form-rows/`
- Modify: `src/content/features/ui-fixes/form-rows/row-model.js`
- Modify: `src/content/main.js:43` (import path only in this task)
- Modify: `qodana.yaml:16` (comment names the folder)
- Create: `scripts/check-form-rows.mjs`

**Interfaces:**
- Produces: `planForm(form, cells, fileIds = new Set(), key = "batch")`, `withRows(form, cells, fileIds = new Set(), key = "batch")`, `putBody(form, sent = REGISTRATION_SENT)`, `verifySaved(expected, saved, sent = REGISTRATION_SENT)`, exported `REGISTRATION_SENT`, `PROTOCOL_SENT`. Unchanged: `resolveChosen`, `fileFieldIds`, `sameDocument`, `buildRows`, the `PLAN_*` constants.

- [ ] **Step 1: Move the folder and fix the one import**

```bash
git mv src/content/features/ui-fixes/registration-form-rows src/content/features/ui-fixes/form-rows
```

In `src/content/main.js` line 43:

```js
import {initRegistrationFormRows} from "./features/ui-fixes/form-rows/init";
```

In `qodana.yaml` line 16 replace `registration-form-rows` with `form-rows` (comment only).

Run: `npm run build` — Expected: both builds `✓ built`.

- [ ] **Step 2: Write the failing check**

Create `scripts/check-form-rows.mjs`:

```js
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
```

- [ ] **Step 3: Run it to see it fail**

Run: `node scripts/check-form-rows.mjs`
Expected: FAIL — `SyntaxError: The requested module … does not provide an export named 'PROTOCOL_SENT'`.

- [ ] **Step 4: Generalise `row-model.js`**

In `src/content/features/ui-fixes/form-rows/row-model.js`:

Replace the header's first paragraph

```js
// The data side of adding batch fields to registration forms that already
// exist: what a new row looks like, which forms can take it, the document to
// send, and the check that the server kept everything else.
```

with

```js
// The data side of adding fields to forms that already exist — one table of
// a registration form (molecule, batch, sample, inventory) or of a protocol
// form (run, protocol): what a new row looks like, which forms can take it,
// the document to send, and the check that the server kept everything else.
// The table is named by its key in `components`; the notes below were
// measured on batch tables and hold for all six (vault 8289, 2026-10-01 —
// protocol tables also carry ontology cells, which go back untouched).
```

and in the bullet list change `components.batch is either null — the form has no layout of its own and CDD shows every batch field —` to `components[key] is either null — the form has no layout of its own and CDD shows every field of that kind —`.

Replace

```js
// The form keys CDD itself sends when it saves a registration form.
const SENT = ["name", "components", "registration_type", "structureless_image_name", "allow_new_molecules", "registration_system_id"];
```

with

```js
// The form keys CDD itself sends when it saves a form, per page.
export const REGISTRATION_SENT = ["name", "components", "registration_type", "structureless_image_name", "allow_new_molecules", "registration_system_id"];
export const PROTOCOL_SENT = ["name", "components"];

// What a table key is called in a note. CDD calls the Entity "molecule".
const KIND_NOUNS = { molecule: "entity", batch: "batch", sample: "sample", inventory: "inventory", run: "run", protocol: "protocol" };
```

Replace the two comments/names that say "batch" in `lastTable`:

```js
// The last table of the last section: "the end of the table".
function lastTable(layout) {
    const sections = layout?.sections;
```

Replace `cellsWithoutDefault(batch, cells)` signature and its walk call:

```js
function cellsWithoutDefault(layout, cells) {
```

and at its end `})(layout);`.

Replace `planForm` from its comment line to the line `const present = fieldIds(batch);` with:

```js
// What adding `cells` to `components[key]` would do to one form. `fileIds`:
// fileFieldIds() of that kind's definitions.
export function planForm(form, cells, fileIds = new Set(), key = "batch") {
    const noun = KIND_NOUNS[key] || key;
    const layout = form?.components?.[key];
    if (layout == null) {
        return { status: PLAN_NO_LAYOUT, add: [], note: `no layout of its own — it shows every ${noun} field already` };
    }
    const table = lastTable(layout);
    if (!table) return { status: PLAN_ODD_LAYOUT, add: [], note: `its ${noun} section has no table to add a row to` };
    const odd = table.contents.find((row) => row?.layoutType !== "row" || rowWidth(row) !== ROW_WIDTH);
    if (odd) return { status: PLAN_ODD_LAYOUT, add: [], note: `a row of its ${noun} table is not ${ROW_WIDTH} wide` };

    const present = fieldIds(layout);
```

and in the same function replace `cellsWithoutDefault(batch, cells)` with `cellsWithoutDefault(layout, cells)`.

Replace `withRows` with:

```js
// The form as it should be afterwards. Throws rather than returning a form
// the plan did not promise.
export function withRows(form, cells, fileIds = new Set(), key = "batch") {
    const plan = planForm(form, cells, fileIds, key);
    if (plan.status !== PLAN_ADD && plan.status !== PLAN_MOVE && plan.status !== PLAN_DEFAULT) throw new Error(plan.note);
    const next = clone(form);
    const table = lastTable(next.components[key]);
    // Defaults first, on the form's own cells; the rows built below carry theirs already.
    for (const { node, cell } of cellsWithoutDefault(next.components[key], cells)) setDefault(node, cell.defaultValue);
    if (plan.status === PLAN_MOVE) table.contents = misplaced(table.contents, cells, fileIds);
    else if (plan.status === PLAN_ADD) table.contents.splice(insertionIndex(table.contents, fileIds), 0, ...buildRows(plan.add));
    return next;
}

export function putBody(form, sent = REGISTRATION_SENT) {
    const body = {};
    for (const key of sent) body[key] = form[key];
    return body;
}

// `expected` is what was sent, `saved` what the server lists afterwards.
// Anything but the agreed document is a problem worth stopping for.
export function verifySaved(expected, saved, sent = REGISTRATION_SENT) {
    const problems = [];
    if (!saved) return ["the form is no longer listed"];
    for (const key of sent) {
```

(the rest of `verifySaved` is unchanged).

`fileFieldIds(batchDefs)` and `resolveChosen(chosen, batchDefs)`: rename the parameter to `defs` in both and change the comment "this vault's batch field definitions" to "this vault's field definitions of one kind".

- [ ] **Step 5: Run the check and the build**

Run: `node scripts/check-form-rows.mjs && npm run build`
Expected: no output from the check, then two `✓ built` lines.

- [ ] **Step 6: Commit**

```bash
git add -A src/content/features/ui-fixes scripts/check-form-rows.mjs src/content/main.js qodana.yaml
git commit -m "form-rows: row model takes the components key and the PUT keys"
```

---

### Task 2: Remembered choice per table key

**Files:**
- Modify (rewrite): `src/content/features/ui-fixes/form-rows/selection.js`

**Interfaces:**
- Produces: `readFormRowSelection() -> Promise<{ picks: { [key]: [{ name, default }] }, lastKind: { [page]: key } }>`; `writeFormRowSelection(page, key, list) -> Promise<void>`.

- [ ] **Step 1: Rewrite `selection.js`**

```js
// content/features/ui-fixes/form-rows/selection.js
//
// The fields last added to forms, per table key, so the same row can be
// added in the next vault without ticking it together again — and which
// kind each page used last, so the card opens on it. Names and default
// value texts, never ids: { picks: { [key]: [{ name, default }] },
// lastKind: { registration|protocol: key } }. Nothing is remembered until
// the user has run it once.
//
// Before 18.8.0 only batch fields could be added, under their own key; that
// list is read as the batch entry until the first new save carries it over.

const STORAGE_KEY = "cddFormRowSelection";
const LEGACY_BATCH_KEY = "cddRegistrationFormRowSelection";

function cleanPicks(list) {
    return Array.isArray(list) ? list.filter((pick) => pick && typeof pick.name === "string") : [];
}

export async function readFormRowSelection() {
    try {
        const result = await chrome.storage.local.get([STORAGE_KEY, LEGACY_BATCH_KEY]);
        const entry = result?.[STORAGE_KEY] || {};
        const picks = {};
        for (const [key, list] of Object.entries(entry.picks || {})) picks[key] = cleanPicks(list);
        if (!picks.batch) picks.batch = cleanPicks(result?.[LEGACY_BATCH_KEY]);
        return { picks, lastKind: { ...(entry.lastKind || {}) } };
    } catch {
        return { picks: {}, lastKind: {} };
    }
}

export async function writeFormRowSelection(page, key, list) {
    const current = await readFormRowSelection();
    current.picks[key] = list;
    current.lastKind[page] = key;
    await chrome.storage.local.set({ [STORAGE_KEY]: current });
}
```

- [ ] **Step 2: Syntax check**

Run: `node --check src/content/features/ui-fixes/form-rows/selection.js`
Expected: no output. (`panel.js` still imports the old names; it is rewritten in Task 4, so the build is checked there.)

- [ ] **Step 3: Commit**

```bash
git add src/content/features/ui-fixes/form-rows/selection.js
git commit -m "form-rows: remember the picks per table key, carry the batch list over"
```

---

### Task 3: Protocol forms can be saved, and their definitions carry types

**Files:**
- Modify: `src/content/features/ui-fixes/form-clipboard/api.js`
- Modify: `src/inject/hooks/form-store-bridge.js`

**Interfaces:**
- Produces: `updateForm(vaultId, formId, body) -> Promise<void>` in `form-clipboard/api.js`; `requestFieldMap()` now resolves `{ protocol, run }` whose entries are `{ id, name, data_type_name, pick_list_values: [{ id, value, hidden }], disabled }`.

- [ ] **Step 1: `updateForm` in `form-clipboard/api.js`**

Change the import line to

```js
import { createFormDefinition, listFormDefinitions, updateFormDefinition } from "../../../utils/form-definitions-api.js";
```

and add after `createForm`:

```js
// Measured in CDD's bundle (updateFormDefinition, case "protocol_form"):
// PUT …/protocol_form_definitions/{form_id} with { form_definition: { name,
// components } }. What comes back is not relied on; the caller lists the
// forms again and compares.
export function updateForm(vaultId, formId, form) {
    return updateFormDefinition(`${base(vaultId)}/${formId}`, form);
}
```

Update the `requestFieldMap` comment to `// { protocol: [def], run: [def] } or null — see inject/hooks/form-store-bridge.js for a def.`

- [ ] **Step 2: The bridge keeps type and pick list values**

In `src/inject/hooks/form-store-bridge.js`, replace `reduce` with:

```js
// What the content side needs of a definition: the name for the clipboards,
// and the type and pick list values for adding a field to forms.
function reduce(list) {
    return (list || [])
        .filter((entry) => entry && entry.id != null)
        .map((entry) => ({
            id: entry.id,
            name: String(entry.name ?? ""),
            data_type_name: String(entry.data_type_name ?? ""),
            pick_list_values: (entry.pick_list_values || [])
                .filter((value) => value && value.id != null)
                .map((value) => ({ id: value.id, value: String(value.value ?? ""), hidden: !!value.hidden })),
            disabled: !!entry.disabled,
        }));
}
```

and in the header protocol comment change `map: { protocol: [{ id, name }], run: [{ id, name }] } | null` to `map: { protocol: [def], run: [def] } | null, def = { id, name, data_type_name, pick_list_values: [{ id, value, hidden }], disabled }`.

- [ ] **Step 3: Check**

Run: `node --check src/inject/hooks/form-store-bridge.js && node --check src/content/features/ui-fixes/form-clipboard/api.js && npm run build:inject`
Expected: `✓ built`.

- [ ] **Step 4: Commit**

```bash
git add src/content/features/ui-fixes/form-clipboard/api.js src/inject/hooks/form-store-bridge.js
git commit -m "protocol forms: updateForm, and run/protocol definitions with type and pick lists"
```

---

### Task 4: Page configs, the card with a type switch, both pages mounted

**Files:**
- Create: `src/content/features/ui-fixes/form-rows/pages.js`
- Modify (rewrite): `src/content/features/ui-fixes/form-rows/panel.js`
- Modify (rewrite): `src/content/features/ui-fixes/form-rows/init.js`
- Modify: `src/content/main.js:43,184`
- Modify: `src/content/features/ui-fixes/field-clipboard/styles.js` (after the `.cdd-fc-pick` rule)

**Interfaces:**
- Consumes: Task 1 `planForm/withRows/putBody/verifySaved/resolveChosen/fileFieldIds/sameDocument/PLAN_*`, `REGISTRATION_SENT`, `PROTOCOL_SENT`; Task 2 `readFormRowSelection`, `writeFormRowSelection`; Task 3 `updateForm`, `requestFieldMap`; existing `listRegistrationForms`, `updateRegistrationForm`, `readRegistrationMap` (`registration-form-clipboard/api.js`), `listForms`, `vaultIdFromPath`, `vaultName` (`form-clipboard/api.js`).
- Produces: `buildBar(page)`, `BAR_CLASS = "cdd-form-rows-bar"`, `REGISTRATION_FORMS`, `PROTOCOL_FORMS`, `initFormRows()`.

- [ ] **Step 1: `pages.js`**

```js
// content/features/ui-fixes/form-rows/pages.js
//
// What differs between the two pages the card lives on: where the forms
// and the field definitions come from, how a form is saved, which tables
// the switch offers. `kinds[].key` is the table's key in `components`.

import { listRegistrationForms, readRegistrationMap, updateRegistrationForm } from "../registration-form-clipboard/api.js";
import { listForms, requestFieldMap, updateForm } from "../form-clipboard/api.js";
import { PROTOCOL_SENT, REGISTRATION_SENT } from "./row-model.js";

export const REGISTRATION_FORMS = {
    page: "registration",
    kinds: [
        { key: "molecule", label: "Entity" },
        { key: "batch", label: "Batch" },
        { key: "sample", label: "Sample" },
        { key: "inventory", label: "Inventory" },
    ],
    listForms: listRegistrationForms,
    updateForm: updateRegistrationForm,
    // { molecule, batch, sample, inventory } or null.
    readDefs: async () => readRegistrationMap()?.defs || null,
    sent: REGISTRATION_SENT,
    formTag: (form) => form.registration_system?.prefix || "",
};

export const PROTOCOL_FORMS = {
    page: "protocol",
    kinds: [
        { key: "run", label: "Run" },
        { key: "protocol", label: "Protocol" },
    ],
    listForms,
    updateForm,
    // { protocol, run } or null, through the page-world bridge.
    readDefs: requestFieldMap,
    sent: PROTOCOL_SENT,
    formTag: () => "",
};
```

- [ ] **Step 2: Rewrite `panel.js`**

```js
// content/features/ui-fixes/form-rows/panel.js
//
// "Add fields to forms" above a forms table — Registration Forms or Protocol
// Forms — and the card it opens. What differs between the two pages is in
// `page` (pages.js).
//
// The card opens with a switch of the tables a form has (Entity · Batch ·
// Sample · Inventory, or Run · Protocol), on the one used last. Under it two
// lists. The first is the vault's fields of that kind: tick the ones to add,
// in the order they should stand in the row, and give a Pick List its
// default. The choice is remembered by name, per kind, so the next vault
// opens with the same fields ticked — and says which of them it does not
// have yet. The second list is the vault's forms with what would happen to
// each: a row added to that table — above the file rows it ends in, if it
// does — a row moved up from below them, a missing Pick List default set,
// nothing (it has them), or never (it has no layout of its own, or one this
// extension does not recognise).
//
// The run is written for forms that are in use:
//   - a JSON file of the forms as they were is downloaded before anything is
//     sent;
//   - each form is listed again right before its PUT, and the run stops if it
//     is no longer the form that was previewed;
//   - each form is listed again right after, and the run stops unless the
//     server holds exactly the document that was sent;
//   - the first failure stops everything, with the server's words.

import { buildButtonBar, cardFoot, checkbox, el, filterInput, openCard, plural } from "../../../utils/settings-card.js";
import { vaultIdFromPath, vaultName } from "../form-clipboard/api.js";
import { PLAN_ADD, PLAN_DEFAULT, PLAN_MOVE, fileFieldIds, planForm, putBody, resolveChosen, sameDocument, verifySaved, withRows } from "./row-model.js";
import { readFormRowSelection, writeFormRowSelection } from "./selection.js";

export const BAR_CLASS = "cdd-form-rows-bar";

function cleanName(name) {
    return String(name ?? "").trim();
}

function downloadBackup(page, vaultId, forms) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const blob = new Blob([JSON.stringify({ vaultId, vaultName: vaultName(), savedAt: new Date().toISOString(), forms }, null, 2)],
        { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `cdd-${page.page}-forms-${vaultId}-${stamp}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
    return link.download;
}

export function buildBar(page) {
    const vaultId = vaultIdFromPath(location.pathname);
    // The second class is the field clipboard's: same buttons, same card.
    const { bar, buttons: [openButton], status, card } = buildButtonBar(`${BAR_CLASS} cdd-fc-bar`, ["Add fields to forms"]);

    openButton.addEventListener("click", async () => {
        status.textContent = "";
        card.hidden = true;
        let forms;
        let defs;
        let remembered;
        try {
            [forms, defs, remembered] = await Promise.all([page.listForms(vaultId), page.readDefs(), readFormRowSelection()]);
            if (!defs) throw new Error("could not read the field names behind this page");
        } catch (error) {
            status.textContent = `Could not open — ${error.message}.`;
            return;
        }
        const last = remembered.lastKind[page.page];
        const kind = page.kinds.find((entry) => entry.key === last) || page.kinds[0];
        openFieldsCard(forms, defs, remembered, kind);
    });

    function openFieldsCard(forms, allDefs, remembered, kind) {
        const kindDefs = Array.isArray(allDefs[kind.key]) ? allDefs[kind.key] : [];
        // A disabled File field still makes its row a file row.
        const defs = kindDefs.filter((def) => def && !def.disabled);
        const fileIds = fileFieldIds(kindDefs);
        const fieldsPage = `${kind.label} Fields`;

        openCard(card, `Add ${kind.label.toLowerCase()} fields to forms`, `${plural(forms.length, "form")} in ${vaultName() || "this vault"}`);

        /* ----- the switch ----- */
        const switchRow = el("div", "cdd-fc-pick");
        const switchButtons = page.kinds.map((other) => {
            const button = el("button", "cdd-fc-kind", other.label);
            button.type = "button";
            if (other.key === kind.key) button.classList.add("is-current");
            else button.addEventListener("click", () => openFieldsCard(forms, allDefs, remembered, other));
            return button;
        });
        switchRow.append(...switchButtons);
        card.append(switchRow);

        /* ----- the fields ----- */
        const fieldsHead = el("div", "cdd-fc-section");
        fieldsHead.append(el("span", null, "Fields, in the order they go into the row"));
        const filter = filterInput();
        fieldsHead.append(filter);
        const fieldList = el("div", "cdd-fc-list");
        card.append(fieldsHead, fieldList);

        // Ordered: the row is built in this order.
        const chosen = [];
        const fieldRows = [];

        function addFieldRow(name, def, rememberedDefault, checked) {
            const line = el("label", "cdd-fc-row");
            const box = checkbox(checked);
            const order = el("span", "cdd-fc-order");
            line.append(box, order, el("span", "cdd-fc-name", name));
            let select = null;
            if (!def) {
                line.classList.add("cdd-fc-row--skip");
                line.append(el("span", "cdd-fc-why", `not in this vault — paste it on ${fieldsPage} first`));
            } else {
                line.append(el("span", "cdd-fc-type", def.data_type_name));
                if (def.data_type_name === "PickList") {
                    select = document.createElement("select");
                    select.className = "cdd-fc-select";
                    select.append(new Option("no default", ""));
                    for (const value of (def.pick_list_values || []).filter((entry) => !entry.hidden)) {
                        select.append(new Option(`default: ${cleanName(value.value)}`, cleanName(value.value)));
                    }
                    const wanted = cleanName(rememberedDefault);
                    if (wanted && [...select.options].some((option) => option.value === wanted)) select.value = wanted;
                    else if (wanted) line.append(el("span", "cdd-fc-why", `no "${wanted}" in this list`));
                    select.addEventListener("change", judge);
                    line.append(select);
                }
            }
            const entry = { name, def, box, order, select, line };
            if (box.checked && def) chosen.push(entry);
            box.addEventListener("change", () => {
                // A remembered field this vault lacks: unticking it lets the
                // run go ahead without it, and forgets it.
                if (!def) {
                    line.classList.toggle("cdd-fc-row--skip", box.checked);
                    judge();
                    return;
                }
                const index = chosen.indexOf(entry);
                if (box.checked && index < 0) {
                    chosen.push(entry);
                    // Up under the fields ticked before it: a vault's newest
                    // fields are at the bottom of a long list, and the row
                    // order should be readable at a glance.
                    const firstFree = [...fieldList.children].find((other) => other !== line && !other.querySelector("input").checked);
                    if (firstFree) fieldList.insertBefore(line, firstFree);
                }
                if (!box.checked && index >= 0) chosen.splice(index, 1);
                judge();
            });
            fieldRows.push(entry);
            fieldList.append(line);
        }

        // Remembered fields first, in their order; then the rest of the vault's.
        const rememberedNames = new Set();
        for (const pick of remembered.picks[kind.key] || []) {
            const name = cleanName(pick.name);
            if (!name || rememberedNames.has(name)) continue;
            rememberedNames.add(name);
            addFieldRow(name, defs.find((def) => cleanName(def.name) === name) || null, pick.default, true);
        }
        for (const def of defs) {
            if (!rememberedNames.has(cleanName(def.name))) addFieldRow(cleanName(def.name), def, null, false);
        }
        const missingHere = () => fieldRows.filter((row) => !row.def && row.box.checked).map((row) => row.name);

        filter.addEventListener("input", () => {
            const needle = filter.value.trim().toLowerCase();
            for (const row of fieldRows) row.line.hidden = !!needle && !row.name.toLowerCase().includes(needle) && !row.box.checked;
        });

        /* ----- the forms ----- */
        card.append(el("div", "cdd-fc-section", "Forms"));
        const formList = el("div", "cdd-fc-list");
        card.append(formList);
        const formRows = forms.map((form) => {
            const line = el("label", "cdd-fc-row");
            const box = checkbox(false);
            const why = el("span", "cdd-fc-detail");
            line.append(box, el("span", "cdd-fc-name", form.name), el("span", "cdd-fc-type", page.formTag(form)), why);
            formList.append(line);
            box.addEventListener("change", count);
            // Ticked by default once; after that the user's own choice stands.
            return { form, line, box, why, touched: false };
        });
        for (const row of formRows) row.box.addEventListener("change", () => { row.touched = true; });

        const footNote = el("span", "cdd-fc-note", "A backup of the forms is downloaded first.");
        const { action, cancel } = cardFoot(card, { extra: [footNote] });

        let cells = [];

        function picks() {
            return chosen.map((entry) => ({ name: entry.name, default: entry.select?.value || null }));
        }

        function judge() {
            fieldRows.forEach((row) => { row.order.textContent = ""; });
            chosen.forEach((entry, index) => { entry.order.textContent = String(index + 1); });
            ({ cells } = resolveChosen(picks(), defs));
            for (const row of formRows) {
                const plan = cells.length ? planForm(row.form, cells, fileIds, kind.key) : { status: null, note: "" };
                const can = plan.status === PLAN_ADD || plan.status === PLAN_MOVE || plan.status === PLAN_DEFAULT;
                row.plan = plan;
                row.box.disabled = !can;
                if (!can) row.box.checked = false;
                else if (!row.touched) row.box.checked = true;
                row.why.textContent = plan.note;
                row.line.classList.toggle("cdd-fc-row--skip", !!plan.status && !can);
            }
            count();
        }

        function todo() {
            return formRows.filter((row) => row.box.checked && !row.box.disabled);
        }

        function count() {
            const n = todo().length;
            const missing = missingHere();
            action.textContent = `Apply to ${plural(n, "form")}`;
            action.disabled = n === 0 || missing.length > 0;
            footNote.textContent = missing.length
                ? `Not in this vault: ${missing.join(", ")}. Paste the fields on ${fieldsPage} first, or untick them.`
                : "A backup of the forms is downloaded first.";
            footNote.className = missing.length ? "cdd-fc-why" : "cdd-fc-note";
        }

        judge();

        action.addEventListener("click", async () => {
            const rows = todo();
            action.disabled = true;
            cancel.disabled = true;
            filter.disabled = true;
            for (const button of switchButtons) button.disabled = true;
            for (const row of fieldRows) {
                row.box.disabled = true;
                if (row.select) row.select.disabled = true;
            }
            for (const row of formRows) row.box.disabled = true;
            status.textContent = "";

            let made = 0;
            let current = null;
            try {
                await writeFormRowSelection(page.page, kind.key, picks());
                const file = downloadBackup(page, vaultId, rows.map((row) => row.form));
                footNote.textContent = `Backup: ${file}`;
                for (const row of rows) {
                    current = row;
                    const fresh = (await page.listForms(vaultId)).find((form) => String(form.id) === String(row.form.id));
                    if (!fresh || !sameDocument(putBody(fresh, page.sent), putBody(row.form, page.sent))) {
                        throw new Error("it was changed since the preview; nothing was sent for it");
                    }
                    const expected = withRows(fresh, cells, fileIds, kind.key);
                    await page.updateForm(vaultId, fresh.id, putBody(expected, page.sent));
                    const saved = (await page.listForms(vaultId)).find((form) => String(form.id) === String(fresh.id));
                    const problems = verifySaved(expected, saved, page.sent);
                    if (problems.length) throw new Error(`it was saved, but ${problems.join("; ")} — compare it with the backup`);
                    row.line.classList.add("cdd-fc-row--done");
                    row.why.textContent = { [PLAN_MOVE]: "moved", [PLAN_DEFAULT]: "default set" }[row.plan.status] || "added";
                    made += 1;
                }
                status.textContent = `Changed ${plural(made, "form")}. Reloading…`;
                setTimeout(() => location.reload(), 1200);
            } catch (error) {
                cancel.disabled = false;
                status.textContent = `Changed ${made} of ${rows.length}. Stopped at "${current?.form.name ?? ""}" — ${error.message}.`;
            }
        });
    }

    return bar;
}
```

- [ ] **Step 3: Rewrite `init.js`**

```js
// content/features/ui-fixes/form-rows/init.js
//
// Discovery + wiring. The only thing content/main.js imports from this feature.
//
// Two pages, one rule: Settings → Registration (the Registration Forms
// table) and Settings → Protocol Forms, with CDD's own "Create a new form"
// link as the sign of an administrator. The bar goes right above the table,
// under that page's form clipboard (Copy / Paste) — main.js starts this
// feature after both clipboards.

import { PROTOCOL_FORMS_PAGE, findFormsTable, findRegistrationFormsTable, mountBarAbove, watchPageSettled } from "../../../utils/settings-page.js";
import { injectFieldClipboardStyles } from "../field-clipboard/styles.js";
import { PROTOCOL_FORMS, REGISTRATION_FORMS } from "./pages.js";
import { BAR_CLASS, buildBar } from "./panel.js";

let started = false;

function mount() {
    const registration = findRegistrationFormsTable();
    if (registration) mountBarAbove(registration, BAR_CLASS, () => buildBar(REGISTRATION_FORMS));
    const protocol = findFormsTable(PROTOCOL_FORMS_PAGE);
    if (protocol) mountBarAbove(protocol, BAR_CLASS, () => buildBar(PROTOCOL_FORMS));
}

export function initFormRows() {
    injectFieldClipboardStyles();
    if (started) return;
    started = true;
    watchPageSettled("form-rows", mount);
}
```

- [ ] **Step 4: `main.js`**

Line 43:

```js
import {initFormRows} from "./features/ui-fixes/form-rows/init";
```

Line 184: `initRegistrationFormRows();` → `initFormRows();` (stays after `initFormClipboard()` and `initRegistrationFormClipboard()`).

- [ ] **Step 5: The switch's style**

In `src/content/features/ui-fixes/field-clipboard/styles.js`, after `.cdd-fc-pick { display: flex; gap: 14px; font-weight: 400; }` add:

```css
    /* The table switch at the top of "Add fields to forms": links, the
       current one in bold — weight marks it, not colour. */
    .cdd-fc-kind {
        appearance: none;
        border: 0;
        background: none;
        padding: 0;
        font: inherit;
        color: #1565c0;
        cursor: pointer;
    }
    .cdd-fc-kind.is-current { font-weight: 700; color: inherit; cursor: default; }
    .cdd-fc-kind[disabled] { cursor: default; }
```

- [ ] **Step 6: Check and build**

Run: `node scripts/check-form-rows.mjs && npm run build && grep -rn "registration-form-rows\|initRegistrationFormRows\|readRowSelection" src`
Expected: silent check, two `✓ built`, grep finds nothing.

- [ ] **Step 7: Commit**

```bash
git add src/content/features/ui-fixes/form-rows src/content/features/ui-fixes/field-clipboard/styles.js src/content/main.js
git commit -m "form-rows: type switch in the card, on Registration and Protocol Forms"
```

- [ ] **Step 8: Test (stop here)**

Test vault: **1000000109** (the user named it for this; writes there are
allowed). Production vault 8289 is read-only for testing. Ask the user to
reload the extension, then on
`https://eu.collaborativedrug.com/vaults/1000000109/vault_protocol_form_definitions`
and that vault's Registration page:
1. Protocol Forms → *Add fields to forms* → **Run** → tick one field → preview → apply to one form → check it in CDD's form editor and the backup file.
2. Registration → *Add fields to forms* → **Entity** → one field, one form → same check.
3. **Batch** opens with the previously remembered batch fields ticked.

Do not continue to Task 5 until the user confirms.

---

### Task 5: Docs and release 18.8.0

**Files:**
- Modify: `manifest.json` (`"version": "18.8.0"`)
- Modify: `CHANGELOG.md`, `RELEASES.md` (new top entries), `docs/FEATURE_CATALOG.md` §6.9e

- [ ] **Step 1: FEATURE_CATALOG 6.9e**

Retitle `### 6.9e Add Fields to Existing Forms`; User value: *Add fields to forms* above the Registration Forms table (Entity · Batch · Sample · Inventory) and the Protocol Forms table (Run · Protocol); entry point `ui-fixes/form-rows/init.js`, `pages.js` the two page configs; data source adds `PUT …/protocol_form_definitions/{id}` and the `form-store-bridge` definitions; storage key `cddFormRowSelection` (old batch key read once); "run `node scripts/check-form-rows.mjs` before touching `row-model.js`".

- [ ] **Step 2: CHANGELOG `## [18.8.0] — <date>`**

`### Added` — the switch, the protocol page, per-key memory with the batch carry-over, `updateForm`, the bridge fields, the folder move, `scripts/check-form-rows.mjs`; what was measured (shapes, PUT body).

- [ ] **Step 3: RELEASES `## 18.8.0 — <date>`**

```markdown
**Add fields to forms** now adds entity, sample and inventory fields to registration forms, and run and protocol fields to protocol forms.

- Pick the kind at the top of the card.
- On **Settings → Protocol Forms**, the button sits under Copy / Paste.
```

- [ ] **Step 4: Bump, build, commit — no push**

```bash
npm run build
git add manifest.json CHANGELOG.md RELEASES.md docs/FEATURE_CATALOG.md
git commit -m "18.8.0: Add fields to forms for every kind, on Registration and Protocol Forms"
```

Tell the user the commit is ready; push `main` and the tag only when asked (the tag publishes to both stores).
