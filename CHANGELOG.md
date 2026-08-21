# Changelog

All notable changes to **CDD Stoichiometric Table Tools** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/) and the
project loosely follows [Semantic Versioning](https://semver.org/). Versions are
taken from `manifest.json` bumps in the git history; dates are commit dates
(UTC, `YYYY-MM-DD`).

> **Version reconciliation:** `manifest.json` is the version that counts — now
> `14.8.0`, and the publish workflow refuses a tag that does not match it.
> `package.json` carries an unrelated `1.0.0` (build-only metadata). Releases are
> tagged `vX.Y.Z`; two legacy tags predate that rule — `7.7.0` (commit `b1c9f3c`)
> and `v7.7.0` (commit `6f8a861`, a **non-building** checkout). Not every
> `manifest.json` bump becomes a tag: numbers used while work was being written
> and tested ship under the next tagged version, and
> [`RELEASES.md`](./RELEASES.md) folds them into that one section. See
> [`DOCUMENTATION_AUDIT.md`](./DOCUMENTATION_AUDIT.md) §3 for the full version
> analysis.

---

## [14.10.1] — 2026-08-21

### Changed
- **The per-card "Reaction 1" badge is gone.** The group is already headed with
  the reaction's name and every card in it carries that reaction's colour on
  its edge, so the badge was a third statement of one fact on every card in the
  panel. The card top is now only appended when it holds a warning, since most
  cards hold none and an empty one still cost its bottom margin.
- **The reaction is drawn as a watermark instead** — `R1`, `R2`, in that
  reaction's own colour, bottom-right, behind the text. It costs no height
  because it is not in the layout. `isolation: isolate` on the card is
  load-bearing here: the mark sits at `z-index: -1` so text paints over it, and
  without a stacking context that would put it behind the card's own background
  instead of in front of it. Opacity is `--cdd-reaction-watermark`, at 0.13.
- **"Some of these values aren't saved on the batch/sample record" is now a
  mark, not a sentence.** It was two lines under every card that had a
  remembered fill offer. It is a footnote about that offer, so it became an
  information glyph inside the offer's own button with the sentence in its
  tooltip.

## [14.10.0] — 2026-08-21

### Added
- **Registration defaults, per vault.** Registering a compound from an ELN entry
  fills in the constants you always type — `Origin` is `Synthesized` for
  anything that came out of a reaction. Kept per vault, because vault 8158 has
  an Origin field and the next one may not. Filled only when the registration
  was opened from an ELN entry; a form opened by hand from Explore Data is left
  alone.
- **Initial amount and units from the stoichiometry row.** Tick *Create a New
  Sample* and both fill from the row the Register link sat in.
- **The HPLC block says what to change.** When the injection lands outside the
  comfortable range, one sentence gives the cheapest fix — more drops, a
  different vessel, or diluting the aliquot — and clicking it applies that to
  the reaction. The order of those levers depends on which way the injection is
  wrong: more drops when the mixture is too dilute, the pour-out dilution when
  it is too concentrated.
- **Two ranges are now settings.** The injector range (the ceiling belongs to
  the sample loop) and the comfortable range inside it. They are stored
  independently and the optimiser searches their overlap.
- **A fourth ELN tab title mode**, `Entry ID only` — `I34E-KRAP-0123`.

### Changed
- **Injection volumes round to 0.1 µL**, not 0.5. The bench works from a printed
  UPLC-MS guide given to one decimal, and every cell of it is this plugin's own
  formula; half-microlitre steps disagreed with it and were coarse enough to
  matter. The exact figure now appears only when rounding actually moved the
  amount.
- **Optimiser parameters replaced with measured ones.** Three drops rather than
  five, dilutions of 2× and 5× only, a comfortable range starting at 0.3 µL, and
  two vessels — a 0.25 mL insert and a vial filled to 1.5 mL. The previous
  defaults offered a 0.1 mL insert that does not exist.
- **The settings page is a rail and one pane.** Eight cards on one page read as a
  wall however they were arranged. Rail items carry a count, so a prefix or
  custom field the plugin discovered while you worked is still visible with the
  card shut.
- **`From the ELN` moved from Registration form into Registration defaults.** One
  card is about which form opens, the other about what gets filled in; the entry
  ID is a value being filled in.
- **Release headings carry a date**, not a month. All 51 sections took theirs
  from `CHANGELOG.md`, which had them all along.

### Fixed
- The sample-amount fill did nothing, for three independent reasons — the row
  selector matched the row's first cell rather than the row, the checkbox
  selector matched Rails' hidden partner field whose `checked` is always false,
  and the amount input was found by a name that seven controls share.
- The HPLC advice bar rendered as an empty amber strip when there was no advice:
  its `display: block` beat the `[hidden]` attribute.
- Vault boxes in Registration defaults kept a light border in dark mode —
  `var(--line, …)` where `--line` was never declared.
- A focused number input no longer steps on the mouse wheel. With no Save button,
  scrolling the page past a threshold you had clicked rewrote it silently.
- The panel could restore off-screen. Its size was clamped to the window on
  restore but its POSITION never was, and nothing re-clamped on resize — so a
  panel left near the right edge of a wide monitor reopened at the same
  absolute x on a laptop, with no way back but clearing storage.
- The panel narrows to 100px with the mouse, for shoving it aside without
  collapsing it. That is only safe because the header now wraps instead of
  clipping and drops its title below 300px, so every control stays reachable
  however narrow it gets.
- The panel could be resized to a width at which it could not be collapsed.
  The minimum was 240px against a header needing 275, and the panel is
  `overflow: hidden`, so the collapse toggle sat entirely outside it.
  Minimum is now 280.
- `⚠ LOW PURITY` was the least legible text in the panel at 4.12:1 on 10px
  bold — red on a red tint, below the 4.5 WCAG AA wants — on the one badge
  that must never be missed. The glyphs move to #f87171 (5.62:1); the badge
  still reads red. The same red elsewhere measures 4.57–4.74 and passes, so
  nothing else changed.
- *Remembered batch values* renders up to a hundred rows and was the one card
  with no height cap.

### Internal
- The package is declared ESM, so checks import straight from `src/` instead of
  copying modules into a scratchpad first — every test had been running against
  a copy. Fixing the build warning that prompted it exposed a second one it had
  been masking: `__dirname` does not exist in ESM and only worked because Vite
  bundles the config.

## [14.9.0] — 2026-08-20

### Added
- **HPLC injection volume in the panel.** Working out how much of a diluted
  reaction sample to put on the column was arithmetic done by hand every
  time, even though every number for it is already on the ELN page. A new
  block at the top of each reaction group does it: an aliquot is drawn from
  the mixture, diluted to the vial volume, and the injection is however much
  of that carries the target amount.

  The reaction molarity comes off the stoichiometry table's solvent row. It
  could not come from the panel's own cards — the row filter drops any row
  with neither a sample nor a registered batch, which is exactly what a
  solvent row is — so the parser gained a second, unfiltered pass over the
  same rows.

- **Half-microlitre steps, with the exact figure kept in view.** Nobody dials
  an arbitrary volume into a sequence, so the block leads with the nearest
  0.5 µL and prints the exact volume underneath, next to what that rounded
  injection really delivers: `exact 0.30 µL · 0.333 nmol on column`.
  Rounding 0.30 up to 0.50 is two thirds more compound, and that is not
  something to hide. 0.5 µL is also the floor — rounding 0.08 µL to the
  nearest half would give zero, which is not an injection.

- **Parameters are per reaction, not global.** One assay takes a single 10 µL
  drop and the next takes two. The options page holds the defaults a block
  starts from; typing into a block overrides them for that reaction alone,
  marks the field, and offers a `reset` back to the defaults. Nothing is
  written back to settings, and no other reaction moves.

- **Reactions with several solvents** combine into one effective molarity,
  `1 / Σ(1/Mᵢ)` — the concentration of the mixture the aliquot is actually
  drawn from.

- **Options card 7**, with an on/off switch and the three defaults (10 µL,
  1.5 mL, 0.2 nmol). **The block is off by default**: it answers a question
  only some workflows ask, and a panel that grows a new box for everyone on
  upgrade is a worse default than one you switch on.

## [14.8.0] — 2026-08-19

> **Shipped as one release.** `v14.5.0` was the last tag to reach the stores, so
> 14.6.0, 14.7.0 and 14.8.0 all go out under this number. The sections below
> stay per-version — that is the history the manifest bumps actually have —
> while [`RELEASES.md`](./RELEASES.md) tells it as the single release users see.

### Added
- **Molecule-Batch ID as a panel field.** CDD's own identifier for a batch —
  `RGT-0001620-001` — was the one thing the panel could not be told to show.
  There was no reason for the gap: the value is simply not a single field in
  the payload. A stoichiometry row carries the batch's own name, usually the
  bare suffix `001`, beside the molecule name, and it is the pair that makes
  the ID. `Batch name` (already in the list) is that suffix, which is why it
  looked like the ID was there and was not.

  The new field composes the two the same way `resolveRowName` already does
  for batch-only rows, and returns an ID that already starts with the molecule
  name untouched — which is what a "Mentioned in text" card carries, since
  those get the full `molecule_batch_identifier` from the molecule's sample
  list. CDD's placeholder `Unspecified` batch is not an identifier and is
  skipped; so is a bare number with no molecule name to put in front of it.

  Off by default, like every optional row, and it costs no request: both
  halves are already in the payload. It joins the print sheets and the CSV
  export with the rest.

### Internal
- **Two Qodana rounds ride along** (PRs #3 and #4, neither carrying a version
  bump of its own): redundant regex escapes dropped, two clone pairs merged
  (`mouseClick` into `utils/dom.js`, `column-manager.js` onto
  `field-picker-core.js`'s normalisers), vite `^7.3.1` → `^8.2.1` for
  CVE-2026-39363/4/5, and six exception-as-control-flow / dead-condition
  findings cleared — `selection-model.js#toggle`, `overlay.js#isSelectable`
  (De Morgan, same truth table), `search-plates.js` (a bad HTTP status is now
  recorded and handled outside the try that logs it, first page still fatal,
  later pages still end the scan with what was collected),
  `molecule-page.js` (the status throw split into `requestMoleculePage` so it
  is no longer caught by its own catch — same warnings, same rejection), the
  `readLocationPath` scope fallback, and missing `await`s in `toolbar.js` and
  `options.js`. No behaviour was meant to change; the box-selection, plate
  export, synonym, multi-position and template paths were all re-tested.

---

## [14.7.0] — 2026-08-19

### Fixed
- **Synonyms never reached the "Mentioned in text" cards.** 14.6.0 promised the
  row on every kind of card, but the enrichment only ever walked
  `STATE.lastPayload.samples` — and mention cards do not live there. They are
  built by the mention scanner into its own store
  (`features/mentions/state.js`) and joined to the payload cards at render
  time, so no fetch was ever started for them and the row stayed empty.
  `enrichSampleSynonyms()` now reads BOTH sources, and
  `features/mentions/init.js` calls it after each scan, since those cards never
  pass through `SAMPLE_DATA`. An entry whose panel is made of mentions alone is
  covered too — the old "no payload samples, nothing to do" early return is
  gone. Still one GET per distinct molecule, still nothing at all while the
  Synonym field is unticked. The re-render guard now accepts either source
  still being current.

- **"No templates saved yet" appeared twice after forgetting the last
  template.** Deleting starts two renders of the fill panel — the Delete
  handler's own, and the one from the storage-change listener, because
  `chrome.storage.onChanged` fires in the tab that wrote as well. Both cleared
  the panel and then awaited the list, so both appended their own copy of the
  result. `renderFillPanel()` now stamps each render with a token and the
  earlier one stops at its await, so the panel is drawn once whatever starts
  it.

### Changed
- **The multi-position action bar stays out of the debit dialog until "Create
  sample from debit" is ticked.** With the box clear, CDD's Save records a
  debit and creates nothing, so a "Create N Samples" button there offered
  something that could not happen — and the selection survives the location
  picker closing, so it could show up on a dialog the user never meant to
  create from. The bar hides itself while the box is unticked and comes back
  the moment it is ticked (a delegated, capture-phase `change` listener, since
  MUI replaces the input on re-render). The selected wells are kept, not
  cleared: ticking the box brings the same destinations back. The plain "Create
  a New Sample" dialog has no such checkbox and is unaffected.

---

## [14.6.0] — 2026-08-19

### Added
- **Synonym as a panel field.** The floating ELN sample panel can now show a
  molecule's synonym, on every kind of card — reagents, products and the
  batches mentioned in the entry text alike. A molecule may carry several
  synonyms; the **first** one is shown, using the same parser the inventory and
  heat-map tooltips already use (`extractSynonym`), which turns `<br>`
  separators into real ones and splits on a separator *followed by whitespace*
  so a name like `N,N-diethylhydroxylamine` is not sawn in half.

  The value does not exist in CDD's `eln_entry` JSON — it lives on the molecule
  page — so showing it costs one HTML GET per distinct molecule in the entry.
  That is why the field is **off by default** and why the whole enrichment
  (`content/features/synonym-enrichment.js`) returns before touching the
  network while the checkbox is clear: nobody who does not want the row pays
  for it. Ticking the box fills in the entry that is already open rather than
  waiting for the next one, via a new panel-fields change subscription in
  `sample-panel.js`.

  A new `content/api/molecule-page.js` does the fetching: one request and one
  `DOMParser` pass per (vault, molecule) per session, failures evicted so a
  later payload retries. It deliberately does not go through
  `getMoleculeData()`, which would render a SMILES structure per molecule that
  the panel never displays. "No synonym" and "the page failed" are kept apart —
  the first is remembered as a final answer, the second is not.

- **The panel is resizable.** Drag either side edge, the bottom edge, or a
  bottom corner. Both sides are grabbable on purpose: the panel starts anchored
  to the top right, where widening means pulling the *left* edge, but once it
  has been dragged elsewhere the right edge is as likely to be the one facing
  free space. Pulling the left edge keeps the right edge still, growing the
  panel leftwards instead of sliding it.

  The size is remembered next to the position in the same
  `cdd-stoich-panel-state` localStorage record, and is capped to the current
  window on load, so a size saved on a wide monitor cannot hand a laptop an
  off-screen panel. Minimums are 240 x 160 px.

  The edges announce themselves: a permanent grip mark in the bottom-right
  corner, and a tint under the cursor on any grabbable edge. The first cut used
  6px transparent strips and was, in testing, impossible to find or hit — the
  hit area is now 10px on the edges and 18px in the corners, deliberately
  larger than the mark it draws.

### Settings
- **Panel fields lists the ticked fields first, then everything else
  alphabetically.** The ticked ones keep the registry's order, which is the
  reading order of the panel card itself, so the top of the list mirrors what
  the user is looking at. The rest is not a layout but a menu to find something
  in — and it had grown long enough that finding a field in it meant reading
  every line. Both lists follow the rule, the static registry and the "From
  your vault" custom fields.

  The order is settled when the list is built, never on a click: reshuffling
  under the cursor would move the next checkbox out from under the hand ticking
  them.

### Changed
- **Panel layout is now a flex column** (`.cdd-stoich-body` grows and scrolls
  inside whatever height the panel has, `min-height: 0`) instead of the body
  carrying its own `max-height: calc(100vh - 90px)`. That is what lets a
  dragged height actually govern the panel. Size is applied through the
  `--cdd-panel-width` / `--cdd-panel-height` custom properties rather than
  inline width/height, so the stylesheet keeps the last word — which is how the
  collapsed panel ignores a remembered height and shrinks back to its header.
- **Panel position/size persistence moved** out of `sample-panel.js` into
  `content/features/panel-state.js`, shared by the drag and the resize. Saving
  a size can no longer forget a position, or the other way round.

---

## [14.5.0] — 2026-08-18

### Added
- **The carried ELN ID drops the vault prefix.** CDD offers three ELN identifier
  formats — Global Identifier, Vault Identifier, Vault-User Identifier — and on
  the last of these an entry ID reads `<vault>-<user>-<number>`
  (`PHA-MDX-0095`). The vault prefix is the same on every entry in the vault, so
  it says nothing a batch registered there does not already say: the entity is
  now registered as `MDX-0095`, and the second stoichiometry table of that entry
  as `MDX-0095B`. The other two formats are carried whole — they have no such
  repeated piece to lose.

  The trim happens before the table letter is added, so the letter always sits
  on the end of whatever the ID has been cut down to.

  Two dashes are required for a cut. An ID with fewer is left whole, however the
  format is set: better to carry one prefix too many than to saw a real ID in
  half because the setting says one thing and the vault does another.

### Settings
- **Registration form → From the ELN → ELN identifier format.** The same three
  choices CDD lists under its own ELN settings, defaulting to **Vault-User
  Identifier**. It is a plugin setting rather than something read off the page
  because CDD keeps that choice on a settings page only an admin can open — a
  normal session cannot see it, so the user names it once instead.

---

## [14.4.0] — 2026-08-18

### Fixed
- **`Ctrl+C` over a stoichiometry table now actually copies it.** 14.2.0 made
  the table selectable, but the clipboard still came out empty — pasting into
  Excel gave nothing. Selecting the text was only half the job: **Slate owns the
  copy**. Its React handler runs on the editor root, calls `preventDefault()`,
  and writes its own serialisation of the selection — and the table is a *void*
  node, so Slate's model has nothing inside it to serialise. What reached the
  clipboard was three empty lines (`text/plain: "\n\n\n"`, alongside an
  `application/x-slate-fragment`).

  A capture-phase `copy` listener on `document` runs ahead of anything mounted
  under it, so the clipboard is filled there and the event stopped before Slate
  ever sees it. What it writes:
  - **A selection spanning more than one cell** becomes a real grid — tab-
    separated `text/plain` plus a `<table>` in `text/html`, which is the flavour
    Excel prefers. One output row per table row, one cell per column. Fields
    inside a cell are joined with ` | ` in the plain text (a newline there would
    break the TSV back into rows) and kept on separate lines in the HTML.
    Labels are kept: a Properties cell carries FW, Density, Concentration and
    Exact mass at once, and four bare numbers in a cell mean nothing.
  - **A selection inside one cell** — a compound name, a mass — is copied
    exactly as highlighted. That is already what was asked for; a grid would
    answer a question nobody put.
  - **A selection anywhere else on the page** is left entirely alone, Slate
    included.

## [14.3.0] — 2026-08-18

### Added
- **The ELN entry's ID follows you into the entity you register from it.**
  Every unregistered row of a stoichiometry table offers *Entity: Register*,
  which opens the Create a New Entity page in a new tab. CDD carries the
  structure and the project across, but not the one thing that says where the
  compound came from — the entry ID had to be typed in by hand, from memory or
  from the other tab. It is now written into the form's **Internal ID** field
  (`IDEMO-MDX-0014`) — and which field that is can be changed on the settings
  page.
- **Which stoichiometry table it came from rides along, as a letter.** An entry
  can hold several reactions, and a product registered from the second table is
  not the product of the first. The first table registers bare
  (`PHA-MDX-0095`), the second adds a `B` (`PHA-MDX-0095B`), the third a `C`.
  The first is left bare deliberately: one reaction per entry is the ordinary
  case and should read the way it always has. The letters are the spreadsheet
  column names of `index + 1` with the first left off, which also settles what a
  27th table gets (`AA`, then `AB`) instead of running off the end of the
  alphabet.

  Tables are counted, not reactions — CDD renders each reaction as
  `<figure data-autotest-id="reaction">` around one
  `<div data-autotest-id="stoichiometry">`, and counting the latter means a
  reaction carrying only a scheme cannot shift the letters of the ones that do.
  The index is the table's position in document order, which is the order the
  entry reads in. A Register link outside any table counts as the first and gets
  no letter.

  How the ID travels: the Register control is a plain
  `<a data-autotest-id="registerLink" target="_blank">`, and a new tab is a new
  JavaScript world, so the two pages cannot simply talk to each other. Storage
  would work but would be a race against the new tab's load. Instead the ID
  rides in the URL — `cdd_eln_id=...` is appended to the link's `href` in the
  capture phase of `mousedown` (before the `click` that follows, and before
  React can re-render the link back), and the registration page reads its own
  query string. One click, one ID, no timing, and a reload still fills the
  field. `mousedown` also covers middle-click and `Ctrl`+click, which fire
  `auxclick` and never `click`.

  The field is found by its label rather than by an id: the cell announces
  itself as `data-editable-cell-label="*Internal ID"`, and CDD's required
  marker is stripped before matching, so `Internal ID` and `*Internal ID` are
  the same field. Only an **empty** field is written to, and only once per
  rendered input — CDD rebuilds the whole form when the project or the
  registration form changes, and the fresh (again empty) input is filled again
  because the value the re-render discarded was ours. A field the user cleared
  by hand is the same DOM node, so it stays cleared. A field the user is typing
  in is never touched.

  Off an ELN entry page nothing is stamped: the ID is read from the entry on
  screen (`[data-autotest-id="entry-identifier"]`), so Register links elsewhere
  in CDD are left exactly as CDD wrote them.

### Settings
- **Registration form → From the ELN.** A checkbox (on by default) and the name
  of the field the ID goes into (`Internal ID` by default). The name is
  per-vault configuration, not a constant — the label is matched ignoring case,
  spacing and CDD's `*` marker, and emptying the box restores the default
  rather than matching nothing.

### Changed
- **One reader for "the entry ID".** The tab-title feature scanned every `<div>`
  on the page for text starting with `ID:`; that reader now lives in
  `content/utils/eln-entry-id.js`, prefers CDD's own
  `[data-autotest-id="entry-identifier"]` hook, and keeps the document scan only
  as a fallback. Both the tab title and the carry-over ask it, so the two can
  never disagree about what the entry ID is.

---

## [14.2.0] — 2026-08-18

### Added
- **Text in a stoichiometry table can be selected and copied.** Nothing in the
  table could be highlighted before — not a molecule name, not a mass, not a
  formula weight. Two of CDD's own decisions were behind it, and both are now
  lifted for the stoichiometry table only:
  - The table sits inside a Slate *void* node — a `<figure>` that switches text
    selection off for everything under it. Every one of the 398 elements in a
    two-reaction table computed `user-select: none`.
  - That same `<figure>` is `draggable`, so pressing the mouse down on a
    molecule name started an HTML5 drag of the whole reaction block. The
    browser never got as far as firing `selectstart`.

  Drag across the table now and it highlights like any other text; `Ctrl+C`
  copies it, tab-separated by column so it pastes into Excel as a table. The
  `draggable` attribute is switched off for the length of a single mouse
  gesture and restored on mouse-up, so Slate can still drag the reaction block
  and every link on the page stays draggable.
- **`Ctrl`/`⌘`+click on a field copies that field's value.** One gesture, no
  popup, no menu — the field flashes green and the value is on the clipboard.
  Hold `Shift` as well to get `Label: value` instead of the bare value. Fields
  showing only a placeholder (`Optional`, `Required`) copy nothing rather than
  the placeholder text. Inside this table the modifier means *copy*, links
  included: `Ctrl`+clicking a batch id copies `PHA-0333427-001` instead of
  opening it in a new tab, which is the point of the gesture. The pointer turns
  into a copy cursor while the modifier is held, so the gesture is visible
  before it is used.

### Fixed
- **A drag that selects text no longer opens the field editor on release.** A
  drag that starts and ends inside one field still fires a click, and CDD's
  edit popup would land straight on top of the text that was just highlighted.
  Past 4 px of travel with a live selection, that click is dropped. A plain
  click travels no distance, so click-to-edit is untouched.

## [14.1.0] — 2026-08-18

### Added
- **Editing an amount in a stoichiometry row now starts on the number.** CDD's
  one-field popup opens with the caret at the *end* of the value and nothing
  selected, so changing `19 g` to `25 g` cost four backspaces before a single
  digit could be typed — and the same in every other numeric field (Purity,
  Density, Equivalent, Concentration). The number is now preselected and the
  unit is left in the box *after* the caret, so typing a new number keeps the
  unit by construction.
- **A cleared field can no longer change the unit behind your back.** Mass and
  Volume carry their unit inside the input text while the popup label states
  the vault default (`Mass [mg]`), so a field cleared and retyped as `25` was
  committed as 25 mg — a 1000× error that looked like an ordinary edit. On
  Enter, a bare number in a field that *had* a unit gets that unit back first.
  A typed `25 mg` is committed exactly as typed, and a field emptied on purpose
  stays empty.
- **The Samples panel's CSV button opens.** It is now a split button: `CSV`
  still downloads the whole table in one click, and the caret next to it offers
  **Products only** — the reaction product rows on their own. That export
  deliberately ignores the *Show products* option, since asking for products is
  already the answer to the question that option poses; an entry with no product
  rows says so instead of downloading an empty sheet. The `Type` column is
  dropped from it (every row would repeat "Product"), and the file is named
  `cdd-products-…` so the two exports do not shadow each other in Downloads.

### Fixed
- **A bulk (parallel) reaction no longer contributes a product that is nowhere
  in the entry.** CDD keeps the template rows a parallel reaction was drawn
  from and renders the two slots the enumeration replaces as *Variable reagent*
  and *Variable product* — but the payload still carries the structures drawn
  **before** the parallel block existed. In entry 2504170 that meant a card, a
  printed row and a CSV line for an acetamide that appears in no table on the
  page. The panel now drops that placeholder, and the enumerated products are
  untouched.

### Technical
- `src/content/features/ui-fixes/stoich-amount-editing.js`, initialised from
  `content/main.js`. Four capture-phase `document` listeners (`mousedown`,
  `focusin`, `keydown`, `focusout`) — no MutationObserver and no table
  scraping. A popup box is recognised by shape (`input.material-input` inside a
  `.MuiPaper-root`, value empty or a number with an optional unit), so the
  solvent picker and the field pickers are never touched.
- A `mousedown` on the box itself suppresses the preselection: that is the user
  aiming the caret, most likely at the unit — the one thing preselecting the
  number would put out of reach.
- The unit correction swallows the Enter, writes the corrected value through
  the React-aware native setter and re-sends Enter on the next frame; the
  re-sent event is synthetic, so the handler ignores it and cannot loop. Both
  branches act on `event.isTrusted` only, so `row-fill.js`'s own fills of these
  same popups pass through untouched.
- Whether CDD also commits on click-outside is unverified; the `focusout`
  branch corrects the value there as a best effort and re-dispatches nothing.
- `exportPanelCsv(visibleFields, { productsOnly })` in
  `content/features/panel-csv.js`; the default path is unchanged apart from
  refusing to write a header-only file when the filter leaves nothing. The menu
  in `sample-panel.js` is `position: fixed` and placed from the caret's rect —
  the panel clips its overflow and is no taller than its header when collapsed,
  so a menu laid out inside its box would be cut off. Its document-level
  close listeners are attached only while it is open, so a panel torn down and
  rebuilt cannot accumulate them.
- The parallel placeholder is dropped in `inject/parsers/sample-data.js`: a
  `product` row is skipped when the table also holds `parallelProduct` rows
  **and** the row has no identity of its own (no `moleculeId`, no batch id, no
  sample). The parallel precondition is what makes it safe — an ordinary
  reaction's unregistered, drawn-only product has exactly the same empty shape,
  and CDD *does* display that one, so it keeps its card. Verified against all
  three reaction features of entry 2504170: the rule drops that one row and no
  other. Row numbering is computed from the full row list and so still matches
  what CDD prints, placeholder included.
- Not fixed, and worth knowing: nothing in the payload distinguishes the
  template reactant CDD labels *Variable reagent* from a real one — it carries
  a full `moleculeId`/`moleculeName`. Today it never reaches the panel (no
  sample, no batch id), so it costs nothing; an entry where that row does carry
  a batch would need a rule we cannot yet derive.

## [14.0.0] — 2026-08-18

`13.2.0`, `13.3.0` and `13.4.0` were built and tested but never tagged, so none
of them reached the stores. This release carries all three — the last public
one was `13.1.1` — as well as the entries below.

### Added
- **The field pickers can be narrowed to one registration form.** Both the
  Search page's *Keywords* selector and Inventory's *Filter Entries* selector
  list every field the vault owns — 129 options in the vault this was built
  against. A row of chips above the columns (`All`, `Molecule`, `Plasmid`,
  `Antibody`, …) cuts that to the fields the chosen form actually uses:
  **21–46 options**, i.e. 3–6× shorter. Default is `All`; the choice is
  remembered per vault, and the chips follow the form order already
  configurable on the options page.
- The map of which fields each form uses is **scraped from
  `/vaults/<v>/molecules/new`**, out of the `RegistrationFormRenderer`
  `react_props`: each `registration_form_definitions[].components` is a nested
  layout tree whose leaves carry a `fieldID`, joined against
  `molecule_field_definitions` / `batch_field_definitions` /
  `inventory_sample_field_definitions`. There is no JSON API for this —
  `/api/v1/vaults/<v>/fields` wants an API token and 401s on a session cookie.
- **That page is ~1 MB and takes the server ~10 s**, so it is never on the
  critical path. It is harvested for free from the live DOM whenever the user
  is on the Create Entity page anyway; the fetch only happens if nothing is
  cached *and* a picker is actually opened, never on page load. A stale map is
  served immediately and refreshed behind the user's back (7-day TTL).
- Matching is **by field name**, because the Search `<option value>` is a plain
  array index into CDD's own list, not a field id. Verified exact across both
  pickers; the handful of labels that don't match are CDD built-ins (Entity
  Name, Salt, Formula Weight, Current Amount, …). Those are detected as
  "not a vault-defined field" rather than from a hardcoded list, so they stay
  visible in a vault we've never seen. `Event` fields are never filtered —
  events belong to no registration form.
- The chip filter is a **second, independent input to visibility**, so it
  composes with the search box instead of fighting it: a chip-filtered field
  scores 0 no matter what is typed, and the browse view drops emptied groups
  and columns. See [`docs/REGISTRATION_FORM_FIELD_FILTER.md`](./docs/REGISTRATION_FORM_FIELD_FILTER.md)
  for the measurements and the full design record.

### Fixed
- **The Samples panel never rendered at all.** `renderFromState()` called
  `isTableRowsEnabled()` without importing it, so it threw a `ReferenceError`
  on every entry that had anything to show. `ensurePanel()` had already built
  the panel a few lines earlier, which is why it sat on its initial
  *"Waiting for reaction data…"* status with no cards — on an entry whose
  mention links had in fact resolved. Nothing reached the console either: the
  mention scan's `refresh().catch()`, there so a failed scan cannot break the
  page, swallowed the programming error along with it. Introduced in 13.4.0
  and never published.
- **The panel outlived the entry.** It hangs off `<html>` rather than `<body>`
  so that Turbo's `<body>` swap cannot take it away, which also means nothing
  removes it on its own — and `renderFromState()` returned on
  `!isElnEntryPage()` *before* reaching the branch that would have. After an
  in-app navigation the panel stayed on screen, still listing the previous
  entry's samples, until the next full page load. The page check moved into
  `shouldShowPanel()`, the one question both callers already ask:
  `ensurePanel()` now refuses to build a panel off an entry, and
  `renderFromState()` takes the old one down. It runs before the Ketcher
  guard, so leaving an entry with the structure editor open removes the panel
  rather than freezing it.
- `updatePanelVisibilityForOverlays()` sets `STATE.isKetcherOpen` **before** it
  looks for the panel. Returning early when there was no panel left the flag
  stuck at `true` — harmless while the panel was never removed, a trap once it
  is: closing the structure editor on a page without a panel would have meant
  never getting a panel on the next entry.

---

## [13.4.0] — 2026-08-17

### Added
- **Batches and samples linked in an entry's text now reach the Samples
  panel**, in their own *Mentioned in text* group below the reactions. Both
  shapes count: a link typed inline into the body (a Slate `.slate-a`) and
  one that is part of an embedded card. They look nothing alike in the DOM
  but carry the same href, which is the whole identity —
  `/vaults/<v>/molecules/<m>#molecule-batches/<id>` or
  `#molecule-inventory_samples/<id>` — so nothing here has to understand the
  editor's document model.
- One endpoint answers both kinds:
  `/vaults/<v>/molecules/<m>/inventory_samples.json`. Each entry carries its
  own `id` AND its `batch_id`, plus `location`, `current_amount`/`units`,
  `fields`, `batch_fields` and a nested `batch` — so a sample mention is a
  direct hit and a batch mention reads the batch half of any sample of that
  batch. One GET per molecule, cached, whichever way.
- **A batch mention deliberately shows no location, amount or
  concentration.** Those belong to one bottle and the entry did not mention
  a bottle; borrowing an arbitrary sample's shelf would be an invented fact.
- `include_depleted=true`: a mention of a bottle since used up still
  resolves, and the panel already knows how to badge it. Filtering it out
  would leave a card with a name and no explanation.
- **A substance already in a stoichiometry table is not shown again as a
  mention.** Writing "we used RGT-0000204-002-I003520" in the text AND
  putting that bottle in the table is the normal way to record an
  experiment, so the duplicate is the common case, not the odd one.
  Matching is by **id, never by name**: the two sources name the same record
  differently — the table row calls that bottle `I003520` (its
  `sample_identifier`) while the link calls it `RGT-0000204-002-I003520`
  (its full name) — so a name comparison would miss exactly the case it
  exists for. Both the sample id and the batch id are checked, so it fires
  whichever of the two the ELN row happens to carry. Hidden mentions are
  **counted in the status line**; a card that is simply gone is
  indistinguishable from a scan that failed.
- **The trailing record id in the href is optional.** Some links CDD writes
  stop at the section — `…#molecule-inventory_samples` with no `/<id>` —
  while still naming the record in their text. Requiring the id dropped
  those silently; they are now resolved by matching the link's text against
  the record's `name`, `sample_identifier` or `molecule_batch_identifier`.
- **Print and CSV now export what the panel shows**, mentions included.
  Both read `STATE.lastPayload` before, which holds only the stoichiometry
  rows — everything linked in the entry's text was missing from every sheet
  and every export. All three now read one function, so they cannot
  disagree.
- **Panel sources are now a setting** — stoichiometry table rows and
  in-text mentions, independently. Both default ON.
- An entry with no stoichiometry table but a batch linked in its text now
  gets a panel at all. Three gates had to agree, not one: `renderFromState`,
  `ensurePanel` (which refused to build a panel without a reaction) and the
  message router (which *deleted* the panel the moment reaction visibility
  went false). They now share a single `shouldShowPanel()`.
- **A Copy button on every row of a protocol's Run Data table.** That table
  is the one place where every run of a protocol is visible at once, so it
  is the natural place to say "that one, give me those settings" without
  opening the run. It produces exactly what the run page's Copy produces,
  so *Paste into form* does not care where the values came from.

### Technical
- Mention cards are built in the SAME shape the stoichiometry parser
  produces, so the field registry, custom-field discovery, the depleted
  badge and the CSV export all work on them unchanged.
- `computeFillOffers` returns nothing for a mention: it is prose, not a row
  — there is no table cell to write to and no row number to find one by.
- The scan compares a signature of what it found before doing anything. The
  entry body is a live editor that re-renders on every autosave, and
  rendering the panel is itself a mutation, so an autosave that moved the
  DOM without touching a link must cost one `querySelectorAll` and stop —
  otherwise the observer feeds itself.
- The cards live in their own tiny module. The panel reads them and the
  scanner writes them; keeping both in the scanner would have meant the
  panel importing the scanner while the scanner imports the panel.
- Which columns of the protocol's run table are real fields is read from
  that page's own run annotator, not guessed from the headers — so
  `Molecules` and `Plates`, which are row counts, drop out on their own
  rather than by a hand-maintained blocklist.

---

## [13.3.0] — 2026-08-17

### Added
- **Run definition templates.** A bar above a run's *Run Definition* card
  saves the values it already holds under a name, and replays them into the
  next run — `chrome.storage.local`, up to 50, same storage split as the
  control-layout presets (`shared/run-form-templates.js` is DOM-free so the
  options page could list them later).
- **Saving picks the fields.** Everything with a value is listed with its
  value; fields that belong to one run rather than to the method (*Run
  Date*, *Person*) start unticked, and a `File` cannot be ticked at all —
  an uploaded file lives on CDD's server and no remembered string brings it
  back.
- **Filling never overwrites silently.** Empty fields are written straight
  away; a field already holding something *different* is left alone and
  listed as `current → template`, with a button per row and a *use all*.
  Identical values, fields this form does not render, and non-replayable
  kinds are reported as skipped. **CDD's Save is never pressed** — the form
  is loaded and handed back for review, which is also why this is safe on a
  run somebody already started.
- **Copy / Paste for the one-off case**, when a saved template is more
  ceremony than the job needs. *Copy* puts the method fields on the
  clipboard as `name<TAB>value` lines — tab-separated so the block pastes
  into a spreadsheet, gets edited there and comes back unchanged. *Paste*
  is **one click**: it writes what Copy last put down and **overwrites**,
  deliberately, reporting every field it changed as `old → new`. Lines that
  went out to a spreadsheet and were edited there come back through a box
  behind the *paste edited lines* link.
- **Reading works anywhere, writing waits for the editor.** *Save* and
  *Copy* work from the read-only view — that is where you are when you
  decide to reuse a definition. *Fill* and *Paste* stay disabled until
  **Edit run definition** is open: a button that silently opened the editor
  would leave the run in an editable, unsaved state nobody asked for.
- **Run definition values are click-to-copy** outside edit mode, the same as
  the fields on batches, samples and entities. In edit mode those cells hold
  form controls, and the existing interactive-content guard leaves them —
  and the batch links — alone.

### Technical
- Copy writes its text twice: to the system clipboard, and to a small stash
  in `chrome.storage.local`. Reading the system clipboard back would need
  the `clipboardRead` permission, which reads as "read data you copy and
  paste" and would make every installed copy ask for consent again on
  update — a one-click Paste is not worth that.
- The two writing buttons are re-enabled from the discovery scan, which
  already runs on every mutation batch, so the bar follows the form in and
  out of edit mode without this feature tracking any state of its own.
- The run definition's `td` cells got their own container/selector pair in
  `copyable-fields.js` rather than a bare `td` added to the shared list,
  which would have made every table cell on the molecule pages copyable.
- A template field carries BOTH `defId` (CDD's `run_field_definition_id`,
  exact within a protocol) and `name` (portable to a different protocol
  rendering the same form). The fill tries the id, then the name, so neither
  case has to be known in advance. No CDD row id is stored, so a template
  can never carry a stale reference into a run it does not belong to.
- The bar is inserted as a **sibling** of `div.protocolAnnotator`, never
  inside it: the annotator is a React root that re-renders wholesale on
  edit/cancel, and a node of ours among its children would be destroyed on
  the next render — or make React throw while removing children it does not
  own. Stale bars are swept the same way the control-layout toolbar sweeps
  its own.
- `react_props` is a ~400 kB JSON string and the scan runs on every mutation
  batch, so it is parsed only when a bar is actually missing.
- The `BatchLink` picker needed three separate concessions, each found the
  hard way against the live form: it **ignores input on an unfocused box**,
  it treats a `change` event as a commit and **discards the typed text**
  (so its writes send `input` only), and it wants to be **clicked open**
  first. Its results are a remote search portaled to `<body>`.
- A `BatchLink` is typed straight OVER its current value and never cleared
  first — clearing would leave a moment holding nothing, and a search that
  then found no match would make that moment permanent. On failure only the
  display text is put back; CDD's committed selection is never touched.
- Every multi-field write runs in SEQUENCE. A BatchLink drives CDD's shared
  search picker, so two at once would type into each other's dropdown.

---

## [13.2.0] — 2026-08-17

### Added
- **The value memory now remembers a batch's solvent too.** `solvent` joins
  `density`, `purity` and `concentration` in `VALUE_FIELDS`, captured by the
  same rule as the rest: the sample record's own *Solvent* field wins and
  frees the slot, otherwise the one picked in the table is kept. The table
  value comes from `row.solvent.name` — the solvent of a solution row is a
  nested row object, never a member of `stoichiometryTable.rows`, so
  `sample-data.js` now resolves it into `tableSolvent` (the same shape
  `print-data.js` has read since 12.8.6).
- **A concentration fill picks the solvent on the way.** `Make solution`
  creates the solution *and* an empty solvent row; filling the concentration
  now goes on to pick the remembered solvent in that row, so one click
  produces a complete stock solution. The button says which solvent it will
  use — *Fill remembered concentration (0.4 mol/L in ethanol) into table*.
  The solvent is best-effort: the concentration is already written, so a
  solvent the picker refuses outright comes back as a note on a successful
  fill, never as a failure.
- **Any string works as a solvent, not just CDD's list.** A remembered
  solvent is matched against the 38 built-in entries first — those carry
  CAS-RN, FW, density and boiling point — and anything else is set as free
  text through the picker's `Create "…"` entry, exactly as a chemist typing
  "EtOAc/Hexane 1:1" would. That names the solvent on that row only; the
  vault's solvent list is never added to.
- **A solvent fill of its own**, offered when the row already *is* a solution
  (it has a concentration) but no solvent was ever picked — the state CDD
  labels *Solvent: Required*. A row that is not a solution gets no such
  offer: turning it into one is the concentration fill's job.
- The settings page lists the remembered solvent next to the density, purity
  and concentration columns.

### Technical
- `row-fill.js` gained the first fill that drives a **dropdown** rather than a
  text field. The solvent of a solution row is its own `<tr>` directly under
  it (`data-autotest-id="stoichiometry-table-solutionSolvent"`, no row
  number); its picker filters CDD's 38 built-in solvents as you type and
  lists them all when the box is empty. The fill types the remembered name
  first and falls back to the full list — in that order, because React
  ignores an input event that does not change the value and the box already
  starts empty.
- The list search and the free-text `Create "…"` entry are looked up
  separately — the list by `solvent-…` autotest id, `Create` by its own
  label with the quoted text checked against what was typed. CDD offers
  `Create` alongside real matches, so trying the list first is what keeps
  "ethanol" from being created as text next to the real Ethanol entry.
- Picker labels and stored names disagree by design: the list says
  *Ethanol (EtOH)*, the payload says *ethanol*. A match is tried against the
  whole label, the label without its trailing parenthesis, and each
  comma-separated abbreviation inside it — so *ethanol*, *EtOH*, *DMSO* and
  *dichloromethane* all resolve. Confirmation compares the stripped strings,
  never numerically: `2,2,2-Trifluoroethanol` parses as a number.

---

## [13.1.1] — 2026-08-12

### Added
- **Ctrl+click a section header to copy the whole block.** The search results
  thead has a grouping row above the column labels — `Properties`
  (`colSpan` 30) and `Batch Fields` (`colSpan` 5) on a 37-column table.
  `findColumnSpan()` now returns the cell's whole span instead of a single
  index, so clicking a section copies every column under it: tab-separated
  (which is what a spreadsheet splits into columns) and led by the leaf labels,
  since 30 unlabelled property columns would be unreadable. A single column is
  unchanged — still pure data with no heading, so a list of IDs pastes clean.

### Fixed
- **13.1.0 swallowed Ctrl+clicks on the search results toolbar.** That toolbar
  (`N Selected: Launch Visualization · Export · Add to collection · Save this
  search …`) lives inside the `thead` as one full-width `th`, so the handler
  treated it as a column header: it called `preventDefault()` and
  `stopImmediatePropagation()`, and the button did nothing. The column span is
  now resolved **before** the event is swallowed, and a header cell is skipped
  when it spans the entire table or contains a `button` / `input` / `select` /
  `textarea` — those clicks reach CDD untouched.

---

## [13.1.0] — 2026-08-12

### Added
- **Ctrl+click a search results column header to copy the whole column.** New
  `src/content/features/ui-fixes/search-column-copy.js`: Ctrl+click (Cmd+click
  on macOS) any header of `table.search_results_table` and every value in that
  column goes to the clipboard, one per line, ready to paste into Excel. The
  copied cells flash green and a toast reports how many rows were taken.
  - **The column cannot be read with `row.cells[n]`.** CDD merges the select
    and molecule columns across all of a molecule's batches via `rowSpan` — in
    the test vault one molecule spans **828** rows — so only the first row of
    each molecule has 7 cells and every continuation row has 5. `cellIndex`
    and the visual column therefore drift apart after the first molecule, and
    a naive read returns the Owner where Batch Name was asked for. Both the
    header and the body are mapped onto a real grid (`buildGrid()`) that
    repeats each cell across every slot its colspan/rowspan covers.
  - Values are **row-aligned**: a merged cell repeats down its rows, so every
    column yields the same line count (933 in the test search) and two copied
    columns line up when pasted side by side.
  - `readCellText()` prefers the single `a[href*="/molecules/"]` in a cell, so
    the Molecule column copies as `TEST-0260386` rather than
    `TEST-0260386 ITR Sandbox` — its raw text also carries the project chips.
  - Newlines inside a cell are collapsed to spaces; a cell wrapping onto two
    lines would otherwise shift every later value out of step.
  - The listener is delegated on `documentElement` in the **capture** phase:
    the headers are `<a>` links that also carry CDD's sort handler, so without
    intercepting first, the copy would re-sort the table or open the search in
    a new tab.

---

## [13.0.1] — 2026-08-12

### Changed
- **The heat map well balloon is 1.4× wider, so its rows stop wrapping.** CDD
  sizes `#balloon` to its own content, which left the `.details-popup` body
  around 140 px wide. Once the configurable batch rows (12.8.0+) were added,
  almost every line wrapped onto a second row — even short ones like
  `Batch name: 001`. New `widenBalloon()` in
  `heat-map-well-fields.js` multiplies the width CDD picked by
  `BALLOON_WIDTH_FACTOR = 1.4`; measured on a live popup that takes the usable
  text column from 136 px to **223 px** (+64 %, since the fixed padding no
  longer eats a proportional share). CDD's own `max-width: 600px` still caps
  the result.
  - Only `#balloon` gets the new width: `#contents` carries the visible box
    (background + border) and has no width of its own, so it follows, while
    the `#topRight` / `#bottomRight` / `#bottomLeft` siblings turned out to be
    fully transparent skin remnants — no background, no border — so their
    stale geometry needs no patching.
  - The guard sits on `.details-popup`, which CDD rebuilds for every well;
    `#balloon` is a single reused element, so a flag there would only widen
    the first popup, and re-running on it would compound 1.4× each time.
  - Applied before the extra rows are inserted, so they lay out at the final
    width, and whether or not any fields are configured — CDD's own rows wrap
    too. A balloon near the right edge of the window is nudged left, since CDD
    placed it while it was still narrow.

---

## [13.0.0] — 2026-08-12

### Added
- **Rectangle selection and saved layouts for CDD's control-layout editor.**
  Editing a control layout (`Run Details` → *Control Layouts* → *Edit this
  layout*, for the 96/384/1536-well run defaults and for plate-specific
  layouts) meant clicking every well individually and cycling it through
  *empty → positive → negative → reference* until it landed on the state you
  wanted. Marking a 1536-well plate that way is thousands of clicks. Two
  toolbars now sit above every layout editor:
  - **Paint wells** — arm *Positive control*, *Negative control*,
    *Reference molecule* or *Clear*, then **drag a rectangle** across the
    grid. Every well inside the band takes the armed state live, and the band
    follows the pointer in all four directions; shrinking it restores the
    wells it no longer covers to exactly the state they had. A row or column
    header fills that whole line, the blank corner header fills the plate,
    and shift+click extends a rectangle from the last well painted. Clicking
    the armed button again disarms it and hands the grid straight back to
    CDD.
  - **Saved N-well layouts** — name the current grid, reload it later, delete
    it. Presets live in `chrome.storage.local` under
    `cddControlLayoutPresets`, keyed by the grid's own geometry (`8x12`,
    `16x24`, `32x48`), so a 96-well layout cannot be loaded into a 384-well
    plate by construction rather than by a runtime check. A row is stored as
    one character per well (`.`/`+`/`-`/`#`), keeping a 1536-well preset at
    roughly 1.5 kB. Loading only fills the grid — CDD's own **Save changes**
    is still what writes it to the vault, and the status line says so.

  New `src/shared/control-layout-presets.js` (storage, DOM-free) and
  `src/content/features/control-layout/` (`layout-grid.js` — every selector
  and the read/write of a well's hidden `control_layout[control_states][r][c]`
  input; `painter.js` — the rubber band; `toolbar.js` — the two bars;
  `styles.js`; `init.js` — discovery).

  Notes on how it stays out of CDD's way:
  - Wells are set through the hidden input CDD itself submits, never through
    the class that paints them, so what gets POSTed is exactly what is on
    screen.
  - CDD delegates `click` for `.well-control-cell`, `.well-row-header` and
    `.well-column-header` from `document`. The painter listens in the
    **capture** phase on the table, so while a brush is armed the native
    per-well cycle never fires; with no brush armed the feature adds no
    listeners' worth of behaviour at all.
  - Discovery is by DOM shape — a `table.plateLayout` holding wells with a
    `control_layout[control_states]` input — not by URL, so plate-specific
    layouts and any other page using the same editor are covered.
  - Reopening a layout editor is hostile to anything the extension puts inside
    CDD's `<form>`, in two different ways, so every scan sweeps before it
    attaches. First, CDD swaps the `<table>` while keeping the form, orphaning
    the toolbar next to it — untreated, *Edit → cancel → Edit* stacked a
    second and third **Paint wells** bar. Second, a section restored after a
    cancel is re-parsed from serialized HTML, which **clones** the toolbar:
    identical markup, no event listeners, so every button is inert while
    looking perfectly normal (pressing CDD's Save and reopening appeared to
    "fix" it, because that path fetches the form from the server without a
    toolbar in it). A toolbar therefore counts as live only if this instance
    built it — tracked in a module-level `WeakSet` of toolbar nodes — not
    merely because one is present. Replacing a toolbar we did not build is
    capped per grid (`MAX_FOREIGN_REPLACEMENTS`), so a second installed copy
    of the extension cannot end up trading toolbars with the first forever.
  - The bars use the `hidden` attribute to swap the preset row for the
    "Save as" row, and the stylesheet re-asserts `[hidden] { display: none }`
    at class specificity: the bars' own `display: flex` rule would otherwise
    outrank the UA default and leave both rows on screen permanently, Cancel
    included.

