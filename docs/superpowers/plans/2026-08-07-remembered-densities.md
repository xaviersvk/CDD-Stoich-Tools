# Remembered Densities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remember user-typed stoichiometry densities per molecule-batch ID (max 100, `chrome.storage.local`), offer them for one-click fill wherever that batch reappears without a density, and manage them from the options page.

**Architecture:** A new DOM-free shared module (`src/shared/density-memory.js`) owns the storage contract and an in-memory cache, mirroring `src/shared/prefix-colors.js`. The content script captures densities passively inside `renderSamples()` (the same hook `persistDiscoveredCustomFields` uses — it runs after every parsed payload AND after batch-field enrichment re-renders). The existing fill button gains a second value source (memory) plus an amber notice; the options page gains a management card.

**Tech Stack:** Vanilla JS browser extension (Manifest V3), Vite build, `chrome.storage.local`. No test framework exists in this repo.

**Spec:** `docs/superpowers/specs/2026-08-07-remembered-densities-design.md`

## Global Constraints

- Storage key: `cddDensityMemoryV1`; entry cap **100**; evict oldest `lastUsedAt` on overflow.
- Map key is `String(batchId)` (numeric CDD batch id); `name` field is display-only.
- Batch-field density is authoritative: its presence deletes the remembered entry.
- The fill button renders **only when a value is available** (batch field first, memory second) and the row's `tableDensity` is empty.
- Shared modules (`src/shared/*`) must stay DOM-free and import-free so they run in both the content script and the options page.
- No test suite exists: each task verifies with `npm run build` (must exit 0) plus the live walkthrough in Task 5. Do not introduce a test framework.
- All UI copy in English. Commit messages follow the repo's existing plain style.
- Release rules from CLAUDE.md apply in Task 6 (changelog, build, commit, tag `v12.4.0`, push).

---

### Task 1: Shared storage module `density-memory.js`

**Files:**
- Create: `src/shared/density-memory.js`

**Interfaces:**
- Consumes: nothing (leaf module; `chrome.storage.local` only).
- Produces (used by Tasks 2–4):
  - `DENSITY_MEMORY_STORAGE_KEY: "cddDensityMemoryV1"`, `DENSITY_MEMORY_LIMIT: 100`
  - `sanitizeDensityMemory(raw) → Record<string, {density: string, name: string, savedAt: number, lastUsedAt: number}>`
  - `loadDensityMemory(): Promise<map>` / `saveDensityMemory(map): Promise<void>`
  - `initDensityMemory(): Promise<map>` — cache + `onChanged` listener, idempotent
  - `getRememberedDensity(batchId) → entry | null` (sync, cache-backed)
  - `rememberDensity(batchId, density, name)` / `forgetDensity(batchId)` / `touchDensityUsed(batchId)` (sync cache ops, debounced persist)
  - `captureDensitiesFromSamples(samples)` — the capture rule, pure data
  - `onDensityMemoryChanged(cb) → unsubscribe`

- [ ] **Step 1: Write the module**

