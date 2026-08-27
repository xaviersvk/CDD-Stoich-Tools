# ELN ID table suffix: letters or numbers — design

Date: 2026-08-27
Status: implemented — see the amendment at the foot, which supersedes the two
decisions marked below.

## Problem

An entry with several stoichiometry tables registers its products with a
letter on the end of the carried ELN ID:

```
table 1 -> MDX-113        table 2 -> MDX-113B        table 3 -> MDX-113C
```

The user's lab reads the product of the second reaction as `MDX-113-2`,
not `MDX-113B`. The lettering is a convention this plugin invented (see
`tableSuffix` in `src/shared/eln-id-carry.js`), not something CDD prints,
so it can be a setting.

## What exists today

One helper composes every suffix, and both places that stamp an ID go
through it:

- `src/shared/eln-id-carry.js`
  - `tableSuffix(index)` — `""`, `B`, `C`, … `AA` (spreadsheet column
    names of `index + 1`, first one dropped).
  - `parallelSuffix(ordinal, letter)` — `-1A`, `-1B` for a product of a
    parallel ("bulk") reaction: the reaction's number among the entry's
    parallel reactions, then the letter **CDD itself prints** beside the
    reagent/product pair.
  - `productSuffix({ parallel, tableIndex })` — parallel wins, otherwise
    `tableSuffix`.
- `src/content/features/ui-fixes/eln-id-to-registration.js:178` — the
  Register link in a stoichiometry row; the finished value travels to the
  registration page in the URL.
- `src/shared/eln-id-to-batch.js:72` (`composeBatchElnId`) — the panel
  button that writes the ID onto a batch that already exists; called from
  `src/content/features/sample-panel.js:1244`.

So the change lands in one function, and both paths inherit it.

## Decisions (from brainstorming)

- **A setting, default = today's letters.** Nothing changes for anyone
  who does not switch it on.
- **Numbers start at 1, including the first table.** `MDX-113-1`,
  `MDX-113-2`, `MDX-113-3`. Every product carries a number, even in an
  entry with a single reaction — the user picked consistency over
  leaving one-reaction entries looking as they do now.
- **Parallel reactions keep their letters** — `-1A`, `-1B`, `-2A` in both
  modes. That letter is CDD's own pair label, printed beside the row; a
  chemist matches the ID to what is on screen. Only table numbering
  changes.
- **Global setting, not per reaction.** It describes how the vault names
  things, like the ELN identifier format it sits under.

## Design

### Storage

```js
// "letter" | "number" — absent means "letter", the format this plugin
// has always written.
export const ELN_TABLE_SUFFIX_STYLE_KEY = "cddElnTableSuffixStyle";
export const ELN_TABLE_SUFFIX_STYLES = ["letter", "number"];
export const DEFAULT_ELN_TABLE_SUFFIX_STYLE = "letter";
```

`getElnIdCarrySettings()` gains a `style` field, validated against the
list and falling back to the default. `saveElnTableSuffixStyle(value)`
mirrors `saveElnIdFormat`.

### Core

```js
tableSuffix(index, style)         // "number" -> `-${index + 1}`, always
productSuffix({ parallel, tableIndex, style })
```

`tableSuffix` keeps its current body for `"letter"`. For `"number"` it
returns `-${index + 1}` for every index, including 0 — that is what
"the first table gets -1" means.

`productSuffix` passes `style` through to `tableSuffix` and leaves the
parallel branch untouched.

`style` is optional in both signatures and defaults to `"letter"`, so a
caller that has not been updated still writes what it writes today.

### Edge case: a Register link outside any table

`tableIndexOf()` returns 0 when the link sits in no stoichiometry table
(a Register control CDD grows somewhere else). Today that means no
suffix. In number mode it means `-1` — the link is treated as the first
table. This follows from "the first table gets -1"; it is stated here so
it is not read later as a bug.

### The two call sites

- `eln-id-to-registration.js` — `style` joins the module's `settings`
  cache (read per click) and the `storage.onChanged` filter around line
  301, next to `ELN_ID_FORMAT_KEY`.
- `eln-id-to-batch.js` — `composeBatchElnId(entryId, format,
  reactionIndex, parallel = null, style = DEFAULT_ELN_TABLE_SUFFIX_STYLE)`.
  Its `carryCache` mirrors the whole `getElnIdCarrySettings()` object, so
  `style` arrives there for free once the new key is added to the same
  `storage.onChanged` filter.