---

## [12.8.8] — 2026-08-12

### Reverted
- **12.8.7's `clampPanelIntoView()` is gone.** Pulling the panel back inside
  the window on every `resize` meant it moved on its own while you worked:
  it drifted away from wherever you had deliberately dragged it each time the
  window changed size, which is worse than the problem it solved.
  `sample-panel.js` is back to its 12.8.6 state — the panel is dragged by its
  header, `left`/`top` are saved to `localStorage` on mouse-up and restored
  verbatim, and nothing repositions it behind your back.
  - The original trap therefore stands: a position picked on a wide monitor
    can leave the panel off-screen in a much narrower window, recoverable by
    clearing `cdd-stoich-panel-state` in localStorage. A clamp applied **only
    when the panel is created** would close that hole without any
    move-while-you-work behaviour, should it ever become a nuisance.
- Panel collapse state was never part of this and is untouched: it is
  remembered as it always has been — `savePanelState({ collapsed })` on
  toggle (`sample-panel.js:543`), read back in `ensurePanel()`
  (`sample-panel.js:210`).

---

## [12.8.7] — 2026-08-12

### Fixed
- **The CDD Samples panel could go missing after the browser window was
  made smaller.** `makePanelDraggable()` clamps the panel to the viewport
  while it is being dragged, but `ensurePanel()` restored the position saved
  in `localStorage` (`cdd-stoich-panel-state`) verbatim. A panel dragged to
  `left: 2389px` on a wide monitor therefore reappeared at 2389 px in a
  1537 px-wide window — entirely off-screen, and unreachable, since the only
  way to move it is to drag its header. It looked exactly like the panel had
  failed to load, even though it was in the DOM and fully populated. New
  `clampPanelIntoView()` pulls it back inside the window on creation and on
  every `resize`, then persists the correction so the next load starts from a
  reachable spot. A panel taller than the window keeps at least its header —
  and with it the drag handle, Refresh/Print/CSV and the collapse button — on
  screen.

