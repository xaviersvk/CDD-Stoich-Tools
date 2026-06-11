# Architecture Overview

> Audience: a developer who has **never** seen this codebase and needs to be able
> to maintain it alone. Every important file is explained with: **why it exists**,
> **who uses it**, **what it exports**, and **what breaks if you delete it**.
>
> This document was produced by reading the actual source (not just the README).
> Where the live code and the existing `README.md` disagree, this document
> follows the code and calls out the difference.

---

## 1. What this project is, in one paragraph

This is a **Chrome / Firefox Manifest V3 browser extension** that adds
quality-of-life tooling on top of the **CDD Vault** web app
(`*.collaborativedrug.com`). It has **no backend and no service worker**. All it
does is: (1) run a *content script* on CDD pages that builds extra UI, and (2)
inject a second *page script* into CDD's own JavaScript world so it can secretly
read the JSON that CDD downloads in the background. The flagship feature is a
floating **"CDD Samples" panel** that lists every sample in an ELN reaction
table with copy-on-click values; around it there is a bag of smaller fixes
(print sheets, dose-response overrides, depleted-sample marking, CSS tweaks).

The single most important architectural idea — and the thing a newcomer must
understand first — is the **two-world split**, explained in section 3.

---

## 2. How the plugin starts (the boot sequence)

There is no central "app". The browser starts two independent scripts, and one
of them starts a third. Follow the arrows:

```
Browser loads a *.collaborativedrug.com page
        │
        │ manifest.json → content_scripts (run_at: "document_idle")
        ▼
[1] dist/assets/content.js   (bundled from src/content/main.js)
        │   runs in the ISOLATED world
        │   init() in main.js is the ONE entry point
        │
        ├─ injectPageScript()  ──────────────►  [2] dist/assets/inject.js
        │     adds <script src=...inject.js>        runs in the PAGE / MAIN world
        │                                           (bundled from src/inject/main.js)
        │                                           hooks window.fetch + XMLHttpRequest
        │
        ├─ window.addEventListener("message", handleMessage)   ← listens for [2]'s data
        │
        └─ wires up every feature (ensurePanel, print buttons,
              dose-response, ui-fixes, eln-title, …)
```

Concretely, the boot order is defined entirely by `src/content/main.js` →
`init()` (read it top to bottom — it is the table of contents for the whole
extension):

1. **Guard**: bail out if the host is not CDD (`isSupportedHost`), and bail out
   if the content script already ran once (`window.__CDD_STOICH_TOOLS_CONTENT__`).
   This double-init guard matters because CDD is a single-page app and the
   script can be evaluated more than once.
2. **`injectPageScript()`** — adds the `<script>` tag that loads the inject
   bundle into the page world. This is what makes network sniffing possible.
3. **Feature initialisers** — `initDoseResponseOverride()`,
   `initSamplePanelFields()`, then `ensurePanel()`, the depleted marker, print
   buttons, all the `ui-fixes`, `eln-title`, etc.
4. **Observers / watchers** — `watchUrlChanges`, `watchKetcherDialog`,
   `watchFileDialog`, and many per-feature `MutationObserver`s that re-apply the
   UI whenever CDD re-renders.

> **Mental model:** the content script is *reactive*. It paints once, then
> re-paints forever in response to (a) URL changes, (b) DOM mutations, and (c)
> messages from the inject script.

---

## 3. The two worlds (read this twice)

A content script and the page it runs on share the **same DOM** but **different
JavaScript worlds**. This is a browser security boundary, not a project choice.

| | **Content script** (`src/content/`) | **Inject script** (`src/inject/`) |
| --- | --- | --- |
| Runs in | *Isolated* world | *Page / MAIN* world |
| Can touch the DOM? | Yes | Yes |
| Can use `chrome.*` / `chrome.storage`? | **Yes** | **No** |
| Sees the page's own `window.fetch`? | **No** (it has its own copy) | **Yes** (can monkey-patch it) |
| Sees CDD's JS objects? | No | Yes |

Why this matters: CDD loads the ELN reaction/stoichiometry data via its own
`fetch`/`XHR`. The content script **cannot** observe those calls because its
`fetch` is a different object than the page's. The **only** way to read that
JSON is to run code *in the page world* and patch the page's `fetch`. That is
the entire reason `src/inject/` exists.

The two worlds cannot call each other's functions. They communicate **only**
through `window.postMessage`, with every message tagged
`source: "CDD_STOICH_TOOLS"` so each side can ignore everyone else's messages.

