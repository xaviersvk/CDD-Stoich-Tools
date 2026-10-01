# Add fields to forms — every kind, both form pages — design

Date: 2026-10-01
Status: designed, layouts and save call measured live (vault 8289)

*Add fields to forms* (6.9e, `ui-fixes/registration-form-rows/`) today adds
**batch** fields to registration forms. It grows a type switch and a second
page:

| Page | Switch | Table key in `components` |
|---|---|---|
| Settings → Registration (Registration Forms table) | **Entity · Batch · Sample · Inventory** | `molecule` · `batch` · `sample` · `inventory` |
| Settings → Protocol Forms (`/vaults/<id>/vault_protocol_form_definitions`) | **Run · Protocol** | `run` · `protocol` |

Everything else the card does — row order, Pick List default, per-form
preview, backup, re-check before and after each PUT, stop at the first
failure — stays exactly as it is and applies to every kind.

## What was measured (vault 8289, 2026-10-01)

**Registration forms** (13). `molecule`, `batch`, `sample`, `inventory`:
every non-null layout is one section holding one `table`; rows are 6 wide
(`L1 F5`, `L1 F2 ×2`, `L1 F1 ×3`, `L1 F0.5 ×4`). No string `fieldID`s —
built-ins (Structure, Name) are not in these tables. Two forms have
`inventory: null` (no layout of its own; CDD shows every field). Field
definitions for all four kinds are already read by `readRegistrationMap()`
(`defs.molecule|batch|sample|inventory`, with `data_type_name`,
`pick_list_values`, `disabled`).

**Protocol forms** (17). Keys `id, name, data_set_id, created_at,
updated_at, components, form_type`; `components` has `protocol`, `run`,
`readout`. `run` and `protocol` are one section, one `table`
(`{ context: 0, layoutType: "table", contents: [rows] }`) on every form; no
nulls. Rows are 6 wide, same patterns, plus:

- `protocol` rows full of ontology cells — `{ span, layoutType,
  ontologyAssn }` (and sometimes `allowedValues`), no `fieldID`;
- a `run` row `L6` (one label across the row);
- run field cells with `defaultValue` (Pick List value id, as in batch),
  `isLocked`, `isRequired`, sometimes `allowedValues`;
- built-in run cells with a string `fieldID` (`"run_date"`).

None of these is touched: they go back as they came. A string `fieldID` is
never a chosen field and never a file field.

**Saving a protocol form**, from CDD's bundle (`updateFormDefinition`, case
`"protocol_form"`): `PUT /api/internal/v1/vaults/{vault_id}/
protocol_form_definitions/{form_definition_id}` with
`{ form_definition: { name, components } }`.

**Protocol/run field definitions**: in the Protocol Forms page's React props,
`store.fieldDefinitionsMap.run|protocol`, each with `id, name,
data_type_name, pick_list_values [{ id, value, hidden }], is_hidden, …`
(8289: 44 run — Text, Number, LongText, PickList ×4, BatchLink, File; 3
protocol — Text ×2, File). `inject/hooks/form-store-bridge.js` reads that
object today but reduces each entry to `{ id, name }`.

## Design

### `row-model.js` — the table key becomes a parameter

`planForm(form, cells, fileIds, key)` and `withRows(form, cells, fileIds,
key)` read and write `form.components[key]` instead of
`form.components.batch`. `putBody(form, sent)` and `verifySaved(expected,
saved, sent)` take the list of form keys the page's PUT sends:

- registration: `name, components, registration_type,
  structureless_image_name, allow_new_molecules, registration_system_id`
  (as now);
- protocol: `name, components`.

Notes name the table: "no layout of its own — it shows every inventory field
already", "its run section has no table to add a row to". `fileFieldIds()`
and `resolveChosen()` already take a definitions list and work for any kind.

Nothing else in the model changes: last table of the last section, rows 6
wide or `odd-layout`, new rows above the closing File-only rows, three
label/field pairs to a row, a Pick List default set only where the form's
cell has none, a misplaced own row moved up, `null` layout left alone.

### `panel.js` — one card, a page config

`buildBar(page)` takes a config:

```js
{
  formsNoun: "registration" | "protocol",   // backup file name, texts
  kinds: [{ key, label }],                  // the switch, in order
  listForms(vaultId), updateForm(vaultId, id, body),
  readDefs() -> { [key]: defs[] } | null,
  sent: [...],                              // keys putBody/verifySaved use
  extraColumn(form) -> string,              // registration: system prefix; protocol: ""
}
```

The switch is a row of buttons at the top of the card (selected one bold —
weight, not colour). Switching rebuilds the field list and the preview for
that key; ticks do not carry across kinds. The card title follows it: *Add
entity fields to forms*, *Add run fields to forms*. The card opens on the
kind used last (else the first). The hint for a remembered field the vault
lacks names the right page: "paste it on Run Fields first".

### Remembered choice — per table key

`selection.js` stores `{ [key]: [{ name, default }] }` under
`cddFormRowSelection`, plus the last kind used per page. The existing
`cddRegistrationFormRowSelection` is read as the `batch` entry when the new
key has none, so a saved batch choice is not lost.

### Protocol Forms page

- `protocol-form-rows` wiring next to `form-clipboard/init.js`: the bar goes
  above the Protocol Forms table, under Copy / Paste, on the same
  administrator rule (`findFormsTable(PROTOCOL_FORMS_PAGE)`).
- `form-clipboard/api.js` gains `updateForm(vaultId, formId, body)` →
  `updateFormDefinition(base/formId, body)`.
- `form-store-bridge.js` keeps `id, name` and adds `data_type_name`,
  `pick_list_values` (`id, value, hidden`) and `disabled` (false when
  absent). The form clipboard reads only `id`/`name`, so it is unaffected.
- `is_hidden` definitions are listed like any other (CDD's own form editor
  decides what a hidden field means; this card does not second-guess it).

### Registration page

Same card with the four-kind switch; definitions from
`readRegistrationMap().defs`. Disabled definitions are dropped from the
list as now; a disabled File field still marks a file row.

### Error handling

Unchanged: a JSON backup of the forms to be changed is downloaded first
(`cdd-<registration|protocol>-forms-<vault>-<stamp>.json`); each form is
listed again before its PUT (changed since the preview → stop) and after it
(anything but the sent document → stop); the first failure stops the run
with the server's words.

## Testing

- `row-model.js` checked with `node`: the batch behaviour as before, then
  the same plan/withRows/verifySaved cases on real shapes from 8289 —
  a `run` table with a string `fieldID` and an `L6` row, a `protocol` table
  with `ontologyAssn` cells (returned byte-identical), `molecule`, `sample`,
  and an `inventory: null` form (`no-layout`).
- `npm run build`.
- In the browser, by the user: on 8289, add one run field to one protocol
  form and one entity field to one registration form; check the form in
  CDD's editor and the backup file.

## Out of scope

- `readout` and ELN fields (no field rows to add).
- Marking added fields required, `allowedValues`, removing fields
  (6.9 *remove registration form fields* exists separately).
- A field list that mixes kinds in one run.