---

## [12.8.6] — 2026-08-12

### Fixed
- **The printed stoichiometry sheet dropped the solvent of every solution
  row.** A reagent used as a stock solution (`rowType === "solution"`, e.g.
  *N-methyl(3-bromo-2-nitrophenyl)amine* in benzene) keeps its solvent
  **nested** under `row.solvent` — a complete row object of its own with
  `role === "solutionSolvent"` — instead of as a member of
  `stoichiometryTable.rows`. `extractRows()` only mapped the top-level array,
  so the solvent never reached the content script and the sheet printed the
  reagent as if it were neat material. `resolveSolventRow()`
  (`src/inject/parsers/print-data.js`) now resolves the nested row one level
  deep, and `renderSolventRowHtml()`
  (`src/content/features/print-buttons.js`) prints it as an indented
  **Solvent** sub-row directly under its parent — name, CAS-RN, FW, density,
  boiling point, mass, volume and mole — mirroring CDD's own on-screen
  layout. A solution whose solvent has no molecule picked yet still prints,
  as `Solvent: not specified`, with whatever volume was typed.
  - `extractRows()` passed `Array.prototype.map`'s index straight into the
    new recursion-depth parameter; it now maps through an arrow so every row
    is resolved at depth 0.

### Added
- **Concentration and reaction molarity on the printed sheet.** Solution rows
  print `Concentration:` in the Properties column and solvent rows print
  `Reaction molarity:` in the Calculation column. Both come from plain
  payload numbers that CDD always keeps in mol/L (`row.concentration`,
  `row.molarity`); `formatMolarity()` keeps that unit and trims trailing
  zeros so the sheet reads exactly like the table on screen
  (`0.6 mol/L`, not `600.00 mmol/L`).

