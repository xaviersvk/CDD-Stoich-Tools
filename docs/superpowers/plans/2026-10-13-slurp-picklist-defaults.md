# Slurp pick list defaults Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the bulk registration mapping page, show pick-list values as buttons next to each "provide a default …" error and inside its dialog; one click applies the default.

**Architecture:** One content-script module, wired from `main.js`. It fetches the vault's field definitions once, finds the CDD dialog form for each field by `header_mapping[field_definition_id]`, and on click fills that form and calls `requestSubmit()`, the same as "type it, press Apply".

**Tech Stack:** Plain JS content script, bundled by Vite (`npm run build`).

## Global Constraints

- Always on, no options-page switch.
- Spec: `docs/superpowers/specs/2026-10-13-slurp-picklist-defaults-design.md`.
- Repo has no test runner: verify by build + live page.
- In-place branch `slurp-picklist-defaults`, no worktree (dist/ is the loaded extension).
- No version bump / release until the user has tested it.

---

### Task 1: Feature module + wiring

**Files:**
- Create: `src/content/features/ui-fixes/slurp-picklist-defaults.js`
- Modify: `src/content/main.js` (import + `initSlurpPicklistDefaults()` after `initSlurpTypeDefault()`)

**Interfaces:**
- Produces: `initSlurpPicklistDefaults()`, `picklistsFromDefinitions(json) -> Map<string, string[]>`, `fieldIdFromErrorId(id) -> string|null`

- [x] **Step 1:** Write the module (fetch `/api/internal/v1/vaults/{v}/data_sets/{v}/registration_form_definitions`, PickList only, hidden values dropped; decorate error `<li>`s and dialog forms; idempotent via `.cdd-picklist-defaults` marker; `watchDocument` re-runs after Turbo re-renders).
- [x] **Step 2:** Wire into `main.js`.
- [x] **Step 3:** `npm run build` — passes.
- [ ] **Step 4:** Commit.

### Task 2: Verification

- [ ] **Step 1:** User reloads the extension and refreshes the mapping page (vault 8158, slurp 1000024490).
- [ ] **Step 2:** Read-only DOM check, no clicks on the buttons: a `.cdd-picklist-defaults` row under the Origin and Intermediate/Final errors and in their dialogs, with Commercial / Screening Library / Synthesized / Virtual and Final compound / Intermediate; none in the "+ Add a field…" form.
- [ ] **Step 3:** User clicks a value: the default is applied and the error line disappears.
- [ ] **Step 4:** Fix whatever the test shows, rebuild, commit.
