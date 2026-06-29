# Changelog

All notable changes to **CDD Stoichiometric Table Tools** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/) and the
project loosely follows [Semantic Versioning](https://semver.org/). Versions are
taken from `manifest.json` bumps in the git history; dates are commit dates
(UTC, `YYYY-MM-DD`).

> **Version reconciliation:** `manifest.json` is now `8.5.0`. `package.json`
> carries an unrelated `1.0.0` (build-only metadata). Two legacy git tags exist —
> `7.7.0` (commit `b1c9f3c`) and `v7.7.0` (commit `6f8a861`, a **non-building**
> checkout); a clean `8.0.0` tag should still be cut. See
> [`DOCUMENTATION_AUDIT.md`](./DOCUMENTATION_AUDIT.md) §3 for the full version
> analysis.

---

## [9.0.0] — 2026-06-29

### Added
- **Production batch sample creation.** Select multiple empty wells in the
  "Pick Location" box grid, then click **Create N Samples** in the Create Sample
  dialog footer — the extension creates all samples with one click.
  - Arm → click CDD's native Save once → capture the outgoing request as a
    replay template → tap the response; **hard gate**: nothing replays unless
    CDD's own first save succeeded (HTTP 2xx).
  - Remaining positions replayed sequentially via the inventory-samples API
    (`POST /vaults/…/inventory_samples`); only the location field is swapped,
    box ID and all form fields are preserved from the captured payload.
  - **Floating results panel** (`position: fixed`) survives the dialog closing
    on native Save; shows ✓/✗ per position with a "Retry failed (N)" button.
  - **Auto page-refresh** on full success — uses `Turbo.visit` (soft nav) when
    available, falls back to `location.reload()`.
  - Architecture: inject hook (`create-request-capture.js`) wraps `fetch` /
    `XMLHttpRequest` once and forwards captured body + tapped response via
    `postMessage`; `response-store.js` bridges the async gate.

- **Spreadsheet-style well selection** in the "Pick Location" box grid.
  - **Normal click** — clear previous selection, select the clicked well, set
    the shift-anchor.
  - **Ctrl / Cmd click** — toggle one well, keep the rest; anchor unchanged.
  - **Shift-click** — rectangle from anchor → clicked well (inclusive); only
    empty wells inside the rect are selected (occupied wells silently skipped);
    anchor unchanged so repeated Shift-clicks extend from the same origin.
  - **Deselection priority** — clicking an already-selected well always removes
    it, regardless of modifier key or occupancy change since selection.
  - **Occupancy validation** on every grid repaint: selected positions that have
    since become occupied are automatically evicted from the model.
  - **Toast** after rect selection: "N positions selected" pill at the bottom of
    the screen, fades out after ~2 s.

### Changed
- **Action bar redesign** (Create Sample dialog footer).
  - No background or box border — a single top divider separates it from the
    rest of the dialog, matching MUI's own section style.
  - **Single well selected (N = 1):** the "Create 1 Sample" button is hidden;
    CDD's native Save handles creation. The selected well coordinate ("D2") is
    shown instead, with a `ⓘ` icon whose hover tooltip carries the full location
    hierarchy (`Lab → Fridge → Box → D2`).
  - **Multiple wells selected (N > 1):** a comma-preview of well labels
    ("D2, D3, D4…") is shown; `ⓘ` appears only when the list is truncated
    (> 6 wells) and reveals the complete list on hover. **Create N Samples** and
    **Clear** buttons follow MUI contained-primary / outlined style (height 36 px,
    font-weight 500, border-radius 4 px).
  - **No wells selected:** placeholder text "No destination selected" (grayed,
    italic); Clear is disabled.
  - Position numbers are converted to well labels (A1, D3…) using the column
    count read from the live box grid when the picker opens; the column count
    persists after the picker closes so the action bar keeps showing labels.

- **Molecule-loading error reporting** — `describeErr()` helper flattens
  `Error`, Response-like, and plain objects into named string fields
  (`errorName`, `errorMessage`, `errorStack`, `httpStatus`, etc.) so logs remain
  readable both in DevTools (expandable object) and in CDD's own error panel
  (which stringifies its arguments). The same pattern is applied in
  `inventory-well-structure.js`.

### Fixed
- **Prefix extraction counts dashes from the right, not the left.**
  The previous algorithm found the 2nd dash from the left, which worked for
  short codes (`IXX-SM-…` → `IXX-SM`) but misidentified the prefix for longer
  compound codes where the project identifier itself contains dashes
  (`PHA-0265229-001-S001095` was yielding `PHA-0265229` instead of `PHA`;
  `IXX-CL-0000002-001-SM003035` was yielding `IXX-CL-0000002` instead of
  `IXX-CL`). The fixed rule cuts at the **3rd dash from the right**, which
  always strips the trailing `{compound}-{batch}-{sample}` suffix regardless
  of how many segments the project prefix contains.

---

## [8.5.0] — 2026-06-28

### Added
- **Prefix-based visualization colours.** Sample IDs are grouped by a *prefix*
  (everything before the second dash, e.g. `IXX-DEMO` in
  `IXX-DEMO-0000048-001-SM000025`) and each prefix can be given a user-chosen
  colour, used consistently across the plugin's visualizations.
  - **Inventory box grid.** Each occupied well in the "Pick Location" / Location
    Tree box view (`.LocationBoxPicker .positions .box-position-filled`) is
    tinted by the prefix colour of the compound in it. Wells whose prefix has no
    colour yet fall back to a default (`rgb(10, 98, 230)`); empty wells keep
    their native look.
  - **No DOM text scraping for the mapping.** The well→compound data comes from
    the box-contents API response already intercepted on the page
    (`inject/main.js`), now forwarded as `EVENTS.INVENTORY_BOX` with one record
    per occupied well (`{ position, moleculeId, name }`).
  - **Per-box cache.** Position `1` is a different compound in every box and CDD
    serves a re-opened box from its own client cache (no new fetch), so records
    are cached by the selected tree node's `data-nodeid` and recolour always
    uses the box currently shown — re-selecting a box keeps the right colours.
  - **Settings → Visualization → Prefix Colors** (extension popup): add / edit /
    delete a prefix and pick its colour. Stored in `chrome.storage.local` as a
    `Record<prefix, hexColor>` (O(1) lookup); changes propagate live to the page
    via `chrome.storage.onChanged`.
  - **Auto-discovery.** Prefixes seen in the data (well tooltip, ELN sample
    panel, box grid) are saved automatically **without a colour** so they appear
    in the popup for the user to colour; an existing prefix's colour is never
    changed automatically.
  - All prefix parsing is centralised in `src/shared/prefix-colors.js`
    (`extractPrefix` / `getColorForSampleId`) — the single source of truth, so
    the matching rule can be changed in one place. No colours are hardcoded in
    the visualizations.

---

## [8.4.0] — 2026-06-27

### Added
- **Export Plate Locations (CSV).** A collapsed "Plate locations (experimental)"
  section in CDD's native Export dialog downloads a CSV of every plate in the
  current search results paired with its **Inventory Location** — so a plate
  list can be walked in the lab.
  - Gathers plates across the *whole* result set, not just the loaded page, via
    the per-render `search_results` endpoint (the one "Load next 100 results" and
    sorting use): a `PUT` with sort + limit/offset form data. The rows come back
    wrapped in `<template name="ujs-replace-content">`, so they are read from the
    template's `.content` fragment (a plain document query does not see them).
  - Pages by **distinct entity count** (CDD's limit/offset count results, not
    table rows — one entity spans several readout `<tr>`s in Details view), so no
    rows are skipped; deduped by plate id (`api/search-plates.js`).
  - Each plate's location is resolved from its plate page
    (`api/plate-info.js`, fetch-once-and-cached), max 4 concurrent.
  - Large sets are guarded: a confirm prompt above a threshold, live progress on
    the button (results scanned, plates found, locations resolved), and a
    **Cancel** (AbortController). CSV is one row per unique plate, sorted by name,
    UTF-8 BOM for Excel.

---

## [8.3.0] — 2026-06-27

### Added
- **Plate Inventory Location hover tooltip.** On the search results table,
  hovering a plate link in the "Plate Fields → Name" column
  (`.plate_name a[href*="/plates/"]`) now shows a small bubble with that plate's
  **Inventory Location** (e.g. `Lab 2 > Fridge 2`).
  - The value lives only on the plate page, so it is fetched from there once and
    parsed from `#plate_data_table_inventory_location` (new
    `api/plate-info.js`, mirroring the fetch-once-and-cache approach of
    `api/molecule-image.js`; failures are cached too, so repeat hovers are free).
  - The bubble is owned end to end (CDD renders none for these links): one
    delegated `mouseover` listener on `document` — surviving Turbo `<body>`
    swaps and covering rows added by "Load next 100 results…" — plus one reused
    floating `<div>` that tracks the cursor.
  - A delayed fetch result is dropped unless the pointer is still on the plate it
    was requested for, so a slow response never paints into the wrong (or hidden)
    bubble. Empty locations show "No inventory location set".

---

## [8.2.1] — 2026-06-26

### Changed
- **Removed all `innerHTML` assignments** (AMO add-on validation flagged them).
  - The inventory tooltip now inserts the structure as a cloned `SVGElement`
    (`renderSmilesToSvg` returns a DOM node) and clears via `replaceChildren()`.
  - A Vite build transform (`patchSmilesDrawerInnerHtml`) rewrites the one
    `innerHTML` in `smiles-drawer`'s unused `PixelsToSvg` to a `DOMParser` parse.
  - Result: zero `innerHTML` in the built `content.js`.

---

## [8.2.0] — 2026-06-26

### Added
- **Inventory well structure tooltip.** In the "Pick Location" box view, hovering
  an occupied well now adds the molecule structure image + first synonym to CDD's
  native tooltip.
  - The molecule id and vault id are read straight from the tooltip's molecule
    link (`a[href*="/molecules/"]`) — no inventory-payload correlation needed.
  - The SMILES is pulled from the molecule page's `react_props` and rendered to
    inline SVG client-side via **`smiles-drawer`** (new dependency, bundled by
    Vite). CDD's own `imgUrl` is not reusable cross-page, hence local rendering.
  - Results are cached per molecule (negative results included) with a token
    race-guard so a delayed response never lands in the wrong/closed tooltip.
  - Opening a box pre-warms every well's structure in the background on
    `requestIdleCallback`, capped at 3 concurrent fetches, via a new
    `INVENTORY_MOLECULES` event from the inject hook.
  - New: `src/content/features/ui-fixes/inventory-well-structure.js`,
    `src/content/api/molecule-image.js`, `src/content/api/structure-render.js`.

---

## [8.1.0] — 2026-06-26

### Removed
- **Depleted-samples collapse** UI fix
  (`src/content/features/ui-fixes/depleted-samples-collapse.js`). CDD now hides /
  collapses depleted samples natively on the sample data view, so the extension's
  `<details>` grouping is redundant. The **depleted-sample marker** (strike-through
  in selectors) and the separate **consumed-batches collapse** are unaffected.

---

## [8.0.0] — 2026-06-16

> `manifest.json` bumped to `8.0.0`. Makes the customizable Sample Panel fully
> functional and copy-to-clipboard reliable on every CDD page, plus internal
> clean-up. Full notes in [`docs/RELEASE_NOTES.md`](./docs/RELEASE_NOTES.md).

### Added
- **Configurable Sample Panel fields** — popup toggles for each attribute (Name,
  Location, Purity, Internal ID, Density, Concentration, Solvent, Molecular
  weight, Formula weight, Batch name, Vendor ID, Owner, Amount, Volume).
- **Automatic custom-field discovery** — vault-specific batch/sample fields
  (e.g. `*Hygroscopic`) detected from CDD's data and offered as checkboxes, with
  a 120-day "last seen" lifecycle (enabled fields are always kept).
- **CDD-ready concentration copy** — clicking a concentration copies a normalised,
  paste-ready value (µM/nM → mmol/L, etc.).
- **Shared field registry** `src/shared/sample-panel-fields.js` used by both the
  in-page panel and the popup.
- **Comprehensive documentation set** under `docs/` (architecture review, data-flow
  diagrams, feature catalog, adding-fields guide, learning guide, release notes).

### Changed
- **Panel print follows field choices** — builds its table from exactly the
  enabled columns and skips columns with no data.
- **Unified clipboard** — three separate copy implementations merged into
  `src/content/utils/clipboard.js` with an automatic legacy `execCommand`
  fallback (Sample Panel, copyable fields, saved-search links).
- **Standardised message names** — all cross-component events go through a single
  `EVENTS` constant in `src/shared/event-types.js` (no loose string literals).
- De-duplicated the text-normalisation helper into `src/content/utils/format.js`.

### Fixed
- **Configurable Sample Panel now loads at all** — the prior `v7.7.0` tag shipped
  importers for a shared module that was not yet in the tree, breaking the panel
  and its print view in a built extension; the module is now included.
- **Copy no longer fails on restricted pages** — the new clipboard fallback
  recovers when the modern Clipboard API is blocked.
- Distinct copy **error state** instead of silent failure.

### Removed
- Unused files: empty `src/inject/constants.js`, unused root `vite.config.js`,
  and an unused host-detection helper (`isCddHost`).

### Follow-up
- `manifest.json` bumped to `8.0.0`. A clean `8.0.0` git tag should still be cut
  from a building commit (the legacy `v7.7.0` tag points at a non-building one).

---

## [7.7.0] — 2026-06-05

> Tagged twice: `7.7.0` (`b1c9f3c`, building) and `v7.7.0` (`6f8a861`,
> **non-building** — see 8.0.0 "Fixed"). Commit messages here say "bump to
> v8.0.0", but the manifest landed at `7.7.0`.

### Added
- Customizable sample-panel fields, enhanced field resolvers, and shared-settings
  integration (the groundwork completed in the prepared `8.0.0`).
- Shared `sample-panel-fields.js` with the central field registry and formatting
  helpers.
- `.gitignore` update.

---

## [7.6.2] — 2026-05-28

### Changed
- Manifest bump.
- Updated icon asset to a new version; kept a legacy icon backup.

---

## [7.6.1] — 2026-05-28

### Added
- **ELN tab-title customization** with popup UI (modes: original / ELN title /
  `EntryID - ELN title`).

---

## [7.6.0] — 2026-05-28

### Added
- **ELN tab-title synchronization** feature.
- **Docked layout** for tighter panel integration (`origin/new-desing` branch).

---

## [7.5.1] — 2026-05-16

### Fixed
- Restore consumed-batch blocks on non-molecule pages.

---

## [7.5.0] — 2026-05-14

### Added
- **Sample Panel state persistence** — remembers position and collapsed/expanded
  state between visits.

---

## [7.4.1] — 2026-05-14

### Fixed
- Alignment adjustments for the saved-search "Copy Link" styles.

---

## [7.4.0] — 2026-05-14

### Added
- **"Copy Link" for saved searches** — copies the absolute search URL from each
  saved-search row on `/searches`.

---

## [7.3.0] — 2026-05-11

### Added
- **Consumed-batches collapse** — collapses consumed batches into a togglable
  block on the molecule batches page.

### Changed
- Refactored the consumed-batches collapse logic.
- Refined depleted-samples collapse logic.

---

## [7.2.0] — 2026-05-06

### Changed
- Expanded field-resolver support for additional **"Purity"** and **"Density"**
  label variations.

---

## [7.1.0] — 2026-05-05

### Changed
- **Molecule links** laid out as a responsive, grid-based multi-column design;
  refined responsive breakpoints for the collapsible grid.

---

## [7.0.0] — 2026-05-05

### Fixed
- **Depleted-samples collapse** UI fix.

### Changed
- Reduced the inventory final-value timeout in `filter-default.js` for faster UI
  updates.

---

## [6.1.0] — 2026-05-05

### Fixed
- **Molecule-links** UI fixes.

---

## [6.0.0] — 2026-05-05

### Added
- **Resizable location-picker tree** — draggable resizer with width persisted in
  `localStorage`.

### Changed
- Iterated on location-picker styling: initially injected tree styling, then
  removed it in favour of refined resize logic, selectors, and padding.

---

## [5.1.1] — 2026-05-04

### Changed
- Manifest bump; disabled debug mode in the filter-default script.
- Merged `origin/main`.

---

## [5.1.0] — 2026-05-04

### Changed
- Enhanced **filter-default** fixes across **ELN and Inventory** contexts; added
  helper functions and tracking to prevent redundant operator fixes.

---

## [5.0.0] — 2026-05-04

### Added
- **Smart filter default** — auto-selects the second filter operator instead of
  "Any value".

### Changed
- README: documented plugin availability and the detailed feature overview.

---

## [4.0.1] — 2026-04-28

### Changed
- Disabled debug mode; debounced `enhanceCopyableFields` via `setTimeout` inside
  the `MutationObserver`.
- Removed redundant logging from `enhanceCopyableFields`.

### Added / Changed (left-ellipsis locations)
- Added left-ellipsis styling for location fields with a dynamic observer (first
  pass was "too aggressive"), then refactored to streamline location handling and
  improve performance with `requestAnimationFrame`, and finally **simplified to a
  lightweight CSS injection** (replacing the JS-based location updates).

---

## [4.0.0] — 2026-04-28

### Added
- **Copyable fields** UI feature — click-to-copy on molecule overview / property /
  batch field values.

---

## [3.0.4] — 2026-04-26

### Fixed
- File-dialog styling adjustments.

---

## [3.0.3] — 2026-04-22

### Fixed
- Further file-dialog fixes.

---

## [3.0.2] — 2026-04-21

### Fixed
- File-dialog UI issues (long file-preview links, dialog width, "associate file"
  button bar).

---

## [3.0.1] — 2026-04-20

### Changed
- Updated labels for the dose-response override actions.

### Fixed
- `decodeHtmlEntities` now safely handles `null`/`undefined` input.

---

## [3.0.0] — 2026-04-19

### Added
- **Dose-response override ("Easy Override")** — ON/OFF toggle in the search
  results bar; per-plot action menu (`> Max`, `< Min`, `Do not calculate`,
  `Do not overwrite`) that PUTs an intercept-override payload back to CDD via its
  API. Includes refreshed UI and data handling.

---

## [2.1.1] — 2026-04-09

### Changed
- Manifest bump.
- Expanded solvent/buffer/medium field resolution to support additional
  permutations.

---

## [2.0.0] — 2026-03-26 → 2026-03-30

> Extension renamed to **"CDD Stoichiometric Table Tools"** to reflect the
> expanded feature set.

### Added
- **Solvent** and **Internal ID** fields in sample handling.
- **Concentration unit normalization** and clipboard formatting.

### Changed
- Renamed the extension and bumped to `2.0.0`.
- Refactored DOM generation for maintainability and performance.
- Refactored sample handling with UI enhancements.
- Bumped Gecko `strict_min_version` to **142.0** in the manifest.

---

## [1.x] — 2026-03-24 → 2026-03-25 (initial "CDD Stoich Tools")

> The project's earliest milestone, originally named **"CDD Stoich Tools"**.

### Added
- Initial commit and **Chrome extension scaffolding** with the core
  stoichiometry-tools functionality.
- **Depleted-sample marker** (introduced and then refactored/enhanced).

### Changed
- Refactored and expanded the early feature-handling code.

---

## Historical milestone grouping

For readers who prefer development phases over exact versions, the history splits
into five eras:

| Era | Versions | Dates | Theme |
| --- | --- | --- | --- |
| **Foundation** | `1.x` | 2026-03-24 → 03-25 | Scaffolding, depleted-sample marker. |
| **Stoichiometry core** | `2.0.0`–`2.1.1` | 2026-03-26 → 04-09 | Rename, sample/field handling, concentration normalization, Firefox 142+ target. |
| **Write-back & dialogs** | `3.0.0`–`4.0.1` | 2026-04-19 → 04-28 | Dose-response override (writes to CDD), file-dialog fixes, copyable fields, left-ellipsis. |
| **UI-fix sweep** | `5.0.0`–`7.2.0` | 2026-05-04 → 05-06 | Smart filter defaults, location-picker resize, molecule links grid, depleted/consumed collapses, resolver coverage. |
| **Panel maturity** | `7.3.0`–`8.0.0` | 2026-05-11 → 06-16 | Saved-search links, panel state persistence, ELN tab-title, customizable fields, shared registry, unified clipboard, standardised events. |

---

## Notes on reconstruction

- Versions and dates come from `git log` and `manifest.json` bumps; where a
  commit message references a version, that anchors the entry.
- The stale `commits.txt` dump (ends ~2026-05-04) and the dated `*.zip` source
  snapshots in the repo root were **not** used as primary sources — they are
  redundant with git and are flagged for cleanup in
  [`DOCUMENTATION_AUDIT.md`](./DOCUMENTATION_AUDIT.md) §5.
- Architectural/technology changes captured above include: the two-world
  content+inject design, the Firefox 142+ target bump, the dose-response API
  write-back, the shared field registry, the unified clipboard helper, and the
  standardised `EVENTS` messaging.

[8.0.0]: manifest `8.0.0` (untagged — clean tag pending)
[7.7.0]: tag `7.7.0` (`b1c9f3c`) / `v7.7.0` (`6f8a861`)
