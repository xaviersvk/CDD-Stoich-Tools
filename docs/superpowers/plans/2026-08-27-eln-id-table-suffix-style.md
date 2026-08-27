# ELN ID table suffix style — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Settings switch that numbers stoichiometry-table products
(`MDX-113-1`, `MDX-113-2`, `MDX-113-3`) instead of lettering them
(`MDX-113`, `MDX-113B`, `MDX-113C`).

**Architecture:** One pure helper in `src/shared/eln-id-carry.js`
(`tableSuffix`, reached through `productSuffix`) composes every suffix, and both
stamping paths — the Register link in a stoichiometry row and the panel button
that writes onto an existing batch — call it. A new storage key carries the
choice; `getElnIdCarrySettings()` already flows into both paths and into the
panel's synchronous cache, so the value rides along once the key is added to the
two `storage.onChanged` filters.

**Tech Stack:** Plain ES modules, no framework, no bundler magic in `src/shared`
(vite bundles the content script; the options page loads the same files as ES
modules from `dist/`). Chrome `storage.local`. Build with `npm run build`.

**Spec:** `docs/superpowers/specs/2026-08-27-eln-id-table-suffix-style-design.md`

## Global Constraints

- **Default is `"letter"`** — an install that never touches the setting writes
  exactly what it writes today. An unknown or absent stored value falls back to
  `"letter"`.
- **Numbers start at 1 and include the first table:** table 1 → `-1`, table 2 →
  `-2`, table 3 → `-3`. There is no bare-first-table special case in number mode.
- **Parallel ("bulk") reactions are untouched** — `-1A`, `-1B`, `-2A` in both
  modes. `parallelSuffix()` must not be edited.
- **`src/shared/*` stays free of DOM access.** Both the content script and the
  options page import these files.
- **No test runner exists in this repo.** `src/shared/eln-id-carry.js` has no
  imports and no top-level `chrome` access, so it can be exercised directly with
  `node`. That is the automated check used below; anything DOM-bound is verified
  by the user reloading the built extension.
- **Do not push.** Per `CLAUDE.md`: bump, document, build, commit — then stop.

## File Structure

- `src/shared/eln-id-carry.js` — *modify*. New storage constants, `style` in the
  settings object, `tableSuffix(index, style)`, `productSuffix({..., style})`,
  `saveElnTableSuffixStyle()`. The only file that knows what a suffix looks like.
- `src/content/features/ui-fixes/eln-id-to-registration.js` — *modify*. Register
  link path: carry `style` in the module's settings snapshot, pass it to
  `productSuffix`, wake on the new storage key.
- `src/shared/eln-id-to-batch.js` — *modify*. `composeBatchElnId()` gains a
  `style` parameter; the panel's `carryCache` wakes on the new key.
- `src/content/features/sample-panel.js` — *modify*, one call site.
- `src/options/options.html` — *modify*. A second `fieldset.choices` and a
  reworded checkbox blurb.
- `src/options/options.js` — *modify*. Radio wiring and initial state.
- `CHANGELOG.md`, `RELEASES.md`, `manifest.json` — *modify*, release task.

Not touched: `src/options/setup-wizard.js`. The wizard asks the two questions a
vault cannot answer for itself (identifier format, field label); suffix style is
a preference with a safe default and does not belong in a first-run gate.

---

### Task 1: The suffix helper and its setting

**Files:**
- Modify: `src/shared/eln-id-carry.js:36-46` (constants block),
  `:107-160` (`tableSuffix`, `productSuffix`), `:172-215` (settings read/save)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `ELN_TABLE_SUFFIX_STYLE_KEY` (string constant `"cddElnTableSuffixStyle"`)
  - `ELN_TABLE_SUFFIX_STYLES` (`["letter", "number"]`)
  - `DEFAULT_ELN_TABLE_SUFFIX_STYLE` (`"letter"`)
  - `tableSuffix(index: number, style?: string) -> string`
  - `productSuffix({ parallel, tableIndex, style }) -> string`
  - `getElnIdCarrySettings() -> { enabled, fieldLabel, format, style }`
  - `saveElnTableSuffixStyle(value: string) -> Promise<string>`

