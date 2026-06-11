# Release 8.0.0

> Version note: the source currently declares `7.7.0` in `manifest.json`
> (`package.json` is an unrelated `1.0.0`), while the most recent commits state
> the intent to ship **8.0.0**. These notes describe everything that changed
> since the last release tag (`v7.7.0`). **The manifest must be bumped to `8.0.0`
> before publishing.**

This release makes the **customizable ELN Sample Panel fully functional** and
makes **copy-to-clipboard reliable across every CDD page**, on top of internal
clean-up that improves stability.

## New Features

- **Choose which attributes the Sample Panel shows.** The extension popup now
  lets you turn individual sample-panel fields on or off (Name, Location, Purity,
  Internal ID, Density, Concentration, Solvent, and optional fields such as
  Molecular weight, Formula weight, Batch name, Vendor ID, Owner, Amount,
  Volume). Your selection is saved and applied the next time the ELN page is
  refreshed.
- **Automatic discovery of your vault's custom fields.** Fields that are specific
  to your vault (for example `*Hygroscopic` and other batch/sample fields) are
  detected from the data CDD loads and appear as their own checkboxes under
  "Custom fields (from your vault)". A custom field you don't use is automatically
  dropped from the list after 120 days; a field you have enabled is always kept.
- **One-click, CDD-ready concentration copying.** Clicking a concentration value
  in the panel copies a normalised, paste-ready value (for example `mol/L` /
  `mmol/L`, with µM and nM converted to mmol/L) so it drops straight into CDD
  without manual reformatting.

## Improvements

- **More reliable copying everywhere.** All "copy" actions — the Sample Panel
  values, the click-to-copy molecule/property/batch fields, and the saved-search
  "Copy Link" buttons — now share one clipboard helper. When the modern clipboard
  API is unavailable or blocked, the extension automatically falls back to a
  legacy copy method, so copying keeps working on more pages and in more
  situations.
- **Panel print follows your field choices.** The Sample Panel's "Print" button
  builds its printable table from exactly the columns you have enabled, and skips
  columns for which no sample has a value.

## User Experience

- **Clear copy feedback.** Copyable fields briefly confirm a successful copy and
  now show a distinct error state if a copy genuinely fails, instead of failing
  silently.
- **Consistent panel behaviour.** The floating panel continues to remember its
  position and collapsed/expanded state between visits, and re-renders
  automatically when you switch between ELN entries or change your field
  selection in the popup.

## Fixes

- **The configurable Sample Panel now loads at all.** In the previous tagged
  build the panel's field logic referenced a shared module that was not present,
  which prevented the sample-panel and its print view from working in a built
  extension. That module is now included, so the panel, its configurable fields,
  and its print view function correctly.
- **Copy no longer fails on restricted pages.** Because of the new clipboard
  fallback, copy actions that previously could fail (when the page blocked the
  modern clipboard API) now succeed.

## Technical Changes

- Introduced a single shared field registry (`src/shared/sample-panel-fields.js`)
  used by **both** the in-page panel and the settings popup, so fields are
  defined in exactly one place.
- Unified three separate clipboard implementations into one helper
  (`src/content/utils/clipboard.js`) with a built-in legacy fallback.
- Standardised all cross-component message names through a single `EVENTS`
  constant set (`src/shared/event-types.js`) — no more loose string literals.
- De-duplicated a text-normalisation helper into `src/content/utils/format.js`.
- Removed unused files (an empty `src/inject/constants.js`, an unused root
  `vite.config.js`) and an unused host-detection helper.
- **Action required before publishing:** bump `manifest.json` to `8.0.0`
  (currently `7.7.0`).

## Known Limitations

- **Settings apply after a page refresh.** Changing which fields are shown in the
  popup takes effect the next time the ELN page is refreshed, not instantly in an
  already-open tab.
- **Custom fields appear only after data loads.** A vault-specific custom field
  becomes available as a checkbox only after you have opened an ELN reaction that
  contains it (that is when it is discovered).
- **Panel needs captured data.** The Sample Panel only appears on an ELN entry
  page that contains a reaction/stoichiometry table, and only once CDD's own data
  has loaded; until then it shows "Waiting for reaction data…". It is also hidden
  while the structure editor (Ketcher) dialog is open.
- **Field detection is best-effort.** Attribute values are read from CDD's data
  using a set of known field names and locations. A field that CDD names or nests
  in an unexpected way may not be picked up; in that case its row is simply not
  shown rather than showing an error.
- **No automated tests yet.** The parts of the extension that read CDD's data are
  not covered by automated tests, so changes to CDD's data format may require a
  manual check.
</content>