---

## [12.8.5] — 2026-08-09

### Fixed
- **Plate map CSV export left Batch ID/Sample ID unsplit for mixed
  alphanumeric sample codes.** `splitBatchAndSample()` accepted a sample
  code only if it matched `^[A-Za-z]+\d+$` — letters, then digits, and
  nothing else. Real codes interleave the two, so
  `I88-SM-0060050-005-I88S034537` failed the test: the whole name landed
  in **Batch ID** and **Sample ID** came out empty. The test is now simply
  "the last dash-segment starts with a letter", which is what distinguishes
  a sample code from a batch's trailing `-001`. Batch-only ids
  (`PHA-0334442-001`) still stay unsplit, and `S003559` / `SM003035`
  behave exactly as before.

---

## [12.8.4] — 2026-08-07

### Changed
- **Heat-map tooltip default is now EMPTY (reverts 12.8.3's default).**
  No preset rows: the popup shows nothing extra until the user picks
  fields in the options card — discovery fills "Available", choosing is
  deliberate (same philosophy as prefix colours). `DEFAULT_HEAT_MAP_FIELDS`
  is gone; an empty selection is simply "off".

---

## [12.8.3] — 2026-08-07

### Fixed
- **Heat-map tooltip defaults could vanish.** An empty selection array in
  storage (left behind by the 12.8.0 free-text card) made the options list
  start with nothing selected and the popup show no extra rows.
  `sanitizeHeatMapFields` now treats anything that cleans up to zero
  labels as "unset" and returns the defaults (Synonyms, Internal ID), on
  read AND write — so the defaults can never silently disappear; removing
  every row in the options card brings them back. The options page also
  no longer repaints from a discovery event before the initial selection
  has loaded.

---

## [12.8.2] — 2026-08-07

### Changed
- **Heat-map tooltip rows are now user-ordered.** The options card shows
  the chosen rows as a reorderable list (▲/▼ arrows, ✕ to remove) — the
  popup renders them in exactly that order, all in the block under the
  molecule link. The synonym is no longer pinned to the bottom: "Synonyms"
  sits in the same ordered list as the batch fields, and unchosen fields
  (Synonyms included) wait under "Available". The stored selection array
  is unchanged in shape — it was always ordered; the UI just finally
  exposes the order.

---

## [12.8.1] — 2026-08-07

### Changed
- **Heat-map tooltip settings are now checkboxes, not a text box.** The
  content script records every batch field definition it parses off a
  molecule page (`recordHeatMapFieldDefs` in `shared/heat-map-fields.js`,
  fed from `api/batch-fields.js` — the blank new-batch form counts too, so
  discovery works before any batch is saved). The "Heat map tooltip"
  options card lists the discovered fields in the vault's own
  `display_order` with a built-in "Synonyms" entry on top; ticking builds
  the same ordered label array as before, so stored selections carry over.
- **Batch fields moved to the top of the popup.** Rows like Internal ID
  now sit directly under the molecule link, before the structure image;
  the synonym row (first synonym only) stays at the bottom of the readout
  list where a long IUPAC name doesn't push the structure around.
- `extractSynonym` now converts `<br>` separators to ", " before reading,
  so multi-line synonym lists can't concatenate into one string.

---

## [12.8.0] — 2026-08-07

### Added
- **Configurable batch fields in the heat-map well tooltip.** On run heat
  maps (`/vaults/<v>/runs/<r>/heat_maps/<p>`), CDD's native hover popup on
  a well gains extra rows: by default the molecule's **Synonyms** and the
  batch's **Internal ID**, configurable as a one-label-per-line list in the
  new "Heat map tooltip" options card. Labels match the vault's batch field
  names ignoring case and `*` markers; the special label `Synonyms` shows
  the molecule synonym; clearing the list disables the feature. Data is
  parsed from the molecule page's `RegistrationFormRenderer` `react_props`
  (`api/batch-fields.js`, one cached fetch per molecule per session) with
  neighbour-well prefetch driven by CDD's inline
  `CDD.HeatMap.wellDetails` data. New shared config module
  `shared/heat-map-fields.js`; `extractSynonym` is now exported from
  `api/molecule-image.js`.

---

## [12.7.0] — 2026-08-07

### Added
- **Plate Map CSV export.** Plate pages (`/vaults/<v>/plates/<p>`) get an
  "Export Plate Map (CSV)" link in the Plate Details / Projects / Plate Map
  tab bar. One click downloads a CSV with one row per occupied well:
  `Barcode, Well, Name, Batch ID, Sample ID`. The barcode column uses the
  plate's barcode field when the vault shows one and falls back to the
  plate name; wells are read straight from the rendered `.plateLayout`
  grid, so the export is instant (no extra requests). The Batch ID /
  Sample ID split (last letter-led dash-segment = sample code) lives in
  the shared `splitBatchAndSample()` in `shared/prefix-colors.js`, next to
  the existing prefix parsing.

---

## [12.6.2] — 2026-08-07

### Added
- **39 more no-sample quotes.** The pool on batch-only cards grows from 35
  to 74 — detective stories, wildlife documentaries, office life and more
  short jabs. Same deterministic per-card-per-day rotation.

---

## [12.6.1] — 2026-08-07

### Added
- **17 new no-sample quotes.** The educational-quote pool on batch-only
  cards (introduced in 12.2.3) grows from 18 to 35 entries — more lab
  humor, audit jokes, and gentle mockery in the same spirit. Rotation
  stays deterministic per card per day.

---

## [12.6.0] — 2026-08-07

### Added
- **Products in the panel and print (optional).** A Panel-fields checkbox
  (default off) renders each reaction's product rows as PRODUCT-badged
  cards with the same configurable fields as reagents, adds a Products
  section to the per-reaction print sheet and a Type column to the panel
  print table. Products are display-only: no fill buttons, no remembered
  values, no metafield fetches. The parsers now emit product rows (with
  `isProduct`) and all gating happens content-side.
- **Two purity thresholds** (both default 93 %, own settings): purity fill
  offers appear only at or below the fill threshold — a batch purity above
  it stays authoritative and never falls through to a remembered value —
  and the ⚠ LOW PURITY badge follows the warning threshold instead of a
  hardcoded 93.
- **CSV export of the panel table.** A CSV button next to Print downloads
  the same rows and columns in the English CSV convention (comma
  separator, dot decimals, RFC 4180 quoting) with a UTF-8 BOM so Excel
  reads diacritics correctly.

### Fixed
- **The equivalent restore after a purity fill could be skipped silently.**
  Waits were wall-clock bound and Chrome throttles background-tab timers to
  roughly one tick per minute, so the 3 s deadline expired before the
  second poll and the "did the equivalent change?" wait gave up. Waits now
  count poll attempts (with a generous hard cap), the purity fill decides
  on the current equivalent rather than on whether the wait observed the
  change, and it verifies the restored value at the end — reporting loudly
  when it still differs. Fill all warns when the tab is in the background.
- Write verification compares the field's own value (numeric,
  unit-tolerant) instead of substring-matching the whole row text, where a
  value like "1" matched almost any row.

