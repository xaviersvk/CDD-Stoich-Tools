# Feature Catalog

A complete inventory of everything the **CDD Stoich Tools** extension can do.
Every feature is documented with: user value, entry-point file, related files,
data source, dependencies, **maintenance difficulty** (low / medium / high), and
**regression risk** when modified.

All paths are relative to the repository root. Every feature is registered from
`src/content/main.js` → `init()` unless stated otherwise.

**Legend**
- *Maintenance difficulty* — how hard the code is to understand and change safely.
- *Regression risk* — how likely a change here is to break something (its own
  feature or others). "High" usually means: fragile CDD-DOM selectors, timing
  hacks, shared by many callers, or it **writes data back to CDD**.

**Quick index**

| Group | Features |
| --- | --- |
| [Sample Panel](#1-sample-panel) | Floating panel · Configurable fields · Custom-field discovery · Card warnings · Panel state persistence |
| [ELN Enhancements](#2-eln-enhancements) | Tab-title override · Reaction detection · Depleted-sample marker |
| [Printing](#3-printing) | Per-reaction stoichiometry sheet · Panel print · Print dispatcher |
| [Dose Response Tools](#4-dose-response-tools) | Easy Override toggle + action menu |
| [Saved Searches](#5-saved-searches) | Copy Link buttons |
| [UI Improvements](#6-ui-improvements) | File-dialog fixes · Left-ellipsis locations · Filter default operator · Location-picker resize · Molecule-links grid · Consumed-batches collapse |
| [Data Extraction](#7-data-extraction) | fetch/XHR hooks · Payload detection · flatSample builder · Field resolvers · Print-data extractor · Messaging bus |
| [Clipboard Features](#8-clipboard-features) | Unified clipboard helper · CDD-ready concentration copy · Click-to-copy fields |

---

## 1. Sample Panel

The flagship feature group: a floating "CDD Samples" box on ELN entry pages.

### 1.1 Floating Sample Panel
- **User value:** Shows every sample in the ELN reaction/stoichiometry table in
  one draggable, collapsible box — grouped and colour-coded by reaction — without
  scrolling through the page tables.
- **Entry point:** `src/content/features/sample-panel.js` (`ensurePanel`,
  `renderFromState`, `renderSamples`).
- **Related files:** `shared/sample-panel-fields.js`, `shared/plugin-constants.js`
  (`PANEL_ID`, `REACTION_COLORS`), `content/state.js`, `content/message-router.js`,
  `content/overlay-watcher.js`, `content/utils/clipboard.js`,
  `content/utils/format.js`, `content/features/panel-print.js`.
- **Data source:** `SAMPLE_DATA` message → `STATE.lastPayload.samples` (produced
  by the inject parsers from CDD's `eln_entry` JSON).
- **Dependencies:** the entire [Data Extraction](#7-data-extraction) pipeline; the
  shared field registry; reaction-visibility flag.
- **Maintenance difficulty:** **medium** — single large file (DOM building +
  inline CSS + drag + render loop).
- **Regression risk:** **medium-high** — it is the central UI; it is re-rendered
  from many triggers (messages, Refresh, SPA nav, settings change), so a change to
  `renderFromState`/`renderSamples` can have wide effects.

### 1.2 Configurable Panel Fields
- **User value:** The popup lets the user choose exactly which attributes appear
  on each sample card; the choice persists.
- **Entry point:** `src/shared/sample-panel-fields.js` (`SAMPLE_PANEL_FIELDS`
  registry, `resolveFieldValue`, `get/saveSamplePanelSettings`).
- **Related files:** `popup/popup.js` + `popup/popup.html` (checkboxes),
  `content/features/sample-panel.js` (`initSamplePanelFields`,
  `renderConfiguredFields`), `panel-print.js` (uses the same enabled set).
- **Data source:** `chrome.storage.local["cddSamplePanelVisibleFields"]` merged
  over registry defaults; values come from each `flatSample`.
- **Dependencies:** `chrome.storage.local`; the Floating Panel for display.
- **Maintenance difficulty:** **low** — adding a static field is a single registry
  entry (see `docs/ADDING_NEW_FIELDS.md`).
- **Regression risk:** **medium** — the registry is imported by panel, panel-print
  **and** the popup; changing its *shape* (not just adding a field) touches three
  consumers.

### 1.3 Custom-Field Discovery & Lifecycle
- **User value:** Vault-specific fields (e.g. `*Hygroscopic`) are auto-detected
  and offered as checkboxes; unused ones disappear after 120 days, enabled ones
  are kept forever.
- **Entry point:** `shared/sample-panel-fields.js` (`discoverCustomFields`,
  `touchSeenCustomFields`, `pruneExpiredCustomFields`,
  `get/saveDiscoveredCustomFields`).
- **Related files:** `sample-panel.js` (`persistDiscoveredCustomFields`),
  `popup/popup.js` (`renderCustomFieldsSection`),
  `inject/parsers/field-resolvers.js` (`collectCustomFields`).
- **Data source:** `flatSample.customBatchFields` / `customSampleFields`;
  persisted in `chrome.storage.local["cddSamplePanelCustomFields"]` with a
  `lastSeen` timestamp.
- **Dependencies:** `chrome.storage.local`; the Data Extraction pipeline.
- **Maintenance difficulty:** **medium** — async storage + pure TTL helpers (the
  helpers take `now` as an argument, so they are easy to reason about/test).
- **Regression risk:** **medium** — discovery writes a *different* storage key than
  settings on purpose, to avoid a render loop; preserve that separation.

### 1.4 Card Warnings (low purity / depleted)
- **User value:** Cards visually flag samples with purity ≤ 93 % ("⚠ LOW PURITY")
  and samples that are depleted ("⚠ DEPLETED SAMPLE USED"), with a red border.
- **Entry point:** `sample-panel.js` (`renderSamples` decoration block,
  `isSampleDepleted`).
- **Related files:** `shared/sample-panel-fields.js` (`parsePurity`),
  `content/utils/format.js` (`normalizeValue`), `STATE.depletedIdentifiers`.
- **Data source:** `flatSample.purity`; `STATE.depletedIdentifiers` (from
  `PRINT_DATA`).
- **Dependencies:** the depleted-identifier set populated by Data Extraction.
- **Maintenance difficulty:** **low**.
- **Regression risk:** **low** — purely additive decoration; depleted matching is
  fuzzy (name/id/internalID) so false negatives are possible but harmless.

### 1.5 Panel State Persistence (drag / collapse)
- **User value:** The panel remembers its position and collapsed/expanded state
  between page loads.
- **Entry point:** `sample-panel.js` (`makePanelDraggable`, `loadPanelState`,
  `savePanelState`).
- **Data source:** `localStorage["cdd-stoich-panel-state"]`.
- **Dependencies:** none beyond the panel itself.
- **Maintenance difficulty:** **low**.
- **Regression risk:** **low** — self-contained.

---

## 2. ELN Enhancements

Improvements that target ELN entry and sample-data pages.

### 2.1 ELN Tab-Title Override
- **User value:** Rewrites the browser tab title on ELN entries to
  `EntryID - ELN title` (default), `ELN title only`, or the original CDD title —
  making tabs easy to tell apart. Configurable in the popup.
- **Entry point:** `src/content/features/eln-title.js` (`initElnTitle`).
- **Related files:** `popup/popup.js` + `popup/popup.html` (mode `<select>`).
- **Data source:** live DOM — the title `<input>` `[data-autotest-id="title"]`
  and a `<div>` whose text starts with `ID:`; mode from
  `chrome.storage.local["cddPluginElnTitleMode"]`.
- **Dependencies:** `chrome.storage.local`.
- **Maintenance difficulty:** **medium** — relies on specific CDD DOM hooks and
  starts two `MutationObserver`s. It imports the shared strict `isElnEntryPage`
  from `shared/page-detection.js` (the local duplicate was removed 2026-06-16).
- **Regression risk:** **medium** — isolated from other features, but **fragile to
  CDD DOM changes** (selectors and the "ID:" text scan can break).

### 2.2 Reaction Detection (panel gate)
- **User value:** Ensures the Sample Panel only appears when the ELN entry
  actually contains a reaction/stoichiometry feature; hides it otherwise.
- **Entry point:** `inject/main.js` (`hasAnyReactionFeature` →
  `REACTION_VISIBILITY` message) + `message-router.js` handler.
- **Related files:** `inject/parsers/common.js`, `state.js`
  (`STATE.hasReactionFeature`), `sample-panel.js` (`removePanel`).
- **Data source:** CDD `eln_entry.feature_map` (any feature `type === "reaction"`).
- **Dependencies:** Data Extraction pipeline.
- **Maintenance difficulty:** **low**.
- **Regression risk:** **medium** — if this flag is wrong, the panel either never
  shows or shows on the wrong pages.

### 2.3 Depleted-Sample Marker (in selectors)
- **User value:** In radio-button sample selectors, depleted samples are greyed
  out and struck through so the user doesn't pick one.
- **Entry point:** `src/content/features/depleted-marker.js`
  (`markDepletedSamplesInSelector`, `startDepletedMarkerObserver`).
- **Related files:** `state.js` (`STATE.depletedIdentifiers`),
  `content/utils/format.js` (`normalizeValue`), `inject/parsers/print-data.js`
  (`extractDepletedIdentifiers`).
- **Data source:** `PRINT_DATA.depletedIdentifiers` (from CDD
  `stoichiometryTable.samples[*].depleted`); matched against radio `value`/text.
- **Dependencies:** Data Extraction (print-data) for the identifier set.
- **Maintenance difficulty:** **medium** — text-containment matching across
  several wrapper-selector fallbacks.
- **Regression risk:** **medium** — fuzzy `text.includes(id)` matching could
  mis-mark on substring collisions; runs on a broad `document` observer.

---

## 3. Printing

Generating printable A4 sheets. The HTML is built in the content world and
printed in the page world via a hidden iframe.

### 3.1 Per-Reaction Stoichiometry Print Sheet
- **User value:** Adds a print icon to each reaction block; clicking it produces a
  formatted stoichiometry sheet (name, FW/exact mass/density, mass/volume,
  equivalents/mole/yield, reaction-scheme image) and prints it.
- **Entry point:** `src/content/features/print-buttons.js` (`ensurePrintButtons`,
  `printStoichiometrySheet`).
- **Related files:** `inject/parsers/print-data.js` (rows + image),
  `inject/print/dispatcher.js`, `content/utils/dom.js` (`escapeHtml`),
  `state.js` (`STATE.reactionPayloads`), `shared/event-types.js` (`PRINT_REQUEST`).
- **Data source:** `PRINT_DATA.reactionPayloads` (from CDD `stoichiometryTable`
  rows, non-product).
- **Dependencies:** Data Extraction (print-data); the print dispatcher.
- **Maintenance difficulty:** **high** — large file that builds a big HTML string.
- **Regression risk:** **medium-high** — output formatting is easy to break;
  depends on print-data row shapes.

### 3.2 Panel Print
- **User value:** The Sample Panel's "Print" button prints a table of exactly the
  columns the user has enabled (empty columns are dropped).
- **Entry point:** `src/content/features/panel-print.js` (`printPanel`).
- **Related files:** `shared/sample-panel-fields.js` (`SAMPLE_PANEL_FIELDS`,
  `resolveFieldValue`, `getCustomFieldsFromSample`), `content/utils/dom.js`,
  `inject/print/dispatcher.js`.
- **Data source:** `STATE.lastPayload.samples` + the enabled `visibleFields`.
- **Dependencies:** the field registry; the print dispatcher.
- **Maintenance difficulty:** **low-medium**.
- **Regression risk:** **low** — reuses registry resolution; isolated to the panel.

### 3.3 Print Dispatcher
- **User value:** Performs the actual print without disturbing the page (hidden
  iframe, waits for images, then `print()`).
- **Entry point:** `src/inject/print/dispatcher.js` (`installPrintDispatcher`).
- **Data source:** `PRINT_REQUEST` messages carrying an HTML string.
- **Dependencies:** runs in the **page world**; receives messages from 3.1 / 3.2.
- **Maintenance difficulty:** **low** — small and stable.
- **Regression risk:** **low** — single, well-isolated responsibility.

---

## 4. Dose Response Tools

### 4.1 Easy Override (toggle + per-plot action menu)
- **User value:** Adds an "Easy Override: ON/OFF" toggle to the search-results
  action bar. When ON, each dose-response plot gets an inline menu (`> Max`,
  `< Min`, `Do not calculate`, `Do not overwrite`) that writes the corresponding
  intercept-override back to CDD with one click.
- **Entry point:** `src/content/features/dose-response-override/init.js`
  (`initDoseResponseOverride`).
- **Related files:** `dose-response-override/` — `state.js`, `dom.js`,
  `scanner.js`, `menu.js`, `actions.js`, `payload.js`, `styles.js`;
  plus `content/api/cdd-api.js`, `content/utils/url.js`, `content/utils/dom.js`
  (`decodeHtmlEntities`), `content/utils/log.js`.
- **Data source:** CDD's own API — `GET <editUrl>` then `PUT <putUrl>`; the edit
  URL is parsed from each plot's `react_props` / hidden form in the DOM.
- **Dependencies:** authenticated `fetchJson` (CSRF + credentials); CDD's
  dose-response edit/PUT endpoints and payload shape (`data_serieses`,
  `intercept_readout_definitions`).
- **Maintenance difficulty:** **high** — multi-file feature that parses DOM
  attributes, transforms URLs, and builds CDD request bodies.
- **Regression risk:** **high** — it **writes data back to CDD**. A wrong payload
  could mis-set overrides. It also depends on both CDD's DOM *and* API shapes.

---

## 5. Saved Searches

### 5.1 Saved-Search "Copy Link"
- **User value:** On the `/searches` page, adds a "Copy Link" action to each saved
  search that copies the absolute search URL to the clipboard.
- **Entry point:**
  `src/content/features/savedSearchCopyLinks/savedSearchCopyLinks.js`
  (`initSavedSearchCopyLinks`).
- **Related files:** `content/utils/clipboard.js` (`copyText`).
- **Data source:** live DOM — `tr.mainRow[id^='saved_search_session-']` rows and
  the run-search `<a href>`.
- **Dependencies:** the unified clipboard helper.
- **Maintenance difficulty:** **low**.
- **Regression risk:** **low** — gated to `/searches`, self-contained.

---

## 6. UI Improvements

Small, mostly CSS-injection fixes. Each is independent; removing one does not
affect the others. These are the **safest** files to touch.

### 6.1 File-Dialog Fixes
- **User value:** Wraps long file-preview links (shows the full filename), widens
  the file dialog, and pins the "associate file" button bar so it's always
  reachable.
- **Entry point:** `ui-fixes/file-dialog-fixes.js` (`applyFileDialogFixes`,
  `injectAssociateFileBarStyles`, `fixAssociateFileBar`).
- **Data source:** live DOM (`.filePreview a`, `#existing_file_selector_single`).
- **Dependencies:** none.
- **Maintenance difficulty:** **low** (CSS + a small text swap).
- **Regression risk:** **low**. *Note:* `main.js` runs two observers that both
  call `applyFileDialogFixes()` (redundant — see Architecture Review §8).

### 6.2 Left-Ellipsis Locations
- **User value:** Long location strings in sample tables truncate on the **left**
  (RTL trick), keeping the most specific part visible.
- **Entry point:** `ui-fixes/left-ellipsis-locations.js`
  (`injectLeftEllipsisForLocations`).
- **Data source:** live DOM CSS (`.AutoEllipsisTooltip`).
- **Dependencies:** none.
- **Maintenance difficulty:** **low** (CSS only).
- **Regression risk:** **low**. *Note:* contains a stray unconditional
  `console.log("[LEFT-ELLIPSIS] CSS injected")`.

### 6.3 Filter Default Operator
- **User value:** When a filter is added, auto-selects the second operator instead
  of leaving it on "Any value", saving a click — for both ELN (CDD SelectBox) and
  Inventory (MUI Select) filters.
- **Entry point:** `ui-fixes/filter-default.js` (`initFilterDefaultFix`).
- **Data source:** live DOM (`[data-testid="filter-item"]`, option labels).
- **Dependencies:** none.
- **Maintenance difficulty:** **high** — drives dropdowns with synthetic
  mouse/keyboard events and chained `setTimeout`s.
- **Regression risk:** **high** — the most timing-/DOM-fragile feature; a CDD
  markup or render-timing change can break it silently.

### 6.4 Location-Picker Resize
- **User value:** Adds a draggable resizer to the location-picker tree panel
  (double-click resets); the width is remembered.
- **Entry point:** `ui-fixes/location-picker-resize.js`
  (`initLocationPickerResize`, `enhanceTreeContainer`).
- **Data source:** live DOM (`.LocationPicker .tree-container`) +
  `localStorage["cdd-location-picker-tree-width"]`.
- **Dependencies:** none.
- **Maintenance difficulty:** **medium** (drag handling + CSS variable + storage).
- **Regression risk:** **low-medium** — isolated, but tied to picker class names.

### 6.5 Molecule-Links Grid
- **User value:** Lays out `#molecule-links` as a responsive multi-column grid
  (3 → 2 → 1 columns by viewport width) for readability.
- **Entry point:** `ui-fixes/molecule-links-fixes.js`
  (`injectMoleculeLinksStyles`).
- **Data source:** live DOM CSS (`#molecule-links`).
- **Dependencies:** none.
- **Maintenance difficulty:** **low** (CSS only).
- **Regression risk:** **low**.

### 6.6 Consumed-Batches Collapse
- **User value:** On the molecule batches page, folds "Consumed = Yes" batch
  blocks into a collapsible "Consumed batches (N)" section; restores them when you
  navigate away.
- **Entry point:** `ui-fixes/consumed-batches-collapse.js`
  (`watchConsumedBatches`, `collapseConsumedBatches`).
- **Data source:** live DOM (`#molecule-batches td[data-editable-cell-label=
  "Consumed"]`), gated to `/molecules/…#molecule-batches`.
- **Dependencies:** none.
- **Maintenance difficulty:** **medium-high** — physically **moves DOM nodes** in
  and out of a wrapper and reacts to `hashchange`.
- **Regression risk:** **medium** — moving CDD's own nodes is riskier than pure
  CSS; depends on specific ids/labels.

---

## 7. Data Extraction

The plumbing that captures CDD's network responses and turns them into the flat
objects the UI consumes. **This group underlies the Sample Panel, Printing, and
the Depleted features** — almost everything depends on it.

### 7.1 Network Hooks (fetch / XHR)
- **User value:** (Indirect.) The only way to read the ELN/reaction JSON CDD loads
  in the background; without it, the panel and print sheets have no data.
- **Entry point:** `src/inject/hooks/fetch-hook.js` (`installFetchHook`),
  `src/inject/hooks/xhr-hook.js` (`installXhrHook`).
- **Related files:** `inject/main.js`, `inject/parsers/common.js`.
- **Data source:** the page's own `window.fetch` responses and `XHR.responseText`
  (must run in the **page/MAIN world**).
- **Dependencies:** `inject-loader.js` must have injected the page script.
- **Maintenance difficulty:** **medium**.
- **Regression risk:** **high** — every data-driven feature flows through here;
  breaking a hook silently empties the panel.

### 7.2 Payload Detection
- **User value:** (Indirect.) Decides whether a captured response is an ELN entry
  with reactions, so the rest of the pipeline only runs on relevant data.
- **Entry point:** `src/inject/parsers/common.js` (`isElnPayload`,
  `getReactionFeatures`, `hasAnyReactionFeature`, `createTextParser`).
- **Data source:** CDD JSON (`eln_entry.feature_map`).
- **Dependencies:** none (pure predicates).
- **Maintenance difficulty:** **low**.
- **Regression risk:** **medium** — a wrong predicate disables everything
  downstream.

### 7.3 flatSample Builder
- **User value:** (Indirect.) Produces the clean, flat sample objects the content
  side renders, deduplicated per reaction/row/sample.
- **Entry point:** `src/inject/parsers/sample-data.js`
  (`extractAllReactionRows`, `extractRowsFromReactionFeature`).
- **Related files:** `field-resolvers.js`, `common.js`.
- **Data source:** CDD `stoichiometryTable.rows[*]`.
- **Dependencies:** the field resolvers.
- **Maintenance difficulty:** **medium**.
- **Regression risk:** **high** — defines the contract (`flatSample` shape) the
  whole panel relies on.

### 7.4 Field Resolvers
- **User value:** (Indirect.) Extracts each attribute (purity, density,
  concentration, molecule data, owner, …) from CDD's deeply nested, inconsistently
  named JSON — "best-effort", returning `null` when absent.
- **Entry point:** `src/inject/parsers/field-resolvers.js` (`resolveBatchFields`,
  `resolveSampleFields`, `resolveMoleculeFields`, `resolveIdentityFields`,
  `resolveQuantityFields`, `collectCustomFields`, …).
- **Data source:** CDD row/sample/batch/molecule sub-objects and custom-field maps.
- **Dependencies:** consumed only by `sample-data.js`.
- **Maintenance difficulty:** **medium-high** — encodes CDD's data shapes and many
  field-name variants.
- **Regression risk:** **high** — the single biggest source of silent breakage
  when CDD changes its API; **has no automated tests**. See
  `docs/ADDING_NEW_FIELDS.md`.

### 7.5 Print-Data Extractor
- **User value:** (Indirect.) Builds per-reaction print rows and the depleted-
  identifier list.
- **Entry point:** `src/inject/parsers/print-data.js` (`extractPrintData`).
- **Data source:** CDD `stoichiometryTable.rows` (non-product) and
  `stoichiometryTable.samples[*].depleted`.
- **Dependencies:** `common.js`.
- **Maintenance difficulty:** **medium** — also keeps a module-level "last
  non-empty" memo that is never reset (can serve stale data across navigations).
- **Regression risk:** **medium** — feeds both Printing and the Depleted features.

### 7.6 Messaging Bus & Router
- **User value:** (Indirect.) The single tagged-`postMessage` channel between the
  two worlds; everything captured is delivered here.
- **Entry point:** `src/inject/bus.js` (`post`) and
  `src/content/message-router.js` (`handleMessage`).
- **Related files:** `shared/event-types.js` (`EVENT_SOURCE`, `EVENTS`),
  `state.js`.
- **Data source:** the parsers' outputs.
- **Dependencies:** both worlds agree on `EVENT_SOURCE` + `EVENTS`.
- **Maintenance difficulty:** **low**.
- **Regression risk:** **high** — it is the only bridge; a mismatch in
  `EVENT_SOURCE`/`EVENTS` silently severs the two worlds.

---

## 8. Clipboard Features

Copy-to-clipboard behaviour shared across the extension.

### 8.1 Unified Clipboard Helper
- **User value:** (Indirect.) Makes "copy" work reliably everywhere — uses the
  modern Clipboard API and falls back to a hidden-textarea + `execCommand` when it
  is blocked.
- **Entry point:** `src/content/utils/clipboard.js` (`copyText`,
  `copyTextWithFeedback`).
- **Used by:** `sample-panel.js`, `ui-fixes/copyable-fields.js`,
  `savedSearchCopyLinks.js`.
- **Data source:** in-memory strings; `navigator.clipboard` / `execCommand`.
- **Dependencies:** none.
- **Maintenance difficulty:** **low**.
- **Regression risk:** **medium** — three features depend on it; a change affects
  all copy interactions.

### 8.2 CDD-Ready Concentration Copy
- **User value:** Clicking a concentration in the panel copies a normalised,
  paste-ready value (mol/L · mmol/L; µM→mmol/L, nM→mmol/L) so it drops straight
  into CDD without reformatting.
- **Entry point:** `shared/sample-panel-fields.js`
  (`getCddCompatibleConcentrationCopyValue`, wired via the `concentration` field's
  `copyValue`).
- **Related files:** `sample-panel.js` (`createCopyableRow`).
- **Data source:** `flatSample.concentration` + `concentrationUnits`.
- **Dependencies:** the field registry + clipboard helper.
- **Maintenance difficulty:** **low-medium** — unit-mapping logic worth a unit test.
- **Regression risk:** **low** — scoped to the concentration field's copy value.

### 8.3 Click-to-Copy Fields
- **User value:** Makes molecule overview / property / batch field values
  click-to-copy on molecule pages, with success/error feedback.
- **Entry point:** `src/content/features/ui-fixes/copyable-fields.js`
  (`observeCopyableFields`, `enhanceCopyableFields`).
- **Related files:** `content/utils/clipboard.js` (`copyText`).
- **Data source:** live DOM (molecule field nodes).
- **Dependencies:** the unified clipboard helper.
- **Maintenance difficulty:** **medium** — relies on CDD field DOM selectors.
- **Regression risk:** **low** — additive; failures show an error state instead of
  throwing.

---

## Maintenance & risk summary

| Feature | Maint. | Regression |
| --- | --- | --- |
| Floating Sample Panel | medium | medium-high |
| Configurable fields | low | medium |
| Custom-field discovery | medium | medium |
| Card warnings | low | low |
| Panel state persistence | low | low |
| ELN tab-title override | medium | medium |
| Reaction detection | low | medium |
| Depleted marker (selectors) | medium | medium |
| Per-reaction print sheet | high | medium-high |
| Panel print | low-medium | low |
| Print dispatcher | low | low |
| Dose Response Easy Override | high | **high (writes to CDD)** |
| Saved-search Copy Link | low | low |
| File-dialog fixes | low | low |
| Left-ellipsis locations | low | low |
| Filter default operator | high | **high (timing/DOM)** |
| Location-picker resize | medium | low-medium |
| Molecule-links grid | low | low |
| Consumed-batches collapse | medium-high | medium |
| Network hooks | medium | **high (everything)** |
| Payload detection | low | medium |
| flatSample builder | medium | high |
| Field resolvers | medium-high | **high (no tests)** |
| Print-data extractor | medium | medium |
| Messaging bus & router | low | **high (only bridge)** |
| Unified clipboard | low | medium |
| CDD-ready concentration copy | low-medium | low |
| Click-to-copy fields | medium | low |

> **Highest-attention areas when changing the code:** the Dose Response tools
> (they write to CDD), the field resolvers and network hooks (everything depends
> on them, untested), the filter-default automation (very fragile), and the
> messaging bus (the only link between the two worlds).
</content>
