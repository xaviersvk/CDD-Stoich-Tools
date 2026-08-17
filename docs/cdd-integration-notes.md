# CDD integration notes — hard-won knowledge

Field notes from building the remembered-values features (12.3.0–12.5.0),
written down so the next extension of the stoichiometry automation starts
from what we already paid to learn. Everything here was verified live
against https://app.collaborativedrug.com/vaults/6884/eln/entries/2504170.

## The payload (eln/v2/entries/:id)

- The inject hook parses **every fetch/XHR response**; CDD's autosave means
  a fresh payload flows within moments of any table edit. But **not every
  response carries the full row data** — some partial payloads have rows
  with an empty `userInput` even though the table visibly holds values.
  Never treat a single payload as the whole truth; the next full one
  corrects the picture.
- **Where typed values actually live** (they are NOT all in `userInput`):
  - density → `row.userInput.density` (string), but CDD can also
    hold/move a working density at **row level** (`row.density`, e.g.
    molecule-derived like Ethanol's 0.789). For "does the table have a
    density?" check both; for "did the user type it?" trust only
    `userInput`.
  - purity → `row.purity`, a **fraction** (0.982 = 98.2 %). Exactly `1`
    is CDD's untyped 100 % default — indistinguishable from a hand-typed
    100, we read `1` as "not typed".
  - concentration → `row.concentration`, a number, **always mol/L** (the
    editor popup has no unit selector).
  - equivalent → `row.equivalent`, row level.
  - `userInput` otherwise carries things like `msample` ("19.5 mg").
- **`row.rowType` is `"default"` | `"solution"` | `"solvent"`** — it, not
  `role`, tells a stock solution apart from neat material. A `"solution"`
  row carries its stock strength in `row.concentration` (mol/L) and its
  **solvent NESTED under `row.solvent`**: a complete row object of its own
  (`role === "solutionSolvent"`, `rowType === "solvent"`, with `name`,
  `casNumber`, `molecularWeight`, `density`, `boilingPoint`, `mass`,
  `volume`, `mole`). It is **not** a member of `stoichiometryTable.rows`,
  so anything that only walks that array silently loses it — that was the
  12.8.6 print bug. A solvent with no molecule picked yet still carries the
  typed `volume`, and the table labels it "Solvent: Required".
  A *standalone* solvent row (a reaction solvent) is an ordinary top-level
  row with `rowType === "solvent"` and a `row.molarity` (mol/L) — the
  reaction molarity it contributes.
- Batch metafields for batch-only rows are NOT in the entry payload —
  `batch-field-enrichment.js` fetches the molecule page and parses
  `RegistrationFormRenderer` react_props. A molecule page that loads but
  has **no field values for the batch still counts as enrichment complete**
  (we then KNOW the batch has no density/purity).

## The stoichiometry table DOM

- **Display order ≠ payload order.** The table groups rows by role:
  reactants first, then agents (solvents, solutions), then products — each
  group in payload order. Parallel reactant/product rows form the lettered
  A/B/C block and get no number. The printed number in the row's first
  cell is therefore a computed display number, not the payload index
  (`computeDisplayRowNumbers` in `sample-data.js`).
- **The printed row number is the ONLY reliable row key.** Names fail
  twice over: a card for a row WITH a sample carries the sample name,
  which the table never prints (use the composed "molecule-batch" name to
  find it at all), and the same batch can sit in one reaction twice with
  pixel-identical rows.
- **Edit mode is table-wide.** Clicking any row flips the WHOLE table into
  edit rendering — every row then shows the `<b>Name:</b> …` edit labels,
  not just the clicked one. Any "find the row being edited by its labels"
  heuristic is therefore wrong; address rows by printed number
  (`findTargetRow` in `row-fill.js`).
- Edit-row `<b>` labels are `Name:`, `IUPAC:`, `MW:`, `FW:`, `Density:`,
  `Purity:`, `Equivalent:`, … — **`Molecule:` is visible text but NOT a
  `<b>` label**. Don't guess markers; dump the DOM first.
- The one-field editor popup is a MuiPaper whose **label text** (e.g.
  `Density [g/cm3]`, `Concentration [mol/L]`) is the only reliable marker;
  the input's placeholder is present only sometimes.
- The Concentration field exists only on solution rows; clicking the
  row's **Make solution** link creates it (the row then shows
  "Remove solvent"). Editing purity makes CDD recalculate that row's
  Equivalent — snapshot before, restore after.
