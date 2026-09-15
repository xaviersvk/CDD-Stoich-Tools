# Form Clipboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** *Copy N forms* / *Paste* on the Protocol Forms settings page, carrying forms between vaults by field **name**, never by id, and creating them through the internal API the page itself uses.

**Architecture:** A bridge reads `fieldDefinitionsMap` (protocol and run field ids and names) from the page's React props. A pure model turns every numeric `fieldID` into a `{ $field, $component }` placeholder at copy time and back into the target's id at paste time, refusing any id it cannot translate. An API module POSTs `{ form_definition }` with the page's CSRF token. A card previews the plan; the run creates the checked forms and reloads. Spec: `docs/superpowers/specs/2026-09-15-form-clipboard-design.md`.

**Tech Stack:** Plain ES modules, Vite, `chrome.storage.local`, throwaway `node` tests.

## Global Constraints

- Clipboard key `cddFormClipboard` → `{ vaultId, vaultName, copiedAt, forms }`; a stored form is `{ name, form_type, components }` with no `id`, `data_set_id`, timestamps, and no numeric `fieldID`.
- Allowed numeric keys inside `components`: `context`, `span`. Any other numeric value under a key ending in `id`/`ID`/`_id` or named like a reference stops that form's copy.
- Skip on exact form-name match; skip a form with any unresolvable field name and list them.
- POST body `{ form_definition: { name, form_type, components } }`, headers `Content-Type: application/json`, `Accept: application/json`, `X-CSRF-Token`, `X-Requested-With: XMLHttpRequest`, `credentials: same-origin`.
- Commit per task. Do not push.

---

### Task 1: `form-model.js` (+ node test) — `neutralize`, `resolve`, `planForms`, `formFieldNames`. Commit.
### Task 2: `inject/hooks/form-store-bridge.js`, events, `inject/main.js`; `api.js`; `clipboard.js`. Build. Commit.
### Task 3: `panel.js`, `styles.js`, `init.js`, registration. Build. Commit.
### Task 4: Live check in vault 6772 (throwaway form via Paste, then CDD's Delete). Release 15.15.0: manifest, CHANGELOG, RELEASES, FEATURE_CATALOG, README. Build. Commit. Stop.
