# Row name from synonym Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Offer to write a stoichiometry row's empty **Name** field with the shortest synonym on the molecule's page, and remember any name the user types by hand so the same molecule is offered that name from then on.

**Architecture:** One dependency-free picker (`shared/pretty-name.js`) turns the molecule page's synonym string into the one name worth showing. One storage module (`shared/name-memory.js`) keeps `moleculeId → name`, 300 entries, mirroring `density-memory.js`. One feature flag (`shared/row-name-flag.js`) gates everything, mirroring `show-products-flag.js`. Capture, enrichment and offer are three small content-script features that plug into the existing `SAMPLE_DATA` → `computeFillOffers` → `runFillOffer` chain, so the panel button, *Fill all* and the experimental auto-fill all pick the new field up for free.

**Tech Stack:** Plain ES modules, Vite build (`npm run build`), Chrome/Firefox MV3 content script + page-context inject script, `chrome.storage.local`. No test framework in this repo — pure functions are checked with a throwaway `node` script, behaviour is checked live in the browser.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-21-row-name-from-synonym-design.md`.
- Storage keys, fixed: flag `cddFillRowName` (default `false`), memory `cddNameMemoryV1`, cap **300** entries.
- **Default OFF.** With the flag off nothing fetches, nothing offers, and nothing is written to memory.
- **Never overwrite an existing name.** Every write goes through `findFieldValueLink(row, "Name:", /* placeholderOnly */ true)`, which only matches the blue `Optional`/`Required` link.
- **Offers**: reactants and agents only — not products, not mentions. **Capture**: every row, products included.
- Precedence for the offered value: **remembered name first, shortest synonym second.** This is the opposite of every other field and is deliberate — see the spec.
- Auto-write policy is unchanged: `auto-fill.js` still only touches rows added while working. Do not widen it.
- Live test entry: `https://app.collaborativedrug.com/vaults/6884/eln/entries/2504170`.
- Scratchpad for throwaway scripts: `C:\Users\MATUS~1.DRE\AppData\Local\Temp\claude\C--Users-matus-drexler-WebstormProjects-CDD-Stoich-Tools\aa50a33e-194d-483e-b607-3af09e54bc78\scratchpad` (referred to below as `$SCRATCH`).
- Node cannot `import` a `.js` file from this repo directly — `package.json` has no `"type": "module"`, so Node reads `.js` as CommonJS and the ESM `export` keyword is a parse error. Every throwaway check therefore **copies** the module to `$SCRATCH` with an `.mjs` extension first.
- The user reloads the unpacked extension and tests live. After a build, ask them to reload and refresh before claiming anything works.
- Release steps (version bump, `CHANGELOG.md`, `RELEASES.md`, rebuild, commit) follow `CLAUDE.md` and **stop before any push**. Do not push the commit. Do not create or push a tag.

## Live DOM facts (verified on entry 2504170, 2026-08-21)

These were measured, not guessed. Do not re-derive them; do re-check them if a step fails.

1. Edit mode renders the field as
   `span[data-autotest-id="field-name"]` → `<b>Name:</b>` +
   `span[data-autotest-id="missing-label"]` with the text `Optional`.
2. **A row whose name IS set renders `<span data-autotest-id="field-name">DIPEA</span>` with NO `<b>` label at all**, in edit mode and view mode alike. Two consequences:
   - `writeFieldViaPopup`'s confirm step (`readFieldText(tr, "Name:")`) **cannot** be used for this field — the label it looks for is gone the moment the write lands. Task 5 reads the bare span instead.
   - `isEditModeRow()` keys on `<b>Name:</b>`, so it goes blind on a table whose rows all have names — a state this very feature creates. Task 5 fixes that too.
3. `data-autotest-id="field-name"` is **shared with the Solvent field** (`<b>Solvent:</b> Ethanol (EtOH)`). The `<b>` label is the discriminator.
4. The editor popup for Name is a `MuiPaper` whose `innerText` is exactly **`Name`**, with `input[placeholder="Name"]`. (Density's is `Density [g/cm3]`, IUPAC's is `IUPAC`.)
5. `<b>` labels that appear **only** in edit mode: `Name:`, `IUPAC:`, `%w/w ratio:`, `%v/v ratio:`, `CAS-RN:`. Labels like `FW:`, `Mass:`, `Purity:` and `Volume: Optional` render in view mode too and are useless as edit-mode markers.
6. The payload field is the row-level string `row.name` (`"DIPEA"`), absent when unset, **not** under `userInput`.
7. Synonyms as CDD serves them:
   - `RGT-0000246` → `N-Ethyldiisopropylamine, N,N-Diisopropylethylamine, N-Ethyldiisopropylamine, DIPEA`
   - `RGT-0000204` → `1-[Bis(dimethylamino)methylene]-1H-1,2,3-triazolo[4,5-b]pyridinium 3-oxid hexafluorophosphate,N-[(Dimethylamino)-1H-1,2,3-triazolo-[4,5-b]pyridin-1-ylmethylene]-N-methylmethanaminium hexafluorophosphateN-oxide, HATU`
   - `PHA-0334390` → `PD-0287`
   - `PHA-0333476` → empty

---

### Task 1: The name picker

**Files:**
- Create: `src/shared/pretty-name.js`
- Modify: `src/content/api/molecule-image.js` (`extractSynonym`, ~line 120)
- Modify: `src/content/api/molecule-page.js` (add one accessor at the end)
- Test: throwaway `node` script in `$SCRATCH` (no test framework in repo)

**Interfaces:**
- Produces: `splitSynonyms(rawText) -> string[]` — used by `pickPrettyName` and nothing else, exported for the test.
- Produces: `pickPrettyName(rawText) -> string | null` — used by Task 6.
- Produces: `extractSynonymsText(doc) -> string | null` (from `molecule-image.js`) — the raw `dd` text with `<br>` already turned into `, `. Used by `molecule-page.js`.
- Produces: `getMoleculeSynonymsText(vaultId, moleculeId) -> Promise<string|null>` (from `molecule-page.js`) — rejects when the page cannot be loaded, resolves `null` when the molecule has no synonyms. Used by Task 6.

- [ ] **Step 1: Write the failing test**

Create `$SCRATCH/test-pretty-name.mjs`:

```js
import { splitSynonyms, pickPrettyName } from "./pretty-name.mjs";

let failures = 0;
function eq(actual, expected, label) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures += 1;
    console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${JSON.stringify(actual)}`);
}

// The two cases the feature exists for — real strings off CDD's molecule pages.
eq(pickPrettyName("N-Ethyldiisopropylamine, N,N-Diisopropylethylamine, N-Ethyldiisopropylamine, DIPEA"),
   "DIPEA", "DIPEA wins over its long names");
