# Synonym field in the ELN sample panel — design

Date: 2026-08-19
Status: approved by user (conversation), incl. proceeding to plan

## Problem

The floating ELN sample panel shows the attributes listed in the **Panel
fields** settings card, but a molecule's *synonym* is not one of them.
The user wants it there — e.g. entry `/vaults/6884/eln/entries/2504170`,
where the product `PRO-000017` carries a synonym that the panel cannot
show today. A molecule may have N synonyms; only the **first** one is
wanted.

The synonym is not in the ELN payload. CDD only exposes it on the
molecule page (`/vaults/<vault>/molecules/<id>`), in the `Synonyms` row
of the molecule definition list. Showing it therefore costs one HTML GET
per distinct molecule in the entry.

## Existing machinery

`extractSynonym(doc)` in `src/content/api/molecule-image.js:120` already
parses that row and already returns only the first synonym — it turns
`<br>` separators into real ones and splits on `[,;]` **followed by
whitespace**, so names like `N,N-diethylhydroxylamine` survive intact.
Nothing new has to be parsed; the value just has to reach the panel.

Three modules currently fetch the same molecule page, each with its own
cache: `api/molecule-image.js` (SVG + synonym, inventory hover),
`api/batch-fields.js` (synonym + batch fields, heat-map hover) and
`features/batch-field-enrichment.js` (batch fields, panel).

## Decisions (from brainstorming)

- **Opt-in, default OFF.** The row is a normal Panel-fields checkbox.
  While it is off, not a single extra request is made — the enrichment
  bails out before touching the network.
- **First synonym only**, via the existing `extractSynonym`.
- **All cards, products included.** The motivating case is a product
  (`PRO-000017`), so the product skip that `batch-field-enrichment.js`
  applies must NOT be copied here. Mentions are covered too.
- **No SVG rendering.** Reusing `getMoleculeData()` would pay a
  SMILES→SVG render (`smiles-drawer`) per molecule for a value the panel
  does not use; a fetch-and-parse-only path is used instead.
- **Missing synonym renders nothing**, per the field-registry convention
  (`resolveFieldValue` skips `null`/`""`) — no `—` placeholder row.

## Components

### 1 · `src/shared/sample-panel-fields.js`

New entry in the optional (off-by-default) part of `SAMPLE_PANEL_FIELDS`,
next to `moleculeName`:

```js
{
    key: "synonym",
    label: "Synonym",
    source: "molecule",
    defaultEnabled: false,
    get: (s) => s?.synonym,
}
```

Everything downstream is derived from this registry, so the field arrives
for free in:

- the **Panel fields** checkbox list (`src/options/options.js:160`),
- the panel rows (`sample-panel.js:800`),
- the print sheets (`panel-print.js:18`),
- the CSV export (`panel-csv.js`).

### 2 · `src/content/api/molecule-page.js` (new)

A thin shared accessor for the molecule page:

- `getMoleculePage(vaultId, moleculeId)` → cached `Promise<Document|null>`,
  one fetch per `${vaultId}:${moleculeId}` per session, failures evicted
  from the cache so a later payload can retry (same contract as
  `batch-fields.js`).
- `getMoleculeSynonym(vaultId, moleculeId)` → `Promise<string|null>`,
  `extractSynonym` applied to that document.

`extractSynonym` stays exported from `molecule-image.js`; this module
imports it rather than duplicating the parser.

### 3 · `src/content/features/synonym-enrichment.js` (new)

Mirrors `batch-field-enrichment.js`:

- `enrichSampleSynonyms()` returns immediately unless the `synonym` field
  is enabled in the panel settings — this is the gate that keeps the
  feature free for everyone who leaves it off.
- Collects every sample with a `moleculeId` that has no `synonym` and no
  `synonymFetched` marker. **Products and mentions are included.**
- Vault id: the page's vault from the URL (`/vaults/(\d+)/`). Mention
  samples do not carry their own `vaultId`, and CDD redirects a molecule
  request to the molecule's home vault transparently, which is what
  `batch-field-enrichment.js` already relies on.
- Groups targets by `moleculeId` so one fetch serves every card of the
  same molecule; sets `sample.synonym` and `sample.synonymFetched = true`
  (the marker is set even when the page carries no synonym, so a missing
  value is never re-fetched).
- Re-renders through `renderFromState()` **only if** `STATE.lastPayload`
  is still the payload the enrichment started from.

Visibility of the field is read from the same source the panel uses, so
the gate and the rendering never disagree.

### 4 · `src/content/message-router.js`

Call `enrichSampleSynonyms()` next to `enrichBatchOnlySamples()` in the
`SAMPLE_DATA` case.

### 5 · Reacting to the checkbox

`sample-panel.js` already re-renders when the panel-field settings
change. The same path calls `enrichSampleSynonyms()`, so ticking the box
fetches the synonyms for the entry that is already on screen instead of
leaving an empty column until the next entry is opened.

## Error handling

A failed or non-OK molecule fetch resolves to `null`: the sample keeps no
synonym, its row is skipped, and the cache entry is evicted so the next
payload may retry. Nothing throws into the render path, and a molecule
without a `Synonyms` row is an ordinary empty result, not an error.

## Testing

The project has no test runner; verification is the usual reload-test
loop:

1. `npm run build`, reload the extension.
2. Open `/vaults/6884/eln/entries/2504170` with **Synonym** unchecked —
   the Network panel must show no extra `/molecules/<id>` requests.
3. Tick **Synonym** in Panel fields — the rows appear on the entry that is
   already open, `PRO-000017` among them.
4. Confirm the same value reaches the print sheet and the CSV export, and
   that a molecule with several synonyms shows only the first.

## Out of scope

Migrating the three existing molecule-page fetchers onto the new shared
cache. `batch-field-enrichment.js` is the natural first candidate, but it
parses `RegistrationFormRenderer` props rather than the definition list
and touching it is not needed for this feature.