```
inject (page world)  ──post()──►  window.postMessage  ──►  content (isolated world)
   bus.js                            { source, type, payload }       message-router.js

content (isolated)   ──postMessage──►  window  ──►  inject print/dispatcher.js
   panel-print.js / print-buttons.js     PRINT_REQUEST
```

---

## 4. Data flow: from page load to rendered UI

This is the single most important diagram. Trace one ELN page open:

```
 (1) User opens an ELN entry page. CDD's own JS fetches the entry JSON.
        │
 (2) inject/hooks/fetch-hook.js (or xhr-hook.js) is wrapping window.fetch.
     It clones the response and hands the text/JSON to processJsonPayload().
        │
 (3) inject/main.js processJsonPayload(data):
        ├─ isElnPayload(data)?              (common.js) — is this an ELN entry blob?
        ├─ hasAnyReactionFeature(data)?     (common.js) — any reaction at all?
        │     └─ post(REACTION_VISIBILITY, {visible})   ──► content
        ├─ extractAllReactionRows(data)     (sample-data.js)  → flat sample objects
        │     └─ post(SAMPLE_DATA, {reactionCount, samples})  ──► content
        └─ extractPrintData(data)           (print-data.js)   → per-reaction print rows
              └─ post(PRINT_DATA, {reactionPayloads, depletedIdentifiers}) ──► content
        │
 (4) content/message-router.js handleMessage(event):
        ├─ REACTION_VISIBILITY → STATE.hasReactionFeature; show/hide panel
        ├─ SAMPLE_DATA         → STATE.lastPayload = payload; renderFromState()
        └─ PRINT_DATA          → STATE.reactionPayloads / STATE.depletedIdentifiers
                                  then ensurePrintButtons() + markDepleted…()
        │
 (5) content/features/sample-panel.js renderFromState():
        ├─ guards: isElnEntryPage? hasReactionFeature? not Ketcher?
        ├─ ensurePanel()           — create the floating box once
        └─ renderSamples(payload)  — group by reaction, draw a card per sample,
              renderConfiguredFields(sample) → static registry + custom fields
              → resolveFieldValue() (shared/sample-panel-fields.js)
              → createCopyableRow() → DOM
        │
 (6) User clicks "Print" on the panel:
        panel-print.js printPanel() builds an HTML string and
        postMessage(PRINT_REQUEST, {html})  ──► inject/print/dispatcher.js
        which writes the HTML into a hidden <iframe> and calls iframe.print().
```

**Key takeaway:** the inject side does *all the heavy CDD-shape parsing* and
sends the content side a small, **flat, already-cleaned** object. The content
side never has to understand CDD's deeply-nested JSON. This is a deliberate and
good separation.

---

## 5. Module dependency diagram

Arrows mean "imports / depends on". `shared/` is depended on by everyone and
depends on nobody (that is the rule that keeps it reusable).

```
                         ┌─────────────────────────────────────────┐
                         │            src/shared/                   │
                         │  event-types.js   (EVENT_SOURCE, EVENTS) │
                         │  plugin-constants.js (PANEL_ID, colors)  │
                         │  page-detection.js  (isElnEntryPage)     │
                         │  sample-panel-fields.js (FIELD REGISTRY) │  ◄── no imports out
                         └───────▲───────────────▲──────────▲───────┘
                                 │               │          │
          ┌──────────────────────┘               │          └───────────────┐
          │                                       │                          │
 ┌────────┴─────────── CONTENT (isolated) ────────┴──────┐         ┌─────────┴──── POPUP ────┐
 │ main.js ── init() wires everything                    │         │ popup.js                │
 │   ├─ inject-loader.js   (loads the inject bundle)     │         │  imports the registry   │
 │   ├─ message-router.js ─► state.js (STATE)            │         │  renders checkboxes     │
 │   ├─ url-watcher.js, overlay-watcher.js               │         │  reads/writes           │
 │   ├─ api/cdd-api.js   (authenticated fetch)           │         │  chrome.storage.local   │
 │   ├─ utils/ clipboard, dom, url, format, log          │         └─────────────────────────┘
 │   └─ features/                                        │
 │        sample-panel.js ─► panel-print.js              │
 │        print-buttons.js, depleted-marker.js,          │
 │        eln-title.js, savedSearchCopyLinks/,           │
 │        dose-response-override/ (init,dom,scanner,     │
 │           menu,actions,payload,state,styles)          │
 │        ui-fixes/ (8 small modules)                    │
 └───────────────────────────────────────────────────────┘
          ▲                                       
          │ window.postMessage (the ONLY link between the two worlds)
          ▼
 ┌──────────────────── INJECT (page / MAIN world) ───────┐
 │ main.js ── installs hooks, parses, posts results      │
 │   ├─ bus.js            (post → window.postMessage)     │
 │   ├─ hooks/ fetch-hook.js, xhr-hook.js                 │
 │   ├─ parsers/ common.js, sample-data.js,              │
 │   │           print-data.js, field-resolvers.js        │
 │   └─ print/ dispatcher.js  (hidden-iframe printing)    │
 └────────────────────────────────────────────────────────┘
```

