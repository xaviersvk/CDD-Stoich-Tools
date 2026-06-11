# Adding New Fields to the Sample Panel

> Audience: a developer who has **never seen this project**. By the end you will
> understand exactly how a value travels from CDD's JSON to a row in the floating
> Sample Panel, and you will be able to add a new field yourself.
>
> You do not need to read the rest of the codebase first — this guide is
> self-contained. Where it helps, it points to
> [`docs/ARCHITECTURE_REVIEW.md`](./ARCHITECTURE_REVIEW.md) and
> [`docs/DATA_FLOW_DIAGRAMS.md`](./DATA_FLOW_DIAGRAMS.md).

---

## 0. The 30-second mental model

A "field" is one labelled row on a sample card (e.g. **Purity: 98**). There are
**two kinds**:

1. **Static fields** — defined once in a central registry. You add these in code.
   Examples: Name, Purity, Density, Concentration. (This guide is mostly about
   these.)
2. **Custom fields** — vault-specific fields (e.g. `*Hygroscopic`) that the
   extension **discovers automatically** from the data. You usually add these
   with **zero code** — you just enable the checkbox once data has loaded.

To add a *static* field you touch **two or three files**:

| You change… | …to do this |
| --- | --- |
| `src/inject/parsers/field-resolvers.js` | read the value out of CDD's JSON |
| `src/inject/parsers/sample-data.js` | (only if you added a brand-new resolver) include it in the flat object |
| `src/shared/sample-panel-fields.js` | declare the field so the panel + popup show it |

That's it. The popup picks up new static fields **automatically** — you never
edit the popup for a static field.

---

## 1. How data flows from CDD JSON (the full pipeline)