eq(pickPrettyName("1-[Bis(dimethylamino)methylene]-1H-1,2,3-triazolo[4,5-b]pyridinium 3-oxid hexafluorophosphate,N-[(Dimethylamino)-1H-1,2,3-triazolo-[4,5-b]pyridin-1-ylmethylene]-N-methylmethanaminium hexafluorophosphateN-oxide, HATU",
   "HATU"), "HATU wins";

// A single synonym is the answer by default.
eq(pickPrettyName("PD-0287"), "PD-0287", "single synonym");

// Nothing to pick.
eq(pickPrettyName(""), null, "empty string");
eq(pickPrettyName("   "), null, "blank string");
eq(pickPrettyName(null), null, "null");
eq(pickPrettyName(undefined), null, "undefined");
eq(pickPrettyName(", ; ,"), null, "separators only");

// A comma with no space after it is part of the NAME, not a separator —
// this is why the split rule matches [,;] followed by whitespace.
eq(splitSynonyms("N,N-diethylhydroxylamine"), ["N,N-diethylhydroxylamine"],
   "bare comma does not split");
eq(pickPrettyName("N,N-diethylhydroxylamine, DEHA"), "DEHA", "…but a comma+space does");

// Semicolons separate too.
eq(pickPrettyName("Ethanol; EtOH"), "EtOH", "semicolon separator");

// Ties go to the first in document order.
eq(pickPrettyName("abc, xyz"), "abc", "tie goes to the first");

// Whitespace around entries is not part of their length.
eq(pickPrettyName("Toluene,    PhMe   "), "PhMe", "trims before measuring");

console.log(failures ? `\n${failures} FAILURE(S)` : "\nall passed");
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
cd "$SCRATCH" && node test-pretty-name.mjs
```

Expected: FAIL — `Cannot find module './pretty-name.mjs'`.

- [ ] **Step 3: Write the picker**

Create `src/shared/pretty-name.js`:

```js
// shared/pretty-name.js
//
// Which of a molecule's synonyms belongs at the top of a stoichiometry row?
//
// The shortest one. A chemist writes DIPEA, not N,N-Diisopropylethylamine,
// and CDD's synonym list carries both — measured against the names the user
// had already typed by hand on entry 2504170, "shortest" picked exactly
// theirs (DIPEA, HATU).
//
// Pure: no DOM, no chrome.*, no imports. Loaded by the content script.

// A separator is a comma or semicolon FOLLOWED BY WHITESPACE. A bare comma
// belongs to the name — "N,N-diethylhydroxylamine" is one synonym, and CDD
// also joins two long names with a bare comma inside a single entry.
const SEPARATOR = /\s*[,;]\s+/;

export function splitSynonyms(rawText) {
    if (typeof rawText !== "string") return [];
    return rawText
        .split(SEPARATOR)
        .map((part) => part.trim())
        .filter(Boolean);
}

// The shortest synonym, or null when there is none. Ties resolve to the
// first in document order — CDD lists the registrant's own name first.
export function pickPrettyName(rawText) {
    let best = null;
    for (const candidate of splitSynonyms(rawText)) {
        if (best === null || candidate.length < best.length) best = candidate;
    }
    return best;
}
```

- [ ] **Step 4: Run the test and make sure it passes**

```bash
cp src/shared/pretty-name.js "$SCRATCH/pretty-name.mjs" && cd "$SCRATCH" && node test-pretty-name.mjs
```

Expected: every line `ok`, final line `all passed`.

- [ ] **Step 5: Split the raw synonyms text out of `extractSynonym`**

In `src/content/api/molecule-image.js`, replace the existing `extractSynonym` with these two functions. `extractSynonym`'s behaviour is unchanged — it still returns the FIRST synonym, because the panel's shipped **Synonym** field depends on that.

```js
// The molecule definition list carries a "Synonyms" row; read its raw value.
// Also used by molecule-page.js and by batch-fields.js, which parse the same
// molecule page HTML.
export function extractSynonymsText(doc) {
    const fields = doc.querySelectorAll(".molecule_field");
    for (const field of fields) {
        const label = field.querySelector("dt")?.textContent?.trim().toLowerCase();
        if (label === "synonyms" || label === "synonym") {
            const dd = field.querySelector("dd");
            if (!dd) return null;
            // <br>-separated synonyms would silently concatenate through
            // textContent; turn the breaks into real separators first.
            for (const br of dd.querySelectorAll("br")) br.replaceWith(", ");
            const value = dd.textContent?.trim();
            return value || null;
        }
    }
    return null;
}

// The FIRST synonym — what the panel's Synonym field has always shown.
// Splits on a separator (comma/semicolon followed by whitespace) -- NOT a
// bare comma, which would mangle names like "N,N-diethylhydroxylamine".
export function extractSynonym(doc) {
    const value = extractSynonymsText(doc);
    return value ? value.split(/\s*[,;]\s+/)[0].trim() : null;
}
```

- [ ] **Step 6: Add the page accessor**

Append to `src/content/api/molecule-page.js`, and add `extractSynonymsText` to its existing import from `./molecule-image.js`:

```js
// All of the molecule's synonyms, exactly as CDD joined them. Same contract
// as getMoleculeSynonym: resolves null when the molecule has none, REJECTS
// when the page could not be loaded — a caller that remembers what it looked
// up needs to tell "no synonyms" (final) from "no answer" (worth retrying).
export async function getMoleculeSynonymsText(vaultId, moleculeId) {
    return extractSynonymsText(await getMoleculePage(vaultId, moleculeId));
}
```

- [ ] **Step 7: Build and confirm nothing regressed**

```bash
npm run build
```

Expected: build succeeds. Ask the user to reload the extension and confirm the panel's existing **Synonym** field (Settings → Panel fields) still shows the first synonym on entry 2504170.

- [ ] **Step 8: Commit**

```bash
git add src/shared/pretty-name.js src/content/api/molecule-image.js src/content/api/molecule-page.js
git commit -m "Pick the shortest synonym as a molecule's pretty name"
```

---

### Task 2: The feature switch

**Files:**
- Create: `src/shared/row-name-flag.js`
- Modify: `src/options/options.html` (the fill-options card, next to the `autoFillEnabled` checkbox at ~line 466)
- Modify: `src/options/options.js` (next to `initAutoFillUI`, ~line 825)
- Modify: `src/content/main.js` (init block, next to `initShowProducts()` at ~line 227)

**Interfaces:**
- Produces: `ROW_NAME_STORAGE_KEY = "cddFillRowName"`, `getFillRowName() -> Promise<boolean>`, `saveFillRowName(value) -> Promise<void>`, `isFillRowNameEnabled() -> boolean` (sync, cached), `onFillRowNameChanged(cb) -> unsubscribe`, `initFillRowName() -> Promise<boolean>`. Used by Tasks 4 and 6.

- [ ] **Step 1: Write the flag module**

Create `src/shared/row-name-flag.js` — the same shape as `show-products-flag.js`, which both contexts already load:

```js
// shared/row-name-flag.js — opt-in filling of a stoichiometry row's Name
// field from the molecule's shortest synonym, plus the memory of names the
// user types by hand. DOM-free; options page uses the async pair, the
// content script the sync cache.
//
// While this is off NOTHING happens: no molecule page is fetched, no offer
// is computed, and no typed name is remembered.

export const ROW_NAME_STORAGE_KEY = "cddFillRowName";

export async function getFillRowName() {
    try {
        const result = await chrome.storage.local.get(ROW_NAME_STORAGE_KEY);
        return result?.[ROW_NAME_STORAGE_KEY] === true;
    } catch {
        return false;
    }
}

export async function saveFillRowName(value) {
    try {
        await chrome.storage.local.set({ [ROW_NAME_STORAGE_KEY]: value === true });
    } catch {
        // Orphaned content script — nothing useful to do.
    }
}

let cached = false;
let listenerAttached = false;
const changeListeners = new Set();

function notify() {
    for (const cb of changeListeners) {
        try {
            cb(cached);
        } catch {
            /* a misbehaving listener must not break the others */
        }
    }
}

export function isFillRowNameEnabled() {
    return cached;
}

export function onFillRowNameChanged(cb) {
    changeListeners.add(cb);
    return () => changeListeners.delete(cb);
}

export async function initFillRowName() {
    if (!listenerAttached && chrome?.storage?.onChanged) {
        listenerAttached = true;
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== "local" || !changes[ROW_NAME_STORAGE_KEY]) return;
            cached = changes[ROW_NAME_STORAGE_KEY].newValue === true;
            notify();
        });
    }
    cached = await getFillRowName();
    notify();
    return cached;
}
```

- [ ] **Step 2: Add the checkbox to the options page**

In `src/options/options.html`, directly after the `autoFillEnabled` label (the one ending `Every write goes through CDD's own editor and autosave.</span></label>`):

