# Row name from synonym — design

Date: 2026-08-21
Status: approved by user (conversation)

## Problem

A stoichiometry row has a free-text **Name** — the label CDD prints above
the molecule-batch id in view mode. It is empty far more often than not,
so the table reads as `RGT-0000246-001` where the chemist thinks
*DIPEA*. The user fills it by hand, one row at a time, with the same
short names over and over.

Live evidence from entry `/vaults/6884/eln/entries/2504170`:

- rows already named by hand: `DIPEA`, `HATU`, `PPH3333`, `MR-0256`;
- the molecule pages for the first two carry that same string as their
  **shortest** synonym.

So the value the user types is usually already in CDD — just not
anywhere the table looks.

## What the live DOM and payload actually say

Verified on the entry above, in edit mode:

- The field renders as
  `span[data-autotest-id="field-name"]` → `<b>Name:</b>` +
  `span[data-autotest-id="missing-label"]` carrying the text `Optional`.
  `findFieldValueLink(row, "Name:", placeholderOnly)` in `row-fill.js`
  already matches exactly this shape.
- **`data-autotest-id="field-name"` is NOT unique to Name** — the solvent
  field uses the same id. The `<b>` label is the discriminator.
- A row whose name IS set renders the bare value, with no `Name:` prefix,
  above the molecule-batch id in view mode.
- In the `eln/v2` payload the value is the row-level string **`row.name`**
  (`name: "DIPEA"`), absent when unset. It is NOT under `userInput`.
- Synonyms come from the molecule page, out of the same `.molecule_field`
  definition list `extractSynonym()` already parses. Observed:
  - `RGT-0000246` → `N-Ethyldiisopropylamine, N,N-Diisopropylethylamine,
    N-Ethyldiisopropylamine, DIPEA` → shortest = `DIPEA`
  - `RGT-0000204` → `1-[Bis(dimethylamino)methylene]-…, HATU`
    → shortest = `HATU`
  - `PHA-0333476` → empty; the user typed `PPH3333` by hand.

## Decisions (from brainstorming)

- **Opt-in, default OFF** — an options checkbox, like every other panel
  feature. While off: no molecule-page fetch, no offer, no capture.
- **Empty Name only.** The fill uses `placeholderOnly`, so a name CDD or
  the user already put there is never overwritten.
- **"Nicest synonym" = the shortest one.** Validated against the user's
  own rows (`DIPEA`, `HATU`).
- **Trigger follows the existing auto-write policy**: automatic only for
  rows added while working (the `auto-fill.js` baseline window); rows
  that existed when the entry loaded need a conscious click — card button
  or *Fill all*. No widening of that policy.
- **Offers exclude products and mentions** — `computeFillOffers` keeps its
  display-only rule for products untouched.
- **Capture is role-agnostic** — a name typed on ANY row, products
  included, is remembered for its molecule. Rationale: if someone writes
  it there, it is a name that molecule answers to, and it will be offered
  later when the same molecule turns up as a reactant.
- **Memory is keyed by `moleculeId`**, not by batch: a name belongs to the
  molecule, and product rows have no batch at all.
- **Cap: 300 entries** — the density memory's 100 is too small for one
  name per molecule.
- **Memory beats the synonym.** This inverts the precedence every other
  field uses (authoritative source first, memory second), deliberately:
  there is no authoritative source for this field, the synonym is a
  guess, and the user's own correction is the better guess.

## Components

### 1 · `src/shared/pretty-name.js` (new)

```js
pickPrettyName(rawSynonymsText) -> string | null
```

Splits on `/\s*[,;]\s+/` — the separator rule `extractSynonym` already
uses, which keeps `N,N-Diisopropylethylamine` intact — trims, drops
empties, and returns the **shortest** remaining entry; ties resolve to
the first in document order. Pure: no DOM, no imports.

### 2 · `src/content/api/molecule-page.js`

Add `getMoleculeSynonymsText(vaultId, moleculeId)` → the raw `dd` text of
the Synonyms row (`<br>` → `, ` first), through the same per-session
document cache the module already keeps. `getMoleculeSynonym()` and the
panel's **Synonym** field are untouched: that shipped feature keeps
showing the *first* synonym.

### 3 · `src/shared/name-memory.js` (new)