- [ ] **Step 1: Write the failing check**

Create `suffix-check.mjs` in the session scratchpad directory (NOT in the repo —
this file is never committed):

```js
import {
    tableSuffix,
    productSuffix,
    DEFAULT_ELN_TABLE_SUFFIX_STYLE,
} from "file:///C:/Users/matus.drexler/WebstormProjects/CDD-Stoich-Tools/src/shared/eln-id-carry.js";

const cases = [
    ["letters, first table", tableSuffix(0), ""],
    ["letters, second table", tableSuffix(1), "B"],
    ["letters, third table", tableSuffix(2), "C"],
    ["letters, 27th table", tableSuffix(26), "AB"],
    ["numbers, first table", tableSuffix(0, "number"), "-1"],
    ["numbers, second table", tableSuffix(1, "number"), "-2"],
    ["numbers, third table", tableSuffix(2, "number"), "-3"],
    ["unknown style falls back to letters", tableSuffix(1, "roman"), "B"],
    ["default constant is letter", DEFAULT_ELN_TABLE_SUFFIX_STYLE, "letter"],
    [
        "parallel ignores the style",
        productSuffix({ parallel: { ordinal: 1, letter: "A" }, tableIndex: 2, style: "number" }),
        "-1A",
    ],
    [
        "productSuffix passes the style through",
        productSuffix({ parallel: null, tableIndex: 1, style: "number" }),
        "-2",
    ],
    [
        "productSuffix without a style still letters",
        productSuffix({ parallel: null, tableIndex: 1 }),
        "B",
    ],
];

let bad = 0;
for (const [name, got, want] of cases) {
    const ok = got === want;
    if (!ok) bad++;
    console.log(`${ok ? "ok  " : "FAIL"} ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}
process.exit(bad ? 1 : 0);
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node <scratchpad>/suffix-check.mjs`

Expected: FAIL — `DEFAULT_ELN_TABLE_SUFFIX_STYLE` is not exported yet, so the
import throws `SyntaxError: The requested module ... does not provide an export
named 'DEFAULT_ELN_TABLE_SUFFIX_STYLE'`.

- [ ] **Step 3: Add the storage constants**

In `src/shared/eln-id-carry.js`, directly below the `DEFAULT_ELN_ID_FORMAT`
block (`:46`):

```js
// "letter" | "number" — how a product is marked with the stoichiometry table
// it came from.
//
//   letter (the original)   MDX-113   MDX-113B   MDX-113C
//   number                  MDX-113-1 MDX-113-2  MDX-113-3
//
// Letters are this plugin's own convention, not something CDD prints, so a
// vault that numbers its reactions can say so. Absent means "letter": the
// setting must never change an ID nobody asked it to change.
export const ELN_TABLE_SUFFIX_STYLE_KEY = "cddElnTableSuffixStyle";

export const ELN_TABLE_SUFFIX_STYLES = ["letter", "number"];