```js
// shared/density-memory.js
//
// SINGLE SOURCE OF TRUTH for "molecule batch → remembered density".
//
// Imported by BOTH execution contexts, like prefix-colors.js:
//   - the content script  → captures typed densities, offers them for fill
//   - the options page    → lists and deletes remembered entries
//
// Keep this file free of DOM access and of imports from other modules.
//
// A remembered density is a fallback for batches whose registration record
// has no density field value. The batch field is always authoritative: as
// soon as a parse shows the batch itself carries a density, the remembered
// entry is deleted.

export const DENSITY_MEMORY_STORAGE_KEY = "cddDensityMemoryV1";
export const DENSITY_MEMORY_LIMIT = 100;

// Normalise an arbitrary stored value into a clean map
// Record<batchId, {density, name, savedAt, lastUsedAt}>. Used on every read
// AND write so neither context ever trusts raw storage. Pure.
export function sanitizeDensityMemory(raw) {
    const out = {};
    if (!raw || typeof raw !== "object") return out;

    for (const [key, entry] of Object.entries(raw)) {
        const id = String(key).trim();
        if (!/^\d+$/.test(id)) continue;
        if (!entry || typeof entry !== "object") continue;

        const density = typeof entry.density === "string" ? entry.density.trim() : "";
        if (!density) continue;

        out[id] = {
            density,
            name: typeof entry.name === "string" ? entry.name.trim() : "",
            savedAt: Number.isFinite(entry.savedAt) ? entry.savedAt : 0,
            lastUsedAt: Number.isFinite(entry.lastUsedAt) ? entry.lastUsedAt : 0,
        };
    }

    return out;
}

export async function loadDensityMemory() {
    try {
        const result = await chrome.storage.local.get(DENSITY_MEMORY_STORAGE_KEY);
        return sanitizeDensityMemory(result?.[DENSITY_MEMORY_STORAGE_KEY]);
    } catch {
        return {};
    }
}

export async function saveDensityMemory(map) {
    await chrome.storage.local.set({
        [DENSITY_MEMORY_STORAGE_KEY]: sanitizeDensityMemory(map),
    });
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
        saveDensityMemory(cachedMemory);
    }, 250);
}

export function getRememberedDensity(batchId) {
    const entry = cachedMemory[String(batchId)];
    return entry || null;
}

// Upsert. Writes storage ONLY when density or name actually changed, so
// repeated renders of an unchanged page never churn chrome.storage.
//
// Deliberately does NOT call notifyChange(): capture runs inside a render
// pass, and a synchronous notification would re-enter the renderer and
// duplicate cards. Subscribers are notified by the chrome.storage.onChanged
// listener instead, which fires asynchronously (in the writing context too)
// after the debounced persist.
export function rememberDensity(batchId, density, name) {
    if (!cacheLoaded) return;

    const id = String(batchId ?? "").trim();
    const value = String(density ?? "").trim();
    if (!/^\d+$/.test(id) || !value) return;

    const label = String(name ?? "").trim();
    const existing = cachedMemory[id];
    if (existing && existing.density === value && existing.name === label) return;

    const now = Date.now();
    const next = {
        ...cachedMemory,
        [id]: {
            density: value,
            name: label,
            savedAt: existing?.savedAt || now,
            lastUsedAt: now,
        },
    };

    // Over the cap: evict the entry with the oldest lastUsedAt (never the
    // one just written).
    const keys = Object.keys(next);
    if (keys.length > DENSITY_MEMORY_LIMIT) {
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

// Same no-notify rule as rememberDensity (see above).
export function forgetDensity(batchId) {
    if (!cacheLoaded) return;

    const id = String(batchId ?? "").trim();
    if (!Object.prototype.hasOwnProperty.call(cachedMemory, id)) return;

    const next = { ...cachedMemory };
    delete next[id];
    cachedMemory = next;
    schedulePersist();
}

// A successful fill from memory refreshes the entry's LRU stamp.
export function touchDensityUsed(batchId) {
    if (!cacheLoaded) return;

    const entry = cachedMemory[String(batchId)];
    if (!entry) return;

    cachedMemory = {
        ...cachedMemory,
        [String(batchId)]: { ...entry, lastUsedAt: Date.now() },
    };
    schedulePersist();
}

export async function clearDensityMemory() {
    cachedMemory = {};
    await saveDensityMemory({});
    // Subscribers hear about it via chrome.storage.onChanged.
}

/**
 * captureDensitiesFromSamples(samples) — THE capture rule, run after every
 * payload parse / enrichment re-render. For each row with a batchId:
 *
 *   - batch-field density present → forget the remembered entry (the batch
 *     record is authoritative and the slot is freed);
 *   - else a user-typed table density present → remember it — but for
 *     batch-only rows only AFTER enrichment has run (batchFieldsEnriched),
 *     otherwise we would briefly remember a density that IS on the batch,
 *     just not fetched yet. Rows with a sample carry their batch fields
 *     from the payload itself, so they capture immediately.
 *
 * All writes funnel through rememberDensity/forgetDensity, which no-op on
 * unchanged data — calling this on every render is safe.
 */
export function captureDensitiesFromSamples(samples) {
    if (!cacheLoaded || !Array.isArray(samples)) return;

    for (const sample of samples) {
        if (!sample?.batchId) continue;

        const batchDensity =
            sample.density != null && String(sample.density).trim() !== "";
        const tableDensity =
            sample.tableDensity != null && String(sample.tableDensity).trim() !== "";

        if (batchDensity) {
            forgetDensity(sample.batchId);
        } else if (
            tableDensity &&
            (sample.hasSample !== false || sample.batchFieldsEnriched === true)
        ) {
            rememberDensity(sample.batchId, String(sample.tableDensity), sample.name);
        }
    }
}

export function onDensityMemoryChanged(cb) {
    changeListeners.add(cb);
    return () => changeListeners.delete(cb);
}

/**
 * initDensityMemory() — call once at startup (content script AND options
 * page). Attaches a one-time chrome.storage.onChanged listener, loads the
 * map into the cache, notifies subscribers. Idempotent.
 */
export async function initDensityMemory() {
    if (!listenerAttached && chrome?.storage?.onChanged) {
        listenerAttached = true;
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== "local" || !changes[DENSITY_MEMORY_STORAGE_KEY]) return;
            cachedMemory = sanitizeDensityMemory(
                changes[DENSITY_MEMORY_STORAGE_KEY].newValue
            );
            notifyChange();
        });
    }

    cachedMemory = await loadDensityMemory();
    cacheLoaded = true;
    notifyChange();
    return cachedMemory;
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: exit 0 (module compiles; nothing imports it yet).

- [ ] **Step 3: Commit**

```bash
git add src/shared/density-memory.js
git commit -m "Add density-memory: chrome.storage map of batch id -> remembered density"
```

---

### Task 2: Capture + init wiring in the content script

**Files:**
- Modify: `src/content/features/sample-panel.js` (imports; top of `renderSamples()`)
- Modify: `src/content/main.js` (init call next to `initPrefixColorCache()`, line ~139)

**Interfaces:**
- Consumes: `captureDensitiesFromSamples`, `initDensityMemory`, `onDensityMemoryChanged` from Task 1.
- Produces: capture runs on every `renderSamples()`; panel re-renders on any memory change (so options-page deletions reflect live).

- [ ] **Step 1: Call capture from `renderSamples()`**

In `src/content/features/sample-panel.js`, extend the density-fill import (line ~4) and call the capture right after `persistDiscoveredCustomFields(samples)` (line ~727):

```js
import { fillDensityIntoTable } from "./density-fill.js";
import {
    captureDensitiesFromSamples,
    getRememberedDensity,
    touchDensityUsed,
} from "../../shared/density-memory.js";
```

```js
    persistDiscoveredCustomFields(samples);
    // Passive capture: remember user-typed densities for batches that lack
    // one, drop entries whose batch now carries its own. No-ops when
    // nothing changed, so the enrichment re-render can't loop storage.
    captureDensitiesFromSamples(samples);