## [12.5.0] — 2026-08-07

### Added
- **Remembered purity & concentration.** The per-batch memory
  (`cddDensityMemoryV1`) now holds density, purity and concentration
  (+units) in one entry per batch. Same contract as density: the
  authoritative source — batch field for purity/density, sample field for
  concentration — always wins and clears the remembered copy; typed values
  are captured passively from the payloads CDD sends on autosave. Typed
  purity is read from the row-level fraction (1 = CDD's untyped 100 %
  default), typed concentration from the row-level mol/L number. Cards
  offer up to three fill buttons; one shared amber notice marks
  memory-sourced values. The purity fill snapshots the row's Equivalent and
  writes it back after CDD's recalculation; the concentration fill clicks
  "Make solution" first when the row isn't a solution yet. The options card
  became **Remembered batch values** (two grid columns wide) with
  per-field columns.
- **"⤵ Fill all missing values (N)" panel button.** One deliberate click
  runs every offer the cards show, sequentially, with progress in the
  button label and failures in the status line. Keep the tab visible while
  it runs — background tabs are timer-throttled by Chrome.
- **Experimental auto-fill (options checkbox, default off).** When
  enabled, the extension automatically fills values — but ONLY into rows
  added while you work on the page. Rows that existed when the entry
  loaded are never touched automatically (a ~5 s baseline window after
  load registers them; URL changes reset it); the card buttons and Fill
  all remain the conscious path for those.

