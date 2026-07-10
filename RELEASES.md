# Release notes

A plain-language history of **CDD Stoichiometric Table Tools** — what changed in
each version and why it matters for everyday CDD work. For the full technical
detail, see [`CHANGELOG.md`](./CHANGELOG.md).

> Most settings live on the extension's settings page — click the extension
> icon, or pick **CDD Plugin options** in CDD's user menu. Changes usually take
> effect after you refresh the CDD page.

---

## 11.1.0 — July 2026

**Find out what changed, without leaving the extension.**

- **The settings page now tells you which version you're running**, and links
  straight to this page. It's in the top-right corner, next to the version
  number.
- This page itself is new: every release, in plain language, at
  <https://xaviersvk.github.io/CDD-Stoich-Tools/>. Each version also gets its own
  entry on GitHub, so you can link a colleague to exactly the change you mean.
- **The plugin's flask now heads both the settings page and this one**, and sits
  in the browser tab as the favicon. The blue you see in the buttons and
  highlights is taken from that icon, so the whole thing finally looks like one
  piece of software rather than three.

---

## 11.0.0 — July 2026

**A real settings page, and a Create Entity page that remembers how you work.**

- **Settings moved out of the little popup.** Clicking the extension icon now
  opens a proper settings page with four columns side by side: tab title, panel
  fields, prefix colours, and the new registration-form settings. You can also
  reach it from **CDD Plugin options**, which now sits in CDD's own user menu
  next to Account.
- **Put the registration forms in the order you actually use them.** The
  Registration Form picklist on the Create Entity page arrives in CDD's order,
  which suits nobody. Drag the forms into your own order on the settings page and
  the picklist follows. Someone working on cells puts Eukaryote on top; someone
  doing chemistry puts Molecule there.
- **The Create Entity page can preselect a form for you.** By default it picks
  whichever form you used last in that vault — each vault remembers its own. Or
  pin one form and always get it. Or turn it off and let CDD choose, as before.
- Forms your vault adds later show up at the bottom of your order, and a pinned
  form that a vault doesn't have leaves CDD's own default alone.

---

## 10.1.0 — July 2026

**Never lose a registration form to a forgotten project again.**

- **The Project picker now also sits right next to the Create Entity button.**
  On the *Create a New Entity* page the project dropdown is at the very top of
  the form, a screenful away from the Create button at the bottom. There's now a
  second copy of it directly left of **Create Entity**. Both are the same field —
  change one and the other follows.
- **Create Entity stays disabled until you pick a project.** While no project is
  selected the button is greyed out ("Select a project first") and the project
  dropdown is highlighted in amber, so you can't submit a form that's about to
  be rejected and have to type it all in again.

---

## 10.0.0 — July 2026

**Plates get the full treatment: locations at a glance, one-click export, and
structure previews on the Plate Map.**

- **See where every plate lives, right in the Plates list.** The Explore Data →
  Plates table now has a **Location** column next to the plate name. Each row
  shows a small spinner and the inventory location (e.g. `Lab 1 > Fridge 1`)
  appears as soon as it's found — no need to open each plate.
- **Export all plate locations from the Plates tab.** A new **"Export Plate
  Locations (CSV)"** link sits next to CDD's own "Export Plates". It walks
  through your entire plate list (including pages you haven't opened) and
  downloads a spreadsheet of plate names and locations, sorted by name — handy
  for a walk around the lab. If you've typed something into the plate search
  box, only the filtered plates are exported. You'll see live progress and can
  cancel at any time.
- **Hover a well on the Plate Map to see what's in it.** On a plate's Plate Map
  (and on heat maps), hovering a well now shows a bubble with the entity's
  synonym and its chemical structure — the same preview you already get in the
  inventory "Pick Location" grid. And as you move around the plate, the
  neighbouring wells (2 in every direction) quietly load in the background, so
  the next preview is usually instant.
- Everything shares one cache per browser session: a structure or location
  loaded once — in a tooltip, the list, or an export — never loads twice.

---

## 9.3.0 — July 2026

**The sample title is now click-to-copy too.**

- The title at the top of each sample in the **Samples** tab
  (e.g. `IXX-NUC-0000009-001-SM003059`) can now be clicked to copy it to the
  clipboard, with the usual green flash.
- Clicking the little collapse/expand arrow still just collapses the sample — it
  won't copy.

---

## 9.2.0 — July 2026

**Click-to-copy now works on samples too.**

- You could already click an entity or batch field value to copy it. Now the
  same works in the **Samples** tab: click a sample's **Sample ID**, **Current
  Amount**, or **Location** in its header to copy it to the clipboard (with the
  usual green flash to confirm).
- Only the header values are clickable — the labels and the event rows below
  stay as they are.

---

## 9.1.1 — July 2026

**Fix: the child-sample batch bar now actually shows up.**

- In 9.1.0 the "Create N Samples" bar never appeared in the "Create Sample from
  Debit" dialog because it was being detected the wrong way. It's now recognised
  correctly, so batch creation of child samples works as intended.

---

## 9.1.0 — July 2026

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