When CDD loads an ELN entry, it fetches a big JSON blob. The extension's **inject
script** (running inside the page so it can see CDD's network calls) captures
that blob and walks it. Simplified shape of what CDD sends:

```jsonc
{
  "eln_entry": {
    "identifier": "EXP-123",
    "title": "My experiment",
    "feature_map": {
      "f1": {
        "type": "reaction",
        "id": 42,
        "data": {
          "stoichiometryTable": {
            "rows": [
              {
                "uid": "row-1",
                "role": "reactant",
                "sample": {
                  "id": 999,
                  "sample_identifier": "SAMPLE-A",
                  "location": { "value": "Freezer 1 > Box 3" },
                  "batch_fields": { "Purity (%)": 98, "Density [g/mL]": 1.04 },
                  "inventory_sample_fields": { "Concentration": 10, "Solvent": "DMSO" }
                },
                "molecule": { "molecular_formula": "C9H8O4", "molecular_weight": 180.16 }
              }
            ]
          }
        }
      }
    }
  }
}
```

The pipeline (each arrow is a real function — see the sequence diagram for the
full version):

```
CDD JSON
  │  inject/hooks/fetch-hook.js & xhr-hook.js     capture the response
  ▼
inject/main.js  processJsonPayload(data)
  │  common.js isElnPayload? hasAnyReactionFeature?
  ▼
inject/parsers/sample-data.js  extractAllReactionRows(data)
  │  for each reaction → each row that has row.sample:
  │     field-resolvers.js turns the nested row into flat values
  ▼
flatSample  { name, purity, density, concentration, molecularFormula, … }
  │  bus.js post("SAMPLE_DATA", { reactionCount, samples:[flatSample…] })
  │  window.postMessage  ───────────────►  CONTENT world
  ▼
content/message-router.js  → STATE.lastPayload → sample-panel.js renderFromState()
  │  for each enabled field in the registry:
  │     shared/sample-panel-fields.js resolveFieldValue(field, sample)
  ▼
one panel row:  "Label: value"   (click to copy)
```

**Key idea:** the messy "where is this value hidden in CDD's JSON" work happens
**once**, in the inject parsers. The panel never sees CDD's nested shape — it only
sees the **flat** `flatSample` object. So adding a field is really two questions:

1. *How do I pull the value out of CDD's JSON?* → field-resolvers.js
2. *How do I declare it so the UI shows it?* → sample-panel-fields.js

---

## 2. Where field-resolvers extract values

File: **`src/inject/parsers/field-resolvers.js`**. This is the only place that
knows CDD's data shapes. It is grouped by *source*:

- `resolveBatchFields(row)` → `{ purity, density, internalID }`
- `resolveSampleFields(row)` → `{ concentration, concentrationUnits, solvent }`
- `resolveMoleculeFields(row)` → `{ moleculeName, molecularFormula, molecularWeight, formulaWeight, … }`
- `resolveIdentityFields(row)` → `{ batchName, vendorId, owner, project, … }`
- `resolveQuantityFields(row)` → `{ amount, amountUnit, volume, mass }`

Two helpers do the heavy lifting and are the ones you'll reuse:

### `getFieldValueCaseInsensitive(fieldMap, candidateNames)`
CDD names the same field differently across vaults (`"Purity (%)"`,
`"*Purity [%]"`, `"Purity"`…). This helper tries a **list of candidate names**,
case-insensitively, and unwraps `{ value: … }` wrappers. Example from the code:

```js
const purity = getFieldValueCaseInsensitive(batchFields, [
    "Purity (%)", "Purity [%]", "*Purity [%]", "Purity[%]",
    "*Purity[%]", "Purity %", "Purity",
]);
```

### `getBatchFields(row)` / `getSampleFields(row)`
CDD nests the custom-field maps in several possible places. These helpers find
them regardless:

```js
export function getBatchFields(row) {
    return (
        row?.sample?.batch_fields ||
        row?.batch_fields ||
        row?.batch?.batch_fields ||
        row?.sample?.batch?.batch_fields ||
        {}
    );
}
```

**Rule of thumb for a new field:** decide *where* CDD stores it (batch field?
sample field? molecule property?), then add a `getFieldValueCaseInsensitive(...)`
call into the matching resolver with every label spelling you can find.

> Every resolver is **best-effort**: it returns `null` when the value is missing.
> A `null` field simply produces no row — it never errors. Keep that contract.

---

## 3. How flatSample is built

File: **`src/inject/parsers/sample-data.js`**,
function `extractRowsFromReactionFeature`. It calls each resolver and **spreads**
the results into one flat object:

```js
const batchFields    = resolveBatchFields(row);
const sampleFields   = resolveSampleFields(row);
const moleculeFields = resolveMoleculeFields(row);
const identityFields = resolveIdentityFields(row);
const quantityFields = resolveQuantityFields(row);

output.push({
    reactionIndex,
    reactionLabel: `Reaction ${reactionIndex + 1}`,
    sampleId,
    name: resolveRowName(row),
    location: resolveRowLocation(row),
    ...batchFields,      // purity, density, internalID
    ...sampleFields,     // concentration, concentrationUnits, solvent
    ...moleculeFields,   // moleculeName, molecularFormula, molecularWeight, …
    ...identityFields,   // batchName, vendorId, owner, …
    ...quantityFields,   // amount, amountUnit, volume, mass
    customBatchFields:  collectCustomFields(getBatchFields(row)),
    customSampleFields: collectCustomFields(getSampleFields(row)),
});
```

So a new value reaches `flatSample` in one of two ways:

- **Add a key to an existing resolver's return object** (e.g. add `cas` to
  `resolveBatchFields`). Because the result is spread, it appears on `flatSample`
  automatically. ← simplest, preferred.
- **Add a brand-new resolver** and spread it here. Only needed if it doesn't fit
  any existing group.

The resulting `flatSample` is what crosses into the content world. **The property
name you use here is the name the registry will read.**

---

## 4. How `sample-panel-fields.js` exposes fields

File: **`src/shared/sample-panel-fields.js`** — the central **registry**. It is
deliberately DOM-free and import-free, because it is used by **both** the in-page
panel **and** the popup. Each entry in `SAMPLE_PANEL_FIELDS` is one field:

