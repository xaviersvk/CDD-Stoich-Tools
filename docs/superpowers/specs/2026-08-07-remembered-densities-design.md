# Remembered densities — design

Date: 2026-08-07
Status: approved by user (conversation), pending spec review

## Problem

Stoichiometry rows often miss the density CDD needs to convert mass ↔ volume.
Since 12.3.0 the extension fills it from the registered batch's density field
in one click — but many batches have no density recorded. Users type the same
density by hand again and again for the same batch.

## Goal

When the user types a density into a stoichiometry row whose batch has no
density field, remember it (keyed by the batch) and offer it for one-click
fill everywhere that batch appears later. The batch-field value always wins
over the remembered one. Nudge users to record the density on the batch
itself.

## Decisions (from brainstorming)

- **Capture is passive, from the parsed payload** — the inject hook already
  parses every fetch/XHR response, so CDD's autosave delivers the user's
  edit (`row.userInput.density` → `tableDensity`) within moments. No DOM
  watching.
- **Offer scope: every card whose table row misses density** — with or
  without a sample ("samples don't matter"). The button appears only when a
  value is actually available (batch field or memory); cards with neither
  get no button.
- **The "not on batch" notice lives on the panel card**, not injected into
  CDD's table.
- **Management UI lives on the options page** as a new card listing all
  remembered entries.
- **Storage: `chrome.storage.local`** — the extension's established
  persistence pattern (shared across tabs, readable from options page,
  reactive via `onChanged`).

## Components

### 1 · `src/shared/density-memory.js` (new)

Storage key `cddDensityMemoryV1`, value:

```js
{ [batchId]: { density: "0.95", name: "RGT-0001620-001", savedAt, lastUsedAt } }
```

- Key is the numeric `batchId` (globally unique in CDD); `name` is the
  composed "MOLECULE-batch" display name, stored only for the options list.
- Cap: **100 entries**. On overflow, evict the entry with the oldest
  `lastUsedAt`.
- API: `loadDensityMemory()`, `rememberDensity(batchId, density, name)`,
  `forgetDensity(batchId)`, `clearDensityMemory()`,
  `onDensityMemoryChanged(cb)`.
- Follows the load/save/subscribe pattern of `src/shared/prefix-colors.js`.

### 2 · Capture (content script, on SAMPLE_DATA)

For each parsed row that has a `batchId`:

- batch-field density present → `forgetDensity(batchId)` (batch value is
  authoritative; frees the slot),
- else if `tableDensity` non-empty → `rememberDensity(batchId,
  tableDensity, name)`.

Write to storage only when the stored value actually changes, so repeated
re-renders don't churn `chrome.storage`.

### 3 · Offer (Samples panel card)

Button condition: row's `tableDensity` empty AND a value is available.
Source precedence: batch field > memory.

- Batch source (existing): `⤵ Fill density (0.95) into table`.
- Memory source (new): `⤵ Fill remembered density (0.95) into table`, plus
  an amber notice under the button: *"This density isn't saved on the batch
  — add it to the batch record so it fills automatically."*
- `fillDensityIntoTable()` takes the value as an explicit parameter instead
  of reading `sample.density`.
- A successful fill from memory refreshes the entry's `lastUsedAt`.

### 4 · Options page card

New card "Remembered densities":

- Table: Molecule-Batch | Density | Saved (date).
- Counter `N / 100`.
- Per-row delete (×) and a "Clear all" button with confirmation.
- Live refresh via `chrome.storage.onChanged`.

## Edge cases

- User edits the density again → last write wins (upsert on next payload).
- Fill-from-memory then autosave → payload re-captures the same value;
  harmless upsert.
- Batch later gains a density field value → entry is deleted on next parse;
  the card switches to the batch source.
- Rows without a `batchId` are ignored entirely.

## Error handling

Capture and offer never touch CDD's DOM except through the existing
`density-fill.js` sequence, which re-verifies every step and aborts cleanly
(worst case: nothing written). Storage failures degrade to the pre-feature
behaviour (no offer from memory).

## Verification

No test suite exists; verify by `npm run build` plus a live walkthrough on
https://app.collaborativedrug.com/vaults/6884/eln/entries/2504170:

1. Type a density into a row whose batch lacks one → entry appears in the
   options list.
2. Clear the row / reload → card offers the remembered value with the
   amber notice; fill works.
3. Options page: delete a row, clear all, counter updates live.
4. A batch **with** a density field never creates an entry; its stored
   entry (if any) disappears after a parse.
