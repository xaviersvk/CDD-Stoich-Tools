# Release notes

A plain-language history of **CDD Stoichiometric Table Tools** — what changed in
each version and why it matters for everyday CDD work. For the full technical
detail, see [`CHANGELOG.md`](./CHANGELOG.md).

> Most settings live on the extension's settings page — click the extension
> icon, or pick **CDD Plugin options** in CDD's user menu. Changes usually take
> effect after you refresh the CDD page.
>
> **Found a bug or have a request?** Open an issue at
> <https://github.com/xaviersvk/CDD-Stoich-Tools/issues>.

---

# What's new in 14.9.0

---

## 14.9.0 — August 2026

**The panel can work out your HPLC injection volume.**

Every number for it is already on the page — the stoichiometry table prints
the reaction molarity on the solvent row — but the sum was still being done by
hand each time. Now a block at the top of each reaction group does it: you draw
an aliquot from the mixture, dilute it into an HPLC vial, and the block tells
you how much of that to inject to land your target amount on the column.

- **It gives you the number you can actually dial in.** Injections go in half
  microlitres, so that is what the block leads with. The exact figure stays
  underneath, next to what the rounded injection really delivers —
  `exact 0.30 µL · 0.333 nmol on column`. Rounding 0.30 up to 0.50 is two
  thirds more compound, and you should be able to see that rather than find
  out later.

- **Each reaction has its own numbers.** One assay takes a single drop, the
  next takes two. Type a different aliquot into one block and only that
  reaction changes — the settings and every other reaction stay where they
  were. The field is marked while it differs, and a **reset** chip puts it
  back.

- **Several solvents are handled properly.** The block combines them into the
  concentration of the mixture your aliquot actually comes from, rather than
  picking one row and hoping.

- **It warns instead of quietly lying.** An injection that would exceed the
  vial volume turns red. One that had to be pushed up to the 0.5 µL minimum
  says so, because it means the vial is too concentrated and you are
  overshooting.

**Switch it on in Settings → HPLC injection.** It is off by default — it
answers a question only some workflows ask, and your panel should not sprout a
new box because you updated. The card also holds the starting values every
block begins from: aliquot 10 µL, vial 1.5 mL, target 0.2 nmol.

---

## 14.8.0 — August 2026

*Everything since 14.5.0, the last version that reached the stores. The 14.6.0
and 14.7.0 numbers were used while this work was being written and tested, and
were never published on their own — what they added is here.*

**The panel can tell you what a compound is also called.**

- **Tick *Synonym* under Panel fields and every card gets its synonym.**
  Reagents, products and the batches you linked in the entry text — all of
  them. If a compound has several synonyms you get the first one, which is the
  one CDD shows at the top of the molecule page.
- **It is off until you switch it on, and that is deliberate.** The synonym is
  not part of what CDD sends the panel; it has to be looked up on each
  compound's own page. While the box is clear the plugin never makes those
  lookups, so nobody pays for a row they do not want. Tick it and the panel you
  already have open fills in — you do not have to reopen the entry.
- The synonym travels with everything else: it becomes a column in the print
  sheets and in the CSV export, exactly like any other panel field.

**Molecule-Batch ID joins the panel fields too.**

- **Tick *Molecule-Batch ID*** and every card shows the identifier CDD prints
  for the batch, e.g. `RGT-0001620-001`. It was missing from the list until
  now — no reason beyond it never having been added.
- **It is not the same as *Batch name*.** That row shows what the entry sends
  for the batch on its own, usually just the `001` on the end; the new row is
  the whole identifier, molecule name included. Cards that come from links in
  the entry text already carry the full ID, and it is shown as it is.
- Batches CDD calls *Unspecified* have no identifier, so those cards simply
  have no row. Both halves are already in what the panel receives — ticking
  this one looks nothing up.

**The CDD Samples panel resizes.**

- **Grab an edge and pull.** Either side, the bottom, or a bottom corner. Pull
  the left edge and the panel grows to the left — the right-hand side stays
  where it is instead of the whole panel sliding across.
- **You can see where to grab.** There is a small grip mark in the bottom-right
  corner, and any edge you can pull lights up as your cursor reaches it.
- **The size is remembered, along with the position.** Come back tomorrow and
  the panel is the shape you left it. If you move to a smaller screen it is
  trimmed to fit rather than hanging off the edge.
