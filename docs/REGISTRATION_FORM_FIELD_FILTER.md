# Filtering field pickers by registration form

> **Status:** built and shipped. Everything below was verified live against
> vault **1000000076** (I9353) on **2026-08-17**, not inferred from
> documentation — the measurements are what the design was chosen on.
>
> This doubles as the design record: §5 and §6.4 explain two decisions that
> look arbitrary in the code if you haven't seen the numbers.

---

## 0. The problem

On the Search page (`/vaults/{id}/searches/new`), the Keywords field selector
lists **every field the vault owns** — 129 options in this vault. When you are
looking for a Plasmid, roughly three quarters of that list is noise: antibody
isotypes, tissue fixation methods, virus Baltimore classifications.

The same list, same problem, appears in the Inventory "Filter Entries" selector.

**The goal:** let the user pick a registration form (Plasmid, Antibody,
Protein, …) and collapse the list to the fields that form actually uses.

---

## 1. What already exists in this repo

This is not a from-scratch feature. Both pickers are **already ours**:

| File | What it does today |
|---|---|
| `src/content/features/ui-fixes/field-picker-core.js` | Shared engine: floating panel, search box, relevance scoring, highlight, keyboard nav, positioning |
| `src/content/features/ui-fixes/keywords-field-picker.js` | Search page adapter — suppresses the native `<select>`, opens the shared picker, writes the choice back |
| `src/content/features/ui-fixes/filter-field-picker.js` | Inventory adapter — overlays CDD's MUI `<Menu>` |
| `src/shared/registration-form.js` | Registration-form **order** + **default** settings, keyed by form NAME |
| `src/content/features/ui-fixes/registration-form-default.js` | Applies that order/default on the Create Entity page |

So the work is: **add a filter row to the shared picker, and a data source that
says which fields belong to which form.**

`initKeywordsFieldPicker`, `initFilterFieldPicker` and
`initRegistrationFormDefault` are **already registered in `src/content/main.js`**
— the feature can be built without touching `main.js` at all.

---

## 2. Where the form → fields mapping lives

**`/vaults/{id}/molecules/new`**, in the DOM, on this element:

```
div.registrationFormRenderer[component_class="RegistrationFormRenderer"][react_props]
```

`react_props` is a ~154 kB JSON string. The four keys that matter:

```js
{
  registration_form_definitions: [ /* 11 forms */ ],
  molecule_field_definitions:    [ /* 61 defs: {id, name, data_type_name, …} */ ],
  batch_field_definitions:       [ /* 57 defs */ ],
  inventory_sample_field_definitions: [ /* 13 defs */ ],
  inventory_event_field_definitions:  [ /*  5 defs */ ],
}
```

Each entry in `registration_form_definitions` looks like:

```js
{
  id: 1000000214,
  name: "Plasmid",
  registration_type: "NUCLEOTIDE",
  components: {
    molecule: { sections: [ … ] },   // nested layout tree
    batch:    { sections: [ … ] },
    sample:   { sections: [ … ] },
    inventory:{ … }                  // always empty in this vault
  }
}
```

The layout tree nests arbitrarily (`sections → contents → contents → cell`), and
the leaves that matter carry a **`fieldID`**. So:

> **Recursively walk `components.<kind>` collecting every `fieldID`, then join
> against `<kind>_field_definitions` to get names.**

The 11 forms in this vault: Molecule, Prokaryote, Eukaryote, Virus, Tissue,
Mixture, Plasmid, Oligonucleotide, Protein, Reagent, Antibody.

### 2.1 The `registration_form_definition_id` is per-vault

`#registration-form-select` on the Create Entity page has these ids as option
values. **They differ between vaults** — `shared/registration-form.js` already
documents this and keys everything by NAME instead. The new feature must do the
same.

---

## 3. Why name matching is the only option (and why it is safe)

### The search `<select>` gives us no ids

```html
<select class="molecule_criteria__select molecule_criteria__field">
  <option value="0">Any field</option>
  <option value="1">Entity name</option>
  …
  <option value="5">Entity Fields</option>     ← section heading
  <option value="6">- *Toxicity</option>       ← "- " = child of that section
  …
  <option value="66">Batch Fields</option>
  <option value="67">- Batch Name</option>
  …
</select>
```

The `value` is a **plain array index** that CDD's own change handler maps to
`field` / `path` / `data_type_name`. It is not a field id, so it cannot be
joined against `*_field_definitions`. The **label is the only join key.**

### Verified: the join is exact and unambiguous

Cross-checked every option label against the harvested definitions:

**Search page (129 options)**

| Section | Options | Matched | Unmatched |
|---|---|---|---|
| Entity Fields | 60 | **60** | — |
| Batch Fields | 62 | 57 | 5 |