```

(`getRememberedDensity` / `touchDensityUsed` are used in Task 3; importing them now keeps this edit single-touch.)

- [ ] **Step 2: Init + live re-render in `main.js`**

Next to the existing `initPrefixColorCache();` call (line ~139):

```js
import { initDensityMemory, onDensityMemoryChanged } from "../shared/density-memory.js";
```

```js
  initPrefixColorCache();
  initDensityMemory().then(() => {
    // Re-offer/remove fill buttons when the memory changes in any context
    // (typing on another tab, deleting from the options page).
    onDensityMemoryChanged(() => renderFromState());
  });
```

`renderFromState` is already imported in `main.js`.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/content/features/sample-panel.js src/content/main.js
git commit -m "Capture typed stoichiometry densities into density-memory on every parse"
```

---

### Task 3: Offer remembered densities on panel cards

**Files:**
- Modify: `src/content/features/density-fill.js:183-190` (signature takes the value)
- Modify: `src/content/features/sample-panel.js` (`buildDensityFillButton`, offer condition in `renderSamples()`, notice styles)

**Interfaces:**
- Consumes: `getRememberedDensity(batchId)`, `touchDensityUsed(batchId)` (imported in Task 2), `fillDensityIntoTable(sample, value)` (changed here).
- Produces: `buildDensityFillButton(sample, value, source)` where `source` is `"batch" | "memory"`; CSS class `cdd-density-memory-note`.

- [ ] **Step 1: `fillDensityIntoTable` takes the value explicitly**

In `src/content/features/density-fill.js`, change the function head (lines 183–187):

```js
// Fill `value` into the sample's stoichiometry row.
// Returns { ok: true } or { ok: false, reason }.
export async function fillDensityIntoTable(sample, value) {
    value = value != null ? String(value).trim() : "";
    if (!value) return { ok: false, reason: "no density value on this card" };
```