### Fixed
- **Fills now target the exact table row, keyed by its printed number.**
  The table renders rows grouped by role (reactants → agents → products;
  parallel rows are lettered), not in payload order — and in edit mode
  every row renders the edit labels, so name- or label-based matching
  cannot tell duplicates apart. All fill steps (field link, popup,
  verification, Make solution, Equivalent snapshot) now address the one
  row whose first cell prints the sample's display number, which makes
  fills reliable when the same batch sits in a reaction twice.
- Sample-carrying cards can fill again: their row is found via the
  composed molecule-batch name (the table never shows the sample name).
- Density offers no longer linger on rows whose density lives outside
  `userInput` (molecule-derived or moved by CDD); only genuinely typed
  densities are remembered.
- Ended a panel redraw loop (and the visibly shuffling NO SAMPLE quotes):
  a batch's stored label is written once instead of ping-ponging between
  the display names of its rows, and quotes are now seeded per batch and
  day instead of re-randomized on every render.
- Orphaned content scripts (extension reloaded while a CDD tab stayed
  open) no longer throw "Extension context invalidated" from storage
  writes.

## [12.4.0] — 2026-08-07

### Added
- **Remembered densities.** When you type a density into a stoichiometry row
  whose registered batch has none, the extension remembers it (up to 100,
  keyed by molecule batch id in `chrome.storage.local`, LRU-evicted) and
  offers a one-click **⤵ Fill remembered density** wherever that batch
  appears again without one — with an amber nudge to save the value on the
  batch record itself, which always takes precedence and removes the
  remembered copy on the next parse. Capture is passive (reads
  `userInput.density` from the payloads CDD already sends on autosave; no
  DOM watching) and, for batch-only rows, waits for batch-field enrichment
  so a density that lives on the batch is never mistaken for a user value.
  A new options-page card **Remembered densities** lists the entries
  (name, value, saved date, `N / 100` counter) with per-row forget and
  Clear all; edits propagate live to open ELN tabs via
  `chrome.storage.onChanged`. New shared module
  `src/shared/density-memory.js`; `fillDensityIntoTable()` now takes the
  value to write as an explicit parameter.