- Collapsing the panel still shrinks it to its title bar; your size comes back
  when you expand it again.

**Panel fields is easier to read.**

- **The fields you have switched on sit at the top**, in the order the panel
  shows them. Everything you have not picked follows underneath in alphabetical
  order, so finding one no longer means reading the whole list. The same goes
  for your vault's own fields further down.
- The list settles when you open the settings page. Ticking a box does not make
  the others jump around under your cursor — the new order shows up next time
  you open it.

**Two smaller fixes.**

- **"Create N Samples" no longer sits in the debit dialog while *Create sample
  from debit* is unticked.** With that box clear, saving records the debit and
  creates no sample, so the button was offering something that could not
  happen. It appears the moment you tick the box, with the wells you picked
  still selected.
- **Forgetting the last saved run-definition template no longer prints its
  "nothing saved yet" note twice.**

**Under the hood.** A pass over the whole code base with a static analyser:
clearer control flow in a handful of places, no behaviour meant to change, and
the build's own toolchain updated away from three published vulnerabilities.

---

## 14.5.0 — August 2026

*Everything since 14.1.0, the last version that reached the stores. The 14.2.0,
14.3.0 and 14.4.0 numbers were used while this work was being written and never
published on their own — what they added is here.*

**You can finally copy out of a stoichiometry table.**

- **Drag across the table and it goes blue, like any other text on the web.**
  Until now nothing in it could be highlighted — not a compound name, not a
  mass, not a formula weight — because CDD switches text selection off for the
  whole reaction block and turns any attempt to drag into a drag of the block
  itself. Both are now out of the way.
- **`Ctrl+C` fills the clipboard for real.** Being able to highlight the table
  turned out to be only half the job: CDD's editor takes the copy over for
  itself, and because it does not consider the reaction table to be text it had
  nothing to hand across — you could select the whole reaction and still paste
  an empty cell. The plugin now gets there first.
- **Highlight several cells and you get a table.** Paste into Excel and the rows
  and columns land where you would expect them — one spreadsheet row per table
  row, one column per column. Everything in a cell keeps its label, so
  `FW: 231.05 g/mol | Density: 1.23 g/cm3` stays readable instead of turning
  into two loose numbers. Highlight inside a single cell — a compound name, a
  mass — and you get exactly what you highlighted, nothing added around it.
- **`Ctrl`+click (`⌘`+click on a Mac) a value and it is on your clipboard.**
  One click, no popup opens, the field flashes green. This is the quick way to
  lift a compound name out of a row. Add `Shift` to get the label too —
  `Ctrl`+click gives `231.05 g/mol`, `Ctrl+Shift`+click gives
  `FW: 231.05 g/mol`.
- Inside the table `Ctrl`+click always means *copy*, batch links included:
  `Ctrl`+clicking `PHA-0333427-001` copies the id instead of opening it in a
  new tab. An ordinary click on the link still opens it as before.
- A field that only shows `Optional` or `Required` copies nothing — you get no
  clipboard full of the word "Required".
- **Everything you did before still works.** A normal click still opens the
  edit popup for that value; only a drag that actually highlighted something
  stops the popup from appearing on release, so a selection you just made
  doesn't get covered up. Copying anywhere else in the entry is untouched.

**Register a product from a reaction and the entry ID is already in the form.**

- **Click *Entity: Register* in a stoichiometry row and the new tab opens with
  the ELN entry's ID already typed into `Internal ID`.** CDD already carried the
  structure and the project across; the one thing that says *where this compound
  came from* is now carried too, so it no longer has to be copied out of the
  other tab.
- **The vault prefix is left behind.** On CDD's *Vault-User Identifier* format an
  entry ID reads `PHA-MDX-0095`, and the `PHA-` in front is the same on every
  entry in the vault — it says nothing you do not already know from where the
  batch lives. What gets registered is **`MDX-0095`**.
- **If the entry has more than one reaction, the table you registered from is in
  the ID too.** The first stoichiometry table registers as `MDX-0095`, the second
  as `MDX-0095B`, the third as `MDX-0095C` — so months later it is still clear
  which reaction in the entry a batch came out of. An entry with a single
  reaction gets no letter on the end.
