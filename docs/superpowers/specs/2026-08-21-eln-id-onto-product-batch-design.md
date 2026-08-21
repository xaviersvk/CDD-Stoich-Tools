# Carry the ELN ID onto a product's existing batch — design

Date: 2026-08-21
Status: implemented and verified live on 2026-08-21. Revised once before
implementation: the write is direct, from the ELN page, with no tab and no
human Save.

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
`PHA-0334592-001`, molecule `165290233`, batch `192201177`. Read-only —
nothing was saved.

**The identifiers are in the payload.**
The product row carries `batchId: 192201177`, `moleculeId: 165290233`,
`hasSample: false`, `role: "product"`. In the rendered entry the same thing
is plain text in a `<span>` with no link at all, so a DOM-driven version of
this feature could not exist. It has to come from the intercepted payload.

**The molecule is the case, exactly.**
Its tabs read *Batches 1, Samples 0*; the batch has
`Chem Purpose: Virtual Compound`, `Batch Status: For Synthesis`, and an
empty *Internal ID* whose data row does not exist yet
(`{ text_value: null, id: null }`).

**The field definition is per vault.**
*Internal ID* is `id 150242` in vault 6884 and `id 152401` in vault 7965, so
matching must be by NAME — which `eln-id-carry` already does. It is
`unique_value: true, overwritable: false`.

**The batch's vault is not always the ELN's vault.**
A reagent in the same entry (protein `PRO-0000017`) lives in vault 7965
while the entry is in 6884. Same host, different vault.

**There is no server-rendered edit form.**
`GET /vaults/6884/specified_batches/192201177/edit` **redirects** to the
molecule page, and the returned HTML contains no control whose id starts
`specified_batch_192201177_field_`. The edit form is built by React, in the
browser, on the `#molecule-batches` tab.

**But the rendered form is an ordinary Rails form.** Once React has it:

```
form.edit_specified_batch
  action  /vaults/<vault>/specified_batches/<batchId>
  method  post   +   hidden _method=put
  104 named controls, including authenticity_token

  specified_batch[salt_ratio]
  specified_batch[salt_name]
  specified_batch[solvent_of_crystallization_ratio]
  specified_batch[solvent_of_crystallization_id]
  specified_batch[eln_attached_structure_id]
  specified_batch[editable_fields_including_blanks_attributes][i][value]
  specified_batch[editable_fields_including_blanks_attributes][i][batch_field_definition_id]
  specified_batch[editable_fields_including_blanks_attributes][i][id]
```

*Internal ID* is index `8`, control id
`specified_batch_192201177_field_150242`.

**Framing is allowed.** The molecule page answers
`X-Frame-Options: SAMEORIGIN` and
`Content-Security-Policy: frame-ancestors app.collaborativedrug.com`. The
ELN page is on that host, so it may frame the molecule page and script it.

**The write does what it promises.** Verified on batch `192201177` after the
first real click: *Internal ID* became `MDX-0095` on a value row that did not
exist before (`id: null` → `id: 792165193`), and Chem Purpose, Batch Status,
Synth. Assigned To, Priority, Batch Name and Date are all exactly as they were.

## Decisions

| Question | Decision |
| --- | --- |
| What value | The ELN entry ID — the same one `eln-id-carry` carries on registration |
| Existing value | **Never overwrite.** No button, and no request, when the field is non-empty |
| Which rows | **Products only.** The ID means "this batch was made here"; a reactant was consumed here, not made |
| How it writes | **Directly from the ELN**, by submitting CDD's own edit form. No tab, no Save |
| Two products, one ID | Not handled. CDD refuses the second write and the card shows what it said |
| Product enrichment | Products join the enrichment pass fully — their cards gain the real batch fields |
| Bulk mode | Not now |

### Why an iframe rather than a hand-built request

