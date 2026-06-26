# Changelog

All notable changes to **CDD Stoichiometric Table Tools** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/) and the
project loosely follows [Semantic Versioning](https://semver.org/). Versions are
taken from `manifest.json` bumps in the git history; dates are commit dates
(UTC, `YYYY-MM-DD`).

> **Version reconciliation:** `manifest.json` is now `8.2.1`. `package.json`
> carries an unrelated `1.0.0` (build-only metadata). Two legacy git tags exist —
> `7.7.0` (commit `b1c9f3c`) and `v7.7.0` (commit `6f8a861`, a **non-building**
> checkout); a clean `8.0.0` tag should still be cut. See
> [`DOCUMENTATION_AUDIT.md`](./DOCUMENTATION_AUDIT.md) §3 for the full version
> analysis.

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