Storage key `cddNameMemoryV1`:

```js
{ [moleculeId]: { name, moleculeName, savedAt, lastUsedAt } }
```

`moleculeName` is the `PHA-…`/`RGT-…` code, stored only so the options
list is readable. Cap **300**; on overflow evict the oldest `lastUsedAt`.
The API mirrors `density-memory.js`: `loadNameMemory`, `rememberName`,
`getRememberedName`, `touchNameUsed`, `forgetName`, `clearNameMemory`,
`onNameMemoryChanged`, plus a `sanitizeNameMemory` applied on every read
AND write. No DOM and no imports from other modules — both the content
script and the options page load it.

### 4 · Capture (content script, on `SAMPLE_DATA`)

The parser gains one field next to `tableDensity`:

```js
tableName: row?.name ?? null
```

Named `tableName` because the sample's `name` is already the composed
sample/batch identifier the DOM search keys on (see `resolveRowName`).

Capture rule: **the first payload of a page load is a baseline**, per
row. Only when a row's `tableName` later differs from its baseline is the
value written to memory. Opening an old entry therefore stores nothing —
its `MR-0265-B`-style one-off labels are not molecule names and must not
become offers. Storage is written only when the stored value actually
changes.

The baseline is keyed the way `auto-fill.js` keys rows
(`reactionIndex:rowUid ?? batchId`) and is reset on navigation.

### 5 · Offer — `src/content/features/fill-offers.js`

New offer `{ field: "name", value, source: "memory" | "synonym" }`.

Conditions: the feature is enabled, `tableName` is empty, the row has a
`moleculeId`, and it is neither a mention nor a product. Value:
remembered name first, `pickPrettyName(synonyms)` second; no offer when
neither yields anything.

Because the synonym needs a fetch, the offer reads a synonym cache that a
small enrichment fills — same shape as `synonym-enrichment.js`: gated on
the checkbox, one fetch per molecule per session, re-render only if
`STATE.lastPayload` is still the payload the enrichment started from.

`offerUsesMemory()` returns true for `source: "memory"`, so a successful
fill refreshes `lastUsedAt` through the existing touch path — extended to
call `touchNameUsed` for this field.

### 6 · Write — `src/content/features/row-fill.js`

`fillNameIntoTable(sample, value)`: the established sequence — find the
row by its printed number, click the `Name:` value link with
`placeholderOnly` (so only `Optional` is ever replaced), set the popup
input React-natively, Enter, click the margin. The editor popup's
`MuiPaper` label is checked live during implementation, the way the
density and concentration popups were; the fill aborts cleanly when the
marker is not found. Name is a label, not a quantity, so no equivalent
snapshot/restore should be needed — to be confirmed live before the fill
is wired up.

### 7 · Options page

- Checkbox **Fill row name from synonym** (default off), next to the
  other fill options. It gates capture, enrichment and offer alike.
- Card **Remembered names**: Molecule | Name | Saved, per-row delete,
  *Clear all* with confirmation, counter `N / 300`, live refresh via
  `chrome.storage.onChanged`.

## Error handling

A failed or non-OK molecule fetch resolves to null: no synonym, no offer,
cache entry evicted so a later payload can retry. A molecule with no
Synonyms row is an ordinary empty result, not an error. Storage failures
degrade to the pre-feature behaviour. The fill re-verifies every DOM step
and aborts without writing when CDD's markup has moved.

## Verification

No test runner exists; `npm run build`, reload the unpacked extension,
then on `/vaults/6884/eln/entries/2504170`:

1. Checkbox off → no `/molecules/<id>` requests, no name buttons.
2. Checkbox on, add a row for `RGT-0000246` → its Name fills with `DIPEA`
   on its own (a new row, so the baseline policy allows it).
3. An older row with an empty Name offers a button, and only a click
   fills it.
4. Overwrite a filled name by hand → the entry appears in **Remembered
   names**; the same molecule in another entry then offers the typed
   name, not the synonym.
5. `PHA-0333476` (no synonyms) offers nothing until a name is typed once.
6. A row that already has a name is never touched.

## Out of scope

- Changing the panel's existing **Synonym** field (still the first
  synonym).
- Offering names on product rows.
- Migrating the other molecule-page fetchers onto the shared cache.