```js
{
    key: "purity",            // unique id; ALSO the chrome.storage on/off flag
    label: "Purity [%]",      // text shown in the panel and the popup checkbox
    source: "batch",          // informational only: sample | batch | molecule | computed
    defaultEnabled: true,     // shown when the user has no saved preference
    get: (s) => s?.purity,    // read the value from flatSample (s)
    highlight: (_v, s) => isLowPurity(s), // optional → render the value in red
}
```

Optional hooks each entry may add:

| Hook | Purpose | Returns |
| --- | --- | --- |
| `get(sample)` | read the raw value from `flatSample` | raw value or `null`/`""` (→ row skipped) |
| `format(value, sample)` | format for display | display string |
| `copyValue(sample)` | override the click-to-copy text | string |
| `highlight(value, sample)` | render the value red | boolean |

How it is consumed:

- **Panel** (`sample-panel.js` → `renderConfiguredFields`): iterates
  `SAMPLE_PANEL_FIELDS`, skips fields not enabled in `visibleFields`, and calls
  `resolveFieldValue(field, sample)` which runs `get` → `format` → `copyValue` →
  `highlight`, all wrapped in try/catch (it **never throws**).
- **Popup** (`popup.js`): iterates the *same* `SAMPLE_PANEL_FIELDS` and renders a
  checkbox per field. **This is why you never edit the popup for a static field —
  it reads the registry.**

`resolveFieldValue` returns `{ text, copyValue, highlight }` or `null`. `null`
means "this sample has no value for this field" → the row is omitted.

### How a new static field becomes visible without extra wiring

`getSamplePanelSettings()` reads the saved on/off map and **merges it over the
registry defaults**:

```js
const merged = { ...getDefaultVisibleFields() };  // includes your new field's defaultEnabled
for (const [key, value] of Object.entries(stored)) {
    if (typeof value === "boolean") merged[key] = value;
}
```

So a newly added static field appears immediately with its `defaultEnabled`
value, even for users who already have saved settings. No migration needed.

---

## 5. How popup settings discover fields

File: **`src/popup/popup.js`**. Two lists are rendered:

1. **Static fields** — `SAMPLE_PANEL_FIELDS.map(field → checkbox)`. Automatic; no
   action needed when you add a static field.
2. **Custom fields** — `renderCustomFieldsSection(...)`, populated from whatever
   the content script has *discovered and persisted* (see §6).

Toggling a checkbox writes the whole visible-field map back:

```js
const onToggle = (key, checked) => {
    visibleMap[key] = checked;
    saveSamplePanelSettings(visibleMap);   // → chrome.storage.local
};
```

The content panel listens via `chrome.storage.onChanged` (in
`initSamplePanelFields`) and re-renders. **Note:** the change takes effect the
next time the ELN page is rendered/refreshed (the popup is a separate page).

---

## 6. How custom fields are persisted

You usually **don't write code** for vault-specific fields — they ride the
custom-field pipeline:

1. **Capture:** `field-resolvers.js collectCustomFields(getBatchFields/
   getSampleFields)` turns CDD's `batch_fields` / sample-field maps into flat
   `{ name → value }` maps on `flatSample.customBatchFields` /
   `customSampleFields`.
2. **Discover:** when the panel renders, `sample-panel.js
   persistDiscoveredCustomFields(samples)` calls `discoverCustomFields(samples)`
   (union of all custom-field names) and merges them into the stored list with a
   `lastSeen` timestamp (`touchSeenCustomFields`).
3. **Persist:** the list is saved under
   `chrome.storage.local["cddSamplePanelCustomFields"]` (a **different** key than
   the on/off settings — on purpose, so saving discoveries doesn't re-trigger the
   settings listener and cause a render loop).