A direct write means a `PUT` to
`/vaults/<vault>/specified_batches/<batchId>`. The danger is not the verb —
it is the **body**: that endpoint takes the batch's *whole* field set, so a
body assembled by us decides the fate of all thirty fields, not just the one
we care about. Get a pick-list, a date, or a file field wrong and the write
quietly damages a batch nobody asked us to touch.

The `react_props` on the molecule page do carry every current value, so a
body *could* be reconstructed from them. It would still be our body, and its
edge cases (pick lists, dates, batch links, uploads) are exactly where a
reconstruction goes wrong. **`field_name_prefix` in those props even says
`molecule[batch][…]`, which is the *Add a batch* form's prefix, not the edit
form's `specified_batch[…]`.** Anyone building the body from the props would
build the wrong one.

So the body is never built. A hidden same-origin iframe loads the page, lets
CDD render its own form with its own values and its own CSRF token, one
input is changed, and `new FormData(form)` is posted to the form's own
action. Every byte except the ELN ID is CDD's.

## Design

### 1 · Where the button lives

On the product card in the samples panel, styled like the existing fill
buttons (`buildFillButton`).

This is the first action ever offered on a product card. The products spec
of 2026-08-07 says *"Products are display-only in v1: no fill buttons, no
density-memory"* — a v1 scoping choice, deliberately reversed here rather
than worked around. The options-page copy that repeats it must change too.

### 2 · When it is offered

All of these must hold:

- `sample.isProduct`
- `sample.batchId` and `sample.moleculeId` are both present
- the ELN entry ID is known, and `eln-id-carry` is enabled
- the batch's *Internal ID* — under the label configured in `eln-id-carry`,
  not a hardcoded string — is **empty**

When it is already filled, the card shows the value that is there and offers
no button. A missing button with no explanation reads as a bug.

The value written is `applyIdentifierFormat(entryId, format)` plus
`tableSuffix(sample.reactionIndex)` — the same composition the Register link
already stamps, so a batch filled this way and one registered from the entry
carry the identical string.

### 3 · Knowing whether it is empty

`batch-field-enrichment.js:139` currently reads:

```js
if (sample.isProduct) continue;   // no metafield fetches for products
```

That line goes. Products join the same pass, which already fetches the
molecule page once per molecule, caches the promise, and joins
`batch_field_definitions` against the lot's values. A product costs one GET
per molecule not already fetched.

Two additions to what enrichment records:

- `sample.batchFieldMap` — the raw `{name: value}` map, so the button can
  look up **the configured label** rather than the hardcoded names
  `resolveBatchFields` knows.
- `sample.batchVaultId` — parsed from the fetched response's final URL,
  because the redirect may have landed in another vault.

Consequence, accepted deliberately: product cards start showing batch fields
they never showed — Purity, Density, Vendor ID, whatever the vault defines.

### 4 · What the click does

1. Create a hidden iframe at
   `/vaults/<batchVaultId>/molecules/<moleculeId>#molecule-batches`.
2. Wait until **this batch's props are readable from the frame**. Do NOT wait
   on `readyState`: a fresh iframe starts on `about:blank`, whose
   `readyState` is already `"complete"`, so a readyState poll returns the
   blank document about 5 ms in and every read after it comes back empty.
   That was the first implementation and it failed exactly that way.
   *Measured: props readable after 2.3 s.*
3. Re-read *Internal ID* from those props. This is the last moment before a
   write, and the panel's copy may be minutes old. If it is no longer empty,
   stop. No request.
4. Wait for `#specified_batch_<batchId>_field_<defId>`. It will not come:
   **the batches tab lands read-only inside an iframe** — measured at twelve
   seconds with no input. Click that batch's
   `a[href$="/specified_batches/<id>/edit"]` inside the frame and wait again.
   *Measured: input present 766 ms after the click.* The nudge is the normal
   path, not a fallback.
5. Check the input is still empty — a third look at the same question, this
   time at the live control. Set its value; dispatch `input` and `change` so
   React's state follows.
6. `POST` `new FormData(form)` to the form's own `action`, with
   `credentials: "include"`. `_method=put` and `authenticity_token` ride
   along because they are the form's own fields.
