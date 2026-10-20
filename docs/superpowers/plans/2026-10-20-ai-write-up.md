# AI write-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Write-up panel tab that sends the whole ELN entry plus its stoichiometry table to the CERIT LLM and shows a polished English text and a list of text-vs-table mismatches.

**Architecture:** Pure model module (entry text from Slate body, table rows from feature_map, prompt, tolerant JSON parse, unit conversion, comparison, yield) tested with `node --test`; background.js does the HTTP call with the stored key; a panel pane drives it; an options card stores enable/key/model.

**Tech Stack:** MV3 extension, plain ES modules, Vite bundle for the content script, `node --test`.

## Global Constraints

- Off by default. Host `https://llm.ai.e-infra.cz/*` is an OPTIONAL host permission, requested when the user turns the feature on.
- API base `https://llm.ai.e-infra.cz/v1`, `Authorization: Bearer <key>`; default model `gpt-oss-120b`.
- The key lives in `chrome.storage.local` and is read only by background.js and the options page — never sent to the CDD page context.
- Nothing is written into the ELN.
- Tolerance 2 % relative. Table units in the payload: `mass` g, `volume` L, `mole` mol; `userInput.msample` is the sample mass as typed.
- Messages: imperative verbs, fault shown in numbers; bold for structure, colour only for state.

---

### Task 1: Model (pure)

**Files:** Create `src/content/features/ai-write-up/model.js`; Test `tests/ai-write-up-model.test.js`

**Produces:**
- `entryTextFromBody(bodyJson: string) → string` — headings as `## `, paragraphs, table rows ` | `-joined; reaction nodes skipped; empty lines collapsed.
- `tableRowsFromEntry(eln_entry) → Array<{row, reaction, name, role, massG, volumeL, mol, eq, mw, limiting}>` (1-based `row` across all reactions in display order).
- `buildMessages(text, rows) → [{role, content}]`.
- `parseLlmJson(content: string) → object|null` (strips fences / prose, takes the outermost `{…}`).
- `parseQuantity(str) → {kind: "mass"|"volume"|"amount"|"eq"|"percent", value}|null` in g / L / mol / eq / %.
- `buildChecks(result, rows) → Array<{kind: "mismatch"|"missing"|"yield"|"note", label, text?, table?, message?}>`.

Steps: write tests (units, tolerance, yield from product mass, missing rows, fenced JSON, Slate extraction), run → fail, implement, run → pass, commit.

### Task 2: Settings flag + options card

**Files:** Create `src/shared/ai-write-up-settings.js`, `src/options/ai-write-up-ui.js`; Modify `src/options/options.html` (rail item + card), `src/options/options.js` (init + chip), `manifest.json` (`optional_host_permissions`, gecko `data_collection_permissions.optional: ["websiteContent"]`).

**Produces:** `AI_ORIGIN`, `AI_DEFAULT_MODEL`, `getAiSettings()`, `saveAiSettings(patch)`, `initAiWriteUp()`, `isAiWriteUpEnabled()`, `onAiWriteUpChanged(cb)`.

Enable toggle calls `chrome.permissions.request({origins: [AI_ORIGIN + "/*"]})`; refused → unchecked. Test connection → background `AI_MODELS` → lists models and whether a whisper model exists.

### Task 3: Background call

**Files:** Modify `src/background.js`; `src/shared/event-types.js` (message names, copied in background).

Messages: `CDD_STOICH_TOOLS_AI_MODELS` → `{ok, models}`; `CDD_STOICH_TOOLS_AI_CHAT {id, messages}` → `{ok, content}` or `{ok:false, error: "no-key"|"auth"|"timeout"|"network"|"http", status}`; `CDD_STOICH_TOOLS_AI_CANCEL {id}`. 180 s timeout via AbortController.

### Task 4: Panel tab

**Files:** Create `src/content/features/ai-write-up/panel-tab.js`; Modify `src/content/features/sample-panel.js` (third tab when enabled), `src/content/main.js` (init flag).

Polish entry → fetch `/vaults/<v>/eln/v2/entries/<id>` → model → background → render English text card (Copy) + Checks card.

### Task 5: Verify

`npm test`, `npm run build`, reload, check on entry 1000000823 (vault 1000000109) without a key (error path) and with the user's key.

### Task 6 (after Task 5): Dictation SK/CZ/EN — see spec.
