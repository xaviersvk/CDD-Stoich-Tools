# Field Clipboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** *Copy N fields* and *Paste* beside every *Add/Edit … Fields* link, so a vault's Molecule, Batch, Sample, Inventory, Protocol, Run and ELN field definitions can be re-created in another vault, skipping exact name matches, with a preview and without pressing Update.

**Architecture:** A page-world bridge reads the rows from React state above each table. A pure model normalizes them and plans a paste against the target. A DOM module drives CDD's own edit mode: add row, native setters, the pick-list dialog via a synthetic paste. A card shows the plan and runs it. Spec: `docs/superpowers/specs/2026-09-15-field-clipboard-design.md`.

**Tech Stack:** Plain ES modules, Vite, `chrome.storage.local`, throwaway `node` tests.

## Global Constraints

- Seven kinds: molecule, batch, sample, inventory, protocol, run, eln. Storage key `cddFieldClipboard` → `{ [kind]: { vaultId, vaultName, copiedAt, fields } }`.
- Skip on exact, case-sensitive, trimmed name match. Skip types the target select does not offer. Never copy `disabled` rows or hidden pick values. Never set Sample Identifier.
- Group requirement → pasted as *is optional*, noted in the preview.
- Never press *Update … fields*. Preview before any DOM change.
- Commit per task. Do not push.

---

### Task 1: Pure model — `field-model.js` (+ node test)
`KINDS`, `kindsForPath`, `normalizeRows`, `planPaste`, `countPlan`, `PLAN_ADD | PLAN_SAME_NAME | PLAN_TYPE_MISSING`. Commit.

### Task 2: Bridge + storage — `inject/hooks/field-rows-bridge.js`, `field-clipboard/clipboard.js`, events, `inject/main.js`
`FIELD_ROWS_REQUEST { requestId, tableIndex }` → `FIELD_ROWS { requestId, rows | null }`. Build. Commit.

### Task 3: DOM driver — `page-dom.js`
`findTable`, `findEditLink`, `isEditing`, `enterEditMode`, `addRow`, `fillRow`, `setPickList`, `targetTypes`, `existingRowsFromDom` (fallback names when the bridge is silent), `requestFieldRows`. Build. Commit.

### Task 4: UI — `panel.js`, `styles.js`, `init.js`, registration in `content/main.js`
Buttons beside each edit link; the preview card; the run. Build. Commit.

### Task 5: Live check in vault 6772 (both directions on one vault), then release 15.14.0
manifest, CHANGELOG, RELEASES, FEATURE_CATALOG, README. Build. Commit. Stop.