Two builds produce two bundles (`vite.content.config.js` → `assets/content.js`,
`vite.inject.config.js` → `assets/inject.js`). The popup is **not** bundled — it
is copied verbatim and imports `shared/` at runtime, which is why the build also
copies `src/shared/` into `dist/shared/`.

---

## 6. Significant files, one by one

For each: **why it exists / who uses it / what it exports / what breaks if removed.**

### Boot & infrastructure

#### `manifest.json`
- **Why:** the contract with the browser — declares the content script match
  pattern, the web-accessible inject bundle, the popup, and the `storage`
  permission. MV3.
- **Used by:** the browser itself.
- **Exports:** n/a (declarative).
- **If removed:** there is no extension. Nothing loads.

#### `src/content/main.js`  →  bundled as `assets/content.js`
- **Why:** the single content-script entry point. `init()` is the wiring
  diagram of the whole extension in code form.
- **Used by:** the browser (content script). Imports every feature.
- **Exports:** nothing (it calls `init()` at the bottom).
- **If removed:** no UI, no inject loading, no features. The extension becomes a
  no-op.

#### `src/inject/main.js`  →  bundled as `assets/inject.js`
- **Why:** the page-world entry point. Installs the network hooks and routes
  every captured payload through `processJsonPayload()`.
- **Used by:** loaded via `inject-loader.js`'s `<script>` tag.
- **Exports:** nothing (IIFE, guarded by `window.__CDD_STOICH_TOOLS_HOOKED__`).
- **If removed:** the panel and print sheets get **no data** — they'd show
  "Waiting for reaction data…" forever. Pure-DOM features (CSS ui-fixes,
  eln-title, dose-response) would still work.

#### `src/content/inject-loader.js`
- **Why:** the bridge that crosses into the page world. It creates a `<script
  src=chrome.runtime.getURL("assets/inject.js")>` element; loading it as a real
  page script is what makes it run in the MAIN world.
- **Used by:** `main.js` (`injectPageScript()`).
- **Exports:** `injectPageScript()`.
- **If removed:** the inject bundle never loads → same effect as removing
  `inject/main.js`.

#### `src/content/state.js`
- **Why:** the single in-memory source of truth for the content side
  (`STATE`): last sample payload, reaction-visibility flag, depleted IDs, panel
  collapsed flag, last URL.
- **Used by:** `message-router.js`, `sample-panel.js`, `print-buttons.js`,
  `depleted-marker.js`, `url-watcher.js`, `overlay-watcher.js`.
- **Exports:** `STATE`, `resetState()`.
- **If removed:** every feature loses its shared memory; nothing renders. This
  is the spine of the content side.

#### `src/content/message-router.js`
- **Why:** the *only* place that turns inject→content messages into `STATE`
  changes and re-renders. Keeps message handling in one switch statement.
- **Used by:** `main.js` registers it as the `"message"` listener.
- **Exports:** `handleMessage(event)`.
- **If removed:** data arrives from inject but is never stored or rendered — the
  panel stays empty.

### Watchers (SPA survival)

#### `src/content/url-watcher.js`
- **Why:** CDD is a single-page app; the URL changes without a full reload. This
  detects navigation so the panel can reset and re-render.
- **Used by:** `main.js` (`watchUrlChanges(cb)`).
- **Exports:** `watchUrlChanges(onChange)`.
- **Detail:** uses **both** a `MutationObserver` and a `setInterval(…, 700ms)`
  belt-and-braces poll. The poll is a small, permanent CPU cost (see §8).
- **If removed:** navigating between ELN entries would leave a stale panel.

#### `src/content/overlay-watcher.js`
- **Why:** the structure editor (Ketcher) opens a modal; the floating panel must
  hide so it doesn't cover the dialog.
- **Used by:** `main.js` (`watchKetcherDialog`), and `sample-panel.js` calls
  `updatePanelVisibilityForOverlays()` after creating the panel.
