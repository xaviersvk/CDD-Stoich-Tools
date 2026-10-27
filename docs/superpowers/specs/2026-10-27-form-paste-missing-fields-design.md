# Form paste: say which fields are missing, and hand them to the field clipboard

## Problem

Pasting a protocol form into a vault that lacks some of its run or protocol
fields stops at *missing fields: A, B*. The user then has to find out each
field's type and pick list in the source vault, create the fields by hand,
and paste again.

## Decision

No automatic field creation (rejected: writes to vault settings, or presses
*Update … fields* on the user's behalf). Instead the form paste prepares
exactly what to paste where, through the field clipboard that already exists.

## Behaviour

1. **Copy forms** stores, beside the neutral forms, the definitions of the
   protocol and run fields those forms use — in the field clipboard's shape
   (`normalizeRows`): name, type, pick list values, required, unique,
   overwritable, single use. Built-in fields (`disabled`) are not carried.
2. **Paste**: when one or more forms are blocked by missing fields, the card
   shows, under the form list, *Missing in this vault. Make these first:* and
   one line per settings page — *Run Fields: Temperature (Number), Solvent
   (Pick List, 4 values)*. The page name links to that settings page.
3. **Copy missing fields** writes those definitions to the field clipboard,
   one entry per kind (replacing what was there for that kind; the card says
   so). The status line then says: open the page, press Paste, then Update,
   then come back and Paste the forms again.
4. A missing field whose definition the clipboard does not carry (a form
   copied before this change) is listed by name with *copy the forms again in
   <source vault>*; it is not put on the field clipboard.

## Data

- Bridge (`inject/hooks/form-store-bridge.js`, `reduce`): also pass through
  `required_group_number`, `unique_value`, `overwritable`, `is_single_use`
  when the page store has them. Not measured: if the store lacks them, the
  fields arrive optional and not unique — the field paste preview shows it.
- Form clipboard entry gains `fieldDefinitions: { protocol: [field], run:
  [field] }`. Old entries without it keep working.
- `form-model.js`: `usedFieldDefinitions(neutralForms, sourceMap)` and
  `missingFields(plan, fieldDefinitions)` — DOM-free, tested with `node`.
- `field-model.js`: `typeLabel` and `describeField` move/appear here so both
  cards word a field the same way.
- `form-bar.js` stays shared with registration forms: the new block appears
  only when the adapter provides `missingFields` and `copyMissingFields`.

## Testing

Unit tests for `usedFieldDefinitions`, `missingFields`, `describeField`.
Live: copy a form with a run field from 1000000109 into a vault without it;
the user runs this (the MCP Chrome profile is not signed in to CDD).
