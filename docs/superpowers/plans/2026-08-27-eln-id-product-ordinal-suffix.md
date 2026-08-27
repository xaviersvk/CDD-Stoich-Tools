# ELN ID suffix counts products — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the ELN-ID suffix say *which product of the entry* a compound is
(`MDX-113`, `MDX-113B`, `MDX-113C`) instead of *which stoichiometry table* it
came from, so two products of one reaction stop registering under the same
Internal ID — and stop stamping non-product rows entirely.

**Architecture:** One pure helper in `src/shared/eln-id-carry.js` composes every
suffix and both stamping routes call it. Today it is fed a table index; after
this change it is fed a product ordinal computed by a second pure helper
(`productOrdinalOf`) over `STATE.lastPayload.samples` — the same array the panel
is built from, so the Register link and the panel button cannot drift apart. The
row a Register link sits in is matched to its sample by *(table index, printed
row number)*, the identity `name-watch.js` already uses; the role then comes
from the payload's `isProduct`, never from a guessed DOM marker.

**Tech Stack:** Plain ES modules, no framework, no bundler magic in
`src/shared` (vite bundles the content script; the options page loads the same
files as ES modules from `dist/`). Chrome `storage.local`. Build with
`npm run build`.

**Spec:** `docs/superpowers/specs/2026-08-27-eln-id-product-ordinal-suffix-design.md`

## Global Constraints

- **Products only.** A Register link on a reagent, solvent or agent row stamps
  nothing — the Internal ID field stays empty. The panel button has always been
  products-only (`elnIdToBatchState()` returns null unless `sample.isProduct`);
  after this change both routes agree.
- **Every product row counts, registered or not.** The ordinal is the position
  among ALL ordinary product rows of the entry, so an ID minted today matches
  one minted tomorrow.
- **Parallel ("bulk") products keep `-1A`, `-1B`, `-2A`** and are NOT counted in
  the ordinary sequence. `parallelSuffix()` must not be edited.
- **No payload, no stamp.** If `STATE.lastPayload.samples` is missing/empty, or
  the row cannot be matched, write nothing. An empty field is a nuisance; a
  wrong ID on a registration is a wrong record.
- **Storage keys keep their names** — `cddElnTableSuffixStyle`,
  `cddElnTableSuffixFirst`. Renaming them would silently reset the user's
  choice. Only UI copy changes.
- **The five styles are untouched** — `letter`, `lower-letter`, `dash-letter`,
  `dash-lower-letter`, `number`, default `letter`, first one bare unless
  `markFirst`.
- **`src/shared/*` stays free of DOM access.** Both the content script and the
  options page import these files.
- **No test runner exists in this repo.** `src/shared/eln-id-carry.js` has no
  imports and no top-level `chrome` access, so it can be exercised directly with
  `node` — that is the automated check used below. Anything DOM-bound is
  verified by the user reloading the built extension.
- **Do not push.** Per `CLAUDE.md`: bump, document, build, commit — then stop.

## File Structure

- `src/shared/eln-id-carry.js` — *modify*. `tableSuffix` → `productMark`,
  `productSuffix({ productIndex, … })`, and two new pure helpers:
  `productOrdinalOf()` and `findRowSample()`. The only file that knows what a
  suffix looks like, and now the only file that knows how products are counted.
- `src/content/features/ui-fixes/eln-id-to-registration.js` — *modify*. The
  Register-link route: parallel branch first, then payload lookup; nothing
  stamped on a non-product row. Gains one import, `STATE`.
- `src/shared/eln-id-to-batch.js` — *modify*. `composeBatchElnId()`'s third
  argument becomes the product ordinal.
- `src/content/features/sample-panel.js` — *modify*, one call site.
- `src/options/options.html` — *modify*, copy only.
- `src/options/setup-wizard.js` — *modify*, one sentence.
- `docs/ELN_ID_PRODUCT_SUFFIX.md`, `docs/FEATURE_CATALOG.md` — *modify*.
- `CHANGELOG.md`, `RELEASES.md`, `manifest.json` — *modify*, release task.

Not touched: `src/inject/parsers/sample-data.js`. It already emits `isProduct`,
`reactionIndex`, `rowNumber`, `parallelOrdinal` and `parallelLetter`; this
change is entirely about reading them.

