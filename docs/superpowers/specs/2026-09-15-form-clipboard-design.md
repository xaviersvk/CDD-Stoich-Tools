# Copy protocol forms between vaults — design

Date: 2026-09-15
Status: designed

## Problem

A protocol form is built by dragging fields onto a canvas, in *Settings →
Vault → Protocol Forms*. Setting up a second vault means rebuilding every
form by hand. The user wants *Copy* in vault A and *Paste* in vault B, with
one hard rule: **nothing that identifies the source vault may be sent to
the target** — a form refers to field definitions by id, and those ids mean
nothing, or something else, in another vault.

## What exists today (verified live, vault 6772)

- The page is `/vaults/<id>/vault_protocol_form_definitions`: a table of
  forms and a *Create a new form* link (administrators only). Clicking a
  form opens `.EditFormDialog`, a drag-and-drop builder — not something to
  drive through the DOM.
- The page loads its forms from an internal API,
  `GET /api/internal/v1/vaults/<id>/protocol_form_definitions`, one object
  per form: `{ id, name, data_set_id, created_at, updated_at, form_type,
  components }`. `components` has `protocol`, `run` and `readout`, each
  `{ sections: [{ name, contents: [{ context, layoutType: "table",
  contents: [{ layoutType: "row", contents: [cell…] }] }] }],
  expanded_aligned_fields }`. A cell is `{ layoutType: "cell", span,
  label?, fieldID?, isRequired? }`. `fieldID` is either a built-in string
  (`protocol_name`, `run_date`) or a **number: the id of a protocol or run
  field definition in this vault**.
- Save sends `PUT …/protocol_form_definitions/<id>` with a JSON body
  `{ form_definition: { name, components, … } }`, headers `Content-Type:
  application/json`, `Accept: application/json`, `X-CSRF-Token` (from the
  page's meta tag) and `X-Requested-With: XMLHttpRequest`.
- Measured with a throwaway form: `POST …/protocol_form_definitions` with
  `{ form_definition: { name, form_type, components } }` answers `200` and
  the created form; the same body **without** the `form_definition` wrapper
  answers `400`. `DELETE …/<id>` answers `204`.
- The names behind the ids are in the page's React props with the dialog
  closed: an object `store.fieldDefinitionsMap` with `protocol` and `run`
  arrays of `{ id, name, … }`, a few levels up from the forms table. No
  internal endpoint serves them (`404`).
- Ontology templates are BAO schema objects with `root.name`, on the page
  root props and at `GET …/ontology_templates`. The test form carries no
  template key; a form with a template set was not available.

## Decisions

- **The clipboard holds names, never ids.** At copy time every numeric
  `fieldID` becomes `{ $field: "<name>", $component: "protocol" | "run" }`,
  and `id`, `data_set_id`, `created_at`, `updated_at` are dropped. What is
  stored could not be sent anywhere as it is.
- **At paste time names become the target's ids** from the target page's
  own `fieldDefinitionsMap`, exact name match. A form with any name the
  target lacks is **skipped** and the preview lists the missing fields — the
  order of work is *copy the fields first, then the forms*.
- **Skip on an exact form-name match**, like the fields.
- **Any other numeric id found in a document stops the copy of that form**
  with a note naming the key — the shape above is what was measured; a key
  that carries an id we do not know how to translate must not be shipped.
  Exception: `context`, `span` and `isRequired` are layout numbers, not ids.
- **Creation goes through the internal API**, one `POST` per form, with the
  same headers the page uses. The user pressed *Create N forms*; that is
  the click. This is the extension's first write through CDD's internal
  API rather than through a CDD button; it is undocumented, and a failure
  will be loud (a status per form), never silent.
- **No switch.** The buttons sit beside *Create a new form*, which CDD shows
  to administrators alone.

## Design

New feature `src/content/features/ui-fixes/form-clipboard/` and one bridge
hook.

### Bridge — `inject/hooks/form-store-bridge.js`

```
FORM_FIELD_MAP_REQUEST { requestId }
  -> FORM_FIELD_MAP     { requestId, map: { protocol: [{ id, name }], run: [{ id, name }] } | null }
```

Walks up from the forms table's fiber and, at each level, scans props a few
levels deep for an object with `fieldDefinitionsMap`. Answers the two lists
reduced to `{ id, name }`.

### Pure — `form-model.js`

- `neutralize(form) -> { form: { name, form_type, components }, missingNames: [] , unknownIds: [key…] }`
  — replaces numeric `fieldID`s with `$field` placeholders using the source
  map, drops the source-only keys, and reports any numeric value under a
  key that looks like an id and is not on the allow-list.
- `resolve(neutralForm, targetMap) -> { form, missing: [{ component, name }] }`
  — the inverse, against the target map.
- `planForms(neutralForms, targetNames, targetMap) -> [{ form, status: "add" | "same-name" | "missing-fields", note }]`.
- `formFieldNames(neutralForm) -> [{ component, name }]` for the preview.

### API — `api.js`

`listForms(vaultId)`, `createForm(vaultId, form)` (POST, wrapper, CSRF from
`meta[name=csrf-token]`), errors as `Error("HTTP 4xx: …")`.

### Storage — `clipboard.js`

`chrome.storage.local` key `cddFormClipboard` →
`{ vaultId, vaultName, copiedAt, forms: [neutralForm…] }`.

### UI — `panel.js`, `styles.js`, `init.js`

A bar above the forms table: **Copy N forms**, **Paste**, status. Copy
fetches the list, reads the field map through the bridge, neutralizes each
form (a form with an unknown id is left out and named in the status), and
stores the lot. Paste fetches the target list and map, plans, and opens a
card: head with source vault and time; one line per form with a checkbox
(checked when addable), the name, the number of fields, and the note for a
skipped one (*same name here*, *missing fields: Lab, SOP*); foot **Create N
forms** / *Cancel* / status. The run POSTs the checked forms in order,
marks each line done, and on success reloads the page after a beat so the
table shows them; on the first failure it stops and says which form and
what the server said.

## Verification

Pure (`node`): `neutralize` on the measured document (89772 → Description,
107073 → Lab; built-ins untouched; `id`/`data_set_id` gone; an extra
`ontology_template_id: 5` reported as unknown); `resolve` round-trips with
a different map; `planForms` with a same name and a missing field.

Live, vault 6772: Copy, then Paste on the same page — *test 1* reads *same
name here*. Rename nothing; instead temporarily remove a field? No: create
the throwaway form *ZZ copy test* through Paste from a clipboard entry
whose name was edited in storage, confirm it appears with the right cells
(open it in the dialog), then delete it with CDD's own Delete.

Between two vaults: the user's test.

## Not in scope

- Ontology template references (dropped to none, noted).
- Readout sections that carry numeric ids (none measured; would be
  reported as unknown ids).
- Updating an existing form in the target.
