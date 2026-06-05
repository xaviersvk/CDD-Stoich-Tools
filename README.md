# CDD Stoich Tools

A browser extension that adds quality-of-life tooling on top of the
**Collaborative Drug Discovery (CDD) Vault** web app
(`*.collaborativedrug.com`).

It is a **Manifest V3** extension that runs only on CDD pages. Its biggest
feature is a floating **ELN Sample Panel** that reads the stoichiometry data CDD
loads in the background and shows the relevant sample / batch / molecule
attributes in one draggable box — with configurable columns and a print view.
Around that it bundles a set of smaller fixes and shortcuts for everyday CDD
work (dose-response overrides, print sheets, depleted-sample marking, saved
search copy links, and various DOM/CSS fixes).

**Main functionality at a glance**

- Floating ELN sample panel with configurable fields + print.
- Per-reaction stoichiometry print sheets.
- ELN browser-tab title override.
- "Easy Override" actions for dose-response plots.
- Depleted-sample highlighting in sample selectors.
- "Copy link" buttons on saved searches.
- A collection of CSS/DOM UI fixes.

> Target system: CDD Vault (`collaborativedrug.com`). Built for Chrome
> (Manifest V3) with a Firefox-compatible manifest block.

### Availability

Published builds (may be ahead of / behind this source):

- Chrome Web Store: <https://chromewebstore.google.com/detail/cdd-stoichiometric-table/ghbhjmmmgejokgekdcbcmgcfaoddlffg>
- Firefox Add-ons: <https://addons.mozilla.org/en-GB/firefox/addon/cdd-stoichiometric-table-tools/>

No remote code is executed; all logic is bundled locally with Vite.

---

## Features