export const DEFAULT_ELN_TABLE_SUFFIX_STYLE = "letter";
```

- [ ] **Step 4: Teach `tableSuffix` the number style**

Replace `tableSuffix` (`:119`) with:

```js
export function tableSuffix(index, style = DEFAULT_ELN_TABLE_SUFFIX_STYLE) {
    if (!Number.isInteger(index) || index < 0) return "";

    // Numbering counts from the FIRST table, so a one-reaction entry reads
    // MDX-113-1. That is the point of the setting: every product carries the
    // number of the reaction it came out of, with no exception to remember.
    if (style === "number") return `-${index + 1}`;

    if (index === 0) return "";

    let n = index + 1;
    let out = "";

    while (n > 0) {
        out = String.fromCharCode(65 + ((n - 1) % 26)) + out;
        n = Math.floor((n - 1) / 26);
    }

    return out;
}
```

Note the guard split: the old single guard rejected `index <= 0`, which the
letter branch still needs but the number branch must not have.

- [ ] **Step 5: Pass the style through `productSuffix`**

Replace `productSuffix` (`:154`) with:

```js
// The suffix for one product row, whichever kind of table it sits in.
//   parallel: { ordinal, letter } of the bulk pair -> "-1A"
//   tableIndex: position of the table among ALL tables
//   style: "letter" -> "", "B", "C"…   "number" -> "-1", "-2", "-3"…
//
// The style reaches the table branch only. A parallel pair's letter is CDD's
// own, printed beside the row, and stays a letter in both styles.
export function productSuffix({ parallel, tableIndex, style }) {
    if (parallel) {
        const s = parallelSuffix(parallel.ordinal, parallel.letter);
        if (s) return s;
    }
    return tableSuffix(tableIndex, style);
}
```

- [ ] **Step 6: Read and write the setting**

In `getElnIdCarrySettings()`, add to the `chrome.storage.local.get` defaults:

```js
            [ELN_TABLE_SUFFIX_STYLE_KEY]: DEFAULT_ELN_TABLE_SUFFIX_STYLE,
```

to the returned object:

```js
            style: ELN_TABLE_SUFFIX_STYLES.includes(stored[ELN_TABLE_SUFFIX_STYLE_KEY])
                ? stored[ELN_TABLE_SUFFIX_STYLE_KEY]
                : DEFAULT_ELN_TABLE_SUFFIX_STYLE,
```

and to the `catch` fallback object:

```js
            style: DEFAULT_ELN_TABLE_SUFFIX_STYLE,
```

Then add, next to `saveElnIdFormat`:

```js
export async function saveElnTableSuffixStyle(value) {
    const style = ELN_TABLE_SUFFIX_STYLES.includes(value)
        ? value
        : DEFAULT_ELN_TABLE_SUFFIX_STYLE;

    try {
        await chrome.storage.local.set({ [ELN_TABLE_SUFFIX_STYLE_KEY]: style });
    } catch {
        // Orphaned content script — nothing useful to do.
    }

    return style;
}
```

- [ ] **Step 7: Run the check to verify it passes**

Run: `node <scratchpad>/suffix-check.mjs`
Expected: every line `ok`, exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/shared/eln-id-carry.js
git commit -m "ELN ID: a suffix style setting — table letters or table numbers"
```

---

### Task 2: The Register link path

**Files:**
- Modify: `src/content/features/ui-fixes/eln-id-to-registration.js:57-67`
  (imports), `:92-98` (settings snapshot), `:178` (the stamp), `:296-300`
  (`storage.onChanged` filter)

**Interfaces:**
- Consumes: `ELN_TABLE_SUFFIX_STYLE_KEY`, `DEFAULT_ELN_TABLE_SUFFIX_STYLE`,
  `productSuffix({ parallel, tableIndex, style })` from Task 1.
- Produces: nothing other tasks read.

- [ ] **Step 1: Import the new key and default**

Add to the existing `eln-id-carry.js` import block, keeping its order:

```js
    ELN_TABLE_SUFFIX_STYLE_KEY,
    DEFAULT_ELN_TABLE_SUFFIX_STYLE,
```

- [ ] **Step 2: Carry the style in the settings snapshot**

The snapshot at `:94` becomes:

```js
let settings = {
    enabled: true,
    fieldLabel: "Internal ID",
    format: DEFAULT_ELN_ID_FORMAT,
    style: DEFAULT_ELN_TABLE_SUFFIX_STYLE,
};
```

`settings` is replaced wholesale by `getElnIdCarrySettings()` at startup and on
change, so this literal only covers the moments before the first read.

- [ ] **Step 3: Stamp with the style**

In `stampLink()`, the `productSuffix` call becomes:

