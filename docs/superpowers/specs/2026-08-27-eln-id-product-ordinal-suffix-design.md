# ELN ID suffix counts products, not tables — design

Date: 2026-08-27
Status: designed

## Problem

The suffix that keeps two products of one ELN entry from registering under the
same Internal ID counts **stoichiometry tables**:

    table 1 -> MDX-113     table 2 -> MDX-113B     table 3 -> MDX-113C

A reaction can have more than one product. Two product rows in the same table
therefore get the SAME suffix — the very collision the suffix exists to
prevent:

    reaction 1, product 1 -> MDX-113
    reaction 1, product 2 -> MDX-113      <- same ID, different compound

The user put it plainly: the mark is really about *which product*, and a
reaction can have several.

## What exists today

One helper composes every suffix; both stamping routes go through it.

- `src/shared/eln-id-carry.js`
  - `tableSuffix(index, style, markFirst)` — the mark for the table at `index`,
    in one of five styles (15.6.0): `letter`, `lower-letter`, `dash-letter`,
    `dash-lower-letter`, `number`.
  - `parallelSuffix(ordinal, letter)` — `-1A`, `-1B` for a product of a
    parallel ("bulk") reaction.
  - `productSuffix({ parallel, tableIndex, style, markFirst })` — parallel
    wins, otherwise `tableSuffix`.
- `src/content/features/ui-fixes/eln-id-to-registration.js` — the Register
  link. `tableIndexOf(link)` is the whole of its knowledge about the row: the
  index of the `[data-autotest-id="stoichiometry"]` block the link sits in, or
  `0` when the link is outside every table. It stamps EVERY Register link,
  reagent rows included.
- `src/shared/eln-id-to-batch.js` — `composeBatchElnId(entryId, format,
  reactionIndex, parallel, suffix)`, called from `sample-panel.js:1244`. This
  route is already products-only: `elnIdToBatchState()` returns null unless
  `sample.isProduct`.

So the two routes already disagree about reagents, and neither can tell one
product of a table from another.

## Decisions (from brainstorming)

- **The mark counts products of the entry**, in the order the entry shows
  them: reaction 1's products in table display order, then reaction 2's, and
  so on. ALL product rows count, registered or not — otherwise the ordinals
  would shift as people register, and an ID minted today would not match one
  minted tomorrow.
- **Only products get an ID.** A Register link on a reagent, solvent or agent
  row is left alone and its Internal ID field stays empty — *"je to len pre
  produkty"*. This also makes the two routes agree, since the panel button has
  always been products-only.
- **The styles are untouched.** The five styles of 15.6.0 apply to the product
  ordinal exactly as they applied to the table index.
- **Parallel reactions keep their own scheme** — `-1A`, `-1B`, `-2A`. That
  letter is CDD's own, printed beside the row. Parallel products do NOT consume
  ordinals of the ordinary count: an entry with a 7-pair parallel block must
  not push its other product to `H`.
- **The role comes from the payload, not from a DOM marker.** There is no
  verified `data-autotest-id` for an ordinary product row, and
  `docs/cdd-integration-notes.md` says in as many words: don't guess markers.
  `STATE.lastPayload.samples` already carries `isProduct`, `reactionIndex` and
  `rowNumber` for every row.
- **No payload, no stamp.** If the samples have not arrived, or the clicked row
  cannot be matched to one, nothing is written. An empty field is a nuisance; a
  wrong ID on a registration is a wrong record.
- **The storage keys stay.** `cddElnTableSuffixStyle` and
  `cddElnTableSuffixFirst` keep their names — renaming them would silently
  reset what the user has already chosen. Only the UI wording changes.

## Design

### The rule

```
productMark(ordinal, style, markFirst)
```

`ordinal` is 0-based over the entry's products. The body is today's
`tableSuffix` unchanged — same five styles, same `columnName(n)` for the
letters, same "the first one is bare unless `markFirst`". Only the meaning of
the argument moves, which is why the rename is the honest part of the change.

