# Readout definition clipboard — design

Date: 2026-10-13

## Goal

Copy every readout definition of a protocol in one vault and paste them into
a protocol in another vault, typically a freshly created one that has none
yet. CDD's own *Duplicate protocol details* does not do this across vaults.

## UI

On a protocol's *Protocol Details* tab, next to CDD's
`#add_readout_definition_link` ("Create a new readout definition"), a bar:

- **Copy N readout definitions** — always (reading only).
- **Paste N readout definitions** — only when the page says editing is
  allowed (`ProtocolReadoutDefinitionsView` `react_props.editingAllowed`).
  Disabled with a tooltip when the clipboard is empty; the tooltip names the
  source protocol and vault.
- A status line: progress, then what was created, skipped and failed. On a
  clean paste the page reloads so CDD shows the new readouts.

Styling reuses the field clipboard's bar (`cdd-fc-bar`, `cdd-fc-button`).
Always on, no options-page switch.

## Endpoints (measured 2026-10-13, vault 8158 read, vault 1000000109 write)

| What | Call |
|---|---|
| List | `GET /vaults/{v}/protocols/{p}/readout_definitions` (JSON array) |
| Calculation | `GET /vaults/{v}/protocols/{p}/custom_calculations/{id}` |
| Create readout | `POST /vaults/{v}/protocols/{p}/readout_definitions`, flat JSON body |
| Create calculation | `POST /vaults/{v}/protocols/{p}/custom_calculations`, flat JSON body |

Headers as in `utils/form-definitions-api.js` (CSRF token,
`X-Requested-With`). Failures answer 400 with `{field: [messages]}`.

Readout body: `name, description, data_type_name, unit_label,
display_format, required, protocol_condition, pick_list_values: [{value,
hidden, display_order}]`.

- `precision_type`/`precision_number` are **ignored** on create; precision
  goes in as `display_format`: `"N significant figure(s)"`,
  `"N decimal place(s)"`, `"0 (integer)"`, or `"None"`.

Calculation body: `formatted_formula, aggregate_readouts_by,
output_readout_definition_attributes: {name, description, data_type_name,
unit_label, display_format}`.

- `formula` (ids) is **ignored**; `formatted_formula` is read, with
  references written as `[Protocol name -> Readout name (unit)]`.

## What is copied

Clipboard (`chrome.storage.local`, key `cddReadoutClipboard`, one entry):
`{ vaultId, vaultName, protocolName, copiedAt, readouts: [...],
calculations: [...] }` — names, never ids.

- Plain readouts (`calculation_type` null): the fields of the body above, in
  `display_order`.
- `CustomCalculation` outputs: their calculation's `formatted_formula`,
  `aggregate_readouts_by`, and the output readout's fields.
- Other calculation types (dose-response, normalisation, Boltz-2, …): listed
  in the clipboard as `skipped` by name and type and reported after paste.

## Paste

1. Read the target's readouts; a name already there is skipped (never
   overwritten, nothing deleted).
2. Create plain readouts in source order.
3. Create calculations. In `formatted_formula`, `[<source protocol> -> `
   becomes `[<target protocol> -> ` (target name = the page's `<h1>`).
   References to other protocols are left as they are. A calculation that
   fails because it refers to a calculation not created yet is retried after
   the others, until a round makes no progress.
4. Report created / skipped / failed (with the server's message). Stop at the
   first plain-readout failure; calculations continue past each other's
   failures.

## Out of scope

Protocol details, control layouts, display options, hit conditions; editing
or selecting readouts before paste; non-custom calculation types.

## Files

`src/content/features/ui-fixes/readout-clipboard/`:
`model.js` (pure: displayFormat, toClipboard, retargetFormula),
`api.js` (fetch + create), `clipboard.js` (storage), `init.js` (bar,
wiring). `main.js` calls `initReadoutClipboard()`.

## Testing

No test runner. `npm run build`; copy from vault 8158 protocol 1000000370
(read-only); paste only into a protocol in test vault 1000000109.