- **Only an empty field is filled.** If something is already in `Internal ID`, it
  stays. If you clear the field yourself, it stays cleared. If you are typing in
  it at that moment, nothing is touched.
- **Switching the project or the registration form does not lose it.** CDD
  rebuilds the whole form when either changes, which throws away anything already
  in it — the ID is put back.
- **It only happens when you started from an ELN entry.** Register links
  elsewhere in CDD behave exactly as before.
- **Settings → Registration form → From the ELN.** Switch the whole thing off
  there, or change which field receives the ID if your vault calls it something
  else — the star does not matter, `Internal ID` and `*Internal ID` are the same
  field, and so are different capitalisation and spacing.
- **Settings → … → ELN identifier format.** The same three choices CDD lists
  under its own ELN settings — *Global Identifier*, *Vault Identifier*,
  *Vault-User Identifier*. Only the last has a vault prefix to drop; the other
  two are carried whole. New installs start on Vault-User. It is set here rather
  than read from CDD because that page needs admin rights to open — and an ID
  that does not actually read `vault-user-number` is left whole whatever the
  setting says, so a differently shaped ID can never come out cut in half.

---

## 14.1.0 — August 2026

**Editing a number in a stoichiometry table stops fighting you.**

- Click an amount and the **number is already selected** — type the new one and
  you are done. No more deleting `19 g` character by character just to make it
  `25 g`. The unit stays sitting after the cursor, so it survives the retype on
  its own. This applies to every number in the row: Mass, Volume, Purity,
  Density, Equivalent, Concentration.
- **A cleared field can no longer change the unit without telling you.** Mass
  and Volume keep their unit inside the box, but the popup's own label says
  `Mass [mg]` — so wiping the field and typing `25` used to save **25 mg**, a
  thousandfold off, looking exactly like a normal edit. Now the unit that was
  there comes back when you press Enter.
- If you *want* a different unit, nothing is in your way: type `25 mg` and that
  is what gets saved. Clear a field on purpose and it stays cleared. Click into
  the middle of the value and the cursor stays where you put it.

**The Samples panel's CSV button now opens.**

- `CSV` still downloads the whole table in one click. The small arrow next to
  it adds **Products only** — just the reaction products, for when the sheet
  you need is the one about what came out.
- That export gives you the products whether or not the panel is currently
  showing them, since asking for them is answer enough. If the entry has no
  product rows, it tells you instead of handing you an empty file. It saves as
  `cdd-products-…`, so it will not overwrite your ordinary export.

**Bulk reactions no longer invent a product.**

- A parallel (bulk) reaction remembers the scheme it was drawn from, and CDD
  shows the varying slots as *Variable reagent* and *Variable product*. The
  panel used to read the leftover structure behind that product slot and give
  it a card — a compound that appears in no table on the page, which then
  followed you into Print and CSV. It is gone. The real enumerated products are
  all still there.

---

## 14.0.0 — August 2026

*Everything since 13.1.1, the last version that reached the stores. The 13.2.0,
13.3.0 and 13.4.0 numbers were used while this work was being written and never
published on their own — what they added is here.*

**The Samples panel now sees what you link in an entry's text.**

- A batch or sample linked anywhere in an ELN entry's body gets its own card,
  in a *Mentioned in text* group under the reactions, with the same fields as
  any other card. Links into another vault work, and so do links that came
  with an embedded card rather than typed in.
- A **sample** card shows that bottle — where it is, how much is left. A
  **batch** card deliberately shows no location or amount: the entry mentioned
  the batch, not one particular bottle. A bottle since used up still gets its
  card, with the usual **DEPLETED** badge.
- **Nothing appears twice.** A substance already in a stoichiometry table is
  not repeated as a mention, and the status line says how many were hidden.
- **Print and CSV** include the mentions. In the settings you choose what the
  panel draws from — table rows, links in the text, or both; an entry with no
  reaction table now gets a panel too, if it links to something.

**Stop retyping the same run definition.**

- **Run Details → Run Definition** has a new bar: save the values under a name,
  then fill them into the next run. You tick what belongs to the method when
  you save — *Run Date* and *Person* start unticked, because they belong to
  that one run.
- Filling writes the **empty** fields and leaves everything else alone. A field
  already holding something different is shown as
  `what's there → what the template has`, and you take the template's value for
  that one field, or for all at once.