- **Exports:** `isKetcherDialogOpen()`, `updatePanelVisibilityForOverlays()`,
  `watchKetcherDialog()`.
- **Caveat:** hardcodes the id string `"cdd-stoich-panel"` instead of importing
  `PANEL_ID` from `plugin-constants.js` (see §8, tech debt).
- **If removed:** the panel can obscure the molecule editor.

### The shared layer (`src/shared/`)

#### `src/shared/event-types.js`
- **Why:** the contract for cross-world messaging — one `EVENT_SOURCE` tag and
  the `EVENTS` enum so both sides agree on message names without magic strings.
- **Used by:** `inject/bus.js`, `inject/main.js`, `inject/print/dispatcher.js`,
  `content/message-router.js`, `content/features/panel-print.js`,
  `content/features/print-buttons.js`.
- **Exports:** `EVENT_SOURCE`, `EVENTS` (`REACTION_VISIBILITY`, `SAMPLE_DATA`,
  `PRINT_DATA`, `PRINT_REQUEST`).
- **If removed:** every messaging site breaks; the two worlds can no longer talk.

#### `src/shared/plugin-constants.js`
- **Why:** central ids, the inject bundle path, and the per-reaction colour
  palette so the panel can colour-code reactions consistently.
- **Used by:** `inject-loader.js` (paths), `sample-panel.js` (`PANEL_ID`,
  `REACTION_COLORS`).
- **Exports:** `PANEL_ID`, `INJECT_SCRIPT_ID`, `INJECT_BUNDLE_PATH`,
  `PRINT_BUTTON_CLASS`, `PRINT_BUTTON_ATTR`, `REACTION_COLORS`.
- **If removed:** the panel can't be created/found and the inject bundle path is
  unknown.

#### `src/shared/page-detection.js`
- **Why:** a single predicate for "are we on an ELN entry page?" used to gate
  panel rendering.
- **Used by:** `sample-panel.js`.
- **Exports:** `isElnEntryPage()` — **loose** regex (`/eln/i` or `/entry/i` in
  the path).
- **If removed:** the panel would try to render on every page.
- **⚠ Duplication:** `eln-title.js` defines its **own, stricter**
  `isElnEntryPage()` (`/^\/vaults\/\d+\/eln\/entries\/\d+/`). The two disagree on
  what counts as an ELN page (see §8).

#### `src/shared/sample-panel-fields.js`  ← the most important shared file
- **Why:** the **central field registry**. It is the one place that defines
  *which attributes the panel can show*, *how to read each value from a sample*,
  *how to format it*, *what to copy on click*, and *when to highlight it red*. It
  is deliberately DOM-free and import-free so it can be used **verbatim** by both
  the bundled content script and the unbundled popup.
- **Used by:** `content/features/sample-panel.js`,
  `content/features/panel-print.js`, and `popup/popup.js`.
- **Exports (the important ones):**
  - `SAMPLE_PANEL_FIELDS` — the static field registry (Name, Location, Purity,
    Internal ID, Density, Concentration, Solvent, … plus optional fields).
  - `resolveFieldValue(field, sample)` → `{ text, copyValue, highlight }` or
    `null`. **Never throws** (every resolver is try/wrapped).
  - `getSamplePanelSettings()` / `saveSamplePanelSettings()` — the visible-field
    map in `chrome.storage.local`, merged over registry defaults.
  - `getDefaultVisibleFields()`, `parsePurity()`, `formatConcentration()`,
    `getCddCompatibleConcentrationCopyValue()`.
  - Custom-field machinery: `getCustomFieldsFromSample()`,
    `discoverCustomFields()`, `get/saveDiscoveredCustomFields()`,
    `touchSeenCustomFields()`, `pruneExpiredCustomFields()` (120-day TTL).
- **If removed:** the panel, the panel-print column builder, **and** the popup
  all fail to import → the sample-panel feature is completely dead. (This exact
  failure shipped at tag `v7.7.0`, where the importers existed but this file did
  not yet — see §9.)

### The sample panel feature

#### `src/content/features/sample-panel.js`
- **Why:** owns the floating panel: builds its DOM and CSS, makes it draggable,
  collapsible, persists position to `localStorage`, groups samples by reaction,
  and renders each sample card using the shared registry.
- **Used by:** `main.js` (`ensurePanel`, `initSamplePanelFields`,
  `renderFromState`) and `message-router.js` (re-render on `SAMPLE_DATA`).