```html
                <label class="field-item auto-fill-toggle">
                    <input type="checkbox" id="fillRowName" />
                    <span><strong>Fill row name from synonym</strong> — offer the
                    molecule's shortest synonym for a stoichiometry row whose
                    <em>Name</em> is still empty, and remember any name you type
                    there yourself. Off by default: each new molecule costs one
                    request for its page.</span>
                </label>
```

- [ ] **Step 3: Wire the checkbox**

In `src/options/options.js`, add `getFillRowName, saveFillRowName` to the imports and put this next to `initAutoFillUI`:

```js
const fillRowNameCheckbox = document.getElementById("fillRowName");

fillRowNameCheckbox.addEventListener("change", () => {
    saveFillRowName(fillRowNameCheckbox.checked);
});

async function initFillRowNameUI() {
    fillRowNameCheckbox.checked = await getFillRowName();
}
```

Then call `initFillRowNameUI()` from the same place `initAutoFillUI()` is called (search the file for `initAutoFillUI()` — it sits in the startup list at the bottom).

- [ ] **Step 4: Load the flag in the content script**

In `src/content/main.js`, import `initFillRowName` from `../shared/row-name-flag.js` and add to the init block, next to `initShowProducts()`:

```js
  // Row name from synonym. Off by default; nothing below it runs until the
  // flag is on. No re-render subscription here — Task 6 adds one once there
  // is something to re-render.
  initFillRowName();
```

- [ ] **Step 5: Build and check the switch**

```bash
npm run build
```

Ask the user to reload the extension, open the options page, and confirm the new checkbox appears, ticks, and survives a page reload. Nothing else should change yet.

- [ ] **Step 6: Commit**

```bash
git add src/shared/row-name-flag.js src/options/options.html src/options/options.js src/content/main.js
git commit -m "Add the row-name feature switch (off by default)"
```

---

### Task 3: The name memory

**Files:**
- Create: `src/shared/name-memory.js`
- Modify: `src/options/options.html` (new card after the *Remembered densities* card, which ends `</section>` at ~line 491)
- Modify: `src/options/options.js` (new section after `initDensityMemoryUI`, ~line 820)
- Modify: `src/options/options.css` (reuse the density-memory classes; add only the grid for the new row)
- Modify: `src/content/main.js`
- Test: throwaway `node` script in `$SCRATCH`

**Interfaces:**
- Produces: `NAME_MEMORY_STORAGE_KEY = "cddNameMemoryV1"`, `NAME_MEMORY_LIMIT = 300`.
- Produces: `sanitizeNameMemory(raw) -> Record<string, {name, moleculeName, savedAt, lastUsedAt}>` — pure, exported for the test.
- Produces: `loadNameMemory() -> Promise<map>`, `saveNameMemory(map) -> Promise<void>` — used by the options page.
- Produces: `initNameMemory() -> Promise<map>`, `getRememberedName(moleculeId) -> string | null`, `rememberName(moleculeId, name, moleculeName) -> void`, `forgetName(moleculeId) -> void`, `touchNameUsed(moleculeId) -> void`, `clearNameMemory() -> Promise<void>`, `onNameMemoryChanged(cb) -> unsubscribe` — used by Tasks 4 and 6.

- [ ] **Step 1: Write the failing test**

Create `$SCRATCH/test-name-memory.mjs`:

```js
import { sanitizeNameMemory, NAME_MEMORY_LIMIT } from "./name-memory.mjs";

let failures = 0;
function eq(actual, expected, label) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures += 1;
    console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${JSON.stringify(actual)}`);
}

eq(NAME_MEMORY_LIMIT, 300, "cap is 300");

eq(sanitizeNameMemory(null), {}, "null");
eq(sanitizeNameMemory("nonsense"), {}, "not an object");
eq(sanitizeNameMemory({ "12": null }), {}, "entry not an object");

// A numeric key and a non-empty name are both required.
eq(sanitizeNameMemory({ abc: { name: "DIPEA" } }), {}, "non-numeric key dropped");
eq(sanitizeNameMemory({ "12": { name: "   " } }), {}, "blank name dropped");
eq(sanitizeNameMemory({ "12": { name: 7 } }), {}, "non-string name dropped");

eq(sanitizeNameMemory({ "12": { name: " DIPEA ", moleculeName: " RGT-0000246 ", savedAt: 5, lastUsedAt: 9 } }),
   { "12": { name: "DIPEA", moleculeName: "RGT-0000246", savedAt: 5, lastUsedAt: 9 } },
   "trims and keeps stamps");

eq(sanitizeNameMemory({ "12": { name: "DIPEA" } }),
   { "12": { name: "DIPEA", moleculeName: "", savedAt: 0, lastUsedAt: 0 } },
   "missing fields default");

eq(sanitizeNameMemory({ "12": { name: "DIPEA", savedAt: "yesterday" } }),
   { "12": { name: "DIPEA", moleculeName: "", savedAt: 0, lastUsedAt: 0 } },
   "non-finite stamp defaults to 0");

console.log(failures ? `\n${failures} FAILURE(S)` : "\nall passed");
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
cd "$SCRATCH" && node test-name-memory.mjs
```

Expected: FAIL — `Cannot find module './name-memory.mjs'`.

- [ ] **Step 3: Write the memory module**

Create `src/shared/name-memory.js`. This is `density-memory.js` with one value and a molecule key; keep the comments that explain WHY each guard is there, because they were all paid for once already.

```js
// shared/name-memory.js
//
// SINGLE SOURCE OF TRUTH for "molecule → the name to put on its row".
//
// Imported by BOTH execution contexts, like density-memory.js:
//   - the content script  → captures typed names, offers them for fill
//   - the options page    → lists and deletes remembered entries
//
// Keep this file free of DOM access and of imports from other modules.
//
// Keyed by MOLECULE, not by batch: the name belongs to the substance, so it
// should follow it onto any batch — and product rows have no batch at all.
// There is no authoritative record to defer to (CDD has no "row name" field
// on a molecule), so unlike a remembered density this value is never
// invalidated by something better; it only ages out of the cap.