```js
    const value = `${trimmed}${productSuffix({
        parallel: parallelInfoOf(link),
        tableIndex: tableIndexOf(link),
        style: settings.style,
    })}`;
```

- [ ] **Step 4: Wake on the new key**

In the `chrome.storage.onChanged` listener, extend the early return:

```js
        if (
            !changes[ELN_ID_CARRY_ENABLED_KEY] &&
            !changes[ELN_ID_CARRY_FIELD_KEY] &&
            !changes[ELN_ID_FORMAT_KEY] &&
            !changes[ELN_TABLE_SUFFIX_STYLE_KEY]
        ) {
            return;
        }
```

Without this the radio would not take effect on an ELN entry already open —
`stampLink` would keep reading the stale snapshot.

- [ ] **Step 5: Verify the build passes**

Run: `npm run build`
Expected: both vite builds succeed, with no unresolved-import warning for
`ELN_TABLE_SUFFIX_STYLE_KEY`.

- [ ] **Step 6: Commit**

```bash
git add src/content/features/ui-fixes/eln-id-to-registration.js
git commit -m "ELN ID: the Register link honours the suffix style"
```

---

### Task 3: The panel button path

**Files:**
- Modify: `src/shared/eln-id-to-batch.js:17-26` (imports), `:69-73`
  (`composeBatchElnId`), `:109-113` (`carryCache`), `:155-163` (`onChanged`)
- Modify: `src/content/features/sample-panel.js:1244-1249`

**Interfaces:**
- Consumes: `ELN_TABLE_SUFFIX_STYLE_KEY`, `DEFAULT_ELN_TABLE_SUFFIX_STYLE`,
  `productSuffix` from Task 1.
- Produces: `composeBatchElnId(entryId, format, reactionIndex, parallel = null,
  style = DEFAULT_ELN_TABLE_SUFFIX_STYLE) -> string`. `getCarrySettings()` now
  returns `{ enabled, fieldLabel, format, style }`.

- [ ] **Step 1: Import the new key and default**

Add to the `eln-id-carry.js` import block in `src/shared/eln-id-to-batch.js`:

```js
    ELN_TABLE_SUFFIX_STYLE_KEY,
    DEFAULT_ELN_TABLE_SUFFIX_STYLE,
```

- [ ] **Step 2: Give `composeBatchElnId` the style**

```js
export function composeBatchElnId(
    entryId,
    format,
    reactionIndex,
    parallel = null,
    style = DEFAULT_ELN_TABLE_SUFFIX_STYLE
) {
    const trimmed = applyIdentifierFormat(entryId, format);
    if (!trimmed) return "";
    return `${trimmed}${productSuffix({ parallel, tableIndex: reactionIndex, style })}`;
}
```

The default keeps any four-argument call writing what it wrote before.

- [ ] **Step 3: Seed the style in the sync cache**

```js
let carryCache = {
    enabled: true,
    fieldLabel: DEFAULT_ELN_ID_CARRY_FIELD,
    format: DEFAULT_ELN_ID_FORMAT,
    style: DEFAULT_ELN_TABLE_SUFFIX_STYLE,
};
```

`initElnIdToBatch()` overwrites the whole object with `getElnIdCarrySettings()`,
so nothing else changes here.

- [ ] **Step 4: Wake the cache on the new key**

In the `chrome.storage.onChanged` listener, the mirror condition becomes:

```js
            if (
                changes[ELN_ID_CARRY_ENABLED_KEY] ||
                changes[ELN_ID_CARRY_FIELD_KEY] ||
                changes[ELN_ID_FORMAT_KEY] ||
                changes[ELN_TABLE_SUFFIX_STYLE_KEY]
            ) {
```

- [ ] **Step 5: Pass the style at the panel call site**

In `src/content/features/sample-panel.js`, the call at `:1244` becomes:

```js
    const value = composeBatchElnId(
        entryId,
        format,
        sample.reactionIndex,
        sampleParallelInfo(sample),
        style
    );
```