The 5 unmatched Batch labels are CDD **system** fields, not vault fields:
`Entity-Batch ID`, `Owner`, `Created Date`, `Updated Date`, `Salt`.

**Inventory "Filter Entries"** (bucketed by `data-value` prefix)

| Prefix | Options | Matched | Unmatched (system fields) |
|---|---|---|---|
| `MOLECULE` | 64 | 60 | Entity Name, Entity ID, Synonyms, Exact Mass |
| `BATCH` | 64 | 57 | Batch ID, Entity Batch ID, Salt Name, Salt ID, Solvent Name, Solvent ID, Formula Weight |
| `SAMPLE` | 22 | 13 | Inventory ID, Depleted, Name, Current Amount, Current Sample Location, Sample Created, Sample Last Modified, Sample Created By, Sample Modified By |
| `EVENT` | 10 | 5 | Event Created, Event Last Modified, Debit/Credit, Event Created By, Event Modified By |

Same pattern in both pickers: **everything that fails to match is a CDD built-in.**
Those go on an always-keep list and are never hidden.

Also verified: **no duplicate names** inside `molecule_field_definitions` or
inside `batch_field_definitions`, so the join has no ambiguity.

> Note the leading `*` (required marker) must be stripped on both sides before
> comparing — `field-picker-core.js` already does this for scoring.

### The residual risk

If a vault admin **renames** a field, the rename lands in
`*_field_definitions` and in the picker label at the same time, so the join
survives. The join only breaks if the two sources disagree — which we have not
observed. Either way the escape hatch is one click: switch the chip back to
**All**.

---

## 4. How much this actually helps

Measured on this vault, out of 129 Search options:

| Form | Entity | Batch | Options shown |
|---|---:|---:|---:|
| Mixture | 1 | 9 | **21** |
| Oligonucleotide | 8 | 17 | **36** |
| Tissue | 7 | 20 | **38** |
| Antibody | 9 | 18 | **38** |
| Plasmid | 12 | 16 | **39** |
| Protein | 7 | 21 | **39** |
| Reagent | 6 | 22 | **39** |
| Virus | 10 | 20 | **41** |
| Prokaryote | 14 | 17 | **42** |
| Molecule | 3 | 32 | **46** |
| Eukaryote | 17 | 18 | **46** |

(Shown = form fields + the always-visible General column + system batch fields.)

**3–6× shorter lists.**

---

## 5. Two constraints that shape the design

### 5.1 There is no JSON API for this

Probed from an authenticated page context:

| URL | Result |
|---|---|
| `/api/v1/vaults/{id}/fields` | **401** — the public API wants an API token; a session cookie is not accepted |
| `/vaults/{id}/registration_form_definitions` | 404 |
| `/vaults/{id}/registration_form_definitions.json` | 404 |
| `/vaults/{id}/field_definitions.json` | 404 |

Scraping `react_props` out of the HTML is the only route. There is precedent:
`src/content/features/batch-field-enrichment.js` and
`src/content/api/molecule-image.js` already do exactly this.

### 5.2 `/molecules/new` is slow and huge

Measured: **~1 010 kB** of HTML, **~10 seconds** server-side render.

**It must never sit on the critical path of opening the picker.** Hence the
cache strategy below.

---

## 6. Design

### 6.1 Getting the data without the 10-second wait

Three tiers, in priority order:

1. **Free, from the live DOM.** `registration-form-default.js` already runs on
   `/molecules/new`. When the user visits that page anyway — which they do to
   register anything — harvest `react_props` straight out of the DOM.
   **Zero fetches, zero waiting.** This will be the usual source in practice.
2. **Background fetch**, only when the cache is empty and the user opens a
   picker. Chips render disabled ("loading…") for the one-off ~10 s.
3. **Refresh:** 7-day TTL, plus every `/molecules/new` visit overwrites the
   cache for free, plus a manual button on the options page.

### 6.2 Storage shape

Store the **reduced** map, not the 154 kB blob — a few kB:

```js
// chrome.storage.local, key: cddRegFormFieldMap
{
  "1000000076": {
    fetchedAt: 1755000000000,
    forms: {
      "Plasmid": {
        entity: ["Plasmid Type", "Optimized for", "Promotor", …],
        batch:  ["*Internal ID", "*Purity [%]", …],
        sample: […]
      },
      …
    }
  }
}
```

Keyed by vault id, then by form **name** (see §2.1).

### 6.3 UI — chip row (decided)

```
┌──────────────────────────────────────────────┐
│ Search fields…                               │
├──────────────────────────────────────────────┤
│ (All) (Molecule) (Plasmid) (Protein)         │
│ (Antibody) (Virus) (Tissue) (Eukaryote) …    │
├────────────┬─────────────┬───────────────────┤
│ GENERAL    │ ENTITY      │ BATCH             │
│ Any field  │ Plasmid Type│ Batch Name        │
│ Entity name│ Promotor    │ *Internal ID      │
└────────────┴─────────────┴───────────────────┘
```