export const NAME_MEMORY_STORAGE_KEY = "cddNameMemoryV1";
export const NAME_MEMORY_LIMIT = 300;

// Normalise arbitrary stored data into a clean map
// Record<moleculeId, {name, moleculeName, savedAt, lastUsedAt}>. Used on
// every read AND write so neither context ever trusts raw storage. Pure.
export function sanitizeNameMemory(raw) {
    const out = {};
    if (!raw || typeof raw !== "object") return out;

    for (const [key, entry] of Object.entries(raw)) {
        const id = String(key).trim();
        if (!/^\d+$/.test(id)) continue;
        if (!entry || typeof entry !== "object") continue;

        const name = typeof entry.name === "string" ? entry.name.trim() : "";
        if (!name) continue;

        out[id] = {
            name,
            moleculeName:
                typeof entry.moleculeName === "string" ? entry.moleculeName.trim() : "",
            savedAt: Number.isFinite(entry.savedAt) ? entry.savedAt : 0,
            lastUsedAt: Number.isFinite(entry.lastUsedAt) ? entry.lastUsedAt : 0,
        };
    }

    return out;
}

export async function loadNameMemory() {
    try {
        const result = await chrome.storage.local.get(NAME_MEMORY_STORAGE_KEY);
        return sanitizeNameMemory(result?.[NAME_MEMORY_STORAGE_KEY]);
    } catch {
        return {};
    }
}

export async function saveNameMemory(map) {
    try {
        await chrome.storage.local.set({
            [NAME_MEMORY_STORAGE_KEY]: sanitizeNameMemory(map),
        });
    } catch {
        // An orphaned content script (the extension was reloaded while this
        // page stayed open) has no storage any more — "Extension context
        // invalidated". The fresh script in a refreshed tab persists the
        // next change.
    }
}

/* ------------------------------------------------------------------ *
 * In-memory cache (sync) — content-script render passes cannot await
 * chrome.storage, so the map lives in module scope and refreshes on
 * every storage change (which is also how options-page edits propagate
 * live to the panel).
 * ------------------------------------------------------------------ */

let cachedMemory = {};
let cacheLoaded = false;
let listenerAttached = false;
let persistScheduled = false;
const changeListeners = new Set();

function notifyChange() {
    for (const cb of changeListeners) {
        try {
            cb(cachedMemory);
        } catch {
            /* a misbehaving listener must not break the others */
        }
    }
}

// Debounced write-back (coalesces the burst of captures on first render).
function schedulePersist() {
    if (persistScheduled) return;
    persistScheduled = true;
    setTimeout(() => {
        persistScheduled = false;
        saveNameMemory(cachedMemory);
    }, 250);
}

export function getRememberedName(moleculeId) {
    return cachedMemory[String(moleculeId)]?.name || null;
}

// Upsert. Persists ONLY when the stored name actually changes — repeated
// renders of an unchanged page never churn chrome.storage.
//
// Deliberately does NOT call notifyChange(): capture runs inside a render
// pass, and a synchronous notification would re-enter the renderer and
// duplicate cards. Subscribers are notified by the chrome.storage.onChanged
// listener instead, which fires asynchronously (in the writing context too)
// after the debounced persist.
export function rememberName(moleculeId, name, moleculeName) {
    if (!cacheLoaded) return;

    const id = String(moleculeId ?? "").trim();
    if (!/^\d+$/.test(id)) return;

    const value = String(name ?? "").trim();
    if (!value) return;

    const existing = cachedMemory[id];
    if (existing?.name === value) return;

    const now = Date.now();
    const merged = {
        name: value,
        moleculeName:
            String(moleculeName ?? "").trim() || existing?.moleculeName || "",
        savedAt: existing?.savedAt || now,
        lastUsedAt: now,
    };

    // Over the cap: evict the entry with the oldest lastUsedAt (never the
    // one just written).
    const next = { ...cachedMemory, [id]: merged };
    const keys = Object.keys(next);
    if (keys.length > NAME_MEMORY_LIMIT) {
        let oldestKey = null;
        let oldestAt = Infinity;
        for (const key of keys) {
            if (key === id) continue;
            if (next[key].lastUsedAt < oldestAt) {
                oldestAt = next[key].lastUsedAt;
                oldestKey = key;
            }
        }
        if (oldestKey) delete next[oldestKey];
    }

    cachedMemory = next;
    schedulePersist();
}

// Same no-notify rule as rememberName (see above).
export function forgetName(moleculeId) {
    if (!cacheLoaded) return;

    const id = String(moleculeId ?? "").trim();
    if (!cachedMemory[id]) return;

    const next = { ...cachedMemory };
    delete next[id];
    cachedMemory = next;
    schedulePersist();
}

// A successful fill from memory refreshes the entry's LRU stamp.
export function touchNameUsed(moleculeId) {
    if (!cacheLoaded) return;

    const id = String(moleculeId);
    const entry = cachedMemory[id];
    if (!entry) return;

    cachedMemory = { ...cachedMemory, [id]: { ...entry, lastUsedAt: Date.now() } };
    schedulePersist();
}

export async function clearNameMemory() {
    cachedMemory = {};
    await saveNameMemory({});
    // Subscribers hear about it via chrome.storage.onChanged.
}

export function onNameMemoryChanged(cb) {
    changeListeners.add(cb);
    return () => changeListeners.delete(cb);
}

export async function initNameMemory() {
    if (!listenerAttached && chrome?.storage?.onChanged) {
        listenerAttached = true;
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== "local" || !changes[NAME_MEMORY_STORAGE_KEY]) return;
            cachedMemory = sanitizeNameMemory(changes[NAME_MEMORY_STORAGE_KEY].newValue);
            notifyChange();
        });
    }

    cachedMemory = await loadNameMemory();
    cacheLoaded = true;
    notifyChange();
    return cachedMemory;
}
```

- [ ] **Step 4: Run the test and make sure it passes**

```bash
cp src/shared/name-memory.js "$SCRATCH/name-memory.mjs" && cd "$SCRATCH" && node test-name-memory.mjs
```

Expected: every line `ok`, final line `all passed`.

- [ ] **Step 5: Add the options card**

In `src/options/options.html`, after the *Remembered densities* `</section>` and before the `col-hplc-heading` section:

```html
        <section class="card" aria-labelledby="col-names-heading">
            <header class="card__head">
                <span class="tile" aria-hidden="true">
                    <span class="tile__no"></span>
                    <span class="tile__sym">Nm</span>
                </span>
                <div class="card__titles">
                    <h3 class="card__name" id="col-names-heading">Remembered names</h3>
                </div>
            </header>

            <div class="card__body">
                <p class="note">
                    Names you typed into a stoichiometry row's <em>Name</em> field,
                    remembered per molecule. They are offered ahead of the
                    molecule's shortest synonym, on every row that molecule
                    appears in.
                </p>
            </div>

            <div class="card__body card__body--scroll">
                <p class="density-memory-count">
                    <span id="nameMemoryCount">0</span> / 300 remembered
                </p>
                <div id="nameMemoryList" class="stack"></div>
                <p id="nameMemoryEmpty" class="empty" hidden>
                    Nothing remembered yet. Switch on <em>Fill row name from
                    synonym</em> and type a name into a stoichiometry row.
                </p>
                <button id="nameMemoryClear" type="button" class="btn btn--quiet" hidden>
                    Clear all
                </button>
            </div>
        </section>