- **The plugin never presses Save.** It loads the form and stops, so you read it
  before anything reaches CDD — Cancel still throws it away. *Fill* and *Paste*
  wait until you have opened **Edit run definition** yourself.
- **Copy** and **Paste into form** cover the one-off case through the
  clipboard, so the values also paste into Excel. On a protocol's **Run Data**
  tab, every run row has a copy link of its own.

**Stock solutions fill themselves — solvent included.**

- The plugin already remembered a density, purity or concentration you typed
  for a batch whose record had none. It now remembers the **solvent** of a
  stock solution the same way and offers them together: one click clicks
  **Make solution**, writes the concentration and picks the solvent.
- **The solvent doesn't have to be on CDD's list.** One of the 38 built-ins is
  picked from the list, so it brings its CAS-RN, FW, density and boiling point
  along; anything else — *EtOAc/Hexane 1:1*, a buffer, a mixture — is written
  as plain text. Neither way adds anything to the vault's solvent list.

**Both field pickers can be narrowed to one registration form.**

- The Search page's **Keywords** selector and Inventory's **Filter Entries**
  selector list every field the vault owns — 129 in the vault this was built
  against. A row of chips above the columns (`All`, `Molecule`, `Plasmid`,
  `Antibody`, …) cuts that to the fields the chosen form actually uses:
  **21–46 options**.
- Default is `All`, and the choice is remembered per vault. CDD's own built-in
  columns stay visible whichever form you pick, and the chips work alongside
  the search box rather than against it.

**Fixed.**

- The Samples panel could sit on *Waiting for reaction data…* and never show
  its cards, on any entry that had something to show.
- The panel stayed on screen after you navigated away from an ELN entry, still
  listing that entry's samples. It now goes when you leave and comes back when
  you return.

---

## 13.1.1 — August 2026

**Ctrl+click a section heading to copy the whole block of columns.**

- New: the search results table groups its columns under headings like
  **Properties** and **Batch Fields**. Ctrl+click one of those and you get the
  entire block at once — all 30 property columns, or all 5 batch columns —
  laid out as columns when pasted into Excel, with the column names on the
  first line. Ctrl+click on a single column header works exactly as before,
  and pastes as a plain list without a heading.
- Fixed: Ctrl+click on the toolbar above the table (*Export*, *Add to
  collection*, *Save this search*…) did nothing in 13.1.0, because the toolbar
  sits inside the table header and the copy feature captured the click. Those
  buttons work again.

---

## 13.1.0 — August 2026

**Copy a whole column from search results with one click.**

- New: on a search results table, hold **Ctrl** (**Cmd** on a Mac) and click a
  column header — *Batch Name*, *Molecule-Batch ID*, *Internal ID*, whatever —
  and the entire column is copied to the clipboard, one value per line. Paste
  straight into Excel. The cells flash green and a short message tells you how
  many rows were copied.
- Columns line up: where a molecule spans several batch rows, its value is
  repeated for each row, so you can copy two columns one after the other and
  paste them next to each other without anything shifting.
- The *Molecule* column copies just the identifier (`TEST-0260386`), not the
  project name shown beside it.
- A normal click on the header still sorts as usual — only Ctrl+click copies.

---

## 13.0.1 — August 2026

**The heat map well popup got wider.**

- Changed: the balloon that opens when you click a well on a run heat map is
  now **1.4× wider**. Since you can add your own batch fields to it, its rows
  kept wrapping onto two lines — even short ones like *Batch name: 001*. The
  text column roughly doubles (136 → 223 px on a real popup), so most rows now
  fit on one line. Very tall content is still capped by CDD's own limit, and a
  popup opened near the right edge of the window is nudged left so it stays
  fully visible.

---

## 13.0.0 — August 2026

**Mark control layouts by dragging a rectangle — and save them for reuse.**

- New: editing a control layout (**Run Details → Control Layouts → Edit this
  layout**) no longer means clicking every well and cycling it through the
  states until it lands on the right one. Pick **Positive control**,
  **Negative control**, **Reference molecule** or **Clear** in the new
  *Paint wells* bar, then **drag a rectangle** over the plate — every well
  inside it changes as you drag. Pull the rectangle back and the wells you
  passed over return exactly to what they were.