Decisions taken:

- **Chips**, not a `<select>` — one click, and you can see what exists.
- Non-matching fields are **hidden outright**, not greyed or moved to an
  "Other" section.
- Default is **All** — nothing preselected. (Consistent with how this project
  treats auto-discovered option lists: discovery fills the pool, the user picks.)
- Chip **order reuses `REG_FORM_ORDER_KEY`** from `shared/registration-form.js`
  — the user can already order forms on the options page, so that order should
  govern here too.
- Chip **list can come from `REG_FORM_NAMES_KEY`**, which is already being
  collected, so the options page can show chips with no CDD page open.
- Last chosen chip is remembered **per vault**.

### 6.4 The filter must not fight the search box

`wireSearch()` in `field-picker-core.js` drives visibility through
`btn.hidden`. If the form filter also used `hidden`, typing in the search box
would un-hide filtered-out fields.

**Solution:** a second, independent visibility channel.

- Mark excluded items `data-cdd-ffp-off="1"`, with a CSS rule
  `[data-cdd-ffp-off] { display: none !important; }`.
- Teach `wireSearch()`'s `apply()` to score off-items as 0 and exclude them from
  `scored.length` (which drives per-column hiding and the grid template).
- Teach `restoreBrowseView()` (the empty-query path) to keep them off, and to
  recompute `columns.dataset.cols` so the grid does not size a track for a
  column that is now entirely empty.
- Have `buildPickerPanel()` return its `apply` as `refresh`, so a chip click
  re-runs the current search with the new filter.

### 6.5 The filter contract, shared by both pickers

Filter **per column kind**, and leave unknown kinds untouched:

| Kind | Search page | Inventory | Filtered? |
|---|---|---|---|
| general | leading options | — | **never** |
| entity | "Entity Fields" | `MOLECULE::` | yes |
| batch | "Batch Fields" | `BATCH::` | yes |
| sample | (not present) | `SAMPLE::` | yes |
| event | (not present) | `EVENT::` | **never** — events are not part of a registration form |

Inventory already uses fixed keys `sample`/`batch`/`entity`/`event`. The
Keywords adapter derives its keys from the heading text (`"Entity Fields"` →
`Entity`), so it needs to also record a normalised kind on each item — the
current `makeItem()` does not.

### 6.6 Files

| File | Change |
|---|---|
| `src/shared/registration-form-fields.js` | **new** — storage contract + pure `filterBuckets()` helper + always-keep system field list. No DOM, no imports (same discipline as `registration-form.js`) |
| `src/content/api/registration-form-fields.js` | **new** — parse `react_props`, walk `components`, join to definitions, reduce, cache |
| `src/content/features/ui-fixes/field-picker-core.js` | off-channel (§6.4), chip-row slot, chip styles, return `refresh` |
| `src/content/features/ui-fixes/keywords-field-picker.js` | record column kind on items, build chip row, persist choice |
| `src/content/features/ui-fixes/filter-field-picker.js` | same chip row (kinds already exist) |
| `src/content/features/ui-fixes/registration-form-default.js` | one import + one call: harvest from live DOM (§6.1 tier 1) |
| `src/options/options.{html,js}` | manual cache refresh — **defer**, see §7 |
| `src/content/main.js` | **no change needed** |

---

## 7. Notes for tomorrow

- **Do the options-page part last, or in a separate commit.** At the time of
  writing another session had uncommitted edits in `src/options/options.js`,
  `options.html`, `main.js`, `sample-panel.js`, `fill-offers.js`,
  `run-form-templates/` and `mentions/`. None of those overlap the picker files,
  so the core feature can land cleanly; the options-page refresh button is the
  one place where a collision is likely.
- **Only one vault was measured.** Another vault may expose Sample/Event
  sections in the *Search* selector too. `parseFieldSelect()` already handles
  arbitrary `"<Object> Fields"` headings generically — the new filter layer must
  be equally generic and must not hardcode Entity/Batch.
- `components.inventory` was empty for all 11 forms here. Do not assume it
  always is.
- A `<select>`-level fallback was prototyped and confirmed working
  (`option.hidden = true` yields `display: none` in Chrome, leaving
  `select.value` untouched). Not needed given we own the picker, but it is a
  valid degradation path if the picker is ever disabled.

## 8. What this does NOT touch

The `<option>` value is CDD's internal index and remains the source of truth.
The filter changes **only which items the picker displays**; the write-back into
the `<select>` (or the delegated click on CDD's `<li>`) is unchanged. No impact
on saved searches, URL parameters, request payloads, or filter semantics.