```

- [ ] **Step 6: Render the card**

In `src/options/options.js`, import `loadNameMemory, saveNameMemory` from `../shared/name-memory.js` and add after `initDensityMemoryUI`:

```js
/* ==================================================== 5b · Remembered names */

const nameListEl = document.getElementById("nameMemoryList");
const nameCountEl = document.getElementById("nameMemoryCount");
const nameEmptyEl = document.getElementById("nameMemoryEmpty");
const nameClearBtn = document.getElementById("nameMemoryClear");

function createNameRow(moleculeId, entry) {
    const wrapper = document.createElement("div");
    wrapper.className = "name-memory-item";

    const molecule = document.createElement("span");
    molecule.className = "density-memory-name";
    molecule.textContent = entry.moleculeName || `molecule #${moleculeId}`;
    molecule.title = `Molecule id ${moleculeId}`;

    const value = document.createElement("span");
    value.className = "density-memory-value";
    value.textContent = entry.name;
    value.title = "Row name";

    const saved = document.createElement("span");
    saved.className = "density-memory-date";
    saved.textContent = entry.savedAt
        ? new Date(entry.savedAt).toLocaleDateString()
        : "";

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "density-memory-delete";
    deleteBtn.setAttribute("aria-label", `Forget the name for ${molecule.textContent}`);
    deleteBtn.textContent = "✕";
    deleteBtn.addEventListener("click", async () => {
        const map = await loadNameMemory();
        delete map[moleculeId];
        await saveNameMemory(map);
        renderNameMemory(map);
    });

    wrapper.append(molecule, value, saved, deleteBtn);
    return wrapper;
}

function renderNameMemory(map) {
    // Newest first — the list is a working set, not an archive.
    const entries = Object.entries(map).sort(
        (a, b) => (b[1].savedAt || 0) - (a[1].savedAt || 0)
    );

    nameListEl.replaceChildren();
    for (const [moleculeId, entry] of entries) {
        nameListEl.appendChild(createNameRow(moleculeId, entry));
    }

    nameCountEl.textContent = String(entries.length);
    nameEmptyEl.hidden = entries.length > 0;
    nameClearBtn.hidden = entries.length === 0;
}

nameClearBtn.addEventListener("click", async () => {
    const count = nameListEl.children.length;
    if (!confirm(`Forget all ${count} remembered names?`)) return;
    await saveNameMemory({});
    renderNameMemory({});
});

async function initNameMemoryUI() {
    renderNameMemory(await loadNameMemory());
}
```

Call `initNameMemoryUI()` from the same startup list that calls `initDensityMemoryUI()`.

- [ ] **Step 7: Style the row**

In `src/options/options.css`, find the `.density-memory-item` rule (it is a grid) and add next to it:

```css
/* Same row furniture as a remembered density, one value column instead of
   four. */
.name-memory-item {
    display: grid;
    grid-template-columns: 1fr auto auto auto;
    gap: 8px;
    align-items: center;
    padding: 6px 0;
}
```

If `.density-memory-item` turns out to set colours, borders or font sizes that the new row also needs, extend its selector to `.density-memory-item, .name-memory-item` rather than copying the declarations.

- [ ] **Step 8: Load the memory in the content script**

In `src/content/main.js`, import `initNameMemory, onNameMemoryChanged` from `../shared/name-memory.js` and add next to the `initDensityMemory()` block:

```js
  // Remembered row names: load the molecule->name map, then re-render the
  // panel whenever it changes in any context (typing on another tab,
  // deleting from the options page) so fill offers appear/disappear live.
  initNameMemory().then(() => {
    onNameMemoryChanged(() => renderFromState());
  });
```

- [ ] **Step 9: Build and check the card**

```bash
npm run build
```

Ask the user to reload the extension and open the options page. Expected: a **Remembered names** card reading `0 / 300 remembered` with the empty note, no *Clear all* button, and no layout damage to the *Remembered densities* card above it.

- [ ] **Step 10: Commit**

```bash
git add src/shared/name-memory.js src/options/options.html src/options/options.js src/options/options.css src/content/main.js
git commit -m "Remember a typed row name per molecule, 300 entries"
```

---

### Task 4: Capture what the user types

**Files:**
- Modify: `src/inject/parsers/sample-data.js` (the `output.push({...})` block, next to `tableDensity` at ~line 178)
- Create: `src/content/features/name-capture.js`
- Modify: `src/content/message-router.js` (the `SAMPLE_DATA` case, ~line 35)

**Interfaces:**
- Consumes: `isFillRowNameEnabled()` (Task 2), `rememberName(moleculeId, name, moleculeName)` (Task 3).
- Produces: sample field `tableName: string | null` — the row's current Name, used by Task 6.
- Produces: `captureRowNames(samples) -> void` — called on every `SAMPLE_DATA` payload.

- [ ] **Step 1: Carry the row's name in the payload**

In `src/inject/parsers/sample-data.js`, inside the `output.push({ ... })` object, directly after the `tableSolvent` line:

```js
            // The row's free-text Name — the label CDD prints above the
            // molecule-batch id. A row-level string, NOT under userInput
            // (verified on the live eln/v2 payload: `name: "DIPEA"`), absent
            // when the field is empty. Called tableName because `name` below
            // is already the composed sample/batch identifier the DOM search
            // keys on.
            tableName: row?.name != null && row.name !== "" ? String(row.name) : null,
```

- [ ] **Step 2: Write the capture feature**

Create `src/content/features/name-capture.js`:

```js
// content/features/name-capture.js
//
// Remembers a row Name the user types, so the same molecule is offered it
// again everywhere else.
//
// THE BASELINE RULE. Only a name that CHANGES while the page is open is
// remembered. The first payload after a load is a baseline and teaches this
// module nothing.
//
// Why: an old ELN is full of one-off row labels — entry 2504170 carries
// MR-0256, MR-0265-B, MR-0266-B, which name that experiment's fractions, not
// the molecule. Capturing whatever an opened entry happens to hold would
// turn every such label into an offer on unrelated future rows. A name typed
// with the panel open is, by contrast, exactly the correction the feature
// exists to reuse.
//
// Role-agnostic on purpose: products included. Products get no fill OFFER
// (they are display-only in the panel), but if someone writes a name on a
// product row it is still a name that molecule answers to.

import { isFillRowNameEnabled } from "../../shared/row-name-flag.js";
import { rememberName } from "../../shared/name-memory.js";

// `${reactionIndex}:${rowUid ?? batchId}` -> the name the row had when this
// page load first saw it (empty string for "had none").
const baseline = new Map();
let baselineHref = null;

function rowKey(sample) {
    return `${sample.reactionIndex}:${sample.rowUid ?? sample.batchId}`;
}

