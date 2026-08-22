# Row name from synonym

**Status: built, not yet verified live.** Every module is in place and the
build is green, but nobody has clicked the button on a real entry yet. The
list of what to walk through is in [§8](#8-what-still-needs-a-live-pass).

---

## 1. What it does

A stoichiometry row has a free-text **Name** — the label CDD prints above the
molecule-batch id. CDD never fills it, so a table reads

```
3   RGT-0000246-001
    N-ethyldiisopropylamine
```

where the chemist thinks *DIPEA*.

With the feature on, a card whose row has an empty Name grows a button:

```
⤵ Fill name (DIPEA) into table
```

Click it and the row is named. Type your own name instead and it is
remembered for that molecule, then offered everywhere that molecule turns up
again — including in other entries.

**Switch it on:** *Settings → Fill row name from synonym*. Off by default,
because each new molecule costs one request for its page.

**Manage what it learned:** *Settings → Remembered names* (300 entries, oldest
use evicted first, per-row delete and *Clear all*).

---

## 2. Why the *shortest* synonym

CDD's molecule page carries a `Synonyms` row with every name the registrant
entered. Measured against the names the user had already typed by hand on
entry `2504170`:

| Molecule | Synonyms as CDD serves them | Shortest | Typed by hand |
| --- | --- | --- | --- |
| `RGT-0000246` | `N-Ethyldiisopropylamine, N,N-Diisopropylethylamine, N-Ethyldiisopropylamine, DIPEA` | `DIPEA` | `DIPEA` |
| `RGT-0000204` | `1-[Bis(dimethylamino)methylene]-…hexafluorophosphate, HATU` | `HATU` | `HATU` |
| `PHA-0334390` | `PD-0287` | `PD-0287` | — |
| `PHA-0333476` | *(empty)* | — | `PPH3333` |

"Shortest" reproduced the user's own choice in both cases where there was a
choice to make. The last row is the case the memory exists for: no synonym to
pick, so the typed name is the only source there will ever be.

Ties resolve to the first in document order. A candidate made only of
punctuation is not a name and is dropped — otherwise the shortest-wins rule
would hand you a comma.

---

## 3. The three storage keys

| Key | Shape | Written by |
| --- | --- | --- |
| `cddFillRowName` | `boolean`, default `false` | the options checkbox |
| `cddNameMemoryV1` | `{ [moleculeId]: { name, moleculeName, savedAt, lastUsedAt } }`, capped at 300 | capture, and a successful fill's LRU touch |

(The shortest synonym itself is **not** persisted. It is a per-session `Map`
in `name-enrichment.js`, rebuilt on each page load from the molecule pages —
a synonym can change on the CDD side, and a stale cached one is worse than a
second request.)

### Why the memory is keyed by molecule

A name belongs to the substance, not to a bottle of it, so it should follow
the molecule onto any batch. Product rows settle it: they often have no batch
at all, and a batch-keyed memory could never learn from them.

This is the one place the extension keeps a value CDD has nowhere to put. A
remembered density is a stand-in for a field that exists on the batch record
and is expected to be filled in there eventually — `density-memory.js` deletes
its copy the moment the batch record carries one. A row name has no such
record: nothing will ever supersede it, so an entry only leaves the map by
ageing out of the cap or by being deleted in the options page.

---

## 4. Modules

```
shared/pretty-name.js        pickPrettyName()  — pure, no DOM: the shortest-wins rule
shared/name-memory.js        moleculeId -> name, 300 entries, both contexts
shared/row-name-flag.js      the on/off switch, both contexts

content/api/molecule-page.js       getMoleculeSynonymsText()  — cached page fetch
content/features/name-enrichment.js  session cache moleculeId -> shortest synonym
content/features/name-capture.js     remembers a name the user types
content/features/fill-offers.js      the offer (memory first, synonym second)
content/features/row-fill.js         fillNameIntoTable() — the actual write
```

`extractSynonymsText()` in `api/molecule-image.js` is the shared parser for
the `Synonyms` row. `extractSynonym()` (the panel's **Synonym** field) is now
built on it and still returns the **first** synonym — that shipped behaviour
is deliberately unchanged.

---

## 5. Data flow

**Reading.** Every `SAMPLE_DATA` payload → `enrichRowNameSynonyms()`. It bails
out immediately unless the flag is on, then fetches the molecule page for each
molecule it has not asked about yet (one request per molecule per session,
products and mentions skipped since they get no offer) and stores
`pickPrettyName(text)`. A molecule with no synonyms stores `null` — that is a
final answer, not a reason to ask again. A failed fetch stores nothing, so the
next payload retries.

**Offering.** `computeFillOffers(sample)` adds `{ field: "name" }` when the
flag is on, the row has a `moleculeId`, and `tableName` is empty. The value is
the remembered name if there is one, otherwise the shortest synonym.

> **Precedence here is inverted** relative to every other field. Density,
> purity, concentration and solvent all prefer the authoritative record and
> fall back to memory. A row name has no authoritative record: the synonym is
> a guess, and the name the user typed is the better guess, so memory wins.

The offer then rides the existing chain for free — the card button,
*Fill all*, and the experimental auto-fill all read the same list.

**Writing.** `fillNameIntoTable()` replays the user's own gestures: click the
row, click the `Name:` value link (**only** when it shows the blue
`Optional` — an existing name is never overwritten), set the popup input
React-natively, Enter, click the margin.

**Capturing.** Every payload → `captureRowNames()`, which compares each row's
`tableName` against what that row said when this page load first saw it.

---

## 6. The two rules that are easy to get wrong

### The baseline rule

Only a name that **changes while the page is open** is remembered. The first
payload of a page load is a baseline and teaches the memory nothing.

Without it, simply opening an old ELN would harvest whatever labels it
happens to carry. Entry `2504170` holds `MR-0256`, `MR-0265-B`, `MR-0266-B` —
those name that experiment's fractions, not the molecules, and offering them
on unrelated future rows would be worse than offering nothing. A name typed
with the panel open is the opposite case: it is exactly the correction the
feature exists to reuse.

A row added while working starts with no name, so its baseline is `""` and the
first name typed into it counts as a change.

Clearing a name is not a name: the memory keeps its previous value rather than
unlearning it.

### Capture and offer have different scopes, on purpose

| | reactants / agents | products | mentions |
| --- | --- | --- | --- |
| offered a name | yes | no | no |
| name typed there is remembered | yes | **yes** | n/a |

Products stay display-only in the panel — that rule is older than this feature
and was not bent for it. But a name someone writes on a product row is still a
name that molecule answers to, so it is learned and will be offered when the
same molecule appears as a reactant.

---

## 7. What the DOM does, and the two traps in it

Measured live on entry `2504170`; the short version also lives in
[`cdd-integration-notes.md`](./cdd-integration-notes.md).

Empty field, edit mode:

```html
<span data-autotest-id="field-name">
  <b>Name:</b>
  <span><span data-autotest-id="missing-label">Optional</span></span>
</span>
```

Field with a value, **edit mode and view mode alike**:

```html
<span data-autotest-id="field-name">DIPEA</span>
```

**Trap 1 — the label disappears once the field has a value.** The generic
`writeFieldViaPopup()` confirms a write by re-reading `<b>Label:</b> value`.
For Name that label is gone the instant the write lands, so it would report
`value did not stick` on every *successful* write. `fillNameIntoTable()`
therefore has its own confirm, `readRowName()`, which reads the unlabelled
span. The Solvent field shares the same `data-autotest-id` but keeps its
`<b>Solvent:</b>` — that is what tells the two apart.

**Trap 2 — this feature erodes `isEditModeRow()`.** That helper decided "this
table is in edit rendering" by looking for a `<b>Name:</b>`. A table whose rows
*all* have names has no such label — and filling names is precisely what this
feature does. It now accepts any of the five labels measured to be
edit-mode-only: `Name:`, `IUPAC:`, `%w/w ratio:`, `%v/v ratio:`, `CAS-RN:`.
(`FW:`, `Mass:`, `Purity:` and even `Volume: Optional` all render in view mode
too, so none of them can serve as a marker.)

Two more facts worth not rediscovering:

- The Name editor popup is a `MuiPaper` whose whole text is the bare word
  `Name`, with `input[placeholder="Name"]`.
- In the payload the value is the row-level string **`row.name`**, not
  `userInput.name`.

---

## 8. What still needs a live pass

Reload the unpacked extension, refresh
`/vaults/6884/eln/entries/2504170`, and walk this:

1. Checkbox **off** → DevTools Network filtered to `molecules/` shows no
   requests, and no card shows a name button.
2. Checkbox **on** → the panel re-renders; `RGT-0000246` offers **DIPEA**,
   `RGT-0000204` offers **HATU**.
3. Click one → the row is named, the button reads `✓ name filled`, and the
   offer is gone on the next render.
4. A row that already has a name (`PPH3333`) gets no button.
5. Product and mention cards get no button.
6. `PHA-0333476` (no synonyms) gets no button until a name is remembered.
7. Type a different name over a filled one → it appears in **Remembered
   names**, and is then offered ahead of the synonym, with the `ⓘ` mark.
8. *Fill all* counts and fills the name offers.
9. Open an old entry and touch nothing → **Remembered names** stays as it was.
10. The existing density / purity / concentration / solvent buttons still
    work — `isEditModeRow()` and the LRU-touch path are shared code that this
    feature changed.

**The likeliest thing to need tuning** is step 3. If the row visibly gets its
name but the button reports `✗ value did not stick`, `readRowName()` did not
find the value: dump the row's `[data-autotest-id="field-name"]` spans right
after the write and compare against §7 before changing anything else.

---

## 9. Where the reasoning is written down

- Spec: [`superpowers/specs/2026-08-21-row-name-from-synonym-design.md`](./superpowers/specs/2026-08-21-row-name-from-synonym-design.md)
- Plan: [`superpowers/plans/2026-08-21-row-name-from-synonym.md`](./superpowers/plans/2026-08-21-row-name-from-synonym.md)