### Fixed
- Batch-field enrichment now marks a batch-only row as enriched even when
  the molecule page has no field values for that batch — previously such a
  row could never have its typed density remembered.

## [12.3.0] — 2026-08-06

### Added
- **"Fill density into table" button on batch-only cards.** When the
  registered batch knows a density (from the batch-field enrichment) that the
  stoichiometry row is missing (`userInput.density` empty — now passed
  through as `tableDensity`), the card offers a one-click fill. A new module
  (`content/features/density-fill.js`) replays the user's own editing
  gestures: click the row (the table flips to edit mode), click the row's
  `Density: Optional/Required` link, set the popup input natively (React
  value-tracker aware) and press Enter — so CDD itself recalculates volume,
  autosaves and keeps its undo history. Every step re-verifies the DOM it
  expects and aborts cleanly with a reason on the button when CDD's markup
  changed; the worst case writes nothing. Deliberately button-triggered only
  (one click = one write to a scientific record); automatic filling is a
  possible later step.
  - Hardened against two live-found traps: the density popup's input only
    sometimes carries `placeholder="Density"` (the popup's `Density [g/cm3]`
    label is the reliable marker), and the trigger click itself — being
    outside the table — would bubble to CDD's outside-click handler and
    instantly close the edit mode it had just opened, so the button stops
    propagation and defers the sequence until the click has fully settled.