4. **Lifecycle:** `pruneExpiredCustomFields(list, enabledMap, now)` drops fields
   not seen for **120 days** (`CUSTOM_FIELD_TTL_MS`) — **unless** they are
   currently enabled (an enabled field is never removed).
5. **Offer:** the popup renders these as checkboxes under "Custom fields (from
   your vault)". Their keys are prefixed `bf:` (batch) or `sf:` (sample).

> **Decision rule:** if the field is a standard CDD attribute you want available
> in *every* vault with a clean label and maybe special formatting → make it a
> **static** field (this guide). If it is vault-specific and "whatever CDD calls
> it" is fine → do **nothing**; it will appear as a custom-field checkbox once an
> ELN reaction containing it has been opened.

---

## 7. Worked examples

### Example A — Molecular Formula (already wired: the reference path)

Molecular Formula is **already supported** — use it to see a complete, working
field end-to-end.

1. **Resolver** (`field-resolvers.js`, inside `resolveMoleculeFields`):
   ```js
   molecularFormula:
       row?.formula || molecule.molecular_formula || molecule.formula || null,
   ```
2. **flatSample** (`sample-data.js`): included via `...moleculeFields`, so
   `flatSample.molecularFormula` exists.
3. **Registry** (`sample-panel-fields.js`):
   ```js
   {
       key: "molecularFormula",
       label: "Molecular formula",
       source: "molecule",
       defaultEnabled: false,        // off by default; user enables it in the popup
       get: (s) => s?.molecularFormula,
   }
   ```
4. **Popup + panel:** automatic. Enable "Molecular formula" in the popup, refresh
   the ELN page, and the row appears.

Nothing to do — this is what a finished static field looks like.

### Example B — CAS Number (a genuinely new static field)

Goal: show **CAS: 50-78-2** on each card. Assume CAS lives in CDD's batch fields
(common case) under a few possible label spellings.

**Step 1 — extract it** in `field-resolvers.js`. Add it to `resolveBatchFields`:

```js
export function resolveBatchFields(row) {
    const batchFields = getBatchFields(row);

    const purity = getFieldValueCaseInsensitive(batchFields, [ /* … */ ]);
    const internalID = getFieldValueCaseInsensitive(batchFields, [ /* … */ ]);
    const density = getFieldValueCaseInsensitive(batchFields, [ /* … */ ]);

    // NEW: CAS number — list every spelling you have seen in your vault(s)
    const cas = getFieldValueCaseInsensitive(batchFields, [
        "CAS Number", "*CAS Number", "CAS #", "CAS No", "CAS No.", "CAS",
    ]);

    return { purity, density, internalID, cas };   // ← add `cas`
}
```

Because `resolveBatchFields`'s result is spread into `flatSample`
(`...batchFields` in `sample-data.js`), `flatSample.cas` now exists. **No change
to `sample-data.js` is needed** — you reused an existing resolver.

**Step 2 — declare it** in `sample-panel-fields.js`. Add an entry to
`SAMPLE_PANEL_FIELDS`:

```js
{
    key: "cas",                 // must match the flatSample property name
    label: "CAS Number",
    source: "batch",
    defaultEnabled: false,      // optional field, off by default
    get: (s) => s?.cas,
},
```

**Step 3 — build & verify.** Run `npm run build`, reload the unpacked extension,
open an ELN reaction page, enable "CAS Number" in the popup, refresh. Done — the
popup checkbox and the panel row appear automatically.

> If CAS turns out to be a **molecule** property instead of a batch field, put the
> resolver in `resolveMoleculeFields` and read from `molecule.cas` /
> `row?.cas` instead — the registry step is identical.

### Example C — Storage Temperature (formatting + the static-vs-custom choice)

"Storage temperature" is usually a **sample/batch field**. You have two routes:

**Route 1 — do nothing (custom field).** If `Storage Temperature` already arrives
in CDD's `batch_fields` / sample fields, it is captured by `collectCustomFields`
automatically. Open an ELN reaction once; then in the popup, under "Custom fields
(from your vault)", tick **Storage Temperature**. No code, no build. Choose this
if the raw CDD label and value are good enough.