7. Remove the iframe. Update the sample's `batchFieldMap` and drop the cached
   molecule page, or the card goes on offering a button whose work is done and
   the next click dies on "already set".

Time-box every wait (10 s) and remove the iframe in a `finally`. An iframe
left behind is a second CDD session running in the page.

**Report each stage.** The whole sequence takes six to eight seconds on a real
batch. A single unchanging "Writing…" for that long reads as a hang, and on
the first live run it was reported as one — the write had in fact succeeded.

**Use the existing page cache.** `content/api/molecule-page.js` has fetched and
parsed molecule pages since the synonym work. Anything here that wants one goes
through it; a second cache means every molecule is fetched twice.

### 5 · The trap that costs an afternoon

On the read-only molecule page the **only** control matching *Internal ID*
by label belongs to the **"Add a batch"** form (`new_specified_batch[…]`).
Filling that one and submitting would create a batch instead of editing one.

The target must be found by the id `specified_batch_<batchId>_field_<defId>`
and by nothing else — not by label, not by name. This is the same class of
mistake as the Rails hidden input that shadowed the *Create a New Sample*
checkbox.

### 6 · Uniqueness

Every eligible product gets a button. If two products in one entry are both
pushed, CDD refuses the second because *Internal ID* is `unique_value: true`.
The card shows the refusal; the plugin neither predicts it nor invents a
suffix to dodge it.

### 7 · Off by default

A checkbox in the options page, off on install. This one writes to a record
without asking again, which is precisely the kind of thing that must not
appear in anyone's panel because they updated.

## Files

- `src/shared/eln-id-to-batch.js` (new) — the enabled flag with the usual
  sync cache, plus a cache of `eln-id-carry`'s `{fieldLabel, format}` so the
  synchronous panel render can read them. DOM-free.
- `src/content/api/batch-registration-props.js` (new) — `readBatchProps(doc,
  batchId)` returning `{ fieldMap, definitions, vaultId }` from a molecule
  document. Used by the enrichment pass and by the pre-write re-check, so
  the two cannot disagree about what "empty" means.
- `src/content/features/batch-field-enrichment.js` — drop the `isProduct`
  skip; record `batchFieldMap` and `batchVaultId`.
- `src/content/features/eln-id-to-batch-write.js` (new) — the iframe write.
  One job, isolated, easy to delete if it ever has to go.
- `src/content/features/sample-panel.js` — the button and the "already set"
  line on product cards.
- `src/content/main.js` — init the flag cache.
- `src/options/options.html`, `src/options/options.js` — the checkbox, and
  the corrected products copy.

## Not in scope

- Reactants, and any field other than the one `eln-id-carry` is configured
  for.
- A bulk "fill all products" action.
- `eln-id-carry` stores its field label **globally** while its own comment
  says the label is per-vault configuration. Recorded as debt in the
  registration-defaults spec; still not this spec's job.

## Verification

No test runner. The pure parts — the label match, the "is it empty"
predicate, the composed value, the target's control id — get the usual
throwaway `node` script.

The rest is live. **The first live write must be to a batch chosen for the
purpose**, not to whichever product happens to be at hand, because unlike
every other feature in this plugin it cannot be undone by closing a tab.

1. Switch the feature on in the options page.
2. Open entry `2504170`. The product card for `PHA-0334592-001` offers the
   button; reactant cards do not.
3. Before clicking: open the batch in another tab and confirm *Internal ID*
   is empty.
4. Click. The button reports `✓ Internal ID set to PHA-MDX-0095`.
5. Reload the batch. *Internal ID* holds that value **and every other field
   is unchanged** — Chem Purpose, Batch Status, Synth. Assigned To,
   Priority, Date, and the salt/solvent ratios. This is the check the whole
   design exists for; do it field by field the first time.
6. Click again on the same card. It refuses without a request, because the
   field is no longer empty.
7. On a second product in the same entry, the write is refused by CDD and
   the card shows what CDD said.
