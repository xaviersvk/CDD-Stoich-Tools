# Release notes

A plain-language history of **CDD Stoichiometric Table Tools** — what changed in
each version and why it matters for everyday CDD work. For the full technical
detail, see [`CHANGELOG.md`](./CHANGELOG.md).

> Most settings live in the extension popup (click the extension icon), and
> changes usually take effect after you refresh the CDD page.

---

## 10.0.1 — July 2026

**Fix: the child-sample batch bar now actually shows up.**

- In 10.0.0 the "Create N Samples" bar never appeared in the "Create Sample from
  Debit" dialog because it was being detected the wrong way. It's now recognised
  correctly, so batch creation of child samples works as intended.

---

## 10.0.0 — July 2026

**Batch creation now works for child samples too.**

- When you create a child sample (an aliquot) from a parent sample's debit
  event, you can now select several positions in the "Pick Location" grid and
  create all the children in one click — exactly like the existing batch create.
  The first child goes through CDD's own Save; the rest are created
  automatically at the remaining selected positions.
- CDD numbers the child samples itself (SM003107, SM003108, …), so there are no
  duplicate names.
- Keep in mind each child debits the parent by the amount in the form — five
  children at 0.05 L each take 0.25 L from the parent. If the parent runs out,
  the affected positions show an error in the results panel and can be retried.

---

## 9.0.2 — July 2026

**Fix: page no longer freezes in "Pick Location" boxes containing very large molecules.**

- The well tooltip draws each compound's structure in the browser. For very
  large molecules (long peptides, polymers, macrocycles) that drawing step could
  run essentially forever and freeze the whole page. Structures with a SMILES
  longer than 250 characters are now skipped — the tooltip simply says
  "Structure unavailable" and everything else keeps working.

---

## 9.0.1 — June 2026

**Firefox fix: batch sample creation now works.**

- Fixed a crash (`TypeError: formData.entries() is not iterable`) that occurred in Firefox when using batch sample creation. Firefox wraps FormData iterators in Xray wrappers that strip the standard iterator interface; the extension now uses `forEach` instead of `for...of` to work around this. No change in behaviour on Chrome.

---

## 9.0.0 — June 2026

**Create many samples at once, and colour-code your inventory.**

- **Batch sample creation.** In the "Pick Location" grid you can now select
  several empty wells and create all the samples in one click ("Create N
  Samples"). The first sample goes through CDD's own Save — so nothing is created
  unless CDD itself succeeds first — and the rest follow automatically. A small
  floating panel shows a ✓ or ✗ for each position and lets you retry any that
  failed, then refreshes the page when everything's done.
- **Spreadsheet-style well selection.** Pick wells the way you'd expect in a
  spreadsheet: normal click to select one, Ctrl/Cmd-click to add or remove
  individual wells, and Shift-click to select a whole rectangle. Occupied wells
  are skipped automatically, and a little "N positions selected" toast confirms
  what you picked.
- **Tidier Create Sample dialog.** The footer was redesigned to match CDD's own
  look: it shows the selected well (e.g. "D2") with the full location on hover, or
  a preview of the wells when several are selected.
- **Fix: correct grouping prefix for long sample codes.** Sample-ID prefixes are
  now detected correctly even for longer codes whose project name itself contains
  dashes (e.g. `PHA-0265229-001-S001095`), so colour-grouping and labels line up
  the way you'd expect.

---

## 8.5.0 — June 2026

**Colour-code your inventory by sample prefix.**

- Sample IDs are grouped by their prefix (e.g. `IXX-DEMO`), and you can assign
  each prefix a colour. Occupied wells in the "Pick Location" box grid are then
  tinted by that colour, making it easy to spot which samples belong together.
- Prefixes you come across are discovered automatically (without a colour) so they
  show up in the settings ready for you to colour them.
- Manage everything under **Settings → Visualization → Prefix Colors** in the
  extension popup; colours update live as you change them.

---

## 8.4.0 — June 2026

**Export every plate's location to a spreadsheet.**

- A new "Plate locations" section in CDD's Export dialog downloads a CSV listing
  every plate in your current search results together with its inventory location
  — handy for walking a plate list around the lab.
- It covers the whole result set (not just the page you can see), shows live
  progress, warns you before very large exports, and can be cancelled.

---

## 8.3.0 — June 2026

**See where a plate lives, just by hovering.**

- Hovering a plate link in the search results now shows a small bubble with that
  plate's inventory location (e.g. `Lab 2 > Fridge 2`), without having to open the
  plate.

---

## 8.2.0 / 8.2.1 — June 2026

**Structure previews when picking a location, plus store-compliance cleanup.**

- In the "Pick Location" box view, hovering an occupied well now shows the
  molecule's **structure image and name** right in CDD's tooltip. Opening a box
  pre-loads the structures in the background so they appear instantly.
- **8.2.1** is a behind-the-scenes cleanup to pass Firefox add-on review (no
  visible change for you).

---

## 8.1.0 — June 2026

**Less clutter.** CDD now hides depleted samples on its own, so the extension's
duplicate grouping was removed. The depleted-sample strike-through and the
consumed-batches collapse still work as before.

---

## 8.0.0 — June 2026

**The Sample Panel grows up.**

- **Choose exactly which fields the Sample Panel shows** — name, location, purity,
  internal ID, density, concentration, solvent, weights, batch, vendor ID, owner,
  amount, volume — all toggled in the popup.
- **Automatic custom-field discovery** — vault-specific fields (like
  `*Hygroscopic`) are detected from your data and offered as checkboxes.
- **Paste-ready concentrations** — clicking a concentration copies a normalised,
  CDD-friendly value.
- **More reliable copying** everywhere, even on restricted pages, with a clear
  error state instead of silent failures.
- Printing now follows your chosen fields, plus a round of internal cleanup.

---

## 7.x — May–June 2026

A steady stream of quality-of-life improvements:

- **ELN tab titles** you can customise (entry ID + title, title only, or
  original).
- **Sample Panel remembers** its position and collapsed state between visits.
- **"Copy Link" on saved searches** for quick sharing.
- **Consumed batches collapse** into a tidy, togglable block.
- Broader recognition of **Purity / Density / solvent** field variations, and a
  responsive multi-column layout for molecule links.

---

## 5.x – 6.x — May 2026

- **Smart filter defaults** — automatically picks a useful filter operator
  instead of "Any value".
- **Resizable location-picker tree** — drag to set the width, and it's remembered.
- Various location-picker and molecule-link layout refinements.

---

## 3.x – 4.x — April 2026

- **Dose-response "Easy Override"** — bulk-adjust curve calculations (max / min /
  skip / don't overwrite) straight from the search results, written back to CDD.
- **Click-to-copy fields** on molecule, property, and batch values.
- A series of file-dialog and layout fixes.

---

## 1.x – 2.x — March–April 2026

The beginning. Core stoichiometry tooling, the depleted-sample marker, solvent and
internal-ID handling, and concentration-unit normalisation. The extension was
renamed to **"CDD Stoichiometric Table Tools"** to reflect its growing scope.
