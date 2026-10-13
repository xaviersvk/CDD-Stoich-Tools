# Readout Clipboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Copy a protocol's readout definitions in one vault and paste them into a protocol in another vault.

**Architecture:** One feature folder `src/content/features/ui-fixes/readout-clipboard/` (model / api / clipboard / init), wired from `main.js`. Uses CDD's own readout and custom-calculation endpoints; body shapes measured and recorded in the spec.

**Tech Stack:** Plain JS content script, Vite build.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-13-readout-clipboard-design.md` (endpoint shapes are there).
- Never overwrite or delete in the target: existing names are skipped.
- Write tests only in test vault 1000000109; vault 8158 is read-only.
- Branch `protocol-readout-clipboard` (on top of `slurp-picklist-defaults`), in place, no worktree.
- No version bump until the user has tested.

---

### Task 1: Pure model — `model.js`

**Produces:** `displayFormat(type, number) -> string`, `toClipboard({ vaultId, vaultName, protocolName, readouts, calculationsById }) -> entry`, `retargetFormula(formula, fromName, toName) -> string`.

- [ ] Write `model.js`.
- [ ] `npm run build`.

### Task 2: API + storage — `api.js`, `clipboard.js`

**Produces:** `listReadouts(v, p)`, `getCalculation(v, p, id)`, `createReadout(v, p, body)`, `createCalculation(v, p, body)`; `readReadoutClipboard()`, `writeReadoutClipboard(entry)`, `onReadoutClipboardChanged(cb)`.

- [ ] Write both files. Every failure throws `Error("HTTP <status>: <server text>")`.

### Task 3: Bar + paste flow — `init.js`, `main.js`

**Consumes:** Tasks 1–2. **Produces:** `initReadoutClipboard()`.

- [ ] Mount the bar before `#add_readout_definition_link`'s container on `/vaults/{v}/protocols/{p}`; idempotent; Paste only if `editingAllowed`.
- [ ] Paste: skip existing names → plain readouts (stop on first failure) → calculations with retry rounds → report; reload on clean success.
- [ ] Wire into `main.js`, `npm run build`, commit.

### Task 4: Verification

- [ ] Copy on vault 8158 protocol 1000000370 (button click only reads).
- [ ] User creates a test protocol in vault 1000000109 and pastes; check names, types, units, precision, Buffer values + condition, and the three calculated readouts' formulas.
