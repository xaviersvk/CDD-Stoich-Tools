# Carry the ELN ID onto a product's existing batch — design

Date: 2026-08-21
Status: approved by user (conversation)

## Problem

`shared/eln-id-carry.js` already writes the ELN entry ID into *Internal ID*
— but only on the way *into* a registration form. That covers the compound
you register **from** the entry.

It does not cover the compound that was registered **first**. A target is
registered before anyone makes it: it has a molecule and a batch, no
inventory sample, and an empty *Internal ID*. When the synthesis finally
happens, that batch is the product of an ELN entry, and nothing points from
one to the other. Today the only fix is to open the molecule, find the
batch, click Edit, and type the entry ID by hand.

## What was verified live

On production entry `2504170` (vault 6884, `PHA-MDX-0095`), product
`PHA-0334592-001`. Read-only; nothing was saved.

- **The payload carries the identifiers.** The product row has
  `batchId: 192201177`, `moleculeId: 165290233`, `hasSample: false`,
  `role: "product"`. This is the fact the whole feature rests on.
- **The DOM does not.** In the rendered entry, `PHA-0334592-001` is plain
  text inside a `<span>` — no molecule link, no batch link, nothing to
  follow. A DOM-driven version of this feature is not possible; it has to
  come from the intercepted payload.
- **The batch has an edit page**: `/vaults/6884/specified_batches/192201177/edit`,
  reachable as an ordinary `<a href>` from the molecule page.
- ***Internal ID* is empty, and emptier than expected.** Its data row reads
  `{ text_value: null, id: null }` — the value row does not exist yet.
- **The field definition is per vault.** *Internal ID* is `id 150242` in
  vault 6884 and `id 152401` in vault 7965. Matching must be by NAME, which
  is what `eln-id-carry` already does.
- **`unique_value: true`, `overwritable: false`** on that definition. The
  vault enforces that no two batches share an *Internal ID*.
- **The batch's vault is not always the ELN's vault.** A reagent in the same
  entry (protein `PRO-0000017`) lives in vault 7965 while the entry is in
  6884. It happens to match for this product; the design must not assume it.

## Decisions

| Question | Decision |
| --- | --- |
| What value | The ELN entry ID — the same one `eln-id-carry` carries on registration |
| Existing value | **Never overwrite.** No button when the field is non-empty |
| Which rows | **Products only.** The ID means "this batch was made here"; a reactant was consumed here, not made |
| How it writes | **The plugin fills, the user saves.** No headless write |
| Two products, one ID | Not handled. Both get a button; CDD refuses the second Save in its own words |
| Product enrichment | Products join the enrichment pass fully — their cards gain the real batch fields |
| Bulk mode | Not now |

