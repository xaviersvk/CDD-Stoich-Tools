# Copy field definitions between vaults — design

Date: 2026-09-15
Status: designed

## Problem

A vault's field definitions — Molecule, Batch, Sample, Inventory, Protocol,
Run and ELN fields — are typed in by hand, one row at a time, in six settings
pages. Setting up a second vault like the first means retyping every field,
its type, its flags and every pick-list value. The user wants *Copy* on a
page in vault A and *Paste* on the same page in vault B, skipping any field
whose name is already there.

## What exists today (verified live, vault 6772)

Six settings pages, all under *Settings → Vault*:

| Page | Path | Edit link | Add link | Row inputs |
| --- | --- | --- | --- | --- |
| Molecule Fields | `vault_molecule_field_definitions` | Add/Edit Molecule Fields | Add a molecule field | name, data_type_name, unique_value, overwritable, required_group_number |
| Batch Fields | `vault_batch_field_definitions` | Add/Edit Batch Fields | Add a batch field | same as Molecule |
| Sample Fields | `inventory_field_definitions` (first table) | Add/Edit Sample Fields | Add a sample field | name, data_type_name, unique_value, *(unnamed: sample identifier)*, is_single_use, required_group_number |
| Inventory Fields | `inventory_field_definitions` (second table) | Add/Edit Inventory Fields | Add a inventory field | name, data_type_name, unique_value, required_group_number |
| Protocol Fields | `vault_protocol_field_definitions` | Add/Edit Protocol Fields | Add a protocol field | name, data_type_name, required_group_number |
| Run Fields | `vault_run_field_definitions` | Add/Edit Run Fields | Add a run field | name, data_type_name, is_display_identifier, required_group_number |
| ELN Fields | `vault_eln_field_definitions` | Add/Edit ELN Fields | Add ELN Field | name, data_type_name, unique, required (checkboxes) |

- Every page is React. The definitions sit in the state or props of a
  component above each `<table>` as an array of rows with `name`,
  `data_type_name`, `unique_value`, `overwritable`, `required_group_number`,
  `disabled`, `pick_list_values` (objects with `value` and `hidden`), plus
  page-specific flags (`is_single_use`, `is_display_identifier`,
  `is_sample_id`). Found by walking `return` from the table's fiber and
  looking for an array whose first element carries `data_type_name`.
  Built-in fields (*Batch Name*, *Initial Amount*, …) are either absent from
  that array or carry `disabled: true`.
- `data_type_name` option **values** are `Text`, `Number`, `Date`,
  `PickList`, `File`, and on Protocol and Run also `LongText` and
  `BatchLink`; Batch offers `BatchLink` too. The option list differs per
  page and is read live.
- `required_group_number`: `null` is *is optional*; a number is a group. A
  group of one is *is required*; a group of several is *or X is required*.
  A new row's select offers *is required* (a fresh group number),
  *is optional* (empty value) and the existing groups.
- Pick-list values are edited through the pencil (`.editPickListButton`) in
  the row, which opens `.pickListDefinitionDialog`: one text input per value
  and an empty one whose placeholder reads *Type in a value and hit enter or
  paste in a list of values, one per line*. Measured: a `keydown` Enter on
  the input commits the typed value; a `paste` event with a multi-line
  `text/plain` payload adds one value per line; *Update Pick List* closes
  the dialog and keeps the values on the row. Setting the input's value
  alone adds nothing. The pencil exists on a new, unsaved row as soon as its
  type is *Pick List*.
- Nothing reaches the server until the page's own *Update … fields* button;
  *cancel* discards every pending row.
- The vault's name is `#headerSwitcher-current-title`; its id is in the path.

## Decisions

- **One clipboard per kind**, seven kinds (Sample and Inventory count
  separately), in `chrome.storage.local` under `cddFieldClipboard`. Copy
  every page of vault A, then paste every page of vault B. A later copy of
  the same kind replaces the earlier one.
- **Skip on an exact name match**, case-sensitive, whitespace trimmed at the
  ends. "Batch ID" and "batch id" are two fields.
- **Group requirements become optional.** A field that was *or X is
  required* is pasted as *is optional* and marked in the preview; the group
  is rebuilt by hand. *is required* and *is optional* are carried over.
- **Types the target page does not offer are skipped** and marked. Built-in
  and `disabled` rows are never copied. Hidden pick-list values are not
  copied.
- **Sample Identifier is never set** by a paste — one field per vault, and
  the target may already have one. *Single Use*, *Display in dropdown*,
  *Must be Unique*, *Overwritable*, *Is Required* are carried where the
  target row offers them.