(The rest of the function already uses the local `value`; no other change.)

- [ ] **Step 2: Two-source button in `sample-panel.js`**

Replace `buildDensityFillButton` (lines ~641–676) with:

```js
// "Fill density into table" — offered on any card whose stoichiometry row
// is missing a density we can supply: from the registered batch's own field
// (authoritative) or, failing that, from density-memory (a value the user
// typed for this batch before). One click, one write, visible outcome; the
// DOM automation lives in density-fill.js.
function buildDensityFillButton(sample, value, source) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cdd-density-fill-btn";
    btn.textContent =
        source === "memory"
            ? `⤵ Fill remembered density (${value}) into table`
            : `⤵ Fill density (${value}) into table`;
    btn.title =
        source === "memory"
            ? "Writes the density you previously typed for this batch into the row, exactly as if you typed it."
            : "Writes this batch density into the row's Density field, exactly as if you typed it.";

    btn.addEventListener("click", async (event) => {
        // The table enters edit mode on a row click and leaves it on any
        // click outside — and this very button IS outside the table. Stop
        // the click from reaching CDD's document-level handlers, then let it
        // finish propagating before the fill sequence starts, or the edit
        // mode we just opened is closed again by our own trigger click.
        event.stopPropagation();

        btn.disabled = true;
        btn.textContent = "Filling…";

        await new Promise((resolve) => setTimeout(resolve, 60));

        const result = await fillDensityIntoTable(sample, value);

        if (result.ok) {
            sample.tableDensity = String(value);
            if (source === "memory") touchDensityUsed(sample.batchId);
            btn.textContent = "✓ Density filled";
        } else {
            btn.textContent = `✗ ${result.reason || "couldn't fill"} — edit the row manually`;
            btn.disabled = false;
        }
    });

    return btn;
}

// Amber nudge under a memory-sourced fill button: the right long-term home
// for the density is the batch record, not this extension's storage.
function buildDensityMemoryNote() {
    const note = document.createElement("div");
    note.className = "cdd-density-memory-note";
    note.textContent =
        "This density isn't saved on the batch — add it to the batch record so it fills automatically.";
    return note;
}
```

- [ ] **Step 3: Offer condition in `renderSamples()`**

Replace the current gate (lines ~820–827):

```js
            if (
                sample.hasSample === false &&
                sample.density != null &&
                sample.density !== "" &&
                (sample.tableDensity == null || sample.tableDensity === "")
            ) {
                card.appendChild(buildDensityFillButton(sample));
            }
```

with:

```js
            // Offer a density fill wherever the table row misses one and a
            // value exists — batch field first (authoritative), remembered
            // value second. Cards with neither get no button.
            const tableDensityEmpty =
                sample.tableDensity == null || String(sample.tableDensity).trim() === "";
            if (tableDensityEmpty) {
                const batchDensity =
                    sample.density != null && String(sample.density).trim() !== ""
                        ? String(sample.density)
                        : null;
                const remembered =
                    !batchDensity && sample.batchId
                        ? getRememberedDensity(sample.batchId)
                        : null;

                if (batchDensity) {
                    card.appendChild(buildDensityFillButton(sample, batchDensity, "batch"));
                } else if (remembered) {
                    card.appendChild(buildDensityFillButton(sample, remembered.density, "memory"));
                    card.appendChild(buildDensityMemoryNote());
                }
            }
```

- [ ] **Step 4: Notice styles**

In the panel's style block (after the `.cdd-density-fill-btn:disabled` rule, line ~404):

