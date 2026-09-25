# Next step: a reaction whose products are the reactants — design

Date: 2026-09-25
Status: designed, feasibility verified live (see "Verified on a test paste")

One icon beside CDD's own *Copy reaction* in a reaction's toolbar:
**Copy as next step** puts a new reaction on the clipboard; Ctrl+V pastes it
below any reaction or paragraph, in this entry or another one. (An
*Insert below* variant was considered and dropped by the user: pasting
where it is wanted is enough.)

The new reaction takes the products of this one as its reactants. The
drawing keeps the arrow with an empty right side, ready for the next product.

## What exists today (verified live, entry 1000000814, vault 1000000109)

- The reaction toolbar is rendered inside the reaction's `<figure>` (Slate
  void node `.slate-reaction`). CDD's copy icon is
  `[data-autotest-id="copy-table"]`, clicked through
  `[data-autotest-id="click-target-copy-table"]`; its siblings are
  `remove-link` and `open-collapse-table`, each with a `mouseover_box`
  tooltip.
- *Copy reaction* calls `navigator.clipboard.write` with two items:
  - `text/plain`: `application/x-slate-fragment:` + base64 of
    `encodeURIComponent(JSON.stringify(fragment))`;
  - `text/html`: `<br>`.
- `fragment` is an array with ONE Slate node:
  `{ type: "reaction", key, children: [{ text: "" }], data }`. `data` has
  exactly the keys of the entry payload's reaction feature data:
  `dataVersion, moleculeRegistrationPath, _autoLimitingReagent, id,
  attachedStructureId, image, moleculeNames, nodeKey, stoichiometryTable,
  structureMrv, attachedStructureVersion, synonyms, mrv`.
- `data.mrv` is the drawing as Marvin MRV (`<cml><MDocument>
  <MChemicalStruct><reaction>` with `reactantList`, `agentList`,
  `productList`, then `arrow`, `MReactionSign` "+" signs, text boxes).
- `data.image` is `/cdd/molecule_image?auto_scale=…&height=…&image_format=…
  &structure=…&width=…`, where `structure` is base64 of the **zlib-deflated
  MRV** — byte-identical to `data.mrv` once inflated. A new drawing gets a
  new image by deflating its MRV (`CompressionStream("deflate")`).
- `stoichiometryTable` has `rows`, plus lookup maps `batches`, `samples`,
  `molecules`, and `currentRowUid`, `visible`, `migrated`, `dataVersion`.
  A product row carries `moleculeId`, `batchId`, `sample`, `mass`, `yield`,
  `inDrawing: true`, `role: "product"`.

## Behaviour

### The new reaction

- **Drawing.** `reactantList` gets the molecules of `productList`, shifted
  left so the rightmost of them ends left of the arrow's start with the same
  gap the old reactants had. `productList` and `agentList` become empty.
  Old reactant molecules are removed. "+" signs are rebuilt: one between
  each pair of new reactants, none on the product side. The arrow stays
  where it is. Text boxes (`MTextBox`, conditions written over the arrow)
  are dropped.
- **Table.** Only the old product rows, each turned into a reactant:
  `role: "reactant"`, `inDrawing: true`, fresh `uid`s from 1, `order`
  0…n-1, no `displayIndex`. Batch, sample, molecule identity and the
  product's **mass** carry over; `yield` and product-only fields are
  dropped. The first becomes the limiting reagent (`limitingReagent: true`,
  `equivalent: 1`); moles are recomputed from mass and formula weight the
  way CDD stores them (`mole = mass / formulaWeight` in mmol/mg units —
  confirmed against the existing rows during implementation).
  `currentRowUid` = number of rows + 1. The lookup maps keep only the
  entries the remaining rows reference.
- **Identity.** `key` gets a fresh value; everything else is left for CDD.
  Pasting gives the reaction a new feature id, a new `nodeKey` and a new
  server-side attached structure (verified), so the copy is independent of
  the original without the plugin clearing anything.
- A reaction without a product (nothing drawn right of the arrow, no
  product row) gets the icon disabled, with the tooltip
  *No product to carry over*.

### Copy as next step

Builds the new reaction from a freshly fetched entry
(`/vaults/<v>/eln/v2/entries/<id>`, the saved state), and writes it with
`navigator.clipboard.write` in CDD's exact two-item format. The icon shows a
tick for a moment, the same as CDD's own copy. Clipboard failure (no
permission, no focus) shows *Copy failed — click the page and try again*
in the icon's tooltip.

## Units

- `src/shared/next-step-reaction.js` — pure: `(reactionData) → nextData`,
  plus the MRV rewrite. No DOM, no fetch. Tested in Node against the live
  fragment captured from entry 1000000814.
- `src/content/features/next-step-reaction.js` — the icon in each
  reaction toolbar (placed after `copy-table`, same markup and tooltip
  style), the fetch of the fresh entry, the fragment encode/decode, the
  image rebuild and the clipboard write.
- A setting? No: the icon sits in CDD's toolbar and do nothing until
  clicked. (If it has to be switchable, it goes under *Settings → ELN*,
  off by default, per the panel-feature rule.)

## Verified on a test paste (entry 1000000814, 2026-09-25)

1. **Native paste of CDD's copy** below the reaction: new feature (65), new
   `nodeKey`, new `attachedStructureId`; the original is untouched.
   Pasting above the reaction inserts nothing.
2. **A rebuilt fragment** (product moved left of the arrow, one reactant
   row, lookup maps trimmed, image re-deflated from the new MRV): CDD
   accepted it as feature 66 with its own new structure, rendered the
   drawing with an empty product side and kept the row as saved —
   1.2 g, 3.58 mmol, limiting reagent.
3. **Synthetic `beforeinput insertFromPaste`** inserts it; a synthetic
   `paste` event does not. (Not needed now that there is no Insert below.)

Also seen: the body's reaction node carries `manualRowOrder: [uid…]` —
the dragged row order. The new reaction's body node gets none (one row, or
payload order).

Molecule counting: a superatom (e.g. Boc) is a `<molecule>` NESTED in the
product's molecule; the coordinate shift walks every `<atom>` under the
moved molecule, nested ones included.

## Out of scope

- Choosing which rows to carry (decided: products only).
- Carrying reagents, solvents or reaction conditions.
- Parallel (bulk) reactions: icon disabled there in v1.
- Inserting into the entry directly (the user pastes).