export function captureRowNames(samples) {
    if (!isFillRowNameEnabled()) return;
    if (!Array.isArray(samples)) return;

    // New entry (full load or Turbo navigation): start a fresh baseline.
    if (baselineHref !== location.href) {
        baselineHref = location.href;
        baseline.clear();
    }

    for (const sample of samples) {
        if (!sample?.moleculeId) continue;

        const key = rowKey(sample);
        const current = sample.tableName != null ? String(sample.tableName).trim() : "";

        if (!baseline.has(key)) {
            // First sighting of this row: record what it already said and
            // stop. A row ADDED while working starts out with no name, so
            // its baseline is "" and the name typed next is a change.
            baseline.set(key, current);
            continue;
        }

        if (current === baseline.get(key)) continue;

        baseline.set(key, current);
        // Clearing a name is not a name — nothing to remember, and nothing
        // to unlearn either (the previous value may still be right).
        if (!current) continue;

        rememberName(sample.moleculeId, current, sample.moleculeName);
    }
}
```

- [ ] **Step 3: Call it on every payload**

In `src/content/message-router.js`, import `captureRowNames` from `./features/name-capture.js` and add it to the `SAMPLE_DATA` case, after `renderFromState()`:

```js
        case EVENTS.SAMPLE_DATA: {
            STATE.lastPayload = data.payload || null;
            renderFromState();
            captureRowNames(STATE.lastPayload?.samples);
            enrichBatchOnlySamples();
            enrichSampleSynonyms();
            onSamplePayload();
            break;
        }
```

- [ ] **Step 4: Build**

```bash
npm run build
```

- [ ] **Step 5: Verify live**

Ask the user to reload the extension, refresh entry 2504170, and:

1. With the checkbox **off**, type a name into a row → options page shows `0 / 300`. Nothing is captured while the feature is off.
2. Tick the checkbox, refresh, and open the entry **without touching anything** → still `0 / 300`. The old `MR-0256` labels must NOT appear; that is the baseline rule working.
3. Now type a name into a row (any row, product rows included) → the molecule appears in **Remembered names** within a second, with the `PHA-…`/`RGT-…` code as its label.
4. Change that same name again → the entry updates rather than duplicating.

- [ ] **Step 6: Commit**

```bash
git add src/inject/parsers/sample-data.js src/content/features/name-capture.js src/content/message-router.js
git commit -m "Capture a row name the user types, once it changes on screen"
```

---

### Task 5: Write a name into the table

**Files:**
- Modify: `src/content/features/row-fill.js` (`isEditModeRow` at ~line 84; new fill after `fillDensityIntoTable`, ~line 548)
- Modify: `docs/cdd-integration-notes.md` (the stoichiometry-table DOM section, ~line 60)

**Interfaces:**
- Produces: `fillNameIntoTable(sample, value) -> Promise<{ ok: true } | { ok: false, reason: string }>` — used by Task 6.

- [ ] **Step 1: Fix the edit-mode marker before it breaks**

`isEditModeRow()` decides "this table is in edit rendering" by looking for a `<b>Name:</b>`. A row whose name is SET has no such label — so a table whose rows all have names reads as view-mode. This feature's whole job is to put names on rows, so it would erode its own helper.

Measured on entry 2504170: the `<b>` labels that appear **only** in edit mode are `Name:`, `IUPAC:`, `%w/w ratio:`, `%v/v ratio:` and `CAS-RN:`. Every other label (`FW:`, `Mass:`, `Purity:`, `Volume:` …) renders in view mode too.

Replace the function:

```js
// A row rendering the editable "Label: value" structure. NOTE (verified
// live): when a table enters edit mode, EVERY row of that table renders
// the edit labels — this marker identifies edit-mode TABLES, not the one
// clicked row, so field searches additionally need the row number.
//
// Several markers, not just "Name:", because a row whose Name is already
// SET renders the bare value with no label at all (verified on entry
// 2504170: `<span data-autotest-id="field-name">DIPEA</span>`) — and this
// feature's own fills create exactly that state. These five labels are the
// ones measured to be absent from view mode; %w/w and %v/v cover a row
// whose Name is set and which has no IUPAC name either.
const EDIT_MODE_LABELS = new Set([
    "Name:", "IUPAC:", "%w/w ratio:", "%v/v ratio:", "CAS-RN:",
]);

function isEditModeRow(tr) {
    for (const b of tr.querySelectorAll("b")) {
        if (EDIT_MODE_LABELS.has((b.textContent || "").trim())) return true;
    }
    return false;
}
```

- [ ] **Step 2: Add the name reader and the fill**

Still in `src/content/features/row-fill.js`, after `fillDensityIntoTable`:

```js
// The row's CURRENT name, or null when it has none.
//
// NOT readFieldText(tr, "Name:"): the label only exists while the field is
// EMPTY. Once a name is set, CDD renders the bare value —
// `<span data-autotest-id="field-name">DIPEA</span>` with no <b> — so the
// label the fill just clicked is gone by the time the write is confirmed.
// The same autotest id is used by the Solvent field, which DOES carry a <b>;
// that is what tells the two apart.
function readRowName(tr) {
    for (const span of tr.querySelectorAll('[data-autotest-id="field-name"]')) {
        if (span.querySelector(":scope > b")) continue;   // "Name: Optional" / "Solvent: …"
        const text = (span.textContent || "").trim();
        if (text) return text;
    }
    return null;
}

// Fill `value` into the row's Name field — the free-text label CDD prints
// above the molecule-batch id. EMPTY fields only: the link search is
// placeholderOnly, so a name that is already there is never overwritten.
//
// Not routed through writeFieldViaPopup because that helper confirms the
// write by re-reading "<b>Name:</b> value", which this field stops rendering
// the moment it has a value (see readRowName).
export async function fillNameIntoTable(sample, value) {
    value = value != null ? String(value).trim() : "";
    if (!value) return { ok: false, reason: "no name value on this card" };

    const ctx = await openRow(sample);
    if (!ctx) return { ok: false, reason: "table row not found" };

    const { container, name, rowNumber } = ctx;

    const link = await waitFor(() => {
        const tr = findTargetRow(container, name, rowNumber);
        return tr ? findFieldValueLink(tr, "Name:", true) : null;
    });
    if (!link) {
        pressEscape();
        return { ok: false, reason: "row has no empty Name field" };
    }

    mouseClick(link);

    // The popup is a MuiPaper whose whole text is the bare word "Name"
    // (verified live) — anchored, so the "Name" inside another popup's label
    // could never match it.
    const input = await waitFor(() => findEditorInput(/^\s*Name\s*$/i));
    if (!input) {
        pressEscape();
        return { ok: false, reason: "Name editor did not open" };
    }

    setNativeInputValue(input, value);
    pressEnter(input);

    const confirmed = await waitFor(() => {
        const tr = findTargetRow(container, name, rowNumber);
        if (!tr) return null;
        return valuesMatch(readRowName(tr), value) ? tr : null;
    });

    if (!confirmed) {
        pressEscape();
        return { ok: false, reason: "value did not stick" };
    }

    clickOutside(container);
    return { ok: true };
}
```

- [ ] **Step 3: Record the DOM facts**

In `docs/cdd-integration-notes.md`, in the bullet list under **The stoichiometry table DOM**, after the "Edit-row `<b>` labels" bullet:

```markdown
- **A row's Name is free text, and its label vanishes once it is set.** Empty:
  `<b>Name:</b>` + `<span data-autotest-id="missing-label">Optional</span>`.
  Set: a bare `<span data-autotest-id="field-name">DIPEA</span>`, no `<b>`,
  in edit AND view mode. So `Name:` alone is a bad edit-mode marker — the
  labels measured to be edit-mode-only are `Name:`, `IUPAC:`, `%w/w ratio:`,
  `%v/v ratio:` and `CAS-RN:`. `data-autotest-id="field-name"` is shared with
  the Solvent field, which keeps its `<b>Solvent:</b>`.
