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
- A click on our panel button is a click OUTSIDE the table, which CDD's
  document-level handler treats as "leave edit mode" — stop propagation
  and defer the fill sequence until the click has settled.

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