- **A preview before anything is touched**, and **the extension never
  presses Update**. Same rule as every other write.
- **No switch.** The buttons appear only beside an *Add/Edit* link, which
  CDD shows to administrators alone.

## Design

New feature `src/content/features/ui-fixes/field-clipboard/`, plus one
bridge hook.

### Bridge — `inject/hooks/field-rows-bridge.js`

```
FIELD_ROWS_REQUEST { requestId, tableIndex }
  -> FIELD_ROWS     { requestId, rows: [...] | null }
```

Walks up from `document.querySelectorAll("table")[tableIndex]` looking in
`memoizedProps` and `memoizedState` for an array whose first element has
`data_type_name`. Answers a JSON-safe copy: for each row the scalar fields
and `pick_list_values` reduced to `[{ value, hidden }]`.

### Pure — `field-model.js`

- `KINDS`: per-kind config — `pathPattern`, `tableIndex`, `editLinkText`,
  `addLinkText`, `label` ("batch fields").
- `kindsForPath(pathname) -> kind[]`.
- `normalizeRows(rawRows) -> Field[]` where
  `Field = { name, type, unique, overwritable, required: "required" | "optional" | "group", groupWith: string[], singleUse, displayIdentifier, pickList: string[] }`.
  Drops `disabled` rows and hidden pick values; derives `required` from
  `required_group_number` counts.
- `planPaste(fields, targetRows, targetTypes) -> Plan[]` with
  `{ field, status: "add" | "same-name" | "type-missing", note }`, where a
  group field gets `status: "add"` and `note: 'was "or X is required"; pasted as optional'`.
- `countPlan(plan) -> { add, skip }`.

### Storage — `clipboard.js`

`readClipboard() -> { [kind]: Entry }`, `writeClipboardEntry(kind, entry)`
with `Entry = { vaultId, vaultName, copiedAt, fields }`. `chrome.storage.local`.

### DOM — `page-dom.js`

The only file with CDD selectors for these pages. `findTable(kind)`,
`findEditLink(kind)`, `isEditing(kind)`, `enterEditMode(kind)`,
`addRow(kind) -> tr` (clicks the add link, waits for a new `tr` with an
empty `input[name=name]`), `fillRow(tr, field, requiredValue)` (native
setters; checkboxes clicked only when their state differs; the required
select set to the option whose text is *is required* or *is optional*),
`setPickList(tr, values)` (click the pencil, wait for the dialog, dispatch
one `paste` with the values joined by `\n`, click *Update Pick List*, wait
for the dialog to go), `targetTypes(tr) -> string[]` (the type select's
option values). All waits race a mutation against a timer, as `nextFrame`
does.

### UI — `panel.js`, `styles.js`, `init.js`

Beside each *Add/Edit … Fields* link: **Copy N fields** (N from the bridge)
and **Paste** (disabled with a tooltip when the clipboard has nothing of this
kind). Copy writes the entry and flashes *Copied N fields from ITR Sandbox*.
Paste opens a card under the link:

- head: *Paste batch fields — 12 from ITR Sandbox, copied 15 Sep 14:02*
- the plan, one line per field: name, type, and either the size of its
  pick list or its note; skipped lines struck out with the reason
- foot: **Add N fields**, *Cancel*, and a status line

The run: enter edit mode if needed, then for each *add* row `addRow`,
`fillRow`, `setPickList` when the type is `PickList`, re-reading nothing —
rows are appended at the end and the run keeps a handle on each `tr`. On
error it stops, keeps what it made, reports how far it got. On success it
closes the card and leaves the page in edit mode with the new rows, and the
status says *Now press Update … fields*.

`init.js`: one observer on `document.documentElement`, debounced; mounts
the buttons for every kind whose path matches and whose edit link is on the
page; tears down with the page.

## Verification

Pure (`node`): `kindsForPath` for all six paths; `normalizeRows` on a batch
row set with a group, a lone required, a disabled row, a hidden pick value;
`planPaste` with a same-name, a missing type, a group field.

Live, vault 6772 (one vault, both directions): Copy on Batch Fields, then on
Batch Fields again Paste — every field reads *same name here*, *Add 0
fields* disabled. Rename one clipboard entry in the preview? No — instead:
on Molecule Fields, Copy; on Batch Fields, Paste — the preview lists the
molecule fields with the batch-only ones marked; add them; they appear as
pending rows with the right types, unique/overwritable flags, and pick-list
values; *cancel* the page. Nothing saved.

Between two vaults: the user's test.

## Not in scope

- Reordering, renaming or editing existing fields.
- Rebuilding *or X is required* groups.
- Registration forms, protocol forms, ontology templates.