- The Name editor popup's MuiPaper text is the bare word `Name`; its input
  carries `placeholder="Name"`. In the payload the value is the row-level
  `row.name`, not `userInput.name`.
```

- [ ] **Step 4: Build**

```bash
npm run build
```

- [ ] **Step 5: Review the diff**

Nothing calls `fillNameIntoTable` yet and the bundle exposes no console hook, so this task's behaviour is verified by Task 6 step 7 — do not invent a hook to test it earlier. What IS verifiable now: the build succeeds, and the existing density/purity/concentration/solvent fills still work on entry 2504170 (the `isEditModeRow` change is the only shared code touched). Ask the user to reload and confirm one existing fill button still fills.

Then confirm by reading the diff that:

- the fill searches with `placeholderOnly = true`;
- the confirm reads `readRowName`, not `readFieldText`;
- `EDIT_MODE_LABELS` contains all five labels.

- [ ] **Step 6: Commit**

```bash
git add src/content/features/row-fill.js docs/cdd-integration-notes.md
git commit -m "Write a row Name through CDD's editor, and fix the edit-mode marker"
```

---

### Task 6: Offer the name

**Files:**
- Create: `src/content/features/name-enrichment.js`
- Modify: `src/content/features/fill-offers.js` (`computeFillOffers`, `offerUsesMemory`, `runFillOffer`, `markOfferFilled`)
- Modify: `src/content/features/sample-panel.js` (`buildFillButton` ~line 1006, the click handler ~line 1057, `runAllOffers` ~line 1098)
- Modify: `src/content/features/auto-fill.js` (the `touchValueUsed` call, ~line 107)
- Modify: `src/content/message-router.js`
- Modify: `src/content/main.js`

**Interfaces:**
- Consumes: `pickPrettyName` (Task 1), `getMoleculeSynonymsText` (Task 1), `isFillRowNameEnabled`/`onFillRowNameChanged` (Task 2), `getRememberedName`/`touchNameUsed` (Task 3), `fillNameIntoTable` (Task 5).
- Produces: `enrichRowNameSynonyms() -> void` and `getPrettyName(moleculeId) -> string | null` (sync, from the session cache) — used by `fill-offers.js`.
- Produces: `initRowNameEnrichment() -> void` — called once from `main.js`.

- [ ] **Step 1: Write the enrichment**

Create `src/content/features/name-enrichment.js`:

```js
// content/features/name-enrichment.js
//
// Keeps a per-session map moleculeId -> shortest synonym, so the offer in
// fill-offers.js can be computed synchronously inside a render pass.
//
// Modelled on synonym-enrichment.js, with two differences: the value is the
// SHORTEST synonym rather than the first, and it is not written onto the
// sample (no panel field shows it) but held here, because the offer is the
// only consumer.
//
// Gated on the row-name checkbox: with the feature off, not a single
// molecule page is requested.

import { STATE } from "../state.js";
import { renderFromState } from "./sample-panel.js";
import { detectVaultId } from "../api/molecule-image.js";
import { getMoleculeSynonymsText } from "../api/molecule-page.js";
import { pickPrettyName } from "../../shared/pretty-name.js";
import {
    isFillRowNameEnabled,
    onFillRowNameChanged,
} from "../../shared/row-name-flag.js";

// moleculeId -> string | null. A stored null means "asked, has none" — a
// final answer, not a reason to ask again.
const prettyNames = new Map();
const inFlight = new Set();

export function getPrettyName(moleculeId) {
    return prettyNames.get(String(moleculeId)) ?? null;
}

// Ticking the checkbox should fill in the panel that is already open, not the
// next one. Safe to call once at content-script startup.
export function initRowNameEnrichment() {
    onFillRowNameChanged(() => {
        enrichRowNameSynonyms();
        renderFromState();
    });
}

export function enrichRowNameSynonyms() {
    if (!isFillRowNameEnabled()) return;

    const samples = STATE.lastPayload?.samples;
    if (!Array.isArray(samples) || !samples.length) return;

    // The molecule's HOME vault may differ from the entry's; the server
    // redirects and fetch() follows it, so the page's own vault is enough.
    const vaultId = detectVaultId();
    if (!vaultId) return;

    const wanted = new Set();
    for (const sample of samples) {
        if (!sample?.moleculeId) continue;
        if (sample.isProduct || sample.isMention) continue;   // no offer, no fetch
        const id = String(sample.moleculeId);
        if (prettyNames.has(id) || inFlight.has(id)) continue;
        wanted.add(id);
    }
    if (!wanted.size) return;

    const payloadAtStart = STATE.lastPayload;

    Promise.all(
        Array.from(wanted, async (moleculeId) => {
            inFlight.add(moleculeId);
            try {
                const text = await getMoleculeSynonymsText(vaultId, moleculeId);
                prettyNames.set(moleculeId, pickPrettyName(text));
                return prettyNames.get(moleculeId) != null;
            } catch {
                // The page did not load. Leave the molecule unrecorded so the
                // next payload retries — molecule-page.js drops failures from
                // its cache for exactly this.
                return false;
            } finally {
                inFlight.delete(moleculeId);
            }
        })
    ).then((results) => {
        if (!results.some(Boolean)) return;
        // Re-render only if what was enriched is still what is on screen.
        if (STATE.lastPayload === payloadAtStart) renderFromState();
    });
}
```

- [ ] **Step 2: Add the offer**

In `src/content/features/fill-offers.js`:

Add to the imports:

```js
import { getRememberedName, touchNameUsed } from "../../shared/name-memory.js";
import { isFillRowNameEnabled } from "../../shared/row-name-flag.js";
import { getPrettyName } from "./name-enrichment.js";
import { fillNameIntoTable } from "./row-fill.js";
```

Inside `computeFillOffers`, as the FIRST offer considered (a row reads better with a name than without, and *Fill all* runs offers in order):

```js
    // The row's free-text Name. Unlike every other field there is no
    // authoritative record to prefer — the synonym is a guess, and a name
    // the user typed before is the better guess, so MEMORY WINS HERE.
    if (isFillRowNameEnabled() && sample?.moleculeId && !has(sample?.tableName)) {
        const remembered = getRememberedName(sample.moleculeId);
        const synonym = getPrettyName(sample.moleculeId);
        if (remembered) {
            offers.push({ field: "name", value: remembered, source: "memory" });
        } else if (synonym) {
            offers.push({ field: "name", value: synonym, source: "synonym" });
        }
    }
```

Extend `runFillOffer`'s switch:

```js
        case "name":
            return fillNameIntoTable(sample, offer.value);
```

Extend `markOfferFilled`:

```js
    if (offer.field === "name") sample.tableName = String(offer.value);