- New: click a **row or column header** to fill that whole line, the empty
  **corner header** to fill the entire plate, or **shift+click** to stretch a
  rectangle from the last well you marked.
- New: **Saved layouts.** Give the current plate a name, and load it back on
  any run later — separate lists for 96-, 384- and 1536-well plates, so a
  96-well layout can never land on a 384-well plate. Loading fills the grid;
  CDD's own **Save changes** button is still what stores it in the vault.
- Works on the 96/384/1536-well run defaults and on plate-specific layouts.
- Click the highlighted colour button again to switch the whole thing off —
  CDD's normal one-well-per-click behaviour comes straight back.

---

## 12.8.8 — August 2026

**The samples panel stays where you put it.**

- Reverted: 12.8.7 made the panel jump back inside the window whenever the
  window was resized. In practice that meant the panel kept moving on its
  own, away from the spot you had chosen for it. That is gone — you drag the
  panel by its header exactly as before, and it stays there.
- Unchanged: the panel still remembers both its position and whether you
  left it collapsed, so it comes back the way you left it.
- Note: as before 12.8.7, a position chosen on a large screen can put the
  panel out of reach if you later work in a much smaller window. If that
  happens, clear `cdd-stoich-panel-state` in the browser's local storage for
  the CDD site, and the panel returns to its default top-right corner.

---

## 12.8.7 — August 2026

**The CDD Samples panel can no longer hide outside the window.**

- Fixed: if you dragged the panel somewhere on a large screen and later
  worked in a smaller window, the panel was restored at its old position —
  off the right edge, out of reach. It looked as if the plugin had stopped
  working, even though the panel was there with all its samples loaded.
  It is now pulled back into view whenever it would fall outside the
  window, including when you resize the window, and the corrected position
  is remembered. If the panel is taller than the window, its header row
  stays visible so you can always grab and move it.

---

## 12.8.6 — August 2026

**Printed sheets no longer hide the solvent a reagent is dissolved in.**

- Fixed: when a reagent is used as a **solution** — say
  *N-methyl(3-bromo-2-nitrophenyl)amine* as a stock in benzene — the PDF
  printed it as if you were weighing out the neat compound. The solvent is
  now printed as its own indented **Solvent** line right under the reagent,
  with CAS-RN, FW, density, boiling point, mass, volume and mole, just like
  CDD shows it on screen. Solutions where the solvent has not been chosen
  yet print as *Solvent: not specified*, keeping the volume you typed.
- New: solution rows now also print their **Concentration**, and solvent
  rows their **Reaction molarity** — both in mol/L, matching the table on
  screen.

---

## 12.8.5 — August 2026

**Plate map export splits every sample code, not just some.**

- Fixed: in **Export Plate Map (CSV)**, wells whose sample code mixes
  letters and digits — like `I88-SM-0060050-005-I88S034537` — dumped the
  whole name into the **Batch ID** column and left **Sample ID** blank.
  Both columns are now filled correctly. Wells that carry only a batch id
  (`PHA-0334442-001`) still show it whole, with Sample ID empty.

---

## 12.8.4 — August 2026

**Heat map tooltip starts blank — you choose.**

- No more preset rows: the well popup shows nothing extra until you pick
  the fields yourself in the settings. Hover a heat map once, the
  "Available" list fills with your vault's batch fields, tick and order
  what you want. Removing everything switches the extra rows off again.

---

## 12.8.3 — August 2026

**The tooltip defaults are back.**

- Fixed: the heat-map tooltip settings could come up with **nothing
  selected** (and the popup showed no extra rows) if an older version had
  stored an empty list. Synonyms + Internal ID now always apply as the
  default — and if you ever remove every row, they simply come back.

---

## 12.8.2 — August 2026

**You decide the tooltip order.**

- The heat-map tooltip rows now come in the order **you** arrange in the
  settings — move them with the ▲/▼ arrows, remove with ✕. Everything,
  synonym included, shows in one block right under the molecule link; no
  more fields scattered in vault order with the synonym stranded at the
  bottom.

---

## 12.8.1 — August 2026

**Heat map tooltip: tick, don't type.**

- The "Heat map tooltip" settings card now fills itself: hover any run
  heat map once and your vault's batch fields appear as checkboxes, in
  the same order as your batch form. Tick what you want — no more typing
  field names.