- **Exports:** `ensurePanel`, `removePanel`, `renderFromState`, `renderSamples`,
  `makePanelDraggable`, `initSamplePanelFields`, `getPanelParts`, helpers.
- **If removed:** no floating panel at all.

#### `src/content/features/panel-print.js`
- **Why:** turns the panel's currently-enabled fields into a printable HTML
  table and asks the inject side to print it.
- **Used by:** the panel's "Print" button (`printPanel(visibleFields)`).
- **Exports:** `printPanel(visibleFields)`.
- **If removed:** the panel's Print button does nothing; the per-reaction print
  buttons (`print-buttons.js`) are unaffected.

### Inject parsing & printing

#### `src/inject/bus.js`
- **Why:** the single outbound channel from the page world. Wraps
  `window.postMessage` and stamps every message with `EVENT_SOURCE`.
- **Used by:** `inject/main.js`.
- **Exports:** `post(type, payload)`.
- **If removed:** the inject side can parse data but never deliver it.

#### `src/inject/hooks/fetch-hook.js` & `xhr-hook.js`
- **Why:** the actual network interception. `fetch-hook` wraps `window.fetch`
  and clones each response; `xhr-hook` patches `XMLHttpRequest.prototype.open/send`
  and reads `responseText` on `load`. Both forward bodies to the parsers.
- **Used by:** `inject/main.js`.
- **Exports:** `installFetchHook(processJsonPayload, tryParseText)`,
  `installXhrHook(tryParseText)`.
- **If removed:** no CDD data is ever captured → empty panel and print sheets.

#### `src/inject/parsers/common.js`
- **Why:** shared payload predicates and a text→JSON helper. Defines what an ELN
  payload *is* and how to find reaction features.
- **Used by:** `inject/main.js`, `sample-data.js`, `print-data.js`.
- **Exports:** `normalizeFeatures`, `isElnPayload`, `getReactionFeatures`,
  `hasAnyReactionFeature`, `createTextParser`.
- **If removed:** the inject side can't recognise or walk CDD payloads.

#### `src/inject/parsers/sample-data.js`
- **Why:** builds the **flat sample objects** the panel consumes. Walks every
  reaction's `stoichiometryTable.rows`, dedupes by
  `reactionIndex::rowUid::sampleId`, and merges all the resolver outputs.
- **Used by:** `inject/main.js` (`extractAllReactionRows`).
- **Exports:** `extractRowsFromReactionFeature`, `extractAllReactionRows`.
- **If removed:** `SAMPLE_DATA` is never produced → panel shows no samples.

#### `src/inject/parsers/field-resolvers.js`
- **Why:** the **CDD-shape knowledge** lives here. Every CDD field can be nested
  in several places and named several ways; each resolver probes a list of
  candidate paths/labels and returns `null` when absent ("best-effort").
- **Used by:** `sample-data.js`.
- **Exports:** `resolveBatchFields` (purity/density/internalID),
  `resolveSampleFields` (concentration/units/solvent), `resolveMoleculeFields`,
  `resolveIdentityFields` (batch name/vendor/owner/project),
  `resolveQuantityFields`, `resolveRowName`, `resolveRowLocation`,
  `collectCustomFields`, `getBatchFields`, `getSampleFields`,
  `getFieldValueCaseInsensitive`, `shortenLocation`.
- **If removed:** samples would have ids but no attributes — every card empty.
- **Note:** this is the **riskiest file to change** because it hardcodes CDD's
  data shapes; it is also the file with **no tests** (see §8).

#### `src/inject/parsers/print-data.js`
- **Why:** builds per-reaction print rows and extracts depleted sample
  identifiers. Also remembers the last non-empty result (module-level
  `PRINT_STATE`) so a later empty response doesn't wipe a good one.
- **Used by:** `inject/main.js` (`extractPrintData`).
- **Exports:** `extractPrintData(payload)`.
- **If removed:** print buttons and depleted-sample marking lose their data.
- **Note:** contains a large block of commented-out `console.log` debug lines
  (lines ~107–145) — dead code worth deleting. The `PRINT_STATE` memo can serve
  **stale** data because the inject script never resets it on navigation (§8).

#### `src/inject/print/dispatcher.js`
- **Why:** does the actual printing in the page world. Listens for
  `PRINT_REQUEST`, writes the HTML into a hidden `<iframe>`, waits for images,
  then calls `iframe.print()`. Printing is kept in the page world so all
  window-level side effects stay there.
- **Used by:** installed by `inject/main.js`; triggered by `panel-print.js` and
  `print-buttons.js` via `PRINT_REQUEST`.