```css
  #${PANEL_ID} .cdd-density-memory-note {
    margin-top: 4px;
    font-size: 10px;
    line-height: 1.35;
    color: #f59e0b;
    opacity: 0.95;
  }
```

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/content/features/density-fill.js src/content/features/sample-panel.js
git commit -m "Offer remembered densities on any card missing one; amber not-on-batch notice"
```

---

### Task 4: Options-page management card

**Files:**
- Modify: `src/options/options.html` (new section 5 before `</main>`)
- Modify: `src/options/options.js` (new section; imports)
- Modify: `src/options/options.css` (row styles)

**Interfaces:**
- Consumes: `DENSITY_MEMORY_STORAGE_KEY`, `DENSITY_MEMORY_LIMIT`, `loadDensityMemory`, `saveDensityMemory` from Task 1 (direct load/save like the prefix-colours editor — no cache needed here).
- Produces: element ids `densityMemoryList`, `densityMemoryCount`, `densityMemoryEmpty`, `densityMemoryClear`.

- [ ] **Step 1: HTML card (follow the existing card markup exactly)**

Add before `</main>` in `options.html`:

```html
    <!-- 5 · Remembered densities -->
    <section class="card" aria-labelledby="col-densities-heading">
        <header class="card__head">
            <span class="tile" aria-hidden="true">
                <span class="tile__no">5</span>
                <span class="tile__sym">ρ</span>
            </span>
            <div class="card__titles">
                <h2 class="card__name" id="col-densities-heading">Remembered densities</h2>
                <p class="card__desc">
                    Densities you typed into stoichiometry rows, remembered per
                    molecule batch. A density saved on the batch record itself
                    always wins and removes the entry here.
                </p>
            </div>
        </header>

        <div class="card__body">
            <p class="density-memory-count">
                <span id="densityMemoryCount">0</span> / 100 remembered
            </p>
            <div id="densityMemoryList" class="stack"></div>
            <p id="densityMemoryEmpty" class="empty" hidden>
                Nothing remembered yet. Type a density into a stoichiometry row
                whose batch has none, and it will appear here.
            </p>
            <button id="densityMemoryClear" type="button" class="btn btn--quiet" hidden>
                Clear all
            </button>
        </div>
    </section>
```

- [ ] **Step 2: options.js section**

Add to the imports:

```js
import {
    DENSITY_MEMORY_STORAGE_KEY,
    DENSITY_MEMORY_LIMIT,
    loadDensityMemory,
    saveDensityMemory,
} from "../shared/density-memory.js";
```

Add a new section after the registration-form section (before the final init calls). Find the existing bottom-of-file init sequence and add `initDensityMemoryUI();` alongside the other `init*()` calls, plus:

```js
/* ==================================================== 5 · Remembered densities */

const densityListEl = document.getElementById("densityMemoryList");
const densityCountEl = document.getElementById("densityMemoryCount");
const densityEmptyEl = document.getElementById("densityMemoryEmpty");
const densityClearBtn = document.getElementById("densityMemoryClear");

function createDensityRow(batchId, entry) {
    const wrapper = document.createElement("div");
    wrapper.className = "density-memory-item";

    const name = document.createElement("span");
    name.className = "density-memory-name";
    name.textContent = entry.name || `batch #${batchId}`;
    name.title = `Batch id ${batchId}`;

    const value = document.createElement("span");
    value.className = "density-memory-value";
    value.textContent = entry.density;

    const saved = document.createElement("span");
    saved.className = "density-memory-date";
    saved.textContent = entry.savedAt
        ? new Date(entry.savedAt).toLocaleDateString()
        : "";

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "density-memory-delete";
    deleteBtn.setAttribute("aria-label", `Forget density for ${name.textContent}`);
    deleteBtn.textContent = "✕";
    deleteBtn.addEventListener("click", async () => {
        const map = await loadDensityMemory();
        delete map[batchId];
        await saveDensityMemory(map);
        renderDensityMemory(map);
    });

    wrapper.append(name, value, saved, deleteBtn);
    return wrapper;
}

function renderDensityMemory(map) {
    // Newest first — the list is a working set, not an archive.
    const entries = Object.entries(map).sort(
        (a, b) => (b[1].savedAt || 0) - (a[1].savedAt || 0)
    );

    densityListEl.replaceChildren();
    for (const [batchId, entry] of entries) {
        densityListEl.appendChild(createDensityRow(batchId, entry));
    }

    densityCountEl.textContent = String(entries.length);
    densityEmptyEl.hidden = entries.length > 0;
    densityClearBtn.hidden = entries.length === 0;
}

densityClearBtn.addEventListener("click", async () => {
    const count = densityListEl.children.length;
    if (!confirm(`Forget all ${count} remembered densities?`)) return;
    await saveDensityMemory({});
    renderDensityMemory({});
});

async function initDensityMemoryUI() {
    renderDensityMemory(await loadDensityMemory());
}
```

And extend the existing `chrome.storage.onChanged` listener at the bottom of `options.js` (line ~461) with:

```js
    if (areaName === "local" && changes[DENSITY_MEMORY_STORAGE_KEY]) {
        renderDensityMemory(
            (await loadDensityMemory())
        );
    }
