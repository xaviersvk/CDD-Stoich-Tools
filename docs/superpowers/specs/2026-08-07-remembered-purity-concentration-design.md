# Remembered purity & concentration (+ experimental auto-fill) — design

Date: 2026-08-07
Status: approved by user (conversation); user asked to proceed to plan
Builds on: `2026-08-07-remembered-densities-design.md` (shipped in 12.4.0)

## Problem

Density was the first field the extension remembers and fills. Purity and
concentration have the same shape of pain: values the user types repeatedly
for the same batch, with an authoritative source that should win when it
exists. Purity adds a CDD quirk (editing it recalculates the row's
Equivalent), concentration adds a UI prerequisite (the row must be a
solution — "Make solution" — before the Concentration field exists).

## Decisions (from brainstorming)

- **One record per batch** in the existing map — not separate maps.
- **Equivalents:** CDD recalculates only the edited row's Equivalent when
  purity changes → snapshot/restore covers just that row.
- **Make solution:** the concentration fill clicks it automatically when the
  row is not yet a solution.
- **Experimental auto-fill:** an options checkbox (default OFF) that runs
  the same fills automatically instead of waiting for button clicks.

## Authoritative sources (always win over memory)

| Field         | Authoritative source        | Memory fallback |
|---------------|-----------------------------|-----------------|
| density       | batch field (enrichment)    | per-batch       |
| purity        | batch field (enrichment)    | per-batch       |
| concentration | sample field (payload)      | per-batch       |

When the authoritative value exists, the stored copy of that field is
deleted on the next parse.

## Components

### 1 · Storage — extend `src/shared/density-memory.js`

Same key `cddDensityMemoryV1` (existing data survives). Entry becomes:

```js
{ density?, purity?, concentration?, concentrationUnits?, name, savedAt, lastUsedAt }
```

- Sanitizer keeps an entry if at least one of density/purity/concentration
  is a non-empty string; `concentrationUnits` rides along with
  concentration.
- Upsert generalises to `rememberValues(batchId, values, name)` — a merge
  that only persists when something actually changed; per-field clearing via
  `forgetValues(batchId, ["purity", ...])` (removes the entry when its last
  value goes). Cap 100 batches, LRU eviction unchanged.
- `getRememberedDensity(batchId)` stays (single call sites read the whole
  entry: `getRememberedValues(batchId)`).

### 2 · Parser — `src/inject/parsers/sample-data.js`

Pass through the user-typed table values alongside `tableDensity`:

- `tablePurity` = `row.userInput.purity`
- `tableConcentration` = `row.userInput.concentration`
- `tableConcentrationUnits` = `row.userInput.concentrationUnits` (exact key
  verified live during implementation; ride-along value)

### 3 · Capture — `captureDensitiesFromSamples` → `captureValuesFromSamples`

Per row with a `batchId`, per field, mirroring the density rule:

- authoritative value present → forget that field from the entry;
- else user-typed table value present → remember it. The
  batch-field-enrichment gate applies to density and purity on batch-only
  rows (sample rows carry batch fields in the payload). Concentration's
  authoritative source (sample field) is in the payload directly, so no
  gate is needed.

### 4 · Fill machinery — generalise `src/content/features/density-fill.js`

The row-finding, popup-by-label, native-input-set, Enter, verify machinery
is shared. One parametrised sequence per field:

- **Density** (unchanged behaviour): link `Density:`, popup label
  `Density [`.
- **Purity:** read the row's current `Equivalent: X` from the edit-mode row
  text BEFORE writing; write purity via link `Purity:` popup; after the
  value sticks, re-read Equivalent — if CDD changed it, open the
  `Equivalent` popup and write X back, verify. If the restore fails, the
  button reports it (purity stays written; the user fixes the equivalent by
  hand — the worst case is visible, never silent).
- **Concentration:** if the row has no `Concentration:` link, click the
  row's `Make solution` link first and wait for the re-render; then write
  the value; if the popup exposes a units control and the remembered units
  differ, set it natively too. Units handling is best-effort and verified
  live during implementation.

Every step re-verifies the DOM and aborts cleanly with a reason, exactly
like the density fill.

### 5 · Panel cards — up to three fill buttons

A button renders per field only when the table value is missing AND a
source exists (authoritative first, memory second). Labels follow the
density pattern: `⤵ Fill purity (98) into table`,
`⤵ Fill remembered concentration (0.5 M) into table`, …

One shared amber notice per card (not per button) when at least one offered
value comes from memory: it says the values aren't saved on the
batch/sample record and should be added there.

### 6 · Options — card becomes "Remembered batch values"

One row per batch: name | density | purity | concentration (value + unit) |
saved date | ✕ (forgets the whole batch entry). Counter `N / 100`,
Clear all with confirmation, live refresh — all unchanged mechanics.

### 7 · Experimental auto-fill (options checkbox, default OFF)

- Checkbox in the options card, clearly labelled experimental: when ON, the
  extension automatically runs the same fill sequences the buttons offer
  (all sources — authoritative and remembered), instead of waiting for a
  click.
- Trigger: after a payload settles (parse + enrichment re-render). Fills
  run **sequentially** (the DOM automation cannot overlap; each fill causes
  an autosave → new payload → re-render).
- Loop guards: each `(batchId, field)` is attempted at most once per page
  session; any failure stops the auto-run for that row and is reported in
  the panel status line. The buttons remain rendered while auto-fill is
  pending, so a failed auto attempt degrades to the manual path.
- Stored under a new `chrome.storage.local` flag (own key, read by the
  content script at startup and live via `onChanged`).

## Edge cases

- A purity fill on a row whose Equivalent CDD does not change → no restore
  write happens (snapshot equals current).
- Make solution on a row that cannot become a solution → the link is
  absent; the fill aborts with a reason before writing anything.
- Remembered concentration without units → fill writes the value and
  leaves CDD's unit default untouched.
- Entries written by 12.4.0 (density only) sanitize cleanly into the new
  shape.

## Verification

`npm run build` + live walkthrough on
https://app.collaborativedrug.com/vaults/6884/eln/entries/2504170:

1. Type purity on a row whose batch lacks it → remembered; clear it →
   `⤵ Fill remembered purity` appears; fill writes purity AND the
   Equivalent ends up unchanged.
2. Concentration on a non-solution row: fill clicks Make solution, writes
   value; sample-field concentration wins where present.
3. Options card shows per-field columns; deleting a row removes the offer
   live; 12.4.0 density entries still listed.
4. Auto-fill checkbox ON → missing values fill themselves sequentially
   after page load; OFF → buttons only. Release as 12.5.0.