- **A solution's solvent is a `<tr>` of its own**, rendered directly after
  the solution row with an **empty first cell** (no printed number) and
  `data-autotest-id="stoichiometry-table-solutionSolvent"`. Present in view
  mode too. `Make solution` creates it labelled *Solvent: Required*;
  `Remove solvent` deletes it and turns the row back into a plain one,
  **taking the concentration with it**. Its `Solvent:` value is a normal
  `<b>` label, so `findFieldValueLink` reads it — but the row itself is
  invisible to `findTargetRow`, which keys on the printed number.
- **The solvent editor is a DROPDOWN, not a text field** — the only fill
  that is. Its MuiPaper label is the bare word `Solvent` and its input
  carries `placeholder="Select solvent"`. Typing filters CDD's 38 built-in
  solvents; **an empty box lists them all**, but only as a *second* event —
  React ignores an input event that doesn't change the value, and the box
  starts empty. The filter is a **case-insensitive substring of the whole
  label**, so `EtOH`, `chloride` and `ethanol` all narrow it correctly.
  Options live in `[data-autotest-id="solvent-row-name-selector-popup"]`,
  one per `[data-autotest-id="solvent-<label>"]`.
- **The list is a convenience, not a constraint.** A solvent may be **any
  string** — the popup's `Create "<typed>"` entry names the solvent on
  *that row* as free text (verified: the row then reads
  `Solvent: EtOAc/Hexane 1:1`); it does **not** add anything to the vault's
  solvent list. That entry has **no autotest id**, so it is matched by its
  label, and only when the quoted text equals what was typed. CDD offers it
  **alongside** real matches, which is why a list match must be tried first
  — otherwise `ethanol` would be created as text next to the real entry.
  A list pick carries CAS-RN, FW, density and boiling point; free text
  carries none of them.
- **Picker label ≠ stored name.** The list says `Ethanol (EtOH)`; the
  payload calls the same thing `ethanol`. Match on the label, the label
  minus its trailing parenthesis, and each comma-separated abbreviation
  inside it (`Dichloromethane (methylene chloride,DCM,CH2Cl2)`). Compare as
  stripped strings — `2,2,2-Trifluoroethanol` parses as a *number*.
- A click on our panel button is a click OUTSIDE the table, which CDD's
  document-level handler treats as "leave edit mode" — stop propagation
  and defer the fill sequence until the click has settled.

## The run definition form (`/vaults/<id>/runs/<id>` → Run Details)

- **Reading needs no click.** `div.protocolAnnotator` carries the whole form
  in a `react_props` attribute (~400 kB of JSON): `protocolFields[] =
  {label, value, definition}`, plus `protocolId`, `schemaPrefix` (the form
  definition id — `510` is "FP assay") and `resourceType`. Test
  `resourceType === "run"`, never the URL: the same component renders for
  other resources. Parse it only when you are about to use it — the scan
  runs on every mutation batch.
- A field's value object is `{id, run_id, run_field_definition_id,
  float_value, text_value, date_value, uploaded_file_id, pick_list_value_id,
  batch_link_id}`. Which slot holds it depends on
  `definition.data_type_name`: `Text` / `LongText` / `PickList` / `BatchLink`
  → `text_value`, `Number` → `float_value`, `File` → `uploaded_file_id`. The
  run's own date is the ONE entry with `definition: null`.
- **Writing goes through a plain RAILS form** that "Edit run definition"
  swaps in — there is no autosave, there is a Save button. Each field is a
  triplet of inputs sharing an index `N`:
  `run[editable_fields_including_blanks_attributes][N][field_definition_id]`
  (hidden, the only stable key), `…[N][value]` (the control) and `…[N][id]`
  (the existing value row, empty when unset). The run date is separate:
  `run[run_date]`.
- **`N` is neither the display order nor stable between forms** — on one
  assay Lab=0, Person=1, Protein=2, Conditions=5, Reaction temp=11,
  Quality=15, Plate Type=31, Probe=34, G factor=57. Key by the definition
  id and find the control by the shared index.
- The form renders only a SUBSET of `protocolFields` (17 of 65 on that
  assay), so a value can exist in the payload with no control to write it
  to.
- A `PickList` is a `select.pick-list` whose **option value equals its
  visible text** ("1536", "Optimization") — no id mapping needed.
- **A `BatchLink` is a MUI autocomplete backed by a hidden rails input**
  (`input[data-testid="rails-hidden-fields"]`) in the same `<td>`. Writing
  the hidden input directly would submit a batch React never resolved, so
  drive the picker: it **ignores input on an unfocused box**, it treats a
  `change` event as a commit and **throws the typed text away**, and its
  results are a REMOTE search portaled to `<body>` as
  `#<comboId>-listbox` with `li[role="option"]` children whose text is the
  batch identifier. Picking one puts CDD's own `batch_link_id` in the hidden
  field (verified: `PRO-0000017-001` → `190898728`).