**Route 2 — make it a first-class static field with a unit suffix.** Choose this
if you want a clean fixed label and formatting (e.g. always show `°C`).

**Step 1 — extract** (`field-resolvers.js`). It is a sample-level condition, so
add it to `resolveSampleFields`:

```js
export function resolveSampleFields(row) {
    const sampleFields = getSampleFields(row);

    const concentration = getFieldValueCaseInsensitive(sampleFields, [ /* … */ ]);
    const solvent = getFieldValueCaseInsensitive(sampleFields, [ /* … */ ]);
    const concentrationUnits = getFieldValueCaseInsensitive(sampleFields, [ /* … */ ]);

    // NEW
    const storageTemperature = getFieldValueCaseInsensitive(sampleFields, [
        "Storage Temperature", "*Storage Temperature",
        "Storage Temp", "Storage temp (°C)", "Storage Conditions",
    ]);

    return { concentration, concentrationUnits, solvent, storageTemperature };
}
```

`flatSample.storageTemperature` now exists (spread via `...sampleFields`).

**Step 2 — declare with formatting** (`sample-panel-fields.js`). This shows the
optional `format` and `highlight` hooks:

```js
{
    key: "storageTemperature",
    label: "Storage temp",
    source: "sample",
    defaultEnabled: false,
    get: (s) => s?.storageTemperature,
    // Append "°C" unless the value already carries a unit.
    format: (v) => /[°cCfF]/.test(String(v)) ? String(v) : `${v} °C`,
    // Example: warn (red) if a cold-chain sample is stored too warm.
    highlight: (v) => {
        const n = parseFloat(String(v).replace(",", "."));
        return Number.isFinite(n) && n > 8;
    },
},
```

**Step 3 — build & verify** (same as Example B).

> **Which route?** Custom (Route 1) = zero maintenance, but the label/format is
> whatever CDD uses and it only appears after data with that field has loaded.
> Static (Route 2) = a stable label, formatting, highlighting, and a default
> on/off state — at the cost of three small code edits and a build.

---

## 8. Checklist & gotchas

**Checklist for a new static field**
- [ ] Resolver added in the right group in `field-resolvers.js`, with **all**
      label spellings, returning `null` when absent.
- [ ] If you made a *new* resolver, spread it in `sample-data.js`
      `extractRowsFromReactionFeature`.
- [ ] Registry entry in `sample-panel-fields.js`: unique `key` **matching the
      flatSample property**, `label`, `source`, `defaultEnabled`, `get`.
- [ ] (Optional) `format` / `copyValue` / `highlight`.
- [ ] `npm run build`, reload the unpacked extension, **refresh the ELN page**.
- [ ] Enable the field in the popup; confirm the row appears and copy works.

**Gotchas**
- **`key` must be unique and stable** — it is also the `chrome.storage` flag.
  Renaming a key silently resets that field's saved on/off state for users.
- **Don't render objects.** `resolveFieldValue` returns `null` for object values
  on purpose (so cards never show `[object Object]`). Resolve to a primitive in
  the resolver (the helpers already unwrap `{ value }`).
- **Empty ≠ shown.** A field that resolves to `null`/`""` produces no row, even if
  enabled. An empty panel usually means the value isn't in CDD's payload, not a
  bug.
- **The inject side can't read `chrome.storage`.** Field *selection* is a content/
  popup concern; the inject parsers always extract everything and let the content
  side decide what to show.
- **Settings apply after a refresh.** The popup and the page are different
  contexts; the panel re-renders on the next ELN render, not instantly.
- **No tests today.** `field-resolvers.js` is the riskiest file and is untested
  (see Architecture Review §8/§10). After adding a resolver, verify against a real
  ELN payload, and consider adding a unit test for your resolver — the resolvers
  are pure functions and easy to test.
</content>