**Why not a headless PUT.** A silent `PUT` is what "one click" literally
asks for, and it was rejected on purpose: it means guessing an endpoint and
a payload shape against a production batch, where a wrong payload can
disturb fields nobody touched. The cost of the chosen route is one keypress
per compound. If this ever runs over dozens of compounds, submitting CDD's
own edit form (so the payload is CDD's, not ours) is the next step — but
that is a different feature from the one specified here.

## Design

### 1 · Where the button lives

On the product card in the samples panel, styled like the existing fill
buttons (`buildFillButton`), one row, no new visual language.

This is the first action ever offered on a product card. The products spec
of 2026-08-07 says *"Products are display-only in v1: no fill buttons, no
density-memory"* — that was a scoping choice for v1, and it is deliberately
reversed here rather than worked around.

### 2 · When it is offered

All of these must hold:

- `sample.isProduct`
- `sample.batchId` and `sample.moleculeId` are both present
- the ELN entry ID is known, and `eln-id-carry` is enabled
- the batch's *Internal ID* — under the label configured in `eln-id-carry`,
  not a hardcoded string — is **empty**

When the field is already filled, the card shows the value it found and
offers no button. That is the "never overwrite" decision made visible rather
than silent: a missing button with no explanation reads as a bug.

### 3 · Knowing whether it is empty

`batch-field-enrichment.js:139` currently reads:

```js
if (sample.isProduct) continue;   // no metafield fetches for products
```

That line goes. Products join the same pass: it already fetches the molecule
page once per molecule, caches the promise, and joins
`batch_field_definitions` against the lot's data values. A product costs one
GET per molecule not already fetched.

Consequence, accepted deliberately: product cards start showing the batch
fields they never showed — Purity, Density, Vendor ID, and whatever else the
vault defines. Anyone with products switched on will see their panel change.

### 4 · What the click does

Opens `/vaults/<batchVault>/specified_batches/<batchId>/edit` in a new tab,
with the ELN ID in the query string under the existing `ELN_ID_PARAM`
(`cdd_eln_id`). The content script on the landing page finds the *Internal
ID* control for **that batch**, fills it, and stops. The user reads it and
presses Save.

The URL is the wire for the same reason it already is on the registration
path: the link opens a new tab, the two pages never share a JavaScript
world, and storage would be a race against the new tab's load.

`<batchVault>` comes from the molecule page URL resolved during enrichment,
not from `location.pathname`. The reagent example above is the reason.

Reused as-is: `applyIdentifierFormat` (so the vault's ID format is honoured),
`normalizeFieldLabel` (so `*Internal ID` and `Internal ID` are one label),
and the guards from `registration-fill.js` — never overwrite a non-empty
field, never touch a focused one, fill once.

### 5 · The two traps on the edit page

**Cold navigation lands read-only.** Fetching
`/vaults/7965/specified_batches/190898728/edit` directly ended at
`…/molecules/164033132#molecule-batches/190898728` with the batch rendered
read-only, `editable: false`. The batch's **Edit** control is a plain
`<a href>` on that page, so the filler can click it — but whether a cold load
needs that click, or whether in-app navigation opens edit mode by itself, is
**not yet established**. It changes one step of the filler, not the design.

**The wrong input is right there.** On that page the only control matching
*Internal ID* by label belonged to the **"Add a batch"** form
(`new_specified_batch[…]`), not to the batch being edited. The batch's own
controls carry the id prefix `specified_batch_<batchId>_field_<defId>`. The
fill must be anchored to that prefix, never to a label match alone.

This is the same class of mistake as the Rails hidden input that shadowed the
*Create a New Sample* checkbox: on a Rails page, a matching name or label is
not proof of the right control.

### 6 · Uniqueness

Nothing special. Every eligible product gets a button. If the entry has two
products and both are pushed, CDD refuses the second Save because
*Internal ID* is `unique_value: true`, and it says so in its own words on its
own page. The plugin neither predicts the refusal nor invents a suffix to
dodge it.

### 7 · Off by default

A checkbox in the options page, off on install, per the standing rule that
nobody's panel sprouts a new control because they updated.

## Files

- `src/content/features/batch-field-enrichment.js` — drop the `isProduct`
  skip; carry the resolved molecule-page vault so callers can build batch
  URLs.
- `src/shared/eln-id-to-batch.js` (new) — the enabled flag, and the pure
  helper that builds the edit URL with `cdd_eln_id` from
  `{ vaultId, batchId, elnId }`. DOM-free, so the options page can import it.
- `src/content/features/sample-panel.js` — the button on the product card,
  and the "already set to X" line when it is not offered.
- `src/content/features/ui-fixes/batch-internal-id-fill.js` (new) — the
  landing-page filler: read `cdd_eln_id`, find the control under
  `specified_batch_<batchId>_field_<defId>`, fill, stop.
- `src/options/` — the checkbox.

## Not in scope

- Any write the plugin performs itself. Save stays a human keypress.
- Reactants, and any field other than the one `eln-id-carry` is configured
  for.
- A bulk "fill all products" action.
- `eln-id-carry` stores its field label **globally** while its own comment
  says the label is per-vault configuration. Already recorded as debt in the
  registration-defaults spec; still not this spec's job.

## Verification

No test runner. The pure parts — the URL builder, the label match, the
"is it empty" predicate — get the usual throwaway `node` script.

The rest is live, on entry `2504170` and product `PHA-0334592-001`, whose
*Internal ID* is empty today:

1. Switch the feature on in the options page.
2. Open the entry. The product card offers the button.
3. Click it. The batch edit page opens with *Internal ID* showing
   `PHA-MDX-0095` and nothing else changed.
4. **Stop there and read the form** before deciding whether to save. Every
   step up to this point is reversible by closing the tab.
5. On a product whose *Internal ID* is already set, the card shows the value
   and offers no button.
6. On a reactant, nothing appears at all.

The vault is production. The verification ends at "the field shows the right
value"; whether to press Save is the user's call, per compound.