```

(Match the surrounding listener's style; if it is not `async`, use `.then()`:
`loadDensityMemory().then(renderDensityMemory);`)

- [ ] **Step 3: CSS rows**

Add to `options.css`:

```css
/* 5 · Remembered densities */

.density-memory-count {
    margin: 0 0 8px;
    font-size: 12px;
    color: var(--ink-soft, #6b7280);
}

.density-memory-item {
    display: grid;
    grid-template-columns: 1fr auto auto auto;
    align-items: center;
    gap: 10px;
    padding: 6px 8px;
    border: 1px solid var(--line, #e5e7eb);
    border-radius: 8px;
}

.density-memory-name {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.density-memory-value {
    font-variant-numeric: tabular-nums;
}

.density-memory-date {
    font-size: 11px;
    color: var(--ink-soft, #6b7280);
}

.density-memory-delete {
    border: none;
    background: none;
    cursor: pointer;
    font-size: 13px;
    line-height: 1;
    color: var(--ink-soft, #6b7280);
}

.density-memory-delete:hover {
    color: #ef4444;
}
```

If `options.css` does not define `--ink-soft` / `--line` custom properties, keep the fallback values as written — they are the literal colours used.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: exit 0. Note: the options page loads `options.js` as an ES module straight from source/dist — confirm `dist/` contains the updated options files after the build (the vite content config copies them).

- [ ] **Step 5: Commit**

```bash
git add src/options/options.html src/options/options.js src/options/options.css
git commit -m "Options: Remembered densities card - list, per-row forget, clear all"
```

---

### Task 5: Live verification on the test entry

**Files:** none (manual walkthrough; fix-forward any findings as small commits).

Use https://app.collaborativedrug.com/vaults/6884/eln/entries/2504170 with the freshly built extension loaded (user reloads the extension / page).

- [ ] **Step 1:** On a row whose batch has NO density: type a density into the stoichiometry table by hand. After CDD autosaves, open the options page → the entry is listed (correct name, value, `N / 100` counter).
- [ ] **Step 2:** Remove the density from that row (or open another entry using the same batch without a density). The card shows `⤵ Fill remembered density (…) into table` plus the amber notice; clicking it fills the row and flips to `✓ Density filled`.
- [ ] **Step 3:** On a card whose batch HAS a density field: behaviour unchanged (`⤵ Fill density (…)` and no notice), and no memory entry appears for that batch; a pre-existing entry for it disappears after the page parses.
- [ ] **Step 4:** A card with neither batch density nor remembered value shows NO fill button.
- [ ] **Step 5:** Options page: delete one entry (row disappears, counter drops, panel button on the open ELN tab disappears without reload); Clear all asks for confirmation and empties the list.
- [ ] **Step 6:** Commit any fixes made during verification.

---

### Task 6: Release 12.4.0

**Files:**
- Modify: `manifest.json` (version → `12.4.0`)
- Modify: `CHANGELOG.md`, `RELEASES.md`

- [ ] **Step 1:** Bump `"version"` in `manifest.json` to `12.4.0`.
- [ ] **Step 2:** Add the CHANGELOG entry:

```markdown
## [12.4.0] — 2026-08-07

### Added
- **Remembered densities.** When you type a density into a stoichiometry row
  whose registered batch has none, the extension remembers it (up to 100,
  keyed by molecule batch) and offers a one-click
  "Fill remembered density" wherever that batch appears again — with an
  amber nudge to save the value on the batch record itself, which always
  takes precedence and removes the remembered copy. A new options-page card
  lists the remembered values with per-row forget and Clear all.
```

Add the matching short entry to `RELEASES.md` in its existing format.

- [ ] **Step 3:** `npm run build` — expected exit 0.
- [ ] **Step 4:** Commit, tag, push (CLAUDE.md release rules):

```bash
git add manifest.json CHANGELOG.md RELEASES.md dist/
git commit -m "Release 12.4.0: remember typed densities per molecule batch and offer them everywhere"
git tag v12.4.0
git push origin main && git push origin v12.4.0
```

(If `dist/` is not tracked in git, `git add` only the tracked files — follow whatever the previous release commits include.)
