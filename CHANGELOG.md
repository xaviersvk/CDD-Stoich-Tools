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

## [12.1.1] — 2026-07-14

### Fixed
- **Features no longer die after in-app (Turbo) navigation.** CDD navigates
  between pages by swapping the whole `<body>` element (Turbo), which silently
  disconnects any `MutationObserver` attached to the old body — so features like
  the Inventory filter operator default (`ui-fixes/filter-default.js`) and the
  filter field picker only worked after a hard refresh of the page, not when the
  user browsed to Inventory from elsewhere in the app. All 14 remaining
  body-attached observers (filter default, filter field picker, Column Manager,
  copyable fields, consumed-batches collapse, location picker resize, options
  menu link, registration form default, registration project mirror, slurp type
  default, dose-response override, ELN title, file-dialog watcher, Ketcher
  overlay watcher) now observe `document.documentElement` instead — the same
  pattern the newer inventory features (`inventory-grid-colors`,
  `plate-list-*`) already used, since `<html>` survives the body swap and
  `subtree: true` covers everything below it. No behaviour change beyond the
  observers staying alive across navigations.

## [12.1.0] — 2026-07-14

### Added
- **A structured field picker for the Search page's "Keywords" selector.** The
  Keywords field selector is a plain native `<select>` that stacks the General
  choices, every Entity field and every Batch field into one long, narrow OS
  dropdown. A new content-script feature (`ui-fixes/keywords-field-picker.js`)
  suppresses the native dropdown (pointer **and** keyboard, including type-ahead)
  and opens the same wide, searchable, multi-column popover already used by the
  Inventory filter — one column per category, each headed and scrolled on its
  own, with the relevance-ranked (exact › prefix › whole-word › substring),
  case- and accent-insensitive search that hides non-matches and highlights the
  matched slice. Delegated on `document`, so the selectors CDD clones in via
  "Add a term" are covered automatically.
  - **Categories are derived from the option list itself**, in source order: a
    "General" column for the leading standalone options, then one column per
    `<Object> Fields` heading the vault actually emits (Entity + Batch today;
    Sample/Event appear automatically where present). Empty categories are never
    rendered.
  - **The `Entity Fields` / `Batch Fields` headings stay selectable.** They are
    real options in CDD's native list (each with its own value — a "whole
    object" search scope), so besides switching the parsing section they are
    also kept as choices under General with their original value preserved.
  - **Selection is delegated to the real `<select>`**: the chosen option's
    numeric value is written back via the `HTMLSelectElement` prototype setter
    (updating React's value tracker) and `input`+`change` are dispatched, so
    CDD's own handler computes field/path/data_type_name exactly as before.
    Operator select, value input, Add/Remove term, saved-search serialisation,
    URL params and request payloads are untouched — no backend change.
  - **Positioning keeps the panel tethered to the field**: it opens directly
    below with a small gap, caps its height to the room available beside the
    field (columns scroll internally) so it never slides over the trigger to
    fit, flips above only when below is too cramped, stays clear of the Search
    button where it can, ties a panel edge to a field edge horizontally, and
    stays inside the viewport.

### Changed
- **Extracted a shared field-picker engine (`ui-fixes/field-picker-core.js`).**
  The styles, relevance search, highlight, column rendering, keyboard navigation
  and viewport-aware positioning that powered the Inventory picker now live in
  one module. `filter-field-picker.js` is refactored to consume it (behaviour
  unchanged — same MUI-menu overlay and click delegation) and the new Keywords
  picker reuses the same engine, so the two selectors are one component with two
  small adapters rather than duplicated logic. The shared grid now renders only
  non-empty columns and sizes itself to the count actually shown (1–5).

---

## [12.0.0] — 2026-07-12

### Added
- **A four-column attribute picker for the Inventory filter field.** CDD renders
  the "Filter Entries" field selector as one very long, very narrow dropdown that
  mixes Sample, Batch, Entity and Event attributes into a single scroll (130+
  fields on a busy vault). A new content-script feature
  (`ui-fixes/filter-field-picker.js`) overlays it with a wide four-column popover
  — one column per object type, each with its own heading, vault/Default grouping
  and scroll — anchored under the trigger like a normal dropdown. It is a
  non-destructive overlay built **inside** CDD's own MUI menu Paper: the native
  `<ul>` is hidden but kept, and selecting one of our items dispatches a real
  click on the original `<li>`, so CDD's handler, values and requests are
  untouched. The search box is relevance-scored (exact › prefix › whole-word ›
  substring), case- and diacritics-insensitive, hides non-matches and empty
  columns, lets a lone surviving column expand, and highlights the matched slice
  of each name.
- **A searchable "Column Manager" for the Select-and-reorder-columns dialog.**
  The columns editor is a flat list of every available column (152 on the sample
  vault) with a drag handle on every row. A new feature
  (`ui-fixes/column-manager.js`) adds a sticky toolbar with a *Visible columns /
  Total available* summary, a ranked **and fuzzy** search (exact › prefix ›
  whole-word › substring › fuzzy, empties hidden), and category chips
  (Sample/Batch/Entity/Event with live counts) that focus one type. It replaces
  the italic `(Category)` suffix with coloured badges, tints selected rows, and
  shows a drag handle **only** on selected rows. Because reordering uses
  react-beautiful-dnd over one global order, no native row is moved or
  restructured — all state is expressed through `data-*` attributes and scoped
  CSS (`:has()`), so selection and drag reordering stay byte-for-byte intact.
- **Order + last-used default for the bulk-registration entity-type picklist.**
  The "slurp" type select (`select[name="slurp[registration_form_definition_id]"]`)
  now gets the same treatment as the Create-a-New-Entity picklist
  (`ui-fixes/slurp-type-default.js`): its options are ordered by the sequence
  configured on the settings page, and it is preselected from the entity type you
  last used in that vault (or a pinned one). Its option values are the same
  per-vault `registration_form_definition_id`, so it reuses
  `shared/registration-form.js` verbatim — both entity-type pickers now share one
  order, one mode, and one per-vault last-used memory. Preselecting dispatches
  `change`, so CDD's `slurp-type` controller rebuilds the dependent with/without
  list.

### Changed
- **The README and public release notes now link to GitHub Issues for feedback**,
  so anyone can report a problem or request a change without hunting for the repo.

## [11.1.0] — 2026-07-10

### Added
- **"What's new" link on the settings page.** The masthead now carries the
  running version — read from `chrome.runtime.getManifest()`, so it cannot
  disagree with the build the user is on — next to a link to the public release
  notes at <https://xaviersvk.github.io/CDD-Stoich-Tools/>.
- **A public release-notes page and a GitHub Release per tag.** `RELEASES.md`
  becomes the single source for both: `scripts/build-releases-page.mjs` renders
  it into `site/` (deployed by `.github/workflows/pages.yml`), and a new
  `github-release` job in `publish.yml` creates each release from the matching
  section, failing when a tag has no notes. Nine existing tags were backfilled.
  The page reports the newest *tagged* version rather than `manifest.json`, and
  marks a written-up-but-untagged version "Not yet released", so it never
  promises a build nobody can install.

### Changed
- **The extension's icon now heads both pages**, as a logo and as a favicon. The
  settings page loads it straight from `icons/`; the release-notes build copies
  it to `site/icon.png`. It is set in a rounded white tile rather than floated on
  the surface, because the PNG has an opaque white background — on a dark theme a
  bare `<img>` would read as a transparency bug.
- **The accent colour is now sampled from that icon** (`#033c8e`, the flask's
  navy; `#7fa9ef` on dark). It was an unrelated green, which beside a navy logo
  read as two brands sharing a page. The CSS variable is renamed
  `--reagent` → `--accent` in both stylesheets to stop the name lying about the
  hue.

### Removed
- **`docs/RELEASE_NOTES.md`.** A stale 8.0.0-era draft for a version that never
  shipped, long superseded by `RELEASES.md`.

---

## [11.0.0] — 2026-07-10

Major bump: the browser-action popup is gone, replaced by a four-column
settings page, and the registration picklist becomes configurable.

### Added
- **Settings page (`src/options/`).** Four columns — tab title, panel fields,
  prefix colours, registration form. Reached from the toolbar icon or from a new
  **CDD Plugin options** entry the extension adds to CDD's own user dropdown
  (`ui-fixes/options-menu-link.js`). Columns 1–3 are the old popup's settings,
  unchanged in behaviour.
- **Registration-form order.** The Create Entity page's Registration Form
  picklist (`#registration-form-select`) is reordered into a sequence the user
  drags together on the settings page — a cell biologist wants Eukaryote on top,
  a chemist Molecule. Reordering moves `<option>` nodes, which changes neither
  `select.value` nor which option is selected, so CDD's Stimulus controller is
  untouched. Forms the vault adds later append at the bottom rather than jumping
  the queue.
- **Registration-form default.** The picklist preselects either the form last
  used *in that vault*, or one pinned on the settings page, or nothing at all
  (`ui-fixes/registration-form-default.js`, `shared/registration-form.js`).
  Preselecting dispatches `change`, because CDD's
  `new-molecule#handleRegistrationFormChange` is what rebuilds the type-specific
  form below — setting `.value` alone would leave the picklist and the form
  disagreeing. It is one-shot per page, so it never fights a user who picks
  something else afterwards.
- **`src/background.js`.** Turns a click on the toolbar icon, and the CDD menu
  entry's message, into `chrome.runtime.openOptionsPage()`. Content scripts have
  no access to that API, hence the message hop.

### Changed
- **Everything is keyed by form NAME, not by `value`.** A
  `registration_form_definition_id` is per-vault, so "Molecule" is `1000000170`
  in one vault and something else in the next. A pinned form the current vault
  does not offer leaves CDD's own default alone rather than guessing.
- **Per-browser manifests.** Chrome MV3 accepts only
  `background.service_worker` and rejects `background.scripts` ("requires
  manifest version of 2 or lower"); Firefox MV3 implements no service worker and
  needs `background.scripts`. Chrome also warns about `browser_specific_settings`,
  a Gecko-only key. Neither browser tolerates the other's keys, so the build now
  emits `dist/manifest.json` (Chrome, no Gecko block) and
  `dist/manifest.firefox.json`, and `publish.yml` picks the right one per store.
  Both are warning-free: `web-ext lint` reports 0 errors / 0 warnings / 0 notices
  on the Firefox package, and the Chrome manifest carries no key outside the MV3
  schema.

### Removed
- **The browser-action popup (`src/popup/`).** Its 800×600 ceiling could not
  hold four columns. The toolbar icon now opens the settings page instead;
  `action.default_popup` is gone, which is precisely what lets
  `action.onClicked` fire.

---

## [10.1.0] — 2026-07-10

### Added
- **Project select mirrored next to Create Entity.** On the "Create a New
  Entity" registration page the required Project select sits at the top of the
  form while the Create Entity button sits at the bottom, so a forgotten project
  was only discovered after submitting — a rejected submit and a scroll back to
  the top. (CDD rejects the submit and keeps the entered data; the cost is the
  round trip, not the form.) A second,
  synchronized Project select is now rendered inside the button row, immediately
  left of Create Entity (`ui-fixes/registration-project-mirror.js`). The two
  controls track each other in both directions; setting the mirror dispatches
  `input` + `change` on CDD's own select, so the project-dependent re-render of
  the registration fields still fires.
- **Create Entity is disabled until a project is picked.** While the project is
  blank the button is disabled (`title="Select a project first"`, dimmed) and
  the mirror is highlighted amber. Ownership is one-way: the button is only ever
  re-enabled if *we* disabled it, so a button CDD disabled for its own reasons
  (`data-initally-disabled`, no structure drawn) is never silently released. A
  capture-phase click guard on the submit button backstops the frame between
  CDD re-rendering a fresh, enabled button and the next sync — necessary because
  CDD's Stimulus controller (`new-molecule#interceptSubmitForm`) posts the form
  itself, so the browser's native `required` validation never runs.

### Notes
- The mirror carries no `name` and no `id`, so the POST body and CDD's own
  `#project_id` are untouched. Everything is scoped to
  `.displayed_form_content` — the page ships a second, hidden `form#new_molecule`
  template for the other registration types. Registration types with no project
  field at all (e.g. "Other") remove the mirror and release the button.

---

## [10.0.0] — 2026-07-08

Major bump: the plate tooling grows from a single hover tooltip into a set of
features covering the Plates list, plate export, and the Plate Map.

### Added
- **Location column in the Plates list.** The Explore Data → Plates table
  (`table#plateList`) gets a new **Location** column right after Name. Each row
  starts with a spinner and fills in as the plate's Inventory Location resolves
  (`ui-fixes/plate-list-locations.js`). Values come from the same
  fetch-once-and-cached plate-page lookup as the hover tooltip
  (`api/plate-info.js`), so anything already hovered or exported fills
  instantly, and vice versa. At most 4 plate pages load concurrently (a local
  semaphore), rows/header are marked with data attributes so the
  MutationObserver re-runs (Turbo body swaps, re-sorts, per-page changes) stay
  idempotent, and a plate with no location shows a muted "—".
- **Export Plate Locations (CSV) on the Plates tab.** A new link next to CDD's
  native "Export Plates" (`ui-fixes/plate-list-export.js`). It pages through the
  *whole* plate list 500 rows at a time (respecting the current search-box
  `query`, deduped by href, hard-capped at 200 pages), resolves each plate's
  Inventory Location through the shared cache, and downloads
  `cdd-plate-locations.csv` (Plate Name + Inventory Location, name-sorted,
  BOM-prefixed for Excel). Live progress, a Cancel link, and a confirm prompt
  above 500 plates. Same output as the search-dialog export, driven from the
  Plates tab instead.
- **Structure + synonym hover bubble on the Plate Map.** Hovering a well on a
  plate's Plate Map (or a heat map — same `.plateLayout` table) shows a floating
  bubble with the molecule's first synonym and its rendered structure
  (`ui-fixes/plate-map-structure-tooltip.js`). Vault + molecule ids are read off
  the well link's href; data comes from the same `api/molecule-image.js`
  cache as the inventory Pick Location tooltip (molecule-page fetch → SMILES +
  synonym → client-side SVG). Owned bubble end to end (delegated listeners, one
  reused fixed-position `<div>`, race guard against stale responses, viewport
  edge flipping), like `plate-location-tooltip.js`.
- **Neighbour prefetch on the Plate Map.** While hovering a well, the molecules
  in the surrounding ±2 rows/columns (a 5×5 block clipped to the plate edges)
  are prefetched in the background via the existing `prefetchMolecules()` idle
  queue (concurrency 2), so sweeping across a plate feels instant.

### Changed
- **CSV + concurrency helpers extracted to `content/utils/`.**
  `csvField`/`buildCsv`/`downloadCsv` now live in `utils/csv.js` (with
  `buildCsv` taking the header as a parameter) and `mapLimit` in
  `utils/concurrency.js`; `ui-fixes/plate-location-export.js` was refactored to
  consume them so both plate-location exports share one implementation.

---

## [9.3.0] — 2026-07-07

### Added
- **The sample title is now click-to-copy too.** Each sample's header title
  (e.g. `IXX-NUC-0000009-001-SM003059`) can now be clicked to copy. It lives in a
  `.sticky-header > .label-text` span that also holds the collapse/expand toggle
  button, so it can't go through the generic path — labels are excluded from
  `VALUE_SELECTORS`, and the button would trip the interactive-content guard.
  Handled by a dedicated `enhanceSampleNames()` in `copyable-fields.js` that
  copies only the span's direct text nodes (skipping the toggle's SVG) and skips
  the copy when the click lands on the toggle button, so collapse/expand still
  works. Re-run from the same `MutationObserver`; binding stays idempotent via
  `data-cddCopyableBound`.

---

## [9.2.0] — 2026-07-07

### Added
- **Click-to-copy now works on sample fields too.** The existing click-to-copy
  behaviour (entity/molecule and batch fields in the Overview, Properties and
  Batches sections) now also covers the per-sample header values in the Samples
  tab: **Sample ID**, **Current Amount**, and **Location**. Two additive changes
  in `copyable-fields.js`: `#molecule-inventory_samples` was added to
  `CONTAINER_SELECTORS`, and `.value-text` to `VALUE_SELECTORS`. The event-table
  cells below each header are deliberately left untouched (they carry no
  `.value-text` class), and the field labels / sample name (`.label-text`) are
  not made copyable. The existing `MutationObserver` handles collapse/expand and
  sticky-header re-renders; re-tagging stays idempotent via
  `data-cddCopyableBound`.

---

## [9.1.1] — 2026-07-07

### Fixed
- **Child-sample batch bar never appeared.** The v9.1.0 detection looked for
  `[data-testid="createSampleFromDebit"]` on the dialog, but CDD's real markup
  titles the dialog **"Create Sample from Debit"** (an `h2.MuiDialogTitle-root`)
  and puts `data-testid=".createSampleFromDebit"` (leading dot) on a *checkbox*,
  not the container — so nothing matched and no "Create N Samples" bar showed.
  Detection now keys off the dialog title, with the checkbox marker (dot-prefixed
  or not) as a fallback, still requiring a real dialog ancestor (`init.js`,
  `findDebitDialogRoot`).

---

## [9.1.0] — 2026-07-07

### Added
- **Batch creation of CHILD samples (create-from-debit).** The multi-position
  flow now also works when creating a child sample (aliquot) from a parent
  sample's debit event. CDD sends that create as
  `PUT .../inventory_samples/<parentId>/create_sample_from_debit` with the new
  sample nested under `child_sample_attributes`; the extension captures it,
  swaps only the position part of the child's Location value
  (`"<boxId>,<position>"`, same `field_definition_id` 1000001955) and replays it
  for every remaining selected position. Minor bump: it reuses the existing
  batch-create replay mechanism on a sibling endpoint rather than adding a new
  capability tier.
  - The debit dialog has no "Create a New Sample" heading; it is detected by its
    **"Create Sample from Debit"** title (with the `.createSampleFromDebit`
    checkbox marker as a fallback), accepted only inside a real dialog container
    so the same marker elsewhere on the page can't match.
  - The response to a debit create is the updated *parent* — the created child's
    id/name are read from the newest `inventory_events[]` entry carrying a
    `child_sample_id`.
  - CDD assigns child sample identifiers server-side, so replaying an identical
    payload cannot produce duplicate names.
  - Each replay debits the parent by the payload's Debit amount (N children =
    N × debit); an insufficient parent amount shows as a per-position error in
    the results panel with Retry.
  - `findLocationField` now prefers Location fields under
    `[child_sample_attributes]` when a payload carries more than one;
    `createInventorySample` replays with the captured HTTP verb (POST or PUT).

---

## [9.0.2] — 2026-07-06

### Fixed
- **Page freeze in "Pick Location" with very large molecules.** The well tooltip
  renders molecule structures with SmilesDrawer, whose ring perception runs
  synchronously on the main thread and can take effectively forever on very
  large molecules (macrocycles, peptides, polymers). One such molecule in a box
  froze the whole page — no console error, just a permanently pending molecule
  request. `renderSmilesToSvg()` now skips SMILES longer than 250 characters and
  the tooltip shows "Structure unavailable" instead (`structure-render.js`,
  `MAX_SMILES_LENGTH`).

---

## [9.0.1] — 2026-06-30

### Fixed
- **Firefox: batch sample creation crash.** `FormData.entries()` and
  `FormData.keys()` return iterators that Firefox wraps in Xray wrappers inside
  WebExtension content scripts; those wrappers strip `[Symbol.iterator]`, causing
  `TypeError: formData.entries() is not iterable` when the extension tried to
  build the replay payload. All iteration in `shared/cdd-form-data.js` now uses
  `FormData.forEach()`, which is callback-based and avoids the iterator protocol
  entirely. Chrome is unaffected.

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
