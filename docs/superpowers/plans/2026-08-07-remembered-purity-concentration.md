# Remembered Purity & Concentration (+ Auto-fill) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the remembered-values system (12.4.0, density-only) to purity and concentration, and add an experimental options checkbox that auto-runs the fills.

**Architecture:** The per-batch storage entry in `src/shared/density-memory.js` grows to `{density?, purity?, concentration?, concentrationUnits?}`. The DOM fill machinery in `density-fill.js` is renamed `row-fill.js` and parametrised by field; purity adds an Equivalent snapshot/restore, concentration adds an automatic "Make solution" click. A new content module `fill-offers.js` computes which buttons a card gets (single source of truth for the panel AND for the auto-fill queue in `auto-fill.js`).

**Tech Stack:** Vanilla JS MV3 extension, Vite build, `chrome.storage.local`. No test framework exists in this repo.

**Spec:** `docs/superpowers/specs/2026-08-07-remembered-purity-concentration-design.md`

## Global Constraints

- Storage key stays `cddDensityMemoryV1`; 12.4.0 density-only entries must sanitize cleanly into the new shape. Cap stays **100** batches, LRU on `lastUsedAt`.
- Authoritative sources always win and clear the stored copy of that field: density → batch field, purity → batch field, concentration → **sample** field.
- The batch-field-enrichment gate (`hasSample !== false || batchFieldsEnriched === true`) applies to density and purity capture; concentration needs no gate.
- A fill button renders only when the table value is missing AND a source exists. One shared amber notice per card when ≥1 offered value is memory-sourced.
- Auto-fill is opt-in (checkbox default OFF, own storage key `cddAutoFillEnabled`), runs sequentially, attempts each (row, field) at most once per page session, reports failures in the panel status line.
- Shared modules stay DOM-free. All UI copy in English. Verification = `npm run build` (exit 0) + live walkthrough (Task 7); no test framework.
- Work on branch `remembered-values` (created in place, not a worktree — the user's browser loads `dist/` from this folder). Release rules from CLAUDE.md apply in Task 8 (version 12.5.0, tag `v12.5.0`).

---

### Task 0: Branch

- [ ] **Step 1:** `git checkout -b remembered-values` (from `main`).

---

### Task 1: Generalise the storage module

**Files:**
- Modify: `src/shared/density-memory.js`
- Modify: `src/content/features/sample-panel.js` (rename call sites only)

**Interfaces:**
- Consumes: nothing new.
- Produces (used by Tasks 4–6):
  - `VALUE_FIELDS = ["density", "purity", "concentration"]`
  - `getRememberedValues(batchId) → {density?, purity?, concentration?, concentrationUnits?, name, savedAt, lastUsedAt} | null`
  - `rememberValues(batchId, values, name)` — merge-upsert, persists only on change
  - `forgetValues(batchId, fields)` — removes listed fields, drops entry when no value remains
  - `touchValueUsed(batchId)` — LRU stamp
  - `captureValuesFromSamples(samples)` — replaces `captureDensitiesFromSamples`
  - Everything else (`loadDensityMemory`, `saveDensityMemory`, `initDensityMemory`, `onDensityMemoryChanged`, `clearDensityMemory`, `DENSITY_MEMORY_STORAGE_KEY`, `DENSITY_MEMORY_LIMIT`) keeps its name.

- [ ] **Step 1: Rewrite the entry-shape parts of `density-memory.js`**

Replace `sanitizeDensityMemory`'s per-entry body, and the
`getRememberedDensity` / `rememberDensity` / `forgetDensity` /
`touchDensityUsed` / `captureDensitiesFromSamples` block, with:

```js
export const VALUE_FIELDS = ["density", "purity", "concentration"];

// inside sanitizeDensityMemory's loop, replacing the density-only checks:
        const clean = {};
        for (const field of VALUE_FIELDS) {
            if (typeof entry[field] === "string" && entry[field].trim()) {
                clean[field] = entry[field].trim();
            }
        }
        if (!Object.keys(clean).length) continue;   // no values → drop entry

        if (clean.concentration && typeof entry.concentrationUnits === "string"
            && entry.concentrationUnits.trim()) {
            clean.concentrationUnits = entry.concentrationUnits.trim();
        }

        out[id] = {
            ...clean,
            name: typeof entry.name === "string" ? entry.name.trim() : "",
            savedAt: Number.isFinite(entry.savedAt) ? entry.savedAt : 0,
            lastUsedAt: Number.isFinite(entry.lastUsedAt) ? entry.lastUsedAt : 0,
        };
```

```js
export function getRememberedValues(batchId) {
    return cachedMemory[String(batchId)] || null;
}

// Merge-upsert. `values` may hold any of VALUE_FIELDS plus
// concentrationUnits. Persists ONLY when something actually changed —
// repeated renders of an unchanged page never churn chrome.storage.
// No notifyChange() here: capture runs inside a render pass (see the
// comment history in git); chrome.storage.onChanged notifies subscribers.
export function rememberValues(batchId, values, name) {
    if (!cacheLoaded) return;

    const id = String(batchId ?? "").trim();
    if (!/^\d+$/.test(id)) return;

    const existing = cachedMemory[id];
    const label = String(name ?? "").trim();
    const merged = { ...(existing || {}) };
    let changed = !existing || existing.name !== label;
    merged.name = label;

    for (const field of VALUE_FIELDS) {
        const value = values?.[field] != null ? String(values[field]).trim() : "";
        if (!value || merged[field] === value) continue;
        merged[field] = value;
        changed = true;
    }
    const units = values?.concentrationUnits != null
        ? String(values.concentrationUnits).trim() : "";
    if (units && merged.concentrationUnits !== units) {
        merged.concentrationUnits = units;
        changed = true;
    }
    if (!changed) return;

    const now = Date.now();
    merged.savedAt = existing?.savedAt || now;
    merged.lastUsedAt = now;

    const next = { ...cachedMemory, [id]: merged };
    const keys = Object.keys(next);
    if (keys.length > DENSITY_MEMORY_LIMIT) {
        let oldestKey = null, oldestAt = Infinity;
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

// Remove the listed fields; the entry disappears with its last value.
export function forgetValues(batchId, fields) {
    if (!cacheLoaded) return;

    const id = String(batchId ?? "").trim();
    const existing = cachedMemory[id];
    if (!existing) return;

    const nextEntry = { ...existing };
    let changed = false;
    for (const field of fields) {
        if (nextEntry[field] == null) continue;
        delete nextEntry[field];
        if (field === "concentration") delete nextEntry.concentrationUnits;
        changed = true;
    }
    if (!changed) return;

    const next = { ...cachedMemory };
    if (VALUE_FIELDS.some((f) => nextEntry[f] != null)) next[id] = nextEntry;
    else delete next[id];
    cachedMemory = next;
    schedulePersist();
}

export function touchValueUsed(batchId) {
    if (!cacheLoaded) return;
    const entry = cachedMemory[String(batchId)];
    if (!entry) return;
    cachedMemory = {
        ...cachedMemory,
        [String(batchId)]: { ...entry, lastUsedAt: Date.now() },
    };
    schedulePersist();
}

/**
 * captureValuesFromSamples(samples) — THE capture rule, per row with a
 * batchId and per field: the authoritative value clears the stored copy;
 * otherwise a user-typed table value is remembered. Density and purity are
 * authoritative on the BATCH (enrichment gate applies to batch-only rows);
 * concentration is authoritative on the SAMPLE (in the payload directly —
 * no gate).
 */
export function captureValuesFromSamples(samples) {
    if (!cacheLoaded || !Array.isArray(samples)) return;

    const has = (v) => v != null && String(v).trim() !== "";

    for (const sample of samples) {
        if (!sample?.batchId) continue;

        const gate = sample.hasSample !== false || sample.batchFieldsEnriched === true;
        const toForget = [];
        const toRemember = {};

        if (has(sample.density)) toForget.push("density");
        else if (has(sample.tableDensity) && gate) toRemember.density = String(sample.tableDensity);

        if (has(sample.purity)) toForget.push("purity");
        else if (has(sample.tablePurity) && gate) toRemember.purity = String(sample.tablePurity);

        if (has(sample.concentration)) toForget.push("concentration");
        else if (has(sample.tableConcentration)) {
            toRemember.concentration = String(sample.tableConcentration);
            if (has(sample.tableConcentrationUnits)) {
                toRemember.concentrationUnits = String(sample.tableConcentrationUnits);
            }
        }

        if (toForget.length) forgetValues(sample.batchId, toForget);
        if (Object.keys(toRemember).length) {
            rememberValues(sample.batchId, toRemember, sample.name);
        }
    }
}
```

Delete `getRememberedDensity`, `rememberDensity`, `forgetDensity`,
`touchDensityUsed`, `captureDensitiesFromSamples` (fully replaced above).

- [ ] **Step 2: Rename the three call sites in `sample-panel.js`**

Import block: `captureDensitiesFromSamples` → `captureValuesFromSamples`,
`getRememberedDensity` → `getRememberedValues`, `touchDensityUsed` →
`touchValueUsed`. In `renderSamples()`: the capture call becomes
`captureValuesFromSamples(samples)`; in the offer block
`getRememberedDensity(sample.batchId)` becomes
`getRememberedValues(sample.batchId)` and `remembered.density` stays valid;
in the button handler `touchDensityUsed` → `touchValueUsed`. (The offer
block is rewritten in Task 4; these renames just keep the build green.)

- [ ] **Step 3: Build** — `npm run build`, expected exit 0.
- [ ] **Step 4: Commit**

```bash
git add src/shared/density-memory.js src/content/features/sample-panel.js
git commit -m "density-memory: one entry per batch holds density, purity, concentration"
```

---

### Task 2: Parser passes purity/concentration user input through

**Files:**
- Modify: `src/inject/parsers/sample-data.js` (next to `tableDensity`, line ~63)

**Interfaces:**
- Produces: `sample.tablePurity`, `sample.tableConcentration`,
  `sample.tableConcentrationUnits` (all `?? null`, straight from
  `row.userInput`).

- [ ] **Step 1:** After the `tableDensity` line add:

```js
            tablePurity: row?.userInput?.purity ?? null,
            tableConcentration: row?.userInput?.concentration ?? null,
            tableConcentrationUnits:
                row?.userInput?.concentrationUnits ??
                row?.userInput?.concentrationUnit ??
                null,
```

(The exact units key is unconfirmed; both spellings are read, and Task 7
verifies against the live payload — if neither matches, inspect
`row.userInput` there and adjust this one line.)

- [ ] **Step 2:** `npm run build` — exit 0.
- [ ] **Step 3: Commit**

```bash
git add src/inject/parsers/sample-data.js
git commit -m "Parser: pass user-typed purity and concentration through as table* fields"
```

---

### Task 3: Generalise the fill machinery (`row-fill.js`)

**Files:**
- Rename: `src/content/features/density-fill.js` → `src/content/features/row-fill.js` (`git mv`)
- Modify: `src/content/features/row-fill.js`
- Modify: `src/content/features/sample-panel.js` (import path only)

**Interfaces:**
- Consumes: nothing new.
- Produces (used by Tasks 4 & 6):
  - `fillDensityIntoTable(sample, value) → Promise<{ok, reason?}>` (unchanged behaviour)
  - `fillPurityIntoTable(sample, value) → Promise<{ok, reason?}>` — snapshots and restores the row's Equivalent
  - `fillConcentrationIntoTable(sample, value, units) → Promise<{ok, reason?}>` — clicks "Make solution" when needed; `units` best-effort

- [ ] **Step 1:** `git mv src/content/features/density-fill.js src/content/features/row-fill.js`; update the import in `sample-panel.js` to `./row-fill.js`.

- [ ] **Step 2: Generalise the private helpers**

Replace `findDensityPlaceholderLink` and `findDensityEditorInput` with
parametrised versions (all other helpers — `wait`, `waitFor`, `mouseClick`,
`getReactionContainers`, `findRowsByName`, `setNativeInputValue`,
`pressEnter`, `pressEscape`, `clickOutside` — stay as they are):

```js
// The value element of "<b>Label:</b> <value>" in an edit-mode row.
// placeholderOnly limits the match to the blue Optional/Required link (an
// EMPTY field) — density keeps that rule; purity overwrites CDD's default
// "100 %" so it matches any value.
function findFieldValueLink(row, label, placeholderOnly) {
    for (const span of row.querySelectorAll("span")) {
        const b = span.querySelector(":scope > b");
        if (!b || (b.textContent || "").trim() !== label) continue;

        const value = b.nextElementSibling;
        if (!value) continue;

        if (placeholderOnly &&
            !/^(Optional|Required)$/.test((value.textContent || "").trim())) {
            continue;
        }
        return value;
    }
    return null;
}

// The editable text input inside the floating one-field popup whose
// MuiPaper box text matches labelRe (e.g. /Density\s*\[/i).
function findEditorInput(labelRe) {
    const candidates = [];
    const active = document.activeElement;
    if (active && active.tagName === "INPUT") candidates.push(active);
    candidates.push(...document.querySelectorAll(".MuiPaper-root input"));

    for (const input of candidates) {
        if (input.readOnly || input.type !== "text") continue;
        let box = input.parentElement;
        for (let i = 0; i < 8 && box; i++) {
            if (/MuiPaper/.test(box.className || "")) break;
            box = box.parentElement;
        }
        if (box && labelRe.test(box.innerText || "")) return input;
    }
    return null;
}

// A <select> inside the same popup (concentration units). Null when the
// popup has none — callers treat units as best-effort.
function findEditorSelect(labelRe) {
    for (const select of document.querySelectorAll(".MuiPaper-root select")) {
        let box = select.parentElement;
        for (let i = 0; i < 8 && box; i++) {
            if (/MuiPaper/.test(box.className || "")) break;
            box = box.parentElement;
        }
        if (box && labelRe.test(box.innerText || "")) return select;
    }
    return null;
}

function setNativeSelectValue(select, value) {
    // Accept a match on option value OR visible text.
    const option = Array.from(select.options).find(
        (o) => o.value === value || (o.textContent || "").trim() === value
    );
    if (!option) return false;

    const setter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype, "value")?.set;
    if (setter) setter.call(select, option.value);
    else select.value = option.value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
}

// Click the sample's row into edit mode; returns {container, name} or null.
// (Extracted verbatim from the old fillDensityIntoTable body.)
async function openRow(sample) {
    const name = String(sample?.name || "").trim();
    if (!name) return null;

    const containers = getReactionContainers();
    let container = containers[sample.reactionIndex];
    let viewRows = container ? findRowsByName(container, name) : [];

    if (!viewRows.length) {
        for (const candidate of containers) {
            const rows = findRowsByName(candidate, name);
            if (rows.length) { container = candidate; viewRows = rows; break; }
        }
    }
    if (!viewRows.length) return null;

    mouseClick(viewRows[0].cells[0]);
    return { container, name };
}

// Read "Equivalent: X" from the sample's edit-mode row, or null.
function readEquivalent(container, name) {
    for (const tr of findRowsByName(container, name)) {
        const m = (tr.innerText || "").match(/Equivalent:\s*([\d.,]+)/);
        if (m) return m[1];
    }
    return null;
}
```

- [ ] **Step 3: One generic write + the three public fills**

```js
// Click `label`'s value link in the sample's edit row, type `value` into
// the popup, Enter, and wait until the row text shows "label value".
async function writeFieldViaPopup(container, name, label, popupLabelRe, value, placeholderOnly, units) {
    const link = await waitFor(() => {
        for (const tr of findRowsByName(container, name)) {
            const found = findFieldValueLink(tr, label, placeholderOnly);
            if (found) return found;
        }
        return null;
    });
    if (!link) return { ok: false, reason: `row has no ${label.replace(":", "")} field` };

    mouseClick(link);

    const input = await waitFor(() => findEditorInput(popupLabelRe));
    if (!input) return { ok: false, reason: `${label.replace(":", "")} editor did not open` };

    setNativeInputValue(input, value);
    if (units) {
        const select = findEditorSelect(popupLabelRe);
        if (select) setNativeSelectValue(select, units);   // best-effort
    }
    pressEnter(input);

    const confirmed = await waitFor(() => {
        for (const tr of findRowsByName(container, name)) {
            const text = tr.innerText || "";
            if (text.includes(label) && text.includes(value)) return tr;
        }
        return null;
    });
    return confirmed ? { ok: true } : { ok: false, reason: "value did not stick" };
}

export async function fillDensityIntoTable(sample, value) {
    value = value != null ? String(value).trim() : "";
    if (!value) return { ok: false, reason: "no density value on this card" };

    const ctx = await openRow(sample);
    if (!ctx) return { ok: false, reason: "table row not found" };

    const result = await writeFieldViaPopup(
        ctx.container, ctx.name, "Density:", /Density\s*\[/i, value, true);
    if (!result.ok) { pressEscape(); return result; }

    clickOutside(ctx.container);
    return { ok: true };
}

export async function fillPurityIntoTable(sample, value) {
    value = value != null ? String(value).trim() : "";
    if (!value) return { ok: false, reason: "no purity value on this card" };

    const ctx = await openRow(sample);
    if (!ctx) return { ok: false, reason: "table row not found" };

    // CDD recalculates this row's Equivalent when purity changes — snapshot
    // it first and put it back afterwards, so the fill only changes purity.
    await waitFor(() => readEquivalent(ctx.container, ctx.name) != null || null);
    const equivalentBefore = readEquivalent(ctx.container, ctx.name);

    const result = await writeFieldViaPopup(
        ctx.container, ctx.name, "Purity:", /Purity/i, value, false);
    if (!result.ok) { pressEscape(); return result; }

    if (equivalentBefore != null) {
        const changed = await waitFor(() => {
            const now = readEquivalent(ctx.container, ctx.name);
            return now != null && now !== equivalentBefore ? now : null;
        });
        if (changed != null) {
            const restore = await writeFieldViaPopup(
                ctx.container, ctx.name, "Equivalent:", /Equivalent/i,
                equivalentBefore, false);
            if (!restore.ok) {
                pressEscape();
                // Purity IS written; the failure is visible, never silent.
                return { ok: false, reason: `purity written but equivalent restore failed (was ${equivalentBefore})` };
            }
        }
    }

    clickOutside(ctx.container);
    return { ok: true };
}

export async function fillConcentrationIntoTable(sample, value, units) {
    value = value != null ? String(value).trim() : "";
    if (!value) return { ok: false, reason: "no concentration value on this card" };

    const ctx = await openRow(sample);
    if (!ctx) return { ok: false, reason: "table row not found" };

    // The Concentration field only exists on solution rows; "Make solution"
    // converts the row. waitFor tolerates the field already being there.
    const hasField = await waitFor(() => {
        for (const tr of findRowsByName(ctx.container, ctx.name)) {
            if (findFieldValueLink(tr, "Concentration:", false)) return true;
        }
        return null;
    });

    if (!hasField) {
        const make = (() => {
            for (const tr of findRowsByName(ctx.container, ctx.name)) {
                for (const el of tr.querySelectorAll("a, span, button")) {
                    if (/^Make solution$/i.test((el.textContent || "").trim())) return el;
                }
            }
            return null;
        })();
        if (!make) { pressEscape(); return { ok: false, reason: "no Concentration field and no Make solution link" }; }

        mouseClick(make);

        const appeared = await waitFor(() => {
            for (const tr of findRowsByName(ctx.container, ctx.name)) {
                if (findFieldValueLink(tr, "Concentration:", false)) return true;
            }
            return null;
        });
        if (!appeared) { pressEscape(); return { ok: false, reason: "Concentration field did not appear after Make solution" }; }
    }

    const result = await writeFieldViaPopup(
        ctx.container, ctx.name, "Concentration:", /Concentration/i,
        value, false, units || null);
    if (!result.ok) { pressEscape(); return result; }

    clickOutside(ctx.container);
    return { ok: true };
}
```

Delete the old `fillDensityIntoTable` body and the two replaced helpers.
Update the file's header comment to describe the generalised role.

- [ ] **Step 4:** `npm run build` — exit 0.
- [ ] **Step 5: Commit**

```bash
git add -A src/content/features/row-fill.js src/content/features/sample-panel.js
git commit -m "row-fill: generalize fill machinery; add purity (equivalent-safe) and concentration (make-solution) fills"
```

---

### Task 4: Offers module + three-button cards

**Files:**
- Create: `src/content/features/fill-offers.js`
- Modify: `src/content/features/sample-panel.js` (button builder + offer block + notice text)

**Interfaces:**
- Consumes: `getRememberedValues` (Task 1), the three fill functions (Task 3).
- Produces (used by Task 6):
  - `computeFillOffers(sample) → Array<{field, value, units?, source}>` where `field ∈ {"density","purity","concentration"}`, `source ∈ {"batch","sample","memory"}`
  - `runFillOffer(sample, offer) → Promise<{ok, reason?}>`
  - `markOfferFilled(sample, offer)` — stamps the corresponding `table*` field on the in-memory sample

- [ ] **Step 1: Write `fill-offers.js`**

```js
// content/features/fill-offers.js
//
// ONE source of truth for "what could be filled into this row": the panel
// renders a button per offer, the experimental auto-fill runs the same
// offers without the click. Order: authoritative source (batch / sample)
// first, remembered value second — never both for one field.

import { getRememberedValues } from "../../shared/density-memory.js";
import {
    fillDensityIntoTable,
    fillPurityIntoTable,
    fillConcentrationIntoTable,
} from "./row-fill.js";

const has = (v) => v != null && String(v).trim() !== "";

export function computeFillOffers(sample) {
    const offers = [];
    const entry = sample?.batchId ? getRememberedValues(sample.batchId) : null;

    if (!has(sample?.tableDensity)) {
        if (has(sample?.density)) offers.push({ field: "density", value: String(sample.density), source: "batch" });
        else if (entry?.density) offers.push({ field: "density", value: entry.density, source: "memory" });
    }
    if (!has(sample?.tablePurity)) {
        if (has(sample?.purity)) offers.push({ field: "purity", value: String(sample.purity), source: "batch" });
        else if (entry?.purity) offers.push({ field: "purity", value: entry.purity, source: "memory" });
    }
    if (!has(sample?.tableConcentration)) {
        if (has(sample?.concentration)) {
            offers.push({
                field: "concentration", value: String(sample.concentration),
                units: has(sample?.concentrationUnits) ? String(sample.concentrationUnits) : null,
                source: "sample",
            });
        } else if (entry?.concentration) {
            offers.push({
                field: "concentration", value: entry.concentration,
                units: entry.concentrationUnits || null, source: "memory",
            });
        }
    }
    return offers;
}

export function runFillOffer(sample, offer) {
    switch (offer.field) {
        case "density": return fillDensityIntoTable(sample, offer.value);
        case "purity": return fillPurityIntoTable(sample, offer.value);
        case "concentration": return fillConcentrationIntoTable(sample, offer.value, offer.units);
        default: return Promise.resolve({ ok: false, reason: "unknown field" });
    }
}

export function markOfferFilled(sample, offer) {
    if (offer.field === "density") sample.tableDensity = String(offer.value);
    if (offer.field === "purity") sample.tablePurity = String(offer.value);
    if (offer.field === "concentration") sample.tableConcentration = String(offer.value);
}
```

- [ ] **Step 2: Rework the panel button**

In `sample-panel.js`: drop the `fillDensityIntoTable` import (now unused
there) and import `computeFillOffers`, `runFillOffer`, `markOfferFilled`
from `./fill-offers.js`. Replace `buildDensityFillButton` with:

```js
// One fill button per offer (density / purity / concentration). One click,
// one write, visible outcome; the DOM automation lives in row-fill.js.
function buildFillButton(sample, offer) {
    const shown = offer.units ? `${offer.value} ${offer.units}` : offer.value;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cdd-density-fill-btn";
    btn.textContent = offer.source === "memory"
        ? `⤵ Fill remembered ${offer.field} (${shown}) into table`
        : `⤵ Fill ${offer.field} (${shown}) into table`;
    btn.title = offer.source === "memory"
        ? `Writes the ${offer.field} you previously typed for this batch into the row, exactly as if you typed it.`
        : `Writes this ${offer.field} into the row, exactly as if you typed it.`;

    btn.addEventListener("click", async (event) => {
        // (same stopPropagation + settle-delay rationale as before)
        event.stopPropagation();
        btn.disabled = true;
        btn.textContent = "Filling…";
        await new Promise((resolve) => setTimeout(resolve, 60));

        const result = await runFillOffer(sample, offer);
        if (result.ok) {
            markOfferFilled(sample, offer);
            if (offer.source === "memory") touchValueUsed(sample.batchId);
            btn.textContent = `✓ ${offer.field} filled`;
        } else {
            btn.textContent = `✗ ${result.reason || "couldn't fill"} — edit the row manually`;
            btn.disabled = false;
        }
    });

    return btn;
}
```

`buildDensityMemoryNote()` text becomes: `"Some of these values aren't saved
on the batch/sample record — add them there so they fill automatically."`

Replace the offer block in `renderSamples()` (the `tableDensityEmpty` block)
with:

```js
            const offers = computeFillOffers(sample);
            for (const offer of offers) {
                card.appendChild(buildFillButton(sample, offer));
            }
            if (offers.some((o) => o.source === "memory")) {
                card.appendChild(buildDensityMemoryNote());
            }
```

- [ ] **Step 3:** `npm run build` — exit 0.
- [ ] **Step 4: Commit**

```bash
git add src/content/features/fill-offers.js src/content/features/sample-panel.js
git commit -m "Cards offer purity and concentration fills alongside density"
```

---

### Task 5: Options — "Remembered batch values" card + auto-fill flag UI

**Files:**
- Create: `src/shared/auto-fill-flag.js`
- Modify: `src/options/options.html` (card 5), `src/options/options.js`, `src/options/options.css`

**Interfaces:**
- Produces: `AUTO_FILL_STORAGE_KEY = "cddAutoFillEnabled"`,
  `getAutoFillEnabled(): Promise<boolean>`, `saveAutoFillEnabled(v)` — Task 6
  reads the same module from the content script.

- [ ] **Step 1: `src/shared/auto-fill-flag.js`**

```js
// shared/auto-fill-flag.js — the experimental "fill tables automatically"
// switch. DOM-free; read by the content script and the options page.
export const AUTO_FILL_STORAGE_KEY = "cddAutoFillEnabled";

export async function getAutoFillEnabled() {
    try {
        const result = await chrome.storage.local.get(AUTO_FILL_STORAGE_KEY);
        return result?.[AUTO_FILL_STORAGE_KEY] === true;
    } catch {
        return false;
    }
}

export async function saveAutoFillEnabled(value) {
    await chrome.storage.local.set({ [AUTO_FILL_STORAGE_KEY]: value === true });
}
```

- [ ] **Step 2: HTML** — in the card-5 section of `options.html`: title →
`Remembered batch values`, description → `Values you typed into
stoichiometry rows (density, purity, concentration), remembered per
molecule batch. A value saved on the batch or sample record itself always
wins and removes the copy here.` Above the count line insert:

```html
            <label class="field-item auto-fill-toggle">
                <input type="checkbox" id="autoFillEnabled" />
                <span><strong>Experimental:</strong> fill missing values into
                tables automatically (runs the same fills the buttons offer,
                without the click)</span>
            </label>
```

- [ ] **Step 3: options.js** — add to imports
`import { getAutoFillEnabled, saveAutoFillEnabled } from "../shared/auto-fill-flag.js";`
and in section 5:

```js
const autoFillCheckbox = document.getElementById("autoFillEnabled");

autoFillCheckbox.addEventListener("change", () => {
    saveAutoFillEnabled(autoFillCheckbox.checked);
});

async function initAutoFillUI() {
    autoFillCheckbox.checked = await getAutoFillEnabled();
}
```

Call `initAutoFillUI();` next to `initDensityMemoryUI();`. Extend
`createDensityRow` to render the three values (em-dash when absent):

```js
    const density = document.createElement("span");
    density.className = "density-memory-value";
    density.textContent = entry.density || "—";
    density.title = "Density";

    const purity = document.createElement("span");
    purity.className = "density-memory-value";
    purity.textContent = entry.purity || "—";
    purity.title = "Purity";

    const conc = document.createElement("span");
    conc.className = "density-memory-value";
    conc.textContent = entry.concentration
        ? entry.concentration + (entry.concentrationUnits ? ` ${entry.concentrationUnits}` : "")
        : "—";
    conc.title = "Concentration";
```

and `wrapper.append(name, density, purity, conc, saved, deleteBtn);` (the
single `value` span from 12.4.0 is removed).

- [ ] **Step 4: CSS** — `.density-memory-item` grid becomes
`grid-template-columns: 1fr auto auto auto auto auto;` and add:

```css
.auto-fill-toggle {
    margin-bottom: 10px;
}
```

- [ ] **Step 5:** `npm run build` — exit 0; confirm `dist/options/` and
`dist/shared/auto-fill-flag.js` updated.
- [ ] **Step 6: Commit**

```bash
git add src/shared/auto-fill-flag.js src/options/options.html src/options/options.js src/options/options.css
git commit -m "Options: Remembered batch values card with per-field columns + experimental auto-fill checkbox"
```

---

### Task 6: Auto-fill runner

**Files:**
- Create: `src/content/features/auto-fill.js`
- Modify: `src/content/features/sample-panel.js` (export `setStatus`)
- Modify: `src/content/message-router.js` (schedule after SAMPLE_DATA)
- Modify: `src/content/main.js` (init)

**Interfaces:**
- Consumes: `computeFillOffers`/`runFillOffer`/`markOfferFilled` (Task 4),
  `touchValueUsed` (Task 1), `AUTO_FILL_STORAGE_KEY`/`getAutoFillEnabled`
  (Task 5), `STATE`, `setStatus`, `renderFromState`.
- Produces: `initAutoFill()`, `scheduleAutoFill()`.

- [ ] **Step 1:** In `sample-panel.js`, add `export` to the existing
`setStatus` function declaration (no other change).

- [ ] **Step 2: `auto-fill.js`**

```js
// content/features/auto-fill.js
//
// EXPERIMENTAL, opt-in (options checkbox): runs the same fills the card
// buttons offer, without the click. Sequential by design — every fill
// drives CDD's real editing UI and triggers an autosave, so overlapping
// runs would fight each other. Each (row, field) is attempted once per
// page session; a failure stops that row and is shown in the panel status.

import { STATE } from "../state.js";
import { setStatus, renderFromState } from "./sample-panel.js";
import { computeFillOffers, runFillOffer, markOfferFilled } from "./fill-offers.js";
import { touchValueUsed } from "../../shared/density-memory.js";
import { AUTO_FILL_STORAGE_KEY, getAutoFillEnabled } from "../../shared/auto-fill-flag.js";

let enabled = false;
let running = false;
let timer = null;
const attempted = new Set();

export function initAutoFill() {
    getAutoFillEnabled().then((value) => {
        enabled = value;
        if (enabled) scheduleAutoFill();
    });

    if (chrome?.storage?.onChanged) {
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== "local" || !changes[AUTO_FILL_STORAGE_KEY]) return;
            enabled = changes[AUTO_FILL_STORAGE_KEY].newValue === true;
            if (enabled) scheduleAutoFill();
        });
    }
}

// Debounced: payloads arrive in bursts (parse, enrichment re-render);
// wait for the dust to settle before touching the table.
export function scheduleAutoFill() {
    if (!enabled) return;
    clearTimeout(timer);
    timer = setTimeout(runQueue, 1500);
}

async function runQueue() {
    if (running || !enabled) return;
    running = true;

    let filled = 0;
    try {
        const samples = STATE.lastPayload?.samples || [];
        for (const sample of samples) {
            for (const offer of computeFillOffers(sample)) {
                const key = `${sample.reactionIndex}:${sample.rowUid ?? sample.batchId}:${offer.field}`;
                if (attempted.has(key)) continue;
                attempted.add(key);

                const result = await runFillOffer(sample, offer);
                if (result.ok) {
                    filled += 1;
                    markOfferFilled(sample, offer);
                    if (offer.source === "memory") touchValueUsed(sample.batchId);
                } else {
                    setStatus(`Auto-fill ${offer.field} for ${sample.name}: ${result.reason || "failed"} — use the card button or edit manually.`);
                    break;   // stop this row, keep going with the next
                }
                await new Promise((resolve) => setTimeout(resolve, 600));
            }
        }
    } finally {
        running = false;
    }

    if (filled) renderFromState();
}
```

- [ ] **Step 3: Wiring** — `message-router.js`: import
`{ scheduleAutoFill } from "./features/auto-fill.js";` and call
`scheduleAutoFill();` directly after the existing
`enrichBatchOnlySamples();` in the `SAMPLE_DATA` case. `main.js`: import
`{ initAutoFill } from "./features/auto-fill.js";` and call
`initAutoFill();` right after the `initDensityMemory()` block.

- [ ] **Step 4:** `npm run build` — exit 0.
- [ ] **Step 5: Commit**

```bash
git add src/content/features/auto-fill.js src/content/features/sample-panel.js src/content/message-router.js src/content/main.js
git commit -m "Experimental auto-fill: opt-in sequential runner over the card offers"
```

---

### Task 7: Live verification on the test entry

**Files:** none (manual walkthrough with the user's reloaded extension;
fix-forward findings as small commits). Entry:
https://app.collaborativedrug.com/vaults/6884/eln/entries/2504170

- [ ] **Step 1 (purity):** Type a purity into a row whose batch lacks one →
options card lists it under the purity column. Clear it → card offers
`⤵ Fill remembered purity`; click → purity lands AND the row's Equivalent
is unchanged afterwards.
- [ ] **Step 2 (purity, batch source):** A card whose batch HAS purity (e.g.
95/98.2/99 rows) shows `⤵ Fill purity (…)` without the amber notice;
filling writes it and restores the equivalent.
- [ ] **Step 3 (concentration):** On a non-solution row, fill concentration
from memory (type one first on another row of the same batch, or into the
row and clear) → the automation clicks Make solution, writes the value
(and units when the popup has a selector). Verify `tableConcentration` /
units key actually captures — if not, inspect `row.userInput` in the
payload and fix the Task 2 keys.
- [ ] **Step 4 (precedence):** A row whose SAMPLE has a concentration field
offers the sample value, never the remembered one; batches with
purity/density fields never leave remembered copies behind after a parse.
- [ ] **Step 5 (options):** The card shows per-field columns, 12.4.0
density-only entries still render (density column filled, others —),
per-row ✕ and Clear all work, counter updates.
- [ ] **Step 6 (auto-fill):** Checkbox ON → reload the ELN page → missing
values fill themselves one after another; failures appear in the panel
status line and the buttons remain usable. OFF → nothing runs
automatically.
- [ ] **Step 7:** Commit any fixes.

---

### Task 8: Release 12.5.0

**Files:**
- Modify: `manifest.json` (→ `12.5.0`), `CHANGELOG.md`, `RELEASES.md`

- [ ] **Step 1:** Bump `manifest.json` version to `12.5.0`.
- [ ] **Step 2:** CHANGELOG entry:

```markdown
## [12.5.0] — 2026-08-07

### Added
- **Remembered purity & concentration.** The per-batch memory now holds
  density, purity and concentration (+units). Same contract as density:
  the authoritative source — batch field for purity/density, sample field
  for concentration — always wins and clears the remembered copy; typed
  values are captured passively from the autosave payloads. Cards offer up
  to three fill buttons; one shared amber notice marks memory-sourced
  values. The purity fill snapshots the row's Equivalent and writes it
  back after CDD's recalculation; the concentration fill clicks
  "Make solution" first when the row isn't a solution yet. The options
  card became **Remembered batch values** with per-field columns.
- **Experimental auto-fill (options checkbox, default off).** When
  enabled, the extension runs the same fills automatically after the page
  settles — sequentially, each row/field attempted once per page session,
  with failures reported in the panel status line.
```

Matching plain-language entry in `RELEASES.md` (same format as 12.4.0).

- [ ] **Step 3:** `npm run build` — exit 0.
- [ ] **Step 4:** Commit on the branch, merge to `main` (`--no-ff`), tag,
push:

```bash
git add manifest.json CHANGELOG.md RELEASES.md
git commit -m "Release 12.5.0: remembered purity & concentration + experimental auto-fill"
git checkout main
git merge --no-ff remembered-values -m "Merge branch remembered-values: release 12.5.0"
git tag v12.5.0
git push origin main
git push origin v12.5.0
```