---

### Task 1: The rule and the two pure helpers

**Files:**
- Modify: `src/shared/eln-id-carry.js` — the `tableSuffix` block (~line 163-205)
  and `productSuffix` (~line 218-236)
- Test: a throwaway node script (not committed)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `productMark(ordinal: number, style?: string, markFirst?: boolean) -> string`
    — replaces `tableSuffix`, same body, same five styles.
  - `productSuffix({ parallel, productIndex, style, markFirst }) -> string`
    — `tableIndex` renamed to `productIndex`.
  - `productOrdinalOf(samples: object[], sample: object) -> number` — 0-based
    position among the entry's ordinary products, or `-1`.
  - `findRowSample(samples: object[], tableIndex: number, rowNumber) -> object|null`

- [ ] **Step 1: Write the failing check**

Create `check-ordinal.mjs` OUTSIDE the repo — this project commits no test files. Use the session scratchpad:

    C:/Users/MATUS~1.DRE/AppData/Local/Temp/claude/C--Users-matus-drexler-WebstormProjects-CDD-Stoich-Tools/30a6d53c-32e2-4c1a-80a7-61375daac6d6/scratchpad/check-ordinal.mjs

Import paths below assume it is run from the repo root with an absolute path.

```js
import {
    productMark,
    productSuffix,
    productOrdinalOf,
    findRowSample,
} from "file:///C:/Users/matus.drexler/WebstormProjects/CDD-Stoich-Tools/src/shared/eln-id-carry.js";

let failed = 0;
const eq = (got, want, what) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) { failed += 1; console.log(`FAIL ${what}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
};

// --- productMark: the five styles, unchanged behaviour under a new name ---
eq(productMark(0, "letter", false), "", "first product is bare");
eq(productMark(1, "letter", false), "B", "second product");
eq(productMark(2, "letter", false), "C", "third product");
eq(productMark(26, "letter", false), "AA", "27th product");
eq(productMark(0, "letter", true), "A", "markFirst");
eq(productMark(1, "lower-letter", false), "b", "small letter");
eq(productMark(1, "dash-letter", false), "-B", "dash letter");
eq(productMark(1, "dash-lower-letter", false), "-b", "dash small letter");
eq(productMark(1, "number", false), "-2", "number");
eq(productMark(0, "number", true), "-1", "number, markFirst");
eq(productMark(-1, "letter", true), "", "negative ordinal");

// --- productSuffix: parallel wins, productIndex is the new name ---
eq(productSuffix({ productIndex: 1, style: "letter" }), "B", "ordinary product");
eq(productSuffix({ parallel: { ordinal: 1, letter: "A" }, productIndex: 5 }), "-1A", "parallel wins");

// --- productOrdinalOf: a fixture shaped like STATE.lastPayload.samples ---
// Reaction 1: reagent, product, product. Reaction 2: parallel pair, product.
const reagent1 = { reactionIndex: 0, rowNumber: 1, isProduct: false, parallelLetter: null };
const prodA    = { reactionIndex: 0, rowNumber: 2, isProduct: true,  parallelLetter: null };
const prodB    = { reactionIndex: 0, rowNumber: 3, isProduct: true,  parallelLetter: null };
const parProd  = { reactionIndex: 1, rowNumber: null, isProduct: true, parallelLetter: "A" };
const prodC    = { reactionIndex: 1, rowNumber: 4, isProduct: true,  parallelLetter: null };
const samples  = [reagent1, prodA, prodB, parProd, prodC];

eq(productOrdinalOf(samples, prodA), 0, "first product of the entry");
eq(productOrdinalOf(samples, prodB), 1, "second product, same table");
eq(productOrdinalOf(samples, prodC), 2, "product of the next table");
eq(productOrdinalOf(samples, parProd), -1, "parallel product is not counted");
eq(productOrdinalOf(samples, reagent1), -1, "reagent is not counted");
eq(productOrdinalOf(samples, { reactionIndex: 9 }), -1, "unknown sample");
eq(productOrdinalOf(null, prodA), -1, "no samples");