`productSuffix({ parallel, productIndex, style, markFirst })` — `tableIndex`
renamed. Parallel still wins.

### Where the ordinal comes from

A new pure helper, beside the rule so both routes share it:

```
productOrdinalOf(samples, sample) -> 0-based index among the entry's ordinary
                                     products, or -1
```

It walks `samples` in payload order, counts only `isProduct` rows that are NOT
parallel (`parallelLetter == null`), and returns the position of the given
sample. Both routes feed it the same array — `STATE.lastPayload.samples` — so
the Register link and the panel button cannot drift apart.

Ordering: samples arrive grouped per reaction (`reactionIndex`) in payload
order, and within a table CDD displays products last, as a group, in payload
order. Ordering by *(reactionIndex, position in the array)* therefore matches
what the entry shows. This is the one assumption worth checking on a live entry
with two products in one table.

### Register link (`eln-id-to-registration.js`)

`tableIndexOf(link)` is replaced by a lookup. **The parallel branch is asked
first**, because a parallel row prints no number and so can never be matched to
a sample — asking the payload first would silently kill the `-1A` stamp that
works today:

1. `parallelInfoOf(link)` -> a pair? stamp `-1A` as today and stop. The pair
   letter is printed on the reagent row above and exists nowhere else as
   reliably, so this branch stays on the DOM.
2. otherwise `link.closest("tr")` -> the row; its first cell's text is the
   printed row number (`rowKeysOf` in `name-watch.js` already reads rows this
   way).
3. the table index, as today, from `link.closest(TABLE_SELECTOR)`.
4. find the sample with that `reactionIndex` and `rowNumber`.
5. no sample, or `!sample.isProduct` -> return without stamping.
6. otherwise stamp `productSuffix({ productIndex: productOrdinalOf(samples,
   sample), style, markFirst })`.

`STATE` is already imported by content features; this file will import it too.
That is the one new dependency, and it is the same one the panel has.

### Panel button (`eln-id-to-batch.js` + `sample-panel.js`)

`composeBatchElnId(entryId, format, productIndex, parallel, suffix)` — the
third argument stops being `reactionIndex` and becomes the product ordinal.
`sample-panel.js` computes it with `productOrdinalOf(STATE.lastPayload.samples,
sample)` and offers no button when it comes back `-1`.

### Settings page

Wording only:

- *Mark the first table too* -> **Mark the first product too**, and its blurb
  says the same thing about the entry's first product.
- The card note reads "second and third product" instead of "second and third
  table".
- The **From the ELN** blurb loses "A second or third stoichiometry table marks
  the product" and gains "every product after the first is marked".

### Error handling

| Case | Behaviour |
| --- | --- |
| Payload has not arrived yet | No stamp. The field stays empty; the panel button appears once it does. |
| Row cannot be matched (no printed number, no match) | No stamp. |
| Reagent / solvent / agent row | No stamp, by design. |
| Register link outside any table | No stamp — no row, so no product ordinal. (Today it counts as table 1.) |
| Parallel product | Unchanged: `-1A`, read from the DOM. |
| Product row dropped from the payload (no batch, no name, no uid) | No stamp for that row; the other ordinals are unaffected, because both routes count the same array. |

### Testing

- `productMark` and `productOrdinalOf` are pure and importable by node, like
  the rest of `eln-id-carry.js` — five styles x `markFirst` x ordinals
  0/1/2/26, plus a samples fixture holding: two products in one table, a
  reagent between them, a parallel block, and a product missing from the
  payload.
- On a live entry (the user's reload test): a two-product reaction must give
  `MDX-113` and `MDX-113B` from the Register link and the SAME two strings from
  the panel button; a reagent row must leave the field empty.

## Out of scope

- Renaming the storage keys.
- Any per-reaction override — this stays a vault-wide convention, like the ELN
  identifier format above it.
- Changing what a parallel pair's suffix looks like.