Every feature is a content-script module under `src/content/features/`. Some
features need data from CDD's own API responses; that data is captured by the
**inject** script (see [Architecture](#architecture)).

### Floating ELN Sample Panel

- **What it does:** On an ELN entry page that contains a reaction /
  stoichiometry table, it shows a draggable, collapsible panel listing each
  sample grouped by reaction. Each card shows the configured attributes
  (concentration, purity, density, …), copy-on-click values, and warning badges
  for low purity / depleted samples.
- **Main files:**
  - `src/content/features/sample-panel.js` — panel DOM, drag, collapse,
    rendering.
  - `src/shared/sample-panel-fields.js` — the field **registry**, value
    resolution, and settings (shared with the popup).
  - `src/content/features/panel-print.js` — "Print" button → printable table.
- Deep-dived below in [Sample Panel Deep Dive](#sample-panel-deep-dive).

### Configurable Sample Panel Fields

- **What it does:** The popup lets you choose which attributes the panel shows.
  There are two kinds of fields: a fixed **static registry** (Name, Location,
  Purity, Concentration, …) and **dynamic custom fields** discovered from the
  vault's own `batch_fields` / sample fields (e.g. `*Hygroscopic`). Custom
  fields have a 120-day "last seen" lifecycle.
- **Main files:** `src/shared/sample-panel-fields.js` (registry + storage),
  `src/popup/popup.js` (checkboxes), `src/content/features/sample-panel.js`
  (discovery + rendering).

### Stoichiometry Print Buttons

- **What it does:** Adds a small print icon to each reaction block on an ELN
  page. Clicking it generates a formatted A4 stoichiometry sheet (name,
  FW/exact mass/density, mass/volume, equivalents/mole/yield, reaction scheme
  image) and prints it.
- **Main files:**
  - `src/content/features/print-buttons.js` — button injection + print HTML.
  - `src/inject/parsers/print-data.js` — extracts per-reaction rows from the
    CDD payload.
  - `src/inject/print/dispatcher.js` — performs the actual print via a hidden
    iframe (runs in the page context).

### ELN Tab Title Override

- **What it does:** Rewrites the browser tab title on ELN entry pages. Three
  modes: original CDD title, ELN title only, or `EntryID - ELN title`
  (default). Configurable in the popup.
- **Main files:** `src/content/features/eln-title.js`, `src/popup/*`.

### Dose Response Override ("Easy Override")

- **What it does:** Adds an "Easy Override: ON/OFF" toggle to the search-results
  action bar. When ON, each dose-response plot gets an inline action menu
  (`> Max`, `< Min`, `Do not calculate`, `Do not overwrite`) that PUTs the
  corresponding intercept-override payload back to CDD via its API.
- **Main files:** `src/content/features/dose-response-override/` (see
  [Feature Structure](#feature-structure)) and `src/content/api/cdd-api.js`.

### Depleted Sample Marker

- **What it does:** When the inject script reports depleted sample identifiers,
  this greys out and strikes through matching options in radio-button sample
  selectors so you don't pick a depleted sample.
- **Main files:** `src/content/features/depleted-marker.js`. Depleted IDs come
  from `src/inject/parsers/print-data.js` via the `PRINT_DATA` message.

### Saved Search Copy Links

- **What it does:** On the `/searches` page, adds a "Copy Link" action to each
  saved-search row that copies the absolute search URL to the clipboard.
- **Main files:**
  `src/content/features/savedSearchCopyLinks/savedSearchCopyLinks.js`.

### UI Fixes

A bundle of small, mostly CSS-injection fixes under
`src/content/features/ui-fixes/`:

| Module | What it fixes |
| --- | --- |
| `file-dialog-fixes.js` | Wraps long file-preview links; widens the file dialog; pins the "associate file" button bar. |
| `copyable-fields.js` | Makes molecule overview/property/batch field values click-to-copy. |
| `left-ellipsis-locations.js` | Left-truncates long location strings (RTL trick) in sample tables. |
| `filter-default.js` | Auto-selects the second filter operator instead of "Any value" (ELN + Inventory filters). |
| `location-picker-resize.js` | Adds a draggable resizer to the location-picker tree panel (width saved in `localStorage`). |
| `molecule-links-fixes.js` | Lays out `#molecule-links` as a responsive multi-column grid. |
| `depleted-samples-collapse.js` | Collapses depleted samples into a `<details>` block on the sample data view. |
| `consumed-batches-collapse.js` | Collapses consumed batches into a togglable block on the molecule batches page. |

---

## Architecture

```
src/
├── content/     content script  – isolated world, owns the DOM & UI
│   ├── features/    one folder/file per feature
│   ├── api/         authenticated fetch helper (cdd-api.js)
│   ├── utils/       clipboard, dom, url, log helpers
│   ├── main.js          entry point: init() wires everything
│   ├── message-router.js  receives inject→content messages
│   ├── state.js         in-memory STATE (last payload, flags)
│   ├── inject-loader.js   injects the page script
│   ├── url-watcher.js     SPA navigation detection
│   └── overlay-watcher.js Ketcher dialog detection
│
├── inject/      page script – MAIN world, hooks network & prints
│   ├── hooks/       fetch-hook.js, xhr-hook.js
│   ├── parsers/     sample-data.js, print-data.js, field-resolvers.js, common.js
│   ├── print/       dispatcher.js (hidden-iframe printing)
│   ├── bus.js       post() → window.postMessage
│   └── main.js      installs hooks, parses payloads, posts results
│
├── popup/       extension popup (settings UI)
│   ├── popup.html / popup.js / popup.css
│
└── shared/      code used by content, inject AND popup
    ├── sample-panel-fields.js  field registry + settings
    ├── event-types.js          EVENT_SOURCE constant
    ├── plugin-constants.js     PANEL_ID, colors, paths
    └── page-detection.js       page predicates
```

### Content script

Declared in `manifest.json` under `content_scripts` → `assets/content.js`,
injected at `document_idle` on `*://*.collaborativedrug.com/*`. It runs in the
**isolated world**: it can read and modify the DOM and use `chrome.*` APIs, but
it **cannot** see the page's own JavaScript objects or its `window.fetch`.
`main.js` `init()` is the single entry point that wires up every feature.

### Inject script

`assets/inject.js` is listed under `web_accessible_resources`. The content
script injects it as a `<script src>` (see `inject-loader.js`) so it runs in the
page's **MAIN world**. This is the whole reason the inject script exists: only
code in the page context can monkey-patch `window.fetch` and
`XMLHttpRequest.prototype` to observe CDD's API responses. It parses those
responses and posts the results back to the content script.

### Why some things live in inject and not content

- **Network interception** (`hooks/`): the content script's `fetch` is a
  different object than the page's. To read CDD's ELN/reaction JSON you must
  patch the page's `fetch`/`XHR` — only possible from the MAIN world.
- **Parsing** (`parsers/`): kept next to the hooks so the heavy CDD-shape
  knowledge stays in one world; the content side receives a small, flat object.
- **Printing** (`print/dispatcher.js`): the content side builds the HTML string,
  but the actual `document.write` + `window.print()` into a hidden iframe is
  done in the page context to keep all window-level print side effects there.

### Data flow

```
        CDD server
            │  (JSON responses)
            ▼
┌─────────────────────────── PAGE / MAIN world ───────────────────────────┐
│  fetch-hook.js / xhr-hook.js                                             │
│        │ response text/json                                             │
│        ▼                                                                │
│  inject/main.js  processJsonPayload()                                   │
│        ├── isElnPayload? → hasReaction?                                  │
│        ├── extractAllReactionRows() ─┐  (sample-data.js)                 │
│        └── extractPrintData()  ──────┤  (print-data.js)                  │
│                                      ▼                                   │
│                          bus.post(type, payload)                        │
│                          window.postMessage({source:"CDD_STOICH_TOOLS"})│
└───────────────────────────────│─────────────────────────────────────────┘
                                 │  REACTION_VISIBILITY / SAMPLE_DATA / PRINT_DATA
┌───────────────────────────────▼──── CONTENT / isolated world ───────────┐
│  message-router.js  handleMessage()                                     │
│        ├── STATE.hasReactionFeature / STATE.lastPayload / …             │
│        └── renderFromState() ; ensurePrintButtons() ; markDepleted()    │
│                                      │                                   │
│                       sample-panel.js renders the panel                 │
└───────────────────────────────│─────────────────────────────────────────┘
                                 │  PRINT_REQUEST { html }   (content → page)
┌───────────────────────────────▼──── PAGE / MAIN world ──────────────────┐
│  inject/print/dispatcher.js  → hidden iframe → window.print()           │
└─────────────────────────────────────────────────────────────────────────┘
```

All messages are plain `window.postMessage` objects tagged with
`source: "CDD_STOICH_TOOLS"` (`EVENT_SOURCE` in `shared/event-types.js`). Both
sides ignore any message without that tag.

---

## Feature Structure

How each feature is registered and initialized (all from
`src/content/main.js` `init()` unless noted).

| Feature | Entry point | Registered / initialized by | Main functions |
| --- | --- | --- | --- |
| Sample panel | `sample-panel.js` | `ensurePanel()`, `initSamplePanelFields()`, `renderFromState()`; re-rendered from `message-router.js` on `SAMPLE_DATA` | `ensurePanel`, `renderSamples`, `renderConfiguredFields`, `makePanelDraggable` |
| Panel print | `panel-print.js` | `printPanel(visibleFields)` from the panel's Print button | `buildPrintColumns`, `printPanel` |
| Print buttons | `print-buttons.js` | `ensurePrintButtons()` + re-run on `PRINT_DATA` | `ensurePrintButtons`, `buildPrintHtml`, `printStoichiometrySheet` |
| ELN title | `eln-title.js` | `initElnTitle()` | `updateElnTabTitle`, `loadElnTitleMode` |
| Dose response | `dose-response-override/init.js` | `initDoseResponseOverride()` | `scanDoseResponseOverride`, `enhancePlot`, `createActionMenu` |
| Depleted marker | `depleted-marker.js` | `ensureDepletedStyle()`, `startDepletedMarkerObserver()`, `markDepletedSamplesInSelector()` | `markDepletedSamplesInSelector` |
| Saved search links | `savedSearchCopyLinks/…` | `initSavedSearchCopyLinks()` | `addCopyLinksToSavedSearches` |
| File dialog fixes | `ui-fixes/file-dialog-fixes.js` | `applyFileDialogFixes()`, `injectAssociateFileBarStyles()`, `watchFileDialog()` | `enhanceFileDialogLinks`, `fixAssociateFileBar` |
| Copyable fields | `ui-fixes/copyable-fields.js` | `observeCopyableFields()` | `enhanceCopyableFields` |
| Left ellipsis | `ui-fixes/left-ellipsis-locations.js` | `injectLeftEllipsisForLocations()` | (CSS only) |
| Filter default | `ui-fixes/filter-default.js` | `initFilterDefaultFix()` | `fixElnFilters`, `fixInventoryFilters` |
| Location picker resize | `ui-fixes/location-picker-resize.js` | `initLocationPickerResize()` | `enhanceTreeContainer` |
| Molecule links | `ui-fixes/molecule-links-fixes.js` | `injectMoleculeLinksStyles()` | (CSS only) |
| Depleted collapse | `ui-fixes/depleted-samples-collapse.js` | `watchDepletedSamples()` | `collapseDepletedSamples` |
| Consumed collapse | `ui-fixes/consumed-batches-collapse.js` | `watchConsumedBatches()` | `collapseConsumedBatches` |
| Ketcher overlay | `overlay-watcher.js` | `watchKetcherDialog()` | `updatePanelVisibilityForOverlays` |

Common pattern: most features expose an `initX()` / `watchX()` that injects a
`<style>` once and starts a `MutationObserver` (usually debounced via
`requestAnimationFrame` or a `setTimeout`) to re-apply on DOM changes.

### Dose Response Override sub-modules

`src/content/features/dose-response-override/`:

| File | Responsibility |
| --- | --- |
| `init.js` | Entry point; injects styles, ensures the toggle, starts the observer. |
| `state.js` | Shared config + mutable state (`easyOverrideEnabled`, `selectedAction`). |
| `dom.js` | DOM helpers: find plot roots, extract edit URL, the ON/OFF toggle. |
| `scanner.js` | Finds plots and inserts the action menu when enabled. |
| `menu.js` | Builds the `<select>` + Apply button and runs the chosen action. |
| `actions.js` | Maps each action to a payload builder + PUT via `cdd-api.js`. |
| `payload.js` | Builds CDD intercept-override request bodies. |
| `styles.js` | Injected CSS for the action bar/toggle. |

---

## Sample Panel Deep Dive

This is the most important feature. It lives in
`src/content/features/sample-panel.js` plus the shared registry
`src/shared/sample-panel-fields.js`.

### How the current sample is determined

There is no "selected sample" — the panel shows **all** samples from the ELN
entry's reaction/stoichiometry tables. The inject parser walks every reaction
feature's `stoichiometryTable.rows`, keeps rows that have a `sample`, and
deduplicates by `reactionIndex::rowUid::sampleId`
(`inject/parsers/sample-data.js`). The content side groups them by reaction for
display (`groupSamplesByReaction`).

### Where the data comes from

```
CDD JSON (eln_entry.feature_map[*].data.stoichiometryTable.rows[*])
   └─ inject/parsers/sample-data.js  extractRowsFromReactionFeature()
        ├─ field-resolvers.js  resolveBatchFields()    → purity, density, internalID
        ├─ field-resolvers.js  resolveSampleFields()   → concentration, units, solvent
        ├─ field-resolvers.js  resolveMoleculeFields() → formula, MW, FW, names
        ├─ field-resolvers.js  resolveIdentityFields() → batchName, vendorId, owner
        ├─ field-resolvers.js  resolveQuantityFields() → amount, volume
        └─ collectCustomFields(getBatchFields/getSampleFields) → customBatchFields/customSampleFields
   →  flat sample object  ──post("SAMPLE_DATA")──►  STATE.lastPayload
```

Each `sample` reaching the content side is a **flat object** (e.g.
`{ name, location, purity, density, concentration, concentrationUnits, solvent,
moleculeName, molecularFormula, molecularWeight, formulaWeight, batchName,
vendorId, owner, amount, amountUnit, volume, customBatchFields,
customSampleFields, reactionIndex, reactionLabel, … }`). Resolvers are
**best-effort**: unknown fields are `null` and simply not rendered.

### How rendering works

1. `renderFromState()` guards (`isElnEntryPage`, `hasReactionFeature`, not
   Ketcher) and calls `renderSamples(STATE.lastPayload)`.
2. `renderSamples` groups samples by reaction, draws a coloured group box per
   reaction and a card per sample.
3. Per card, `renderConfiguredFields(sample)`:
   - iterates the **static registry** (`SAMPLE_PANEL_FIELDS`) in order, keeping
     only fields whose key is enabled in `visibleFields`;
   - then iterates the sample's **custom fields**, keeping enabled ones;
   - for each, `resolveFieldValue(field, sample)` returns
     `{ text, copyValue, highlight }` or `null` (→ row skipped);
   - `createCopyableRow(label, text, …)` builds a click-to-copy row.
4. Card decoration (low-purity badge, depleted badge, red border) is computed
   separately from field config using `parsePurity` + `isSampleDepleted`.

```
STATE.lastPayload.samples
      │ groupSamplesByReaction
      ▼
 [reaction group] → [sample card]
                         │ renderConfiguredFields
                         ├─ static fields  (SAMPLE_PANEL_FIELDS ∩ visibleFields)
                         └─ custom fields  (getCustomFieldsFromSample ∩ visibleFields)
                                  │ resolveFieldValue → {text,copyValue,highlight}
                                  ▼
                            createCopyableRow → DOM
```

### Drag & drop

`makePanelDraggable(panel)` listens on the header: `mousedown` records the start
position, a document-level `mousemove` updates `left/top` (clamped to the
viewport), and `mouseup` persists the position. Clicks on `<button>`s inside the
header are ignored so the action buttons still work.

### Minimization (collapse)

The header `−/+` button toggles a `collapsed` class on the panel; the CSS hides
`.cdd-stoich-body` when collapsed. The collapsed flag is persisted.

### Local storage

Panel **position and collapsed state** are stored in `localStorage` under
`cdd-stoich-panel-state` (`loadPanelState` / `savePanelState`). This is distinct
from the **field settings**, which live in `chrome.storage.local` (see below).
The location-picker resizer also uses `localStorage`
(`cdd-location-picker-tree-width`).

### Refresh

- **Automatic:** every captured `SAMPLE_DATA` message replaces
  `STATE.lastPayload` and calls `renderFromState()`.
- **Manual:** the header "Refresh" button calls `renderFromState()` again.
- **SPA navigation:** `url-watcher.js` resets state and re-renders on URL change.
- **Settings change:** `initSamplePanelFields()` listens to
  `chrome.storage.onChanged` and re-renders when the field selection changes.

---

## Popup Settings

The popup (`src/popup/popup.html`) is a plain page loaded as an ES module
(`<script type="module">`). It is **copied verbatim** into `dist/popup/` by the
content build and imports the shared registry from `../shared/…` at runtime.

### Settings that exist

| Setting | Storage key | Storage area | Where used |
| --- | --- | --- | --- |
| ELN tab title mode | `cddPluginElnTitleMode` | `chrome.storage.local` | `eln-title.js` |
| Sample panel visible fields | `cddSamplePanelVisibleFields` | `chrome.storage.local` | `sample-panel.js` |
| Discovered custom fields (+`lastSeen`) | `cddSamplePanelCustomFields` | `chrome.storage.local` | popup + `sample-panel.js` |
| Panel position / collapsed | `cdd-stoich-panel-state` | `localStorage` | `sample-panel.js` |
| Location tree width | `cdd-location-picker-tree-width` | `localStorage` | `location-picker-resize.js` |

`cddSamplePanelVisibleFields` is a `{ key: boolean }` map. On read it is merged
over the registry defaults so newly added static fields appear automatically and
dynamic custom-field keys are preserved (`getSamplePanelSettings`).

### How to add a new setting

Example: a checkbox in the popup that some feature reads.

1. **Pick a key** and a default, e.g. `const MY_KEY = "cddMyFeatureEnabled";`.
2. **Popup UI** (`src/popup/popup.html`): add the control
   (`<input type="checkbox" id="myFeature">`).
3. **Popup logic** (`src/popup/popup.js`): load it with
   `chrome.storage.local.get({ [MY_KEY]: false })` and save it on `change`
   with `chrome.storage.local.set({ [MY_KEY]: el.checked })`.
4. **Consume it** in the feature: read with `chrome.storage.local.get`, and
   optionally react live via
   `chrome.storage.onChanged.addListener((c, area) => …)` (see `eln-title.js`).
5. If the feature lives in **inject**, it cannot read `chrome.storage`; pass the
   value from the content script via `postMessage`, or gate the behaviour on the
   content side.

---

## Development

> There is currently **no `dev`/watch script and no test/lint setup** — only
> production builds. Iterating means: rebuild, then reload the unpacked
> extension in the browser.

Reference environment (from the maintainer's setup): Windows 11, Node.js
22.13.1, npm 10.8.3. The only dependency is Vite.

```bash
npm install          # installs vite (the only dependency)
npm run build        # builds content + inject into dist/ and copies popup/shared
# or individually:
npm run build:content
npm run build:inject
```

`build` runs `build:content` then `build:inject`. Order matters:
`build:content` empties `dist/` and copies the static assets; `build:inject`
has `emptyOutDir: false` so it adds `inject.js` without wiping the rest.

### Loading the extension in Chrome

1. Run `npm run build`.
2. Open `chrome://extensions`, enable **Developer mode**.
3. **Load unpacked** → select the `dist/` folder.
4. After code changes: `npm run build`, then click the **reload** icon on the
   extension card, and refresh the CDD page.

(The manifest also has a `browser_specific_settings.gecko` block, so the same
`dist/` can be loaded as a temporary add-on in Firefox.)

---

## Build Output

`dist/` after `npm run build`:

```
dist/
├── manifest.json          (copied from repo root)
├── assets/
│   ├── content.js         bundled content script (entry: src/content/main.js)
│   └── inject.js          bundled page script   (entry: src/inject/main.js)
├── popup/                 copied verbatim from src/popup/
│   ├── popup.html / popup.js / popup.css
├── shared/                copied verbatim from src/shared/ (popup imports it)
└── icons/                 copied from icons/ (if present)
```

- Both bundles use `inlineDynamicImports: true` and `minify: false` (readable
  output).
- The popup is **not bundled** — it is a real ES module at runtime, which is why
  `src/shared/` is copied into `dist/shared/` so the popup's
  `import "../shared/sample-panel-fields.js"` resolves.
- **Packaging:** zip the contents of `dist/` for the Chrome Web Store / Firefox
  AMO. (There is no packaging script in `package.json`.)

---

## How to Add a New Feature

1. **Create the module**
   `src/content/features/my-feature/my-feature.js` (or a single file for small
   features). Export an `initMyFeature()` (and a `watchMyFeature()` if it needs
   a `MutationObserver`). Inject any CSS once via a guarded `<style>` element.
2. **Register it** by importing into `src/content/main.js` and calling it inside
   `init()`. Keep DOM-dependent calls after `document_idle` (init already runs
   then).
3. **Initialize / observe:** if the feature must survive SPA navigation or
   re-renders, start a debounced `MutationObserver` (mirror
   `filter-default.js` / `depleted-samples-collapse.js`). Guard observers with a
   module-level "started" flag.
4. **Need CDD API data?** Add a parser under `src/inject/parsers/`, post a new
   message type from `src/inject/main.js`, and handle it in
   `src/content/message-router.js` → `STATE`. Add the message name to
   `src/shared/event-types.js`.
5. **Need a setting?** Follow [How to add a new setting](#how-to-add-a-new-setting).
6. `npm run build` and reload.

---

## Troubleshooting

| Symptom | Likely cause / check |
| --- | --- |
| **Content script doesn't run** | Host not matched — must be `*.collaborativedrug.com` (`isSupportedHost()` in `main.js`). Confirm `assets/content.js` exists in `dist/` and the extension is reloaded. The `__CDD_STOICH_TOOLS_CONTENT__` guard prevents double-init. |
| **Inject script doesn't load** | `injectPageScript()` adds `<script src=runtime.getURL("assets/inject.js")>`. Ensure `inject.js` is in `web_accessible_resources` (it is) and present in `dist/assets/`. Look for `"[CDD Stoich Tools] inject main loaded"` in the page console. |
| **MutationObserver not firing** | Most observers watch `document.body`/`documentElement` with `childList+subtree`; if a feature targets attributes, confirm the right `attributeFilter`. CDD is an SPA — features that only run once miss later renders; use the observer pattern. |
| **Storage doesn't update** | `chrome.storage.local` is async. The popup writes; the content side only reacts if it has an `onChanged` listener. Inject code **cannot** read `chrome.storage` at all. |
| **Panel doesn't show** | Needs all of: ELN entry page (`isElnEntryPage`), a reaction feature in the payload (`STATE.hasReactionFeature`, set by `REACTION_VISIBILITY`), and no open Ketcher dialog (`overlay-watcher.js` hides it). Without captured data it shows "Waiting for reaction data…". |
| **Panel empty / no fields** | Data captured but all chosen fields resolve to `null`, or the field isn't in CDD's payload. Verify in the popup which fields are enabled; remember a field can be listed but have no data. |

---

## Code Map

Most important files:

| File | Purpose | Used where |
| --- | --- | --- |
| `manifest.json` | MV3 manifest: content script, web-accessible inject, popup, permissions. | Browser |
| `src/content/main.js` | Content entry point; `init()` wires every feature. | Loaded as `assets/content.js` |
| `src/content/message-router.js` | Routes inject→content messages into `STATE` + triggers renders. | `main.js` |
| `src/content/state.js` | In-memory `STATE` (lastPayload, flags, depleted IDs). | All content features |
| `src/content/inject-loader.js` | Injects the page script into the MAIN world. | `main.js` |
| `src/content/features/sample-panel.js` | Floating panel: DOM, drag, collapse, rendering, field settings. | `main.js`, router |
| `src/content/features/panel-print.js` | Builds the panel's printable table from enabled columns. | Panel Print button |
| `src/content/features/print-buttons.js` | Per-reaction print buttons + full stoichiometry print sheet. | `main.js`, router |
| `src/content/features/eln-title.js` | ELN tab-title override. | `main.js` |
| `src/content/features/depleted-marker.js` | Marks depleted samples in selectors. | `main.js`, router |
| `src/content/api/cdd-api.js` | Authenticated `fetchJson` (CSRF, credentials). | Dose-response actions |
| `src/inject/main.js` | Inject entry point; installs hooks, parses, posts results. | Loaded as `assets/inject.js` |
| `src/inject/hooks/fetch-hook.js`, `xhr-hook.js` | Monkey-patch `fetch`/`XHR` to read CDD responses. | `inject/main.js` |
| `src/inject/parsers/sample-data.js` | Builds the flat sample objects for the panel. | `inject/main.js` |
| `src/inject/parsers/field-resolvers.js` | Best-effort field/value resolvers + custom-field collection. | `sample-data.js` |
| `src/inject/parsers/print-data.js` | Per-reaction print rows + depleted identifiers. | `inject/main.js` |
| `src/inject/print/dispatcher.js` | Hidden-iframe printing in the page context. | `PRINT_REQUEST` messages |
| `src/shared/sample-panel-fields.js` | Field registry, value resolution, field settings + lifecycle. | content, popup |
| `src/shared/event-types.js` | `EVENT_SOURCE` message tag. | inject + content |
| `src/shared/plugin-constants.js` | `PANEL_ID`, reaction colors, inject path. | content |
| `src/popup/popup.js` | Settings UI (ELN title + sample-panel fields). | Popup |
| `vite.content.config.js`, `vite.inject.config.js` | The two real build configs. | `npm run build` |

### Potential Cleanup

Resolved in the latest cleanup pass:

- ~~Empty `src/inject/constants.js`~~ — deleted.
- ~~Empty `src/content/utils/format.js`~~ — repurposed to host the shared
  `normalizeValue` helper.
- ~~Unused root `vite.config.js`~~ — deleted (the build uses
  `vite.content.config.js` + `vite.inject.config.js`).
- ~~Unused `isCddHost()`~~ — removed from `shared/page-detection.js`.
- ~~Three clipboard implementations~~ — unified into `utils/clipboard.js`
  (`copyText` now has the execCommand fallback); `copyable-fields.js` and
  `savedSearchCopyLinks.js` import it.
- ~~Duplicate `normalizeValue`~~ — single copy in `utils/format.js`, imported by
  `depleted-marker.js` and `sample-panel.js`.
- ~~Inconsistent event names~~ — all sides now use `EVENTS.*` from
  `shared/event-types.js` (no raw string literals).

Still open:

- **Duplicate `isElnEntryPage`:** one in `shared/page-detection.js` (loose
  regex, used by the panel) and a stricter one inline in `eln-title.js`. They
  disagree on what counts as an ELN entry page. Not unified yet because the
  panel relies on the loose regex and it needs verification.
- **Hard-coded id:** `overlay-watcher.js` uses `"cdd-stoich-panel"` instead of
  importing `PANEL_ID` from `plugin-constants.js`.
- **Version drift:** `manifest.json` is `7.6.2` while the latest commit message
  says it was bumped to `8.0.0`; `package.json` is a separate `1.0.0`.