## Entity links in an ELN entry body

- A batch or sample referenced in the body renders as an ordinary `<a>` whose
  href is a deep link into the molecule page:
  `/vaults/<vault>/molecules/<molecule>#molecule-batches/<batchId>` or
  `…#molecule-inventory_samples/<sampleId>`. That href is the whole identity,
  so nothing has to parse the editor's document model.
- **Two DOM shapes, one href.** A link typed inline is a Slate inline
  (`div.slate-a[data-slate-inline]` wrapping the `<a>`); a link that came with
  an embedded card sits in a `molecule-names__container` and is not Slate at
  all. Match on the href, never on the wrapper.
- **The vault in the href is the molecule's HOME vault**, routinely NOT the
  entry's vault (ELN 6884 → registration 6885 / 7965). Fetch through it to
  skip a redirect; one entry can mention molecules from several vaults.
- **`/vaults/<v>/molecules/<m>/inventory_samples.json?include_depleted=<bool>`**
  is the one endpoint that answers both kinds. Returns
  `{inventory_samples, sample_limit_hit, depleted_samples_count}`; each sample
  carries `id`, `batch_id`, `name`, `sample_identifier`, `location{id,
  position, value}`, `current_amount` + `units`, `depleted`, `fields` (sample
  metafields), `batch_fields`, `molecule_fields` and a nested `batch`
  (`molecule_batch_identifier`, `molecule_name`, `formula_weight`, salt,
  synonyms). So a sample mention is a direct hit and a batch mention reads
  the batch half of any sample of that batch.
- **The molecule page's HTML does NOT contain its samples.** `SampleDataView`
  fetches the JSON above at runtime; a background `fetch()` of the page gets
  the pre-JS markup, where the sample ids simply are not present. (The page's
  `RegistrationFormRenderer` blocks DO carry batch fields — that is what
  `batch-field-enrichment.js` scrapes.)

## The protocol page (`/vaults/<id>/protocols/<id>`)

- Carries **two** `.protocolAnnotator`s: one with `resourceType === "protocol"`
  (Name / Category / Description) and one with `resourceType === "run"` that is
  the blank new-run form — 65 fields with nothing filled in. Neither holds a
  real run's values.
- The **Run Data** tab is a `table.SimpleDataTable` with a `tr.header-row` of
  field names and one body row per run — the only place every run of a
  protocol is visible at once. Its last column is empty (spare).
- Its columns include `Molecules` and `Plates`, which are row COUNTS, not
  fields. Rather than blocklisting them, take the valid names from the run
  annotator's own `protocolFields` on the same page.

## Extension architecture gotchas

- **Every `chrome.storage` write re-renders the panel** (via `onChanged` →
  `renderFromState`). Any capture logic that writes on unchanged data
  loops the redraw forever. Two incidents:
  - the remembered-entry *label* ping-ponged between the differing display
    names of the same batch's rows → write per parse → endless redraw
    (visible as the NO SAMPLE quotes reshuffling). Labels now stick to the
    first non-empty name.
  - never `notifyChange()` synchronously from capture — it re-enters the
    renderer mid-render and duplicates cards. Let `storage.onChanged`
    deliver the notification asynchronously.
- Anything random per render (the NO SAMPLE quotes) visibly flickers,
  because re-renders are frequent. Seed randomness by stable identity
  (batch id + day).
- **Chrome throttles background-tab timers** to ~1/min. A polling
  automation (waitFor @100 ms) crawls to a near-halt when the CDD tab is
  not visible — long fill queues must run in a foreground tab.
- **Orphaned content scripts**: reloading the unpacked extension while a
  CDD tab stays open leaves the old script running with dead `chrome.*`
  APIs ("Extension context invalidated"). Guard storage writes with
  try/catch; a page refresh gets the fresh script.
- Auto-anything that WRITES into a scientific record needs an explicit
  policy. Ours: automatic fills touch only rows ADDED while the user works
  (a ~5 s baseline window after load registers pre-existing rows; URL
  change resets it). Existing rows go through the card buttons or the
  panel's "Fill all" button — a conscious click.

## Debugging techniques that paid off

- Fetch `/vaults/:vault/eln/v2/entries/:id` from the page console and walk
  `stoichiometryTable.rows` — ground truth for field locations and order.
- Dump `<b>` labels / first-cell numbers of live table rows before coding
  any DOM heuristic.
- To watch what the parser emits, add a temporary `window.addEventListener
  ("message", …)` in the page console — but remember partial payloads and
  that a page reload wipes the listener.
- The per-card fill buttons keep their ✗ failure reason visible; the
  status line gets overwritten by the next payload's "Loaded …" — put
  durable diagnostics on the buttons, not the status line.
