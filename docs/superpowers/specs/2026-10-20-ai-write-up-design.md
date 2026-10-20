# AI write-up (CERIT LLM) — design

Status: approved 2026-10-20

## Goal

A chemist dictates an ELN entry (Windows dictation, Win+H — CERIT offers no
speech-to-text), clicks one button, and gets back:

1. the whole entry rewritten as a tidy English experimental section, and
2. a list of mismatches between the text and the stoichiometry table.

Nothing is written into the ELN. The result is a proposal in the panel that
the user copies.

Off by default.

## Service

CERIT-SC AI as a Service, OpenAI-compatible:
`https://llm.ai.e-infra.cz/v1/` with `Authorization: Bearer <key>`. The key is
generated at `chat.ai.e-infra.cz` → Settings → Account → API keys (MetaCentrum
or MUNI account).

## Settings (*Settings → AI write-up*)

- **Enable AI write-up** — off by default. Turning it on requests the optional
  host permission `https://llm.ai.e-infra.cz/*`; refused → stays off.
- **API key** — password field, `chrome.storage.local`.
- **Model** — select filled from `GET /v1/models`, default `gpt-oss-120b`.
- **Test connection** — `GET /v1/models`, shows OK or the error.

## Panel

A third tab, **Write-up**, shown only while the feature is enabled.

- **Polish entry** button (becomes **Cancel** while running).
- **English text** card with a **Copy** button.
- **Checks** card, one line per finding, fault shown in the numbers:
  - `Pd(PPh3)4 — text 0.05 mmol · table 0.10 mmol`
  - `Yield — text 78 % · calculated 71 %`
  - `Not in text: Et3N`
  - LLM notes as given (`Add the temperature of the workup`).

## Data flow

1. Click → fetch `/vaults/<v>/eln/v2/entries/<id>` (the same endpoint the
   entry payload fallback uses). Entry text = text of the Slate `body` in
   order, skipping reaction/embedded nodes. Table rows = the existing print
   parser's rows (same snapshot). If dictated text turns out not to reach the
   JSON before autosave, read the editor DOM instead.
2. Content script → `background.js` message → `POST /v1/chat/completions`.
   The key never enters the CDD page context.
3. The prompt sends the table with numbered rows and asks for JSON:

   ```json
   { "text": "...",
     "amounts": [{ "row": 2, "mass": "250 mg", "volume": null, "mmol": "1.2", "eq": "1.1" }],
     "product": { "row": 5, "mass": "312 mg", "yield": "78 %" },
     "notMentioned": [3],
     "notes": ["..."] }
   ```

   The LLM does the name→row matching; it does no arithmetic.
4. The plugin converts units (mg/g/kg, µL/mL/L, µmol/mmol/mol), compares with
   the table at 2 % relative tolerance, and computes the yield itself:
   `(product mass / product MW) / limiting reactant mol`, the limiting
   reactant being the reactant row with equivalents 1 (else the smallest mol).

## Errors

| Case | Message |
|---|---|
| No key | Add your API key in Settings → AI write-up |
| 401/403 | Check the API key in Settings → AI write-up |
| Timeout (180 s) / network | CERIT did not answer — try again |
| Unparseable JSON | Show the text if recoverable; Checks: "Checks unavailable" |
| No table | Polishing only; Checks card hidden |

## Dictation (second step, same branch)

Languages: Slovak, Czech, English (picker in the Write-up tab, remembered).
Input to the LLM may mix all three; output is always English.

- CERIT serves `whisper-large-v3` (confirmed by the user). Record with
  `MediaRecorder`, send to `/v1/audio/transcriptions` (`model:
  whisper-large-v3`, `language: sk|cs|en`) through `background.js`. Works in
  Chrome and Firefox; audio stays at CERIT. No Google fallback.
- The transcript is inserted at the cursor in the ELN editor.

## Manifest / release

- `optional_host_permissions: ["https://llm.ai.e-infra.cz/*"]`
- Firefox `data_collection_permissions.optional: ["websiteContent"]`
- Store listings mention the optional transmission at release time.

## Testing

Unit (`node --test`): unit conversion, comparison/tolerance, yield, tolerant
JSON parsing (fences, prose around it), Slate text extraction, prompt
building. Manual: entry 1000000823 in test vault 1000000109.
