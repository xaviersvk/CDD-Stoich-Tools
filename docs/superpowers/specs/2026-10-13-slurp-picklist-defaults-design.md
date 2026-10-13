# Slurp pick list defaults — design

Date: 2026-10-13

## Problem

On the bulk registration mapping page
(`/vaults/{vault}/slurps/{slurp}/mapping/edit`), CDD blocks the import until
every required field is mapped or given a default:

> You must map **Origin** when registering new entities. Or, provide a default
> origin.

The "provide a default origin" dialog is a plain text input, even when the
field is a pick list. The user cannot see which values are allowed and has to
look them up elsewhere.

## Goal

For every pick-list field that CDD offers a default for, show its allowed
values as buttons. One click applies that value as the default for the whole
file.

Always on, no options-page switch.

## Where the values come from

```
GET /api/internal/v1/vaults/{vault}/data_sets/{vault}/registration_form_definitions
```

Works on the session cookie and is small and fast. (Unlike
`/vaults/{vault}/molecules/new`, which `api/registration-form-fields.js` scrapes
and which takes ~10 s.) The response carries top-level
`molecule_field_definitions` and `batch_field_definitions`; each definition has
`id`, `name`, `data_type_name` and, for `"PickList"`, `pick_list_values[]` with
`value` and `hidden`.

Build `Map<fieldDefinitionId, string[]>` for definitions with
`data_type_name === "PickList"`, keeping CDD's order and dropping `hidden`
values. Fetch once per page load, only on the mapping page. A failed fetch
yields an empty map and the feature does nothing.

Verified in vault 8158: Origin (159492) → Commercial, Screening Library,
Synthesized, Virtual; Intermediate/Final (182450) → Final compound,
Intermediate.

## How CDD's default works (DOM contract)

Each required field has a hidden dialog form, already in the page:

```html
<form method="post" action="/vaults/{v}/slurps/{s}/mapping/headers"
      data-turbo-stream data-virtual-header-form>
  <input type="hidden" name="header_mapping[field_definition_id]" value="159492">
  <input type="hidden" name="virtual_header[name]" value="Origin">
  <input name="virtual_header[virtual_value]" id="provide159492-dialog_virtual_value">
  <button type="submit">Apply</button>
</form>
```

The error list links to it:

```html
<a data-mapping-error-id="provide159492-dialog" href="#">a default origin</a>
```

The field id is the number in `provide{id}-dialog`. The "+ Add a field…" form
uses the same input name but has no `field_definition_id`; it is ignored.

## Behaviour

1. **Error box.** Under each `<li>` that contains
   `a[data-mapping-error-id^="provide"]` whose field is a pick list, append a
   row of buttons, one per value.
2. **Dialog.** Inside each dialog form that has a
   `header_mapping[field_definition_id]` of a pick-list field, add the same
   row of buttons below the input.
3. **Click** (either place): set the dialog form's
   `virtual_header[virtual_value]` to the value, dispatch `input`, then
   `form.requestSubmit()`. This is exactly "type it and press Apply"; Turbo
   re-renders the page and the error disappears.

Turbo replaces the mapping section after each submit, so injection runs from
a document watcher (`watchDocument`) and is idempotent: a marker attribute on
the injected row prevents duplicates.

## Look

Small buttons in CDD's own `buttony buttony-small` style, normal weight, no
colour fill. The row wraps on narrow widths.

## Out of scope

- "+ Add a field…" (no target field yet).
- Checking pick-list values in file columns.
- Non-pick-list fields.

## Files

- `src/content/features/ui-fixes/slurp-picklist-defaults.js` — the feature.
  Pure helpers (`picklistsFromDefinitions`, `fieldIdFromErrorId`) are exported
  for tests.
- `src/content/main.js` — call `initSlurpPicklistDefaults()` next to
  `initSlurpTypeDefault()`.

## Testing

- Unit: `picklistsFromDefinitions` (PickList only, hidden dropped, order kept,
  junk input → empty map) and `fieldIdFromErrorId`.
- Manual (user, vault 8158 slurp 1000024490): buttons appear in the error box
  and in the dialog; one click sets Origin and the error goes away; the same
  for Intermediate/Final; nothing appears on "+ Add a field…".