// Reaction order wins over array order, so a payload that arrives out of
// order still numbers the products the way the entry shows them.
eq(productOrdinalOf([prodC, prodA, prodB], prodA), 0, "sorted by reaction");
eq(productOrdinalOf([prodC, prodA, prodB], prodC), 2, "sorted by reaction, last");

// --- findRowSample: (table, printed row number) is the row's identity ---
eq(findRowSample(samples, 0, "2"), prodA, "row 2 of table 1");
eq(findRowSample(samples, 0, 3), prodB, "number or string");
eq(findRowSample(samples, 1, "4"), prodC, "row 4 of table 2");
eq(findRowSample(samples, 1, "2"), null, "no such row in that table");
eq(findRowSample(samples, 0, ""), null, "no printed number");
eq(findRowSample(samples, 0, null), null, "null printed number");

console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run it to verify it fails**

Run from the repo root: `node C:/Users/MATUS~1.DRE/AppData/Local/Temp/claude/C--Users-matus-drexler-WebstormProjects-CDD-Stoich-Tools/30a6d53c-32e2-4c1a-80a7-61375daac6d6/scratchpad/check-ordinal.mjs`
Expected: FAIL — `SyntaxError: The requested module … does not provide an
export named 'productMark'`.

- [ ] **Step 3: Rename `tableSuffix` to `productMark`**

In `src/shared/eln-id-carry.js`, replace the `tableSuffix` doc comment and
signature. The body does not change:

```js
// Which product of the entry this is, as a suffix on the entry ID. Two
// settings decide what it looks like:
//
//   style      letter              PHA-MDX-0095B    PHA-MDX-0095C
//              lower-letter        PHA-MDX-0095b    PHA-MDX-0095c
//              dash-letter         PHA-MDX-0095-B   PHA-MDX-0095-C
//              dash-lower-letter   PHA-MDX-0095-b   PHA-MDX-0095-c
//              number              PHA-MDX-0095-2   PHA-MDX-0095-3
//
//   markFirst  off           product 1 -> PHA-MDX-0095
//              on            product 1 -> PHA-MDX-0095A / -A / -1 / small
//
// `ordinal` is 0-based over the entry's products, NOT over its tables: a
// reaction with two products marks them B and C, which is the whole point of
// the 15.7.0 change. The defaults are the original behaviour: capital
// letters, first product bare.
export function productMark(
    ordinal,
    style = DEFAULT_ELN_TABLE_SUFFIX_STYLE,
    markFirst = DEFAULT_ELN_TABLE_SUFFIX_FIRST
) {
    if (!Number.isInteger(ordinal) || ordinal < 0) return "";

    // One product is the normal case, and unless asked it should read the way
    // it always has.
    if (ordinal === 0 && !markFirst) return "";

    const n = ordinal + 1;

    if (style === "number") return `-${n}`;

    // The four letter styles vary in two independent ways -- dash or no dash,
    // capital or small -- so both are read off the style name instead of being
    // spelled out four times. An unknown style lands on the original: a bare
    // capital letter.
    const letter =
        style === "lower-letter" || style === "dash-lower-letter"
            ? columnName(n).toLowerCase()
            : columnName(n);

    return style === "dash-letter" || style === "dash-lower-letter"
        ? `-${letter}`
        : letter;
}
```

- [ ] **Step 4: Rename `tableIndex` to `productIndex` in `productSuffix`**

```js
// The suffix for one product row, whichever kind of table it sits in.
//   parallel: { ordinal, letter } of the bulk pair -> "-1A"
//   productIndex: which product of the ENTRY this is, 0-based
//   style, markFirst: see productMark
//
// The two settings reach the ordinary branch only. A parallel pair's letter is
// CDD's own, printed beside the row, and stays exactly that in every style.
export function productSuffix({ parallel, productIndex, style, markFirst }) {
    if (parallel) {
        const s = parallelSuffix(parallel.ordinal, parallel.letter);
        if (s) return s;
    }
    return productMark(productIndex, style, markFirst);
}
```

- [ ] **Step 5: Add `productOrdinalOf`**

Put it directly after `productSuffix` in the same "Pure helpers" section:

```js
// Which product of the ENTRY a row is, 0-based, or -1 if it is not one.
//
// Every ordinary product row counts -- registered or not. Counting only the
// unregistered ones would renumber the entry as people work, and the ID minted
// today would not be the one minted tomorrow.
//
// Parallel ("bulk") products are NOT counted: they carry CDD's own pair letter
// (-1A, -1B) and take nothing from this sequence. A seven-pair block must not
// push the entry's other product to H.
//
// Order is by reaction, then by payload order within the reaction -- CDD
// displays a table's products last, as a group, in payload order, so this is
// the order the entry shows. `sort` is stable, so the second key needs no
// tie-breaker.
export function productOrdinalOf(samples, sample) {
    if (!Array.isArray(samples) || !sample) return -1;

    const products = samples
        .filter((s) => s?.isProduct && !s?.parallelLetter)
        .sort((a, b) => (a.reactionIndex ?? 0) - (b.reactionIndex ?? 0));

    return products.indexOf(sample);
}
```

- [ ] **Step 6: Add `findRowSample`**

Directly after `productOrdinalOf`:

```js
// The sample for one stoichiometry row, addressed the way this codebase always
// addresses one: the table it sits in and the number the table PRINTS in its
// first cell.
//
// Not the name and not the molecule -- the same batch can sit in one reaction
// twice with pixel-identical rows, which is why name-watch.js keys on the
// printed number too. A row with no printed number (a parallel pair, a
// solution's solvent) has no identity here and returns null.
export function findRowSample(samples, tableIndex, rowNumber) {
    if (!Array.isArray(samples)) return null;

    const printed = String(rowNumber ?? "").trim();
    if (!printed) return null;

    return (
        samples.find(
            (s) =>
                s?.reactionIndex === tableIndex &&
                s?.rowNumber != null &&
                String(s.rowNumber) === printed
        ) || null
    );
}
```

- [ ] **Step 7: Run the check to verify it passes**

Run: `node C:/Users/MATUS~1.DRE/AppData/Local/Temp/claude/C--Users-matus-drexler-WebstormProjects-CDD-Stoich-Tools/30a6d53c-32e2-4c1a-80a7-61375daac6d6/scratchpad/check-ordinal.mjs`
Expected: `all passed`

- [ ] **Step 8: Commit**

```bash
git add src/shared/eln-id-carry.js
git commit -m "the suffix rule counts products, and two helpers to count them"
```

---

### Task 2: The Register link stamps products only

**Files:**
- Modify: `src/content/features/ui-fixes/eln-id-to-registration.js` — the file
  header comment (~line 21-27), the import block (~line 57-72), `tableIndexOf`
  (~line 118-124) and `stampLink` (~line 158-200)

**Interfaces:**
- Consumes: `productSuffix({ parallel, productIndex, style, markFirst })`,
  `productOrdinalOf(samples, sample)`, `findRowSample(samples, tableIndex,
  rowNumber)` from Task 1.
- Produces: nothing other tasks import.

- [ ] **Step 1: Update the file header comment**

Replace the paragraph that begins "An entry can hold several reactions" (~line
21-27) with:

```js
// An entry can hold several products -- two reactions, or one reaction with two
// products -- and they cannot all register under the same ID. Which product of
// the entry this is travels with the ID, as a letter on the end:
//
//   1st product -> MDX-0095     2nd -> MDX-0095B     3rd -> MDX-0095C
//
// The first stays bare -- one product is the ordinary case and reads the way it
// always has. Both the mark's style and whether the first one gets one are
// settings; see shared/eln-id-carry.js.
//
// ONLY products are stamped. A Register link on a reagent row leaves the field
// empty: a starting material is not a product of the entry, and inventing an ID
// for it would collide with one that is. Which rows are products is read from
// the entry payload the panel is built from (STATE.lastPayload.samples), never
// guessed from the markup -- ordinary product rows carry no autotest id of
// their own.
```

- [ ] **Step 2: Add the imports**

`STATE` and the two new helpers:

```js
import { STATE } from "../../state.js";
```

and, in the existing `eln-id-carry.js` import list, add `findRowSample` and
`productOrdinalOf` beside `productSuffix`.

- [ ] **Step 3: Replace `tableIndexOf` with a product lookup**