- **Exports:** `installPrintDispatcher()`.
- **If removed:** clicking any Print button posts a message that nobody handles —
  nothing prints.

### Other content features

#### `src/content/features/print-buttons.js`
- **Why:** injects a print icon into each ELN reaction block and builds the full
  A4 stoichiometry sheet HTML.
- **Used by:** `main.js` and `message-router.js` (on `PRINT_DATA`).
- **Exports:** `ensurePrintButtons`, `printStoichiometrySheet`, etc.
- **If removed:** no per-reaction print buttons (panel print still works).

#### `src/content/features/depleted-marker.js`
- **Why:** greys-out + strikes-through depleted samples in radio-button sample
  selectors so the user doesn't pick one.
- **Used by:** `main.js` and `message-router.js` (on `PRINT_DATA`).
- **Exports:** `ensureDepletedStyle`, `markDepletedSamplesInSelector`,
  `startDepletedMarkerObserver`.
- **Detail:** matches by normalised text containment, which is intentionally
  fuzzy (and therefore slightly fragile).
- **If removed:** depleted samples are no longer visually flagged in selectors.

#### `src/content/features/eln-title.js`
- **Why:** rewrites the browser tab title on ELN entry pages (3 modes).
- **Used by:** `main.js` (`initElnTitle`).
- **Exports:** `initElnTitle`.
- **Note:** has its **own** strict `isElnEntryPage()` (duplicate, §8) and starts
  **two** `MutationObserver`s.
- **If removed:** tab titles stay as CDD's default.

#### `src/content/features/savedSearchCopyLinks/savedSearchCopyLinks.js`
- **Why:** adds a "Copy Link" action to saved-search rows.
- **Used by:** `main.js` (`initSavedSearchCopyLinks`).
- **Exports:** `initSavedSearchCopyLinks`.
- **If removed:** no copy-link buttons on `/searches`.

#### `src/content/features/dose-response-override/` (8 files)
- **Why:** adds an "Easy Override: ON/OFF" toggle to the search-results action
  bar; when on, each dose-response plot gets an inline menu that PUTs an
  intercept-override payload back to CDD.
- **Sub-modules:** `init.js` (entry + observer), `state.js` (config + mutable
  flags), `dom.js` (find plots, extract edit URL, build the toggle),
  `scanner.js` (insert menus), `menu.js` (the select + Apply),
  `actions.js` (action → payload builder → GET then PUT via `cdd-api.js`),
  `payload.js` (builds CDD intercept-override request bodies),
  `styles.js` (CSS).
- **Uses:** `content/api/cdd-api.js`, `content/utils/url.js`,
  `content/utils/dom.js`.
- **If removed:** the dose-response quick-override workflow disappears; nothing
  else is affected (it is well isolated).

#### `src/content/features/ui-fixes/` (8 small modules)
- **Why:** independent, mostly CSS-injection fixes (file dialog wrapping,
  click-to-copy molecule fields, left-ellipsis locations, default filter
  operator, location-picker resize, molecule-links grid, depleted-samples
  collapse, consumed-batches collapse).
- **Used by:** `main.js` (each has an `initX()`/`watchX()`).
- **If removed:** that one cosmetic fix is gone; nothing else breaks. These are
  the safest files to touch.

### Content utilities & API

#### `src/content/api/cdd-api.js`
- **Why:** an authenticated `fetch` helper that adds CSRF token + credentials so
  the extension can call CDD's own API (used by dose-response PUTs).
- **Used by:** `dose-response-override/actions.js`.
- **Exports:** `getCsrfToken()`, `fetchJson(url, options)`.
- **If removed:** dose-response overrides can't talk to CDD.

#### `src/content/utils/clipboard.js`
- **Why:** the **single** clipboard helper. Prefers the async Clipboard API and
  falls back to a hidden-textarea + `execCommand("copy")` when it is unavailable
  or blocked.
- **Used by:** `sample-panel.js` (`copyTextWithFeedback`), `copyable-fields.js`,
  `savedSearchCopyLinks.js` (`copyText`).
- **Exports:** `copyText(text)` → boolean, `copyTextWithFeedback(el, text)`.
- **If removed:** every copy-to-clipboard interaction breaks.

#### `src/content/utils/format.js`
- **Why:** holds `normalizeValue` (collapse whitespace + trim) used for fuzzy
  text comparisons (sample names, depleted ids).
- **Used by:** `depleted-marker.js`, `sample-panel.js`.
- **Exports:** `normalizeValue(value)`.
- **If removed:** depleted matching and sample-depleted detection break.