- Batch fields like **Internal ID** now show at the **top** of the popup,
  right under the molecule link. The synonym (first one only) stays at
  the bottom, so a long chemical name doesn't shove the structure image
  around.

---

## 12.8.0 — August 2026

**Heat map tooltips that tell you what's in the well.**

- Hover a well on a run's heat map and CDD's popup now also shows the
  molecule's **synonym** and the batch's **Internal ID** — right under the
  concentration readouts, loaded in the background as you move the mouse.
- **You pick the rows.** A new "Heat map tooltip" card in the settings
  takes one batch field name per line, in the order you want them —
  `Purity [%]`, `Vendor ID`, whatever your vault defines. Case and the
  `*` required-marker don't matter (`Internal ID` finds `*Internal ID`).
  Clear the list to switch the extra rows off.

---

## 12.7.0 — August 2026

**Export a plate map to CSV.**

- Every plate page now has an **Export Plate Map (CSV)** link right in the
  Plate Details / Projects / Plate Map tab bar. The file lists every
  occupied well — barcode, well position (A01…P24), the full entity name,
  and that name already split into **Batch ID** and **Sample ID** columns —
  ready for Excel or a picking robot. Plates without a barcode field use
  the plate name as the barcode.

---

## 12.6.2 — August 2026

**Even more no-sample quotes.**

- The NO SAMPLE cards now rotate through 74 quotes — cold cases, wildlife
  documentaries, corporate memos and other reminders that a bottle without
  a sample is just a rumor with a cap.

---

## 12.6.1 — August 2026

**More no-sample quotes.**

- The NO SAMPLE cards in the Samples panel now draw from 35 quotes
  instead of 18 — fresh reminders (and gentle teasing) about why that
  bottle deserves a sample record. Still one quote per card per day.

---

## 12.6.0 — August 2026

**Products, thresholds you control, and a CSV button.**

- **Products in the panel (optional).** Tick the new checkbox in Panel
  fields and every reaction's products appear as PRODUCT-badged cards with
  the same fields as your reagents — and in the print sheets too (a
  Products section per reaction, a Type column in the panel print).
  Products are display-only: nothing gets written to them.
- **You decide what counts as low purity.** Two settings, both starting at
  93 %: one decides when a purity fill is offered at all, the other when
  the ⚠ LOW PURITY badge appears.
- **CSV export.** The panel's new CSV button downloads exactly what Print
  shows, ready for Excel.
- **Fixed:** filling purity now reliably puts your Equivalent back — the
  old check could silently give up when Chrome throttled a background tab,
  leaving the recalculated value behind. Keep the tab in front for long
  runs; Fill all now says so.

---

## 12.5.0 — August 2026

**Purity and concentration join the remembered values — and can fill themselves.**

- **The batch memory now covers density, purity and concentration.** Type a
  value once and every later appearance of that batch offers it back with
  one click. Registration data still rules: a purity/density on the batch
  record or a concentration on the sample always wins and retires the
  remembered copy. The purity fill even puts your Equivalent back the way
  it was after CDD's recalculation, and the concentration fill clicks
  "Make solution" for you when needed.
- **One click to fill everything.** The panel's new
  **⤵ Fill all missing values (N)** button runs every offered fill in
  sequence — keep the tab visible while it works.
- **Experimental auto-fill (off by default).** Tick the checkbox in
  settings and rows you ADD while working fill themselves; entries you
  merely open are never touched automatically.
- **Settings page**: the remembered-values card grew per-field columns and
  double width.
- **Reliability**: fills now target rows by their printed table number, so
  the right row gets the value even when the same batch appears twice in
  one reaction; assorted redraw-loop and stale-offer fixes.

---

## 12.4.0 — August 2026

**The extension now remembers densities you type — per batch, everywhere.**

- **Type a density once, get it offered forever.** When you fill a density
  into a stoichiometry row whose registered batch has none, the extension
  quietly remembers it (up to 100, per molecule batch). Next time that batch
  shows up without a density — any entry, any reaction — its card offers
  **⤵ Fill remembered density into table**, with a gentle amber reminder
  that the proper home for the value is the batch record itself. A density
  saved on the batch always wins and retires the remembered copy.