## [12.2.3] — 2026-08-06

### Changed
- **Batch-only cards now educate — loudly and at random.** The grey
  BATCH ONLY badge became an amber **⚠ NO SAMPLE** badge (tooltip: creating a
  sample is the right way — it tracks location, amount and depletion), and
  every batch-only card closes with a randomly picked one-liner from an
  18-quote pool — from the factual ("This purity is from registration day,
  not from the bottle on your shelf.") through "Schrödinger's reagent: both
  full and empty until someone makes a sample." to "No sample means the
  amount is vibes-based." A fresh quote on every render keeps the nudge
  readable instead of letting it fade into wallpaper. Quote text is 12px
  italic amber so it can actually be read.

## [12.2.2] — 2026-08-06

### Fixed
- **Print sheets and the CDD samples panel pair each reaction with its own
  stoichiometry table again after reactions are reordered in an entry.** The
  parsers read reactions from `eln_entry.feature_map`, whose keys are numeric
  feature ids — and JavaScript iterates numeric object keys in ascending order,
  i.e. creation order. The reaction scheme image and the print buttons, by
  contrast, follow the on-screen DOM order. As long as reactions were never
  moved the two orders coincided, but after dragging a reaction elsewhere in
  the entry (or duplicating entries) the printed sheet showed the correct
  scheme with another reaction's reagent table, and the samples panel grouped
  rows under the wrong "Reaction N". `getReactionFeatures()`
  (`inject/parsers/common.js`) now reads the true display order from
  `eln_entry.body` — the serialized editor document, whose `reaction` nodes
  carry `data.feature_id` in document order — and sorts the features by it.
  Features absent from the body (or a missing/unparsable body) fall back to
  the previous id order. Print, depleted-marker and samples-panel extractors
  all share this helper, so one sort fixes them all.

## [12.2.1] — 2026-08-06

### Added
- **The CDD Samples panel now shows cards for batches without an inventory
  sample.** Stoichiometry rows that reference a registered batch (e.g.
  `RGT-0001620-001`) but no sample used to be skipped entirely, because CDD's
  `eln_entry` JSON only ships batch metafields alongside a sample. Now:
  - the inject parser (`inject/parsers/sample-data.js`) keeps sample-less rows
    that carry a batch (products excluded — their batches are synthesis
    targets with no QC metadata) and flags every sample with `hasSample`;
  - card names compose the batch identifier the way CDD displays it
    (`RGT-0001620` + `001` → `RGT-0001620-001`);
  - a new content module (`content/features/batch-field-enrichment.js`)
    fetches the batch's molecule page (one GET per molecule, promise-cached;
    the ELN-vault URL redirects to the molecule's home vault and fetch follows
    it), parses the `RegistrationFormRenderer` `react_props` embedded in the
    HTML, joins `batch_field_definitions` with the lot's values and merges
    Purity, Density, Vendor ID, Internal ID plus all custom batch fields into
    the card before re-rendering;
  - batch-only cards wear a grey **BATCH ONLY** badge so it's obvious why
    sample-side fields (Location, Concentration…) are absent.

## [12.2.0] — 2026-08-06

### Changed
- **The stoichiometry print sheet labels bulk-reaction rows A, B, C… like CDD
  does.** Parallel ("bulk") reactions store their variable reagent/product rows
  with roles `parallelReactant`/`parallelProduct`, joined by a
  `parallelReactionsPairId`; CDD's own table shows each pair under a letter in
  its "Reagents and products" section, but our PDF report numbered every row
  1–N. The print-data extractor (`inject/parsers/print-data.js`) now passes
  each row's `role` and pair id through, and the sheet builder
  (`content/features/print-buttons.js`) assigns letters per pair in order of
  first appearance (A…Z, then AA, AB…). Plain rows keep their 1..N numbering,
  so reports for ordinary reactions are unchanged.
- **Each pair prints as its own bordered block, mirroring CDD's "Reagents and
  products" section.** Instead of interleaving lettered rows into the main
  table (A, A, B, B…), the sheet now renders the fixed rows first and then a
  "Reagents and products" section where every pair is a rounded, bordered
  block: the letter sits in a shaded band on the left spanning both rows, and
  each row carries a small VARIABLE REAGENT / PRODUCT tag above its name. Pair
  blocks avoid page breaks inside themselves.

### Fixed
- **No more "Extension context invalidated" console errors after reloading the
  extension.** When the (unpacked) extension is reloaded while a CDD tab is
  open, the tab's orphaned content script loses its `chrome.storage` bridge and
  the panel's settings/custom-field writes threw uncaught promise errors. Both
  storage writers in `shared/sample-panel-fields.js` now swallow that failure —
  the fresh content script takes over on the next page refresh anyway.

## [12.1.4] — 2026-08-06

### Removed
- **Filter default operator** (`ui-fixes/filter-default.js`). The feature
  auto-selected the second filter operator (e.g. "Has") instead of "Any value"
  when a filter was added in ELN or Inventory. CDD now does this natively, so
  the whole feature — its `MutationObserver`, synthetic-click dropdown driving
  and chained timeouts — was deleted (it was also the most timing-/DOM-fragile
  code in the extension). One less permanent page observer.

## [12.1.3] — 2026-07-15

### Fixed
- **Firefox: the field picker's columns get an explicit pixel height when the
  panel overflows.** The 12.1.2 grid-row fix was not enough in Gecko: a column
  flex container sized only by `max-height` does not reliably re-flex its
  children against the clamped height, so long columns still scrolled against
  their unclamped content height and the list tail stayed out of reach. The
  shared picker (`ui-fixes/field-picker-core.js`) now runs `syncColumnsHeight()`
  on open, resize and after every search keystroke: when the panel content
  overflows its capped box, the columns grid receives an explicit pixel height
  (panel client height minus the search row); otherwise it stays `auto`. In
  Chromium the overflow never materialises and behaviour is pixel-identical.
- **The Search-page Keywords picker no longer fights its own scroll.** Its
  adapter (`ui-fixes/keywords-field-picker.js`) never used the shared
  `positionPanel`, so the explicit column height never reached it — and its
  window-level capture scroll listener treated scrolls *inside* the picker as
  page scrolls: every wheel tick re-ran `positionHost`, whose uncapped
  measurement pass momentarily removed the columns' overflow and clamped the
  very `scrollTop` the user was advancing (the thumb jittered near the top).
  `onReflow` now ignores scroll events originating inside the host,
  `positionHost` preserves the column bodies' scroll positions across its
  measurement pass and calls `syncColumnsHeight` after applying the final cap,
  and `syncColumnsHeight` itself preserves scroller positions so no caller can
  snap a mid-scroll list back to the top.

## [12.1.2] — 2026-07-14

### Fixed
- **Firefox: the field picker's columns now scroll all the way to the bottom.**
  The shared picker's columns grid (`ui-fixes/field-picker-core.js`) declared
  `grid-template-columns` but left its single row implicit (`auto`), so the row
  sized to the tallest column's content instead of the panel's capped height and
  the per-column scrollers never received a constrained height. Firefox follows
  grid track sizing strictly, so the tail of the Entity/Batch columns was
  clipped beyond the reach of the scrollbar; Chromium re-constrains stretched
  items in a lone `auto` row against the container, which masked the bug. The
  row is now an explicit `minmax(0, 1fr)` (reset to content-sized rows in the
  ≤900px layout, where the grid itself is the scroller). Also: the panel is
  capped at `min(70vh, 640px)`, the column scrollers reserve a stable
  scrollbar gutter, and the list's bottom padding grew to 10px so the last item
  never sits flush against the clip edge. Applies to both the Inventory filter
  picker and the Search-page Keywords picker, in every browser.

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