`format` is destructured from `getCarrySettings()` earlier in that function.
Read the surrounding lines and destructure `style` from the same object — do not
call `getCarrySettings()` a second time.

- [ ] **Step 6: Verify the build passes**

Run: `npm run build`
Expected: both builds succeed.

- [ ] **Step 7: Commit**

```bash
git add src/shared/eln-id-to-batch.js src/content/features/sample-panel.js
git commit -m "ELN ID: the panel button honours the suffix style"
```

---

### Task 4: The setting on the options page

**Files:**
- Modify: `src/options/options.html:415-422` (the checkbox blurb), `:439-469`
  (after the existing `eln-id-carry__format` fieldset)
- Modify: `src/options/options.js:100-105` (import), `:731-747` (radio wiring
  and `initElnIdCarryUI`)

**Interfaces:**
- Consumes: `saveElnTableSuffixStyle`, `getElnIdCarrySettings().style` from
  Task 1.
- Produces: nothing other tasks read.

No CSS is needed — the new fieldset reuses `.choices`, `.choice__sample`,
`.eln-id-carry__format` and `.eln-id-carry__format-note`, all already in
`src/options/options.css` (`:587`, `:625`, `:883`, `:887`).

- [ ] **Step 1: Reword the checkbox blurb**

The current text spells out one of the two modes. Replace the `<span>` at
`:416-422` with:

```html
                        <span>Registering from a stoichiometry row fills the
                        entry's <strong>ID</strong> into the new entity
                        — <code>IDEMO-MDX-0014</code>. A second or third
                        stoichiometry table marks the product with the suffix
                        chosen below. Only an empty field is filled.</span>
```

- [ ] **Step 2: Add the fieldset**

Directly after the closing `</fieldset>` of the identifier-format block
(`:468`), still inside the same `<div>`:

```html
                    <fieldset class="choices eln-id-carry__format">
                        <legend class="eyebrow">Product suffix</legend>

                        <p class="note eln-id-carry__format-note">
                            How a product is marked with the stoichiometry table
                            it came from. Parallel reactions keep CDD's own pair
                            letters either way — <code>MDX-113-1A</code>.
                        </p>

                        <label class="choice">
                            <input type="radio" name="elnTableSuffixStyle" value="letter" />
                            <span class="choice__text">
                                <span class="choice__label">Letters</span>
                                <span class="choice__sample">MDX-113, MDX-113B, MDX-113C</span>
                            </span>
                        </label>

                        <label class="choice">
                            <input type="radio" name="elnTableSuffixStyle" value="number" />
                            <span class="choice__text">
                                <span class="choice__label">Numbers</span>
                                <span class="choice__sample">MDX-113-1, MDX-113-2, MDX-113-3</span>
                            </span>
                        </label>
                    </fieldset>
```

- [ ] **Step 3: Import the saver**

In `src/options/options.js`, add to the `eln-id-carry.js` import block:

```js
    saveElnTableSuffixStyle,
```

- [ ] **Step 4: Wire the radios**

Immediately after the `elnIdFormatRadios` loop (`:737`):

```js
const elnTableSuffixStyleRadios = [
    ...document.querySelectorAll('input[name="elnTableSuffixStyle"]'),
];

for (const radio of elnTableSuffixStyleRadios) {
    radio.addEventListener("change", () => {
        if (radio.checked) saveElnTableSuffixStyle(radio.value);
    });
}
```

- [ ] **Step 5: Check the stored one on load**

At the end of `initElnIdCarryUI()`:

```js
    const style = elnTableSuffixStyleRadios.find(
        (radio) => radio.value === settings.style
    );
    if (style) style.checked = true;
```

- [ ] **Step 6: Build, then look at the page**

Run: `npm run build`
Reload the unpacked extension from `dist/` and open the options page. Expected:
under *ELN identifier format* there is a **Product suffix** group with
**Letters** preselected; picking **Numbers** and reopening the page shows
**Numbers** still selected.