#### `src/content/utils/dom.js`
- **Why:** `escapeHtml` (for safely building print HTML strings) and
  `decodeHtmlEntities` (for reading CDD's `react_props` attribute).
- **Used by:** `panel-print.js`, `print-buttons.js`,
  `dose-response-override/dom.js`.
- **Exports:** `escapeHtml`, `decodeHtmlEntities`.
- **If removed:** print HTML could break/inject, and dose-response URL
  extraction fails.

#### `src/content/utils/url.js`
- **Why:** small URL transforms for the dose-response API
  (view→edit→PUT URLs, absolute URLs).
- **Used by:** `dose-response-override/actions.js`, `dom.js`.
- **Exports:** `absoluteUrl`, `viewUrlToEditUrl`, `editUrlToPutUrl`.
- **If removed:** dose-response actions can't compute their target URLs.

#### `src/content/utils/log.js`
- **Why:** a tiny prefixed logger (`logOverride`). Currently always logs.
- **Used by:** (effectively a dev helper).
- **Exports:** `logOverride(...args)`.
- **If removed:** negligible.

### Popup

#### `src/popup/popup.html` / `popup.js` / `popup.css`
- **Why:** the extension's settings page (toolbar icon). Lets the user pick the
  ELN tab-title mode and toggle which sample-panel fields (static + discovered
  custom) are shown.
- **Used by:** the browser action; `popup.js` imports the shared registry at
  runtime (it is **not** bundled).
- **If removed:** no settings UI; features fall back to their defaults.

### Build

#### `vite.content.config.js` / `vite.inject.config.js`
- **Why:** the two real build configs. Content build empties `dist/`, bundles
  `content.js`, and copies `manifest.json`, `icons/`, `popup/`, and `shared/`.
  Inject build has `emptyOutDir: false` and only adds `inject.js`.
- **Used by:** `npm run build` (content **then** inject — order matters).
- **If removed:** no build output.

---

## 7. Strengths of the architecture

1. **The two-world split is correct and well-documented.** Network sniffing
   genuinely *must* happen in the page world; printing side-effects are kept
   there too. The boundary is crossed only via tagged `postMessage`.
2. **Heavy parsing is isolated.** All the brittle "where does CDD hide this
   field" logic lives in `inject/parsers/`; the content side receives small flat
   objects. You can change the UI without touching CDD-shape code, and vice
   versa.
3. **One shared, DOM-free registry** (`sample-panel-fields.js`) is the single
   source of truth for fields, reused by content **and** popup. Adding a field is
   a one-line registry edit.
4. **Defensive, never-throw parsing.** `resolveFieldValue` and the resolvers
   wrap everything in try/catch and skip on `null`. A malformed payload degrades
   gracefully (empty rows) instead of crashing the page.
5. **Uniform feature pattern.** Almost every feature is "inject a `<style>` once
   + start a debounced `MutationObserver`", registered in one `init()`. Easy to
   read, easy to add to (the README's "How to add a feature" is accurate).
6. **Good guards against double-init** (`window.__CDD_*__` flags) for an SPA that
   re-evaluates scripts.
7. **Thoughtful settings lifecycle** — custom fields carry a `lastSeen`
   timestamp and a 120-day TTL, with pure (clock-injected) helpers that are
   inherently unit-testable.

---

## 8. Weaknesses / technical debt (with evidence)

| # | Issue | Evidence | Impact |
| --- | --- | --- | --- |
| 1 | **Duplicate `isElnEntryPage`** with different behaviour | loose `shared/page-detection.js` vs strict `eln-title.js:59` | Panel and title feature disagree about what an ELN page is. |
| 2 | **Hardcoded panel id** | `overlay-watcher.js:5` uses `"cdd-stoich-panel"` not `PANEL_ID` | If `PANEL_ID` ever changes, overlay hiding silently breaks. |
| 3 | **Observer sprawl, no central manager** | ~12 separate `MutationObserver`s on `document.body`/`documentElement` `subtree:true` (main.js ×2, depleted-marker, url-watcher, overlay-watcher, eln-title ×2, dose-response, copyable-fields, depleted/consumed collapse, filter-default…) | Permanent CPU cost on a busy SPA; no teardown. |
| 4 | **Redundant file-dialog observers** | `main.js` `watchFileDialog()` already calls `applyFileDialogFixes()`, then a second `fileDialogObserver` calls it again | Duplicate work on every mutation. |
| 5 | **`url-watcher` double-watches** | `MutationObserver` **and** `setInterval(700ms)` | Belt-and-braces, but the interval runs forever. |
| 6 | **Dead/commented debug code** | `print-data.js:107–145` block of commented `console.log` | Noise; obscures the actual logic. |
| 7 | **Stray always-on log** | `left-ellipsis-locations.js:30` logs unconditionally (others use a `DEBUG` flag) | Console noise in production. |
| 8 | **Inject memo can go stale** | `print-data.js` `PRINT_STATE.lastNonEmpty…` never resets across SPA navigations | Print/depleted data from a previous entry can linger. |
| 9 | **Depleted matching is text-containment** | `depleted-marker.js wrapperMatchesDepleted` uses `text.includes(id)` | Fragile; a substring collision could mismark. |
| 10 | **No tests / no lint / no dev script** | `package.json` has only build scripts | The riskiest code (`field-resolvers.js`, `print-data.js`) is unverified. |
| 11 | **Version chaos** | `manifest.json` = `7.7.0`, `package.json` = `1.0.0`, commit messages claim `8.0.0`, latest tag `v7.7.0` points at a **non-building** commit (§9) | Release management is untrustworthy. |
| 12 | **No teardown anywhere** | observers/listeners are never disconnected | Acceptable for a page-lifetime script, but leaks if the host ever re-inits. |

---

## 9. A concrete release-hygiene bug worth knowing

The git tag **`v7.7.0` points at a commit that does not build.** At that commit,
`sample-panel.js` and `panel-print.js` already `import … from
"../../shared/sample-panel-fields.js"`, but that file **did not exist anywhere in
the tree** at `v7.7.0`. It was added later (commit `b1c9f3c`). So the entire
sample-panel feature was a dangling import in the tagged release; the current
`HEAD` is the first state where it actually resolves.

**Lesson for maintenance:** always `npm run build` before tagging, and treat a
green build as the gate for a release tag.

---

## 10. Recommendations for future development (prioritised)

**Quick wins (low risk):**
1. Delete the commented debug block in `print-data.js` and the stray
   `console.log` in `left-ellipsis-locations.js`.
2. Replace `"cdd-stoich-panel"` in `overlay-watcher.js` with `PANEL_ID`.
3. Unify `isElnEntryPage` — keep the strict version in `shared/page-detection.js`
   and have both the panel and `eln-title.js` import it (verify the panel still
   shows where expected before switching).
4. Fix the version mess: pick one number (the commit history intends **8.0.0**),
   set it in `manifest.json`, align `package.json`, and only then tag.

**Structural (medium):**
5. Introduce a tiny **observer registry** util: a single
   `observeBody(callback)` that debounces via `requestAnimationFrame` and returns
   a disconnect handle. Migrate features onto it to cut observer count and add
   teardown. Remove the redundant second file-dialog observer in `main.js`.
6. Reset `print-data.js` `PRINT_STATE` (and ideally the content `STATE`) on the
   inject side when a new ELN entry payload arrives, to avoid stale print data.

**Confidence (higher value, more effort):**
7. Add **unit tests** for the pure functions that carry the most risk and have
   no DOM dependency: everything in `field-resolvers.js`, `print-data.js`'s row
   mapping, and `sample-panel-fields.js` (`resolveFieldValue`,
   `touchSeenCustomFields`, `pruneExpiredCustomFields`,
   `getCddCompatibleConcentrationCopyValue`). These are already written in a
   test-friendly, side-effect-free way (clock is injected as `now`).
8. Add a `lint` script (the project has zero static analysis today) and a
   `dev`/watch build to shorten the rebuild-reload loop.
9. Capture a few **real CDD payload fixtures** (sanitised) so the resolvers can
   be tested against actual shapes — this is the single biggest source of silent
   breakage when CDD changes its API.

---

## 11. 60-second orientation for a new maintainer

- Start in **`src/content/main.js`** — `init()` is the whole extension's wiring.
- To understand **data**, read **`src/inject/parsers/`** (CDD shape →
  flat object) and **`src/shared/sample-panel-fields.js`** (flat object → UI rows).
- To understand **cross-world messaging**, read **`src/shared/event-types.js`**,
  then `inject/bus.js`, then `content/message-router.js`.
- To add a feature: copy any `ui-fixes/*` module, export an `initX()`, and call
  it from `init()`. Need CDD data? Add a parser + a new `EVENTS.*` + a
  `message-router` case.
- Before tagging a release: **`npm run build` must pass** (see §9).
</content>
</invoke>