- `sample-panel.js:1244` — passes `style` from `getCarrySettings()` as
  the fifth argument.

### Options UI

A second `fieldset.choices` under the existing *ELN identifier format*
one, in the registration card of `src/options/options.html`, following
the same `.choice` / `.choice__label` / `.choice__sample` markup:

```
Product suffix
  ( ) Letters    MDX-113, MDX-113B, MDX-113C
  ( ) Numbers    MDX-113-1, MDX-113-2, MDX-113-3
  note: Parallel reactions keep CDD's pair letters either way — MDX-113-1A.
```

Wired in `src/options/options.js` beside `elnIdFormatRadios`: a `change`
listener per radio calling `saveElnTableSuffixStyle`, and
`initElnIdCarryUI()` checking the stored one.

The checkbox blurb above it (`options.html:415`) currently spells out
"the second stoichiometry table adds a `B`, the third a `C`". That
sentence now describes only one of two modes, so it loses the letters and
points at the choice below instead.

## Out of scope

- Changing how parallel pairs are labelled.
- Any migration of IDs already registered. The setting decides what the
  next stamp writes; nothing rewrites what is in CDD.
- Per-vault or per-reaction overrides.

## Verification

No test runner in this repo — verified by reloading the built extension:

1. Default install still writes `MDX-113`, `MDX-113B`, `MDX-113C` from
   both the Register link and the panel button.
2. Switch to Numbers: the same two paths write `MDX-113-1`, `-2`, `-3`.
3. A parallel reaction writes `-1A` / `-1B` in both modes.
4. Flipping the radio with an ELN entry already open takes effect without
   a page reload (the `storage.onChanged` path), on the panel card and on
   the Register link alike.

## Amendment — 2026-08-27, after the first working build

The user tested Letters/Numbers on a live entry, then asked for a third style
(a dash before the letter) and — the real change — for **"does the first table
get a mark?" to become a setting of its own**, applying to the original letters
as well, so `MDX-113A` is reachable.

That supersedes two decisions above: "Numbers start at 1, including the first
table" is no longer baked into the number style, and the styles are three
rather than two. What shipped:

- **`cddElnTableSuffixStyle`** — `"letter"` (default) | `"dash-letter"` |
  `"number"`. Second and third table: `MDX-113B, MDX-113C` /
  `MDX-113-B, MDX-113-C` / `MDX-113-2, MDX-113-3`.
- **`cddElnTableSuffixFirst`** — boolean, absent means `false`. On, the first
  table is marked too: `MDX-113A` / `MDX-113-A` / `MDX-113-1`.

The two are independent, six combinations in all, and the defaults are the
behaviour this plugin has always had. `tableSuffix(index, style, markFirst)`
holds all of it; the letters come from a `columnName(n)` helper so `A` for the
first table and `AA` for the 27th fall out of the same rule.

`composeBatchElnId()` takes the pair as one `{ style, markFirst }` object
rather than growing a sixth positional parameter.

Verified by 21 cases in a throwaway node script over
`src/shared/eln-id-carry.js` (the module has no imports and no top-level
`chrome` access, so node can run it), plus the user's own reload test.

## Amendment — 2026-08-27, small letters

After testing the three styles the user asked for the letter styles in small
letters as well: some vaults write `MDX-113b`, not `MDX-113B`.

Two new values rather than a separate "lowercase" checkbox. A checkbox would
have to sit dead beside **Numbers**, and the radio list already shows each
style's own example — which is the part that settles the question at a glance.

- **`cddElnTableSuffixStyle`** — now `"letter"` (default) | `"lower-letter"` |
  `"dash-letter"` | `"dash-lower-letter"` | `"number"`. Second and third
  table: `MDX-113B` / `MDX-113b` / `MDX-113-B` / `MDX-113-b` / `MDX-113-2`.
- **`cddElnTableSuffixFirst`** unchanged, and it now reaches ten combinations
  instead of six: `MDX-113a` and `MDX-113-a` join the marked first table.

`tableSuffix()` no longer branches per style. The four letter styles vary in
two independent ways — dash or no dash, capital or small — so both are read off
the style name, and an unrecognised style still lands on the original bare
capital.

**Parallel pairs keep CDD's capital.** `parallelSuffix()` upper-cases the pair
letter because that letter is CDD's own, printed beside the row; a small-letter
style must not make the ID stop matching what is on screen.

Verified over all five styles × markFirst × table 1/2/3/27 in node, plus the
unknown-style fallback.