- **See and manage what's remembered.** The settings page gained a
  **Remembered densities** card: every stored value with its batch name,
  density and date, a ✕ to forget one, and **Clear all** for a fresh start.

---

## 12.3.0 — August 2026

**One click puts the batch's density into the stoichiometry table.**

- **Batch-only cards can now fill the table's Density field for you.** When a
  reagent has no sample but its registered batch knows the density, the card
  shows a **⤵ Fill density into table** button. One click and the extension
  does exactly what you would: opens the row for editing, clicks the Density
  field, types the value and confirms — CDD recalculates the volume and saves
  as usual. If anything on the page doesn't look the way it should, nothing
  is written and the button tells you to fill it manually instead.

---

## 12.2.3 — August 2026

**Batch-only cards get a sense of humour (and a mission).**

- **The BATCH ONLY tag grew into an amber ⚠ NO SAMPLE badge with a random
  educational quote.** Every card that shows registered-batch data instead of
  a real inventory sample now ends with one of eighteen rotating one-liners
  reminding you that creating a sample is the proper way — ranging from the
  sober *"This purity is from registration day, not from the bottle on your
  shelf."* to *"Schrödinger's reagent: both full and empty until someone makes
  a sample."* Collect them all — or just make a sample.

---

## 12.2.2 — August 2026

**Reordered reactions no longer print with the wrong table.**

- **Fixed: after moving reactions around inside an ELN entry, the printed
  stoichiometry sheet could show the right reaction scheme with a different
  reaction's reagent table — and the CDD samples panel grouped samples under
  the wrong reaction number.** The extension used to read reactions in the
  order they were created, while the page shows them in the order they appear
  in the entry; once you dragged a reaction to a new spot, the two got out of
  sync. The extension now follows the entry's actual layout, so the table,
  scheme and samples panel always belong to the reaction you clicked.

---

## 12.2.1 — August 2026

**Purity and density without a sample — batch-only rows join the panel.**

- **The CDD Samples panel no longer ignores reagents that don't have an
  inventory sample.** If a stoichiometry row references a registered batch
  (say `RGT-0001620-001`) rather than a specific sample, the panel now shows a
  card for it anyway: it quietly looks the batch up on its molecule page and
  pulls in the registered metadata — purity, density, vendor ID, internal ID
  and any other batch fields your vault records. There's no reason you
  shouldn't see a reagent's purity just because nobody made a sample of it.
- **Batch-only cards are labelled.** A grey **BATCH ONLY** tag tells you the
  card's data comes from the registered batch, which is also why sample-side
  details like Location or Concentration aren't there.

---

## 12.2.0 — August 2026

**Bulk-reaction print sheets now use letters, matching CDD.**

- **Printed stoichiometry sheets label bulk-reaction rows A, B, C… instead of
  numbers.** In a parallel (bulk) reaction, CDD lists each variable reagent and
  its product together under a letter — but the printed report used to number
  those rows 1–17 like any other. Now the PDF mirrors the page: the fixed rows
  keep their normal 1, 2, 3… numbering, and below them a "Reagents and
  products" section shows each pair as its own framed block — the letter in a
  shaded band on the left, with the variable reagent and its product stacked
  inside and clearly tagged. Reports for ordinary single reactions look
  exactly as before.

---

## 12.1.4 — August 2026

**Goodbye, filter auto-switcher — CDD does it natively now.**

- **Removed the "smart filter default" helper.** It used to flip a freshly added
  ELN/Inventory filter from "Any value" to the second operator for you. CDD now
  ships this behaviour itself, so the extension no longer needs to watch the
  page and simulate clicks — same result, less background work in your browser.

---

## 12.1.3 — July 2026

**Bug fix: the Keywords picker on the Search page scrolls smoothly to the end
in Firefox.**

- **Finishing the 12.1.2 fix.** In Firefox, the long columns of the field
  picker could still stop short of their last options, and the Search page's
  Keywords picker had it worst: while scrolling inside it, the list jittered
  near the top and kept snapping back, so the bottom entries were effectively
  unreachable. The picker no longer mistakes scrolling inside its own list for
  page scrolling, remembers your scroll position while it re-measures itself,
  and gives its columns an exact height so Firefox lets you reach the very
  last option. Chrome behaves exactly as before.

---

## 12.1.2 — July 2026