- [ ] **Step 7: Commit**

```bash
git add src/options/options.html src/options/options.js
git commit -m "Settings: choose letters or numbers for the product suffix"
```

---

## Verification (after Task 4, before Task 5)

Ask the user to reload the built extension and confirm, on a real entry with
several stoichiometry tables:

1. **Default untouched** — Letters still writes `MDX-113`, `MDX-113B`,
   `MDX-113C`, from both the Register link and the panel button.
2. **Numbers** — the same two routes write `MDX-113-1`, `-2`, `-3`.
3. **Parallel** — a bulk reaction writes `-1A` / `-1B` under both settings.
4. **Live** — flipping the radio with an ELN entry already open changes the next
   stamp without reloading the entry, on the panel card and the Register link
   alike.

Do not start Task 5 until the user confirms.

---

### Task 5: Release

**Files:**
- Modify: `manifest.json:4`, `CHANGELOG.md`, `RELEASES.md`
- Rebuild: `dist/`

- [ ] **Step 1: Bump the version**

`manifest.json`: `"version": "15.4.3"` → `"version": "15.5.0"`. A new setting is
a feature, so the minor moves.

- [ ] **Step 2: Write the CHANGELOG entry**

Add above the `## [15.4.3]` heading, following the house format:

```markdown
---
## [15.5.0] — 2026-08-27

### Added
- **The suffix that marks which stoichiometry table a product came from can be
  a number instead of a letter.** Settings → *Product suffix*:
  `MDX-113-1`, `MDX-113-2`, `MDX-113-3` rather than `MDX-113`, `MDX-113B`,
  `MDX-113C`. Letters remain the default, so nothing changes until it is
  switched.

  In number mode the FIRST table is numbered too — every product carries the
  number of the reaction it came out of, with no exception to remember. That is
  the one behavioural difference from the letters, which leave the first table
  bare.

  Parallel ("bulk") reactions are untouched in both modes: their `-1A` / `-1B`
  carries the pair letter CDD itself prints beside the row, and a chemist
  matches the ID to what is on screen.

  The choice is one storage key (`cddElnTableSuffixStyle`) read through
  `getElnIdCarrySettings()`, so both stamping paths — the Register link in a
  stoichiometry row and the panel button that writes onto an existing batch —
  take it from the same place, and both react to the radio without a page
  reload.
```

- [ ] **Step 3: Write the What's new entry**

In `RELEASES.md`, change the `# What's new in 15.4.3` heading to `15.5.0` and
add above the `## 15.4.3` section:

```markdown
## 15.5.0 — 2026-08-27

**You can now number your reactions instead of lettering them.** Settings →
**Product suffix** → **Numbers**, and a product registers as `MDX-113-1`,
`MDX-113-2`, `MDX-113-3` instead of `MDX-113`, `MDX-113B`, `MDX-113C`.

- It applies to both routes: the **Register** link in a stoichiometry row and
  the panel's button that writes the ID onto a batch you registered earlier.
- With **Numbers** on, the first reaction is `-1` as well — every product says
  which reaction it came from.
- Parallel reactions keep their pair letters — `MDX-113-1A` — so the ID still
  matches the letter CDD prints beside the row.
- Letters stay the default. Nothing changes until you switch it.
```

- [ ] **Step 4: Rebuild**

Run: `npm run build`
Expected: both builds succeed and `dist/` is refreshed.

- [ ] **Step 5: Commit everything**

```bash
git add manifest.json CHANGELOG.md RELEASES.md
git commit -m "15.5.0 — number the stoichiometry tables instead of lettering them"
```

- [ ] **Step 6: STOP**

Say the commit is ready and wait. Per `CLAUDE.md`, do NOT run
`git push origin main` and do NOT create or push the `v15.5.0` tag — the tag
publishes to the Chrome Web Store and Firefox AMO. Each needs an explicit
go-ahead from the user.
