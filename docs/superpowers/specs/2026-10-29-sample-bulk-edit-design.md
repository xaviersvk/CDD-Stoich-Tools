# Bulk edit of sample fields — design

Date: 2026-10-29 · Branch: `sample-bulk-edit`

## Problem

A molecule's samples often share a field that was entered wrong — on
RGT-0001968 (vault 6885) sixteen 10 µM stocks should have read 10 mM. CDD
edits one sample at a time through its Edit dialog.

## What it does

A **Bulk edit** link next to CDD's *Create a new sample* on the molecule's
Samples tab opens a dialog:

1. **Field** — every inventory sample field of the vault, from
   `/api/internal/v1/vaults/<v>/data_sets/<v>/registration_form_definitions`
   (`inventory_sample_field_definitions`). Sample ID, Sample Number and
   Barcode are never offered (one per sample). Types offered: PickList,
   Number, Date, Text and the long-text kinds; anything else (files…) is left
   out.
2. **New value** — a select of the visible pick list values, a number, a date
   or a text input by type; plus **Clear** (empty value).
3. **Samples** — the molecule's non-depleted samples (a toggle shows depleted
   ones), each with a tick box, name, location and the field's current value.
   "Select all with <value>" picks by current value. Each ticked row previews
   `old → new`; rows that already hold the new value are skipped.
4. **Write** — samples are saved one at a time; each row shows ✓ or CDD's
   error text, and an error does not stop the rest. Closing the dialog after
   any write reloads the page so CDD's own list shows the new values.

Always on (like *Duplicate sample*): it does nothing until clicked.

### From Inventory search

CDD's own **Bulk Update** there adds an inventory event (Debit/Credit, event
fields) or depletes; it cannot set sample fields. A **Bulk edit fields**
button next to it opens the same dialog over the rows ticked in CDD's table,
all pre-ticked, depleted ones included.

The table shows names only. The ids come from the search response
(`POST /vaults/<v>/inventory_search.json` → `inventory_entries[{ id, name,
batch.molecule_id }]`), which inject/main.js already forwards as
`MOLECULE_SEARCH`; a ticked row is matched by the sample name in any of its
cells. The dialog loads each involved molecule's `inventory_samples.json`
(4 at a time) for the full records and writes to each sample's own molecule.
The page is not reloaded after a write (that would drop the search); the
dialog asks to run the search again.

## How it writes

Exactly what CDD's sample Edit dialog sends (`buildSubmitSampleFormData` in
CDD's bundle, read 2026-10-29):

```
PUT /vaults/<v>/molecules/<m>/inventory_samples/<id>    multipart/form-data
inventory_sample[id|name|units|batch_id|depleted]
inventory_sample[fields_attributes][i][field_definition_id]
inventory_sample[fields_attributes][i][value]
```

All of the sample's current fields are sent, with the one field replaced (or
added when the sample lacks it). Field names in `inventory_samples.json` map
to definition ids by name; a sample holding a field whose name has no
definition is not written (error on its row) rather than risk dropping it.
File-like values send `uploaded_file_id ?? value`, as CDD does.

Verified live in vault 6885 on 2026-10-29: changing Concentration Unit,
adding a field the sample lacked and clearing it with `""` each returned 200
and left location, amount, events and the other fields untouched.

The samples are fetched again right before writing, so each PUT starts from
the sample's current state, not from what the dialog loaded.

Uses `createInventorySample(url, formData, "PUT")` (content/api) for the
request — same CSRF / cookie handling as multi-position create.

## Units

- `src/content/features/sample-bulk-edit/model.js` — pure: editable fields
  from definitions, current value of a sample, preview rows, FormData entries
  for one sample. Tested in `tests/sample-bulk-edit-model.test.js`.
- `src/content/features/sample-bulk-edit/dialog.js` — dialog and write loop;
  `load()` supplies the samples, each tagged `__moleculeId`.
- `src/content/features/sample-bulk-edit/init.js` — the molecule-page link.
- `src/content/features/sample-bulk-edit/search.js` — the Inventory search
  button, ticked rows → ids.
- `src/content/features/sample-bulk-edit/styles.js` — CSS.

## Out of scope

Amount / units of the sample, location.