```

`offerUsesMemory` already returns true for `source === "memory"` — leave it.

- [ ] **Step 3: Touch the right memory after a fill**

Three call sites currently do `if (offerUsesMemory(offer)) touchValueUsed(sample.batchId);` — the panel button (`sample-panel.js` ~line 1057), *Fill all* (~line 1098) and auto-fill (`auto-fill.js` ~line 107). A name lives in a different map, keyed by molecule. Add a shared helper in `fill-offers.js` and use it at all three sites:

```js
// A successful fill from memory refreshes that entry's LRU stamp — in
// whichever memory the value came out of. The name memory is keyed by
// molecule, every other value by batch.
export function touchOfferMemory(sample, offer) {
    if (!offerUsesMemory(offer)) return;
    if (offer.field === "name") touchNameUsed(sample.moleculeId);
    else touchValueUsed(sample.batchId);
}
```

`fill-offers.js` must then import `touchValueUsed` from `../../shared/density-memory.js` (it currently imports only `getRememberedValues`). At each of the three call sites, replace the `if (offerUsesMemory(offer)) touchValueUsed(...)` line with:

```js
                    touchOfferMemory(sample, offer);
```

and drop the now-unused `offerUsesMemory` / `touchValueUsed` imports from `sample-panel.js` and `auto-fill.js` if nothing else there uses them.

- [ ] **Step 4: Word the button**

In `sample-panel.js`, `buildFillButton` builds its label from `offer.field`, which yields "Fill name (DIPEA) into table" — correct as it stands. The memory tooltip, however, says "for this batch", which is wrong for a name. Change the two memory strings to branch:

```js
    btn.title =
        offer.source === "memory"
            ? offer.field === "name"
                ? "Writes the name you previously typed for this molecule into the row, exactly as if you typed it."
                : `Writes the ${offer.field} you previously typed for this batch into the row, exactly as if you typed it.`
            : `Writes this ${offer.field} into the row, exactly as if you typed it.`;
```

and the `ⓘ` mark's tooltip:

```js
        mark.title =
            offer.field === "name"
                ? "This name is remembered from what you typed before — CDD has no field to save it in, so the extension keeps it."
                : `This ${offer.field} is remembered from what you typed before — it is not ` +
                  `saved on the batch or sample record. Add it there and it will fill in ` +
                  `automatically from then on.`;
```

- [ ] **Step 5: Run the enrichment on every payload**

In `src/content/message-router.js`, import `enrichRowNameSynonyms` from `./features/name-enrichment.js` and add it next to `enrichSampleSynonyms()` in the `SAMPLE_DATA` case:

```js
            enrichSampleSynonyms();
            enrichRowNameSynonyms();
```

In `src/content/main.js`, import and call `initRowNameEnrichment()` next to `initSynonymEnrichment()`.

- [ ] **Step 6: Build**

```bash
npm run build
```

- [ ] **Step 7: Verify live — the whole feature**

Ask the user to reload the extension and refresh entry 2504170, then walk the spec's list:

1. Checkbox **off**: DevTools → Network, filter `molecules/` — no requests, and no name buttons on any card.
2. Checkbox **on**: the panel re-renders and cards for rows with an empty Name grow `⤵ Fill name (…) into table`. The `RGT-0000246` card must offer **DIPEA**, `RGT-0000204` must offer **HATU**.
3. Click one: the row's Name reads that value, the button says `✓ name filled`, and the offer is gone on the next render.
4. A row that already has a name (`PPH3333`) gets no button.
5. Product cards get no button; mention cards get no button.
6. `PHA-0333476` (no synonyms) gets no button until a name is remembered for it.
7. Type a different name over a filled one → **Remembered names** picks it up, and the same molecule on another entry now offers the typed name with the `ⓘ` mark, not the synonym.
8. *Fill all* includes the name offers in its count and fills them.
9. Add a NEW row for a molecule with a synonym while the experimental auto-fill checkbox is on → its name fills without a click. Reload the page and confirm an OLD row's name is never filled on its own.

- [ ] **Step 8: Commit**

```bash
git add src/content/features/name-enrichment.js src/content/features/fill-offers.js src/content/features/sample-panel.js src/content/features/auto-fill.js src/content/message-router.js src/content/main.js
git commit -m "Offer a row name: remembered first, shortest synonym second"
```

---

### Task 7: Release

**Files:**
- Modify: `manifest.json`
- Modify: `CHANGELOG.md`
- Modify: `RELEASES.md`

Follow `CLAUDE.md`. `RELEASES.md` is the public *What's new* page: short, factual, imperative, one screen, and it names the path for anything that has to be switched on.

- [ ] **Step 1: Bump the version**

`manifest.json` `14.12.0` → `14.13.0` (a new feature, no breaking change).

- [ ] **Step 2: Write the changelog entry**

At the top of `CHANGELOG.md`, in the file's existing style, under `## 14.13.0 — <the date the release commit is made, ISO>`. It may explain why: the Name field is free text CDD never fills, the shortest synonym matched the names the user was already typing by hand, memory is keyed by molecule because a name belongs to the substance, capture is limited to changes seen on screen so old one-off row labels are not learned, and the edit-mode marker had to widen because a filled Name removes the `Name:` label the old marker relied on.

- [ ] **Step 3: Write the What's new entry**

At the top of `RELEASES.md`:

The heading carries the date the release commit is made, ISO, matching `CHANGELOG.md`:

```markdown
## 14.13.0 — 2026-08-22

Stoichiometry rows can now name themselves. Switch on *Settings → Fill row
name from synonym*, and a row whose **Name** is still empty offers the
molecule's shortest synonym — DIPEA rather than N,N-Diisopropylethylamine.

- Click `⤵ Fill name` on the card, or let *Fill all* do the whole table.
- Type your own name instead and it is remembered for that molecule, then
  offered everywhere it turns up next.
- Manage or clear what has been remembered in *Settings → Remembered names*.
- A row that already has a name is never touched.
```

- [ ] **Step 4: Rebuild**

```bash
npm run build
```

- [ ] **Step 5: Commit everything and STOP**

```bash
git add -A
git commit -m "Release 14.13.0: a row that knows its own name"
```

Tell the user the commit is ready and **wait**. Do not push the commit. Do not create or push a tag — pushing `v14.13.0` publishes to the Chrome Web Store and Firefox AMO, and that is their call, made after they have tested this build.

---

## Self-review

- **Spec coverage.** Picker → Task 1. Flag and its gating → Task 2 (used in Tasks 4 and 6). `name-memory.js` with the 300 cap → Task 3. `tableName` parser field and the baseline capture rule → Task 4. `fillNameIntoTable` → Task 5. Offer, precedence, product/mention exclusion, enrichment → Task 6. Options checkbox → Task 2; options card → Task 3. Error handling is inside the modules of Tasks 1, 3, 5 and 6. Verification steps live in Tasks 4, 6 and the spec's own list.
- **Beyond the spec, deliberately:** Task 5 also widens `isEditModeRow`. The spec did not foresee it because the DOM check that found it happened while this plan was written; it is included because this feature is what breaks the old marker. Task 5 records the finding in `docs/cdd-integration-notes.md` too.
- **Names used consistently:** `tableName`, `pickPrettyName`, `getPrettyName`, `getRememberedName`, `rememberName`, `touchNameUsed`, `fillNameIntoTable`, `captureRowNames`, `enrichRowNameSynonyms`, `isFillRowNameEnabled`, `touchOfferMemory`.