Delete `tableIndexOf` and put this in its place (above `stampLink`, after
`parallelInfoOf`):

```js
// The suffix for an ordinary (non-parallel) Register link, or null when the
// row is not one of the entry's products.
//
// Null means "write nothing at all". That covers the reagent rows this used to
// stamp, and it covers the payload not having arrived yet: an empty field is a
// nuisance, a wrong ID on a registration is a wrong record.
function ordinaryProductSuffix(link) {
    const samples = STATE.lastPayload?.samples;
    if (!Array.isArray(samples) || !samples.length) return null;

    // Outside a stoichiometry table there is no row, so there is no product.
    const table = link.closest(TABLE_SELECTOR);
    if (!table) return null;

    const row = link.closest("tr");
    if (!row) return null;

    // Document order is the order the tables are read in -- Slate renders the
    // entry body top to bottom, and the parser numbers reactions the same way.
    const tableIndex = [...document.querySelectorAll(TABLE_SELECTOR)].indexOf(table);

    const printed = (row.cells?.[0]?.innerText || "").trim();
    const sample = findRowSample(samples, tableIndex, printed);
    if (!sample?.isProduct) return null;

    const productIndex = productOrdinalOf(samples, sample);
    if (productIndex < 0) return null;

    return productSuffix({
        productIndex,
        style: settings.style,
        markFirst: settings.markFirst,
    });
}
```

- [ ] **Step 4: Rewrite the middle of `stampLink`**

Replace the block from `// Trim first, THEN suffix` down to the end of the
`const value = …` statement with:

```js
    // Trim first, THEN suffix: the suffix marks the product (or the parallel
    // pair) and belongs on the end of whatever the ID has been cut down to.
    const trimmed = applyIdentifierFormat(entryId, settings.format);
    if (!trimmed) return;

    // The parallel branch is asked FIRST. A parallel row prints no number, so
    // the payload can never match it -- looking there first would silently drop
    // the -1A stamp that works today. Its letter is CDD's own, on the reagent
    // row above.
    const parallel = parallelInfoOf(link);
    const suffix = parallel
        ? productSuffix({ parallel })
        : ordinaryProductSuffix(link);

    // Not a product: nothing is written, and the link keeps the href CDD gave
    // it.
    if (suffix === null) return;

    // The finished value, suffix and all — the registration page only has to
    // type out what it is handed.
    const value = `${trimmed}${suffix}`;
```

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: both bundles build; no "is not exported by" warning for
`eln-id-carry.js` (that is what a missed import looks like here).

- [ ] **Step 6: Check the bundle actually carries the new path**

Run: `grep -c "ordinaryProductSuffix\|productOrdinalOf" dist/assets/content.js`
Expected: a non-zero count. (Names survive the build — the bundle is not
minified past recognition; if the count is 0, the feature was tree-shaken or
the import is wrong.)

- [ ] **Step 7: Commit**

```bash
git add src/content/features/ui-fixes/eln-id-to-registration.js
git commit -m "Register link: stamp the product's ordinal, and only on products"
```

---

### Task 3: The panel button counts the same way

**Files:**
- Modify: `src/shared/eln-id-to-batch.js:62-92` (`composeBatchElnId` and its
  comment)
- Modify: `src/content/features/sample-panel.js:1244-1251` (the call site) and
  its import block (~line 16)

**Interfaces:**
- Consumes: `productOrdinalOf` from Task 1; `productSuffix({ parallel,
  productIndex, … })` from Task 1.
- Produces: `composeBatchElnId(entryId, format, productIndex, parallel, suffix)`
  — the third argument is now the product ordinal, not `reactionIndex`.

- [ ] **Step 1: Change `composeBatchElnId`'s third argument**

In `src/shared/eln-id-to-batch.js`:

```js
// The same string the Register link stamps, so a batch filled this way and
// one registered from the entry are indistinguishable.
//
// Trim first, THEN suffix: the suffix marks WHICH PRODUCT of the entry this is
// (and, for a parallel reaction, which pair) and belongs on the end of whatever
// the ID was cut to.
//
// `productIndex` is 0-based over the entry's ordinary products —
// `productOrdinalOf(samples, sample)`. It is NOT the reaction index: a reaction
// with two products marks them B and C.
//
// `parallel` is { ordinal, letter } for a product of a parallel (bulk)
// reaction — "-1A" instead of the product mark — and null for everything
// else. See productSuffix.
// `suffix` is { style, markFirst } — the two settings that decide what the
// mark looks like; see productMark. Omitted, it writes the original letters
// with a bare first product.
export function composeBatchElnId(
    entryId,
    format,
    productIndex,
    parallel = null,
    suffix = {}
) {
    const trimmed = applyIdentifierFormat(entryId, format);
    if (!trimmed) return "";

    return `${trimmed}${productSuffix({
        parallel,
        productIndex,
        style: suffix.style,
        markFirst: suffix.markFirst,
    })}`;
}
```

- [ ] **Step 2: Import `productOrdinalOf` into the panel**

`src/content/features/sample-panel.js` imports nothing from `eln-id-carry.js`
today (it reaches the rule through `eln-id-to-batch.js`), so add a line
directly above the `eln-id-to-batch.js` import block at line 13:

```js
import { productOrdinalOf } from "../../shared/eln-id-carry.js";
```

`STATE` is already imported at line 3 — do not add it twice.

- [ ] **Step 3: Feed it the ordinal at the call site**

Replace the `composeBatchElnId(...)` call in `elnIdToBatchState()` with:

```js
    // A parallel pair keeps CDD's own -1A and needs no ordinal; everything else
    // is placed among the entry's products. No place, no button — the same rule
    // the Register link follows.
    const parallel = sampleParallelInfo(sample);
    const productIndex = parallel
        ? -1
        : productOrdinalOf(STATE.lastPayload?.samples || [], sample);
    if (!parallel && productIndex < 0) return null;

    const value = composeBatchElnId(
        entryId,
        format,
        productIndex,
        parallel,
        { style, markFirst }
    );
    if (!value) return null;
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: both bundles build clean.

- [ ] **Step 5: Verify no caller still passes `reactionIndex`**

Run: `grep -rn "composeBatchElnId" src/`
Expected: the definition plus exactly one call site, and the call site passes
`productIndex`.

- [ ] **Step 6: Commit**

```bash
git add src/shared/eln-id-to-batch.js src/content/features/sample-panel.js
git commit -m "panel button: place the product, not the reaction"
```

---

### Task 4: Say so on the settings page and in the docs

**Files:**
- Modify: `src/options/options.html:419-421` (the From-the-ELN blurb),
  `:474-479` (the Product suffix note), `:506-512` (the markFirst checkbox)
- Modify: `src/options/setup-wizard.js:112`
- Modify: `docs/ELN_ID_PRODUCT_SUFFIX.md`
- Modify: `docs/FEATURE_CATALOG.md:240-253`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Reword the From-the-ELN blurb**

In `src/options/options.html`, replace "A second or third stoichiometry table
marks the product with the suffix chosen below." with:

```html
                        <span>Registering from a stoichiometry row fills the
                        entry's <strong>ID</strong> into the new entity
                        — <code>IDEMO-MDX-0014</code>. Every product after the
                        first is marked with the suffix chosen below, and only
                        product rows are filled at all. Only an empty field is
                        filled.</span>
```

- [ ] **Step 2: Reword the Product suffix note**

Replace the `<p class="note eln-id-carry__format-note">` inside the Product
suffix fieldset with:

```html
                        <p class="note eln-id-carry__format-note">
                            How a product is marked with its place among the
                            entry's products — shown here for the second and
                            third product, whether they come from one reaction
                            or three. Parallel reactions keep CDD's own pair
                            letters whatever is picked — <code>MDX-113-1A</code>.
                        </p>
```

- [ ] **Step 3: Reword the markFirst checkbox**

```html
                        <label class="field-item eln-id-carry__toggle">
                            <input type="checkbox" id="elnTableSuffixFirst" />
                            <span>Mark the <strong>first</strong> product too —
                            <code>MDX-113A</code>, <code>MDX-113-b</code>,
                            <code>MDX-113-1</code> and so on, in the style picked
                            above, instead of a bare
                            <code>MDX-113</code>.</span>
                        </label>