**Bug fix: in Firefox, the field picker's columns can now scroll all the way
down.**

- **No more unreachable options at the bottom.** In Firefox, the long Entity
  and Batch columns of the wide field picker (Inventory filter and the Search
  page's Keywords selector) cut off their last options — the scrollbar ran out
  before the list did. The columns now measure their height correctly in every
  browser, the last option is fully visible and clickable, and the list keeps a
  little breathing room at the bottom. Chrome behaves exactly as before.

---

## 12.1.1 — July 2026

**Bug fix: the plugin's tweaks now survive navigating within CDD.**

- **No more "it only works after a refresh".** If you moved to the Inventory
  page (or a registration form) by clicking through CDD instead of reloading it,
  several of the plugin's touches — the filter operator default, the wide filter
  field picker, the Column Manager, form defaults and more — quietly stopped
  applying until you refreshed the page. That's fixed: CDD replaces the page
  content in place when you navigate, and the plugin now watches the page in a
  way that survives that replacement. Everything applies immediately, however
  you arrive.

---

## 12.1.0 — July 2026

**The Search page's "Keywords" field picker gets the same treatment as the
Inventory filter.**

- **Choosing what to search is no longer one endless dropdown.** On the Search
  page, the Keywords field selector used to be a single long, narrow list mixing
  the general choices, every Entity field and every Batch field together. Now it
  opens as the same wide, multi-column picker you already know from the Inventory
  filter — General, Entity and Batch side by side, each with its own heading and
  scroll, and a search box at the top that ranks matches (an exact name wins over
  a loose one), ignores case and accents, hides everything irrelevant, and
  highlights the part you typed. Just start typing the field name — you don't
  even need to click first.
- **Nothing you could pick before is gone.** Every original choice is still
  there, including "Entity Fields" and "Batch Fields" themselves (which search
  across a whole object) — they now sit in the General column, and picking any
  field does exactly what it did in the old dropdown. Your saved searches and
  results are unaffected.
- **The picker stays attached to the field you clicked.** It drops right below
  the Keywords selector, and when there isn't room it repositions sensibly while
  staying connected to that field — so it's always clear which selector it
  belongs to.

---

## 12.0.0 — July 2026

**Finding and choosing attributes stops being a scroll-fest.**

- **The Inventory filter's attribute picker is now four columns, not one endless
  list.** When you add a filter and open the field selector, instead of one long
  narrow dropdown mixing everything together you get Sample, Batch, Entity and
  Event side by side, each with its own heading and scroll. There's a search box
  at the top that ranks matches (an exact "Sample ID" wins over a loose match),
  ignores case and accents, hides everything irrelevant, and highlights the part
  of the name you typed. Picking a field behaves exactly as before.
- **"Select and reorder columns" became a proper Column Manager.** On a vault
  with a hundred-plus columns the old flat list was painful. Now there's a header
  showing how many columns are visible out of the total, a search that even
  copes with fuzzy typing, and Sample/Batch/Entity/Event chips (with counts) to
  jump to one type. Each field carries a small coloured category badge instead of
  an italic "(Sample)"; the columns you've selected are tinted and are the only
  ones showing a drag handle — so it's obvious at a glance what's on and what
  isn't. Selecting and drag-reordering work exactly as before.
- **The bulk-registration type list now remembers, like the Create Entity page
  does.** When you register many entities at once, the entity-type picklist
  arrives in your configured order and preselects whichever type you last used in
  that vault. It shares that memory with the Create Entity page, so both agree on
  what you last worked with.
- **Got feedback? There's now a link.** Report a bug or ask for something at
  <https://github.com/xaviersvk/CDD-Stoich-Tools/issues> — linked from the manual
  and from the top of this page.

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

**No more bouncing off "you forgot the project" at the bottom of the form.**

- **The Project picker now also sits right next to the Create Entity button.**
  On the *Create a New Entity* page the project dropdown is at the very top of
  the form, a screenful away from the Create button at the bottom. There's now a
  second copy of it directly left of **Create Entity**. Both are the same field —
  change one and the other follows.
- **Create Entity stays disabled until you pick a project.** While no project is
  selected the button is greyed out ("Select a project first") and the project
  dropdown is highlighted in amber. Nothing is lost when you forget — CDD just
  rejects the submit — but now you don't make the trip at all.

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