```

- [ ] **Step 4: Fix the wizard sentence**

In `src/options/setup-wizard.js:112`, replace the string with:

```js
            "The suffix tells the entry's products apart: the second product adds a B, the third a C — whether they come from one reaction or three. A product of a parallel (bulk) reaction gets -1A, -1B … for the first parallel reaction, -2A … for the second. Reagent rows are not filled.",
```

- [ ] **Step 5: Update `docs/ELN_ID_PRODUCT_SUFFIX.md`**

Four edits:

1. The opening line becomes:

```markdown
**Since 15.5.0**, small letters since 15.6.0, counted by product since 15.7.0.
Settings → *Registration form → From the ELN* → **Product suffix**.
```

2. §1's first paragraph and table become:

```markdown
An ELN entry can hold several products — several stoichiometry tables, or one
table with more than one product row. When a product is registered, the entry
ID it carries gets a mark saying WHICH product of the entry it is; otherwise
every product would register under the same Internal ID.

Products are counted in the order the entry shows them: reaction 1's products,
then reaction 2's. Every product row counts, registered or not, so the ordinal
does not shift as people work.

Two settings decide what the mark looks like. They are independent, so there
are ten combinations:

| style ⟍ *Mark the first product too* | off (default) | on |
| --- | --- | --- |
| **Letters** (default) | `MDX-113`, `MDX-113B`, `MDX-113C` | `MDX-113A`, `MDX-113B`, `MDX-113C` |
| **Small letters** | `MDX-113`, `MDX-113b`, `MDX-113c` | `MDX-113a`, `MDX-113b`, `MDX-113c` |
| **Letters after a dash** | `MDX-113`, `MDX-113-B`, `MDX-113-C` | `MDX-113-A`, `MDX-113-B`, `MDX-113-C` |
| **Small letters after a dash** | `MDX-113`, `MDX-113-b`, `MDX-113-c` | `MDX-113-a`, `MDX-113-b`, `MDX-113-c` |
| **Numbers** | `MDX-113`, `MDX-113-2`, `MDX-113-3` | `MDX-113-1`, `MDX-113-2`, `MDX-113-3` |

**Only products are marked, and only products are filled.** A Register link on
a reagent row writes nothing — a starting material is not a product of the
entry.
```

3. §2's table rows for the rule and the UI:

```markdown
| The rule | `src/shared/eln-id-carry.js` — `productMark(ordinal, style, markFirst)`, reached through `productSuffix()`; the ordinal comes from `productOrdinalOf(samples, sample)` |
| Row → product | same file — `findRowSample(samples, tableIndex, rowNumber)`; the Register link matches its row by the number the table prints, exactly as `name-watch.js` does |
```

4. §3's second bullet is replaced (the old "outside any table gets tableIndex 0"
   case no longer exists):

```markdown
- **The role comes from the payload, not the markup.** Ordinary product rows
  carry no `data-autotest-id` of their own, so `isProduct` is read from
  `STATE.lastPayload.samples`. Until that payload arrives, a Register link
  stamps nothing — an empty field beats a wrong ID on a registration.
```

- [ ] **Step 6: Update `docs/FEATURE_CATALOG.md`**

In the ELN-ID entry, change `tableSuffix` to `productMark`, `productOrdinalOf`,
`findRowSample` in the *Related files* line, and replace the *Data source* line
with:

```markdown
- **Data source:** the entry ID from the DOM; the row's role and its place among
  the entry's products from the panel payload (`isProduct`, `reactionIndex`,
  `rowNumber` in `inject/parsers/sample-data.js`), matched to the clicked row by
  the printed row number; in a bulk block the letter on the
  `stoichiometry-table-parallelReactant` row above the product row.
```

- [ ] **Step 7: Build and eyeball the options page**

Run: `npm run build`
Then: `grep -c "first</strong> product" dist/options/options.html`
Expected: `1`.

- [ ] **Step 8: Commit**

```bash
git add src/options/options.html src/options/setup-wizard.js docs/ELN_ID_PRODUCT_SUFFIX.md docs/FEATURE_CATALOG.md
git commit -m "docs and settings copy: the mark is about products"
```

---

### Task 5: Release 15.7.0

**Files:**
- Modify: `manifest.json:4`, `CHANGELOG.md`, `RELEASES.md`

**Interfaces:**
- Consumes: everything above.
- Produces: a commit the user can test from `dist/`.

- [ ] **Step 1: Bump the version**

`manifest.json`: `"version": "15.6.0"` → `"version": "15.7.0"`.

- [ ] **Step 2: Write the CHANGELOG entry**

Insert above the `## [15.6.0]` heading:

```markdown
---
## [15.7.0] — 2026-08-27

### Fixed
- **Two products of one reaction no longer register under the same Internal
  ID.** The suffix counted stoichiometry tables, so both product rows of a
  single table were handed the same mark — the exact collision the mark exists
  to prevent. It now counts the entry's PRODUCTS, in the order the entry shows
  them: reaction 1's products, then reaction 2's. Every product row counts,
  registered or not, so an ordinal minted today is the one minted tomorrow.

  For the ordinary entry — one product per reaction — nothing changes:
  `MDX-113`, `MDX-113B`, `MDX-113C` as before.

### Changed
- **Only product rows are filled.** A Register link on a reagent row used to be
  stamped with its table's mark; it now writes nothing. A starting material is
  not a product of the entry, and its invented ID collided with a real one. The
  panel button has always been products-only, so the two routes now agree.
- The role of a row is read from the entry payload the panel is built from
  (`isProduct`, `reactionIndex`, `rowNumber`), never guessed from the markup:
  ordinary product rows carry no autotest id of their own. The clicked row is
  matched to its sample by the number the table prints, the identity
  `name-watch.js` already uses. Until that payload arrives, nothing is stamped
  — an empty field beats a wrong ID on a registration.
- `tableSuffix()` became `productMark(ordinal, style, markFirst)` and
  `productSuffix({ tableIndex })` became `productSuffix({ productIndex })`;
  `composeBatchElnId()`'s third argument is the product ordinal. Two new pure
  helpers, `productOrdinalOf()` and `findRowSample()`, hold the counting and
  the row identity. Both storage keys keep their names, so no setting is lost.
- Parallel ("bulk") products are untouched — `-1A`, `-1B`, `-2A` — and are not
  counted in the ordinary sequence: a seven-pair block cannot push the entry's
  other product to `H`.
```

- [ ] **Step 3: Write the RELEASES entry**

Replace the `# What's new in 15.6.0` heading with `# What's new in 15.7.0` and
insert above the `## 15.6.0` section:

```markdown
## 15.7.0 — 2026-08-27

**A reaction with two products now registers them under two different IDs.**
The suffix used to count reactions, so both products of one reaction were
handed the same Internal ID. It now counts products — `MDX-113`, `MDX-113B`,
`MDX-113C` — in the order the entry shows them.

- One product per reaction reads exactly as before. Nothing to switch.
- **Reagent rows are no longer filled.** Register from a reagent row and the
  Internal ID stays empty — a starting material is not a product of the entry.
- Parallel reactions keep their pair letters, `MDX-113-1A`.
- *Mark the first table too* is now **Mark the first product too**, Settings →
  **Product suffix**. Your choice of style is kept.

---
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: both bundles build; `grep '"version"' dist/manifest.json` shows
`15.7.0`.

- [ ] **Step 5: Commit and STOP**

```bash
git add manifest.json CHANGELOG.md RELEASES.md
git commit -m "15.7.0 — the ELN ID suffix counts products, not tables"
```

Then stop. Per `CLAUDE.md`, do NOT push and do NOT tag: the user reloads
`dist/` and tests first.

- [ ] **Step 6: Hand the user the reload test**

Tell them exactly what to check on a live entry:

1. An entry whose reaction has **two products**: the two Register links must
   pre-fill `MDX-…` and `MDX-…B` (in the chosen style), not the same string
   twice.
2. The **panel button** on those two product cards must offer the SAME two
   strings.
3. A **reagent row's** Register link must leave Internal ID empty.
4. An entry with a **parallel block**: its products still read `-1A`, `-1B`,
   and the entry's ordinary product is not pushed along by them.
5. Flipping the style or *Mark the first product too* must take effect on the
   open entry, no reload.
