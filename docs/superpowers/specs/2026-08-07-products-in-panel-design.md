# Products in the Samples panel & print — design

Date: 2026-08-07
Status: approved by user (conversation), incl. proceeding to plan

## Problem

The CDD Samples panel and the print sheet only cover reagents; product
rows of each reaction are skipped by both parsers. The user wants
products visible (clearly labeled) and exportable — but strictly opt-in.

## Decisions (from brainstorming)

- **Optional**: options checkbox, default OFF — behaviour unchanged until
  enabled.
- **Product cards use the same configurable field list as reagent cards**
  (the panel-fields settings apply to them too).
- **Print**: each reaction gains a separate "Products" section with the
  same columns; the bulk lettered A/B/C pair blocks already contain their
  products and stay unchanged.
- Products are display-only in v1: **no fill buttons, no density-memory
  capture, no batch-field enrichment, no NO SAMPLE quotes** for product
  rows.

## Components

### 1 · `src/shared/show-products-flag.js` (new)

Key `cddShowProducts`, default `false`. Async `getShowProducts()` /
`saveShowProducts(v)` for the options page; sync cached
`isShowProductsEnabled()` + `initShowProducts()` +
`onShowProductsChanged(cb)` for the content script (same pattern as
`purity-threshold.js`). Content init re-renders panel (and print uses the
live value at build time).

### 2 · Parser — `src/inject/parsers/sample-data.js`

Emit product rows instead of skipping them:

- keep all existing fields; product rows without a batch id are allowed
  (identity comes from the molecule) as long as they resolve a name;
- products keep their `role`, and rows get `isProduct` (role is
  `product`/`parallelproduct`, case-insensitive) so consumers don't
  re-derive it;
- `rowNumber` continues to work (products are the third display group).

`src/inject/parsers/print-data.js`: drop the product filter in
`extractRows` — rows carry `role` already; the content-side print builder
decides.

### 3 · Content guards

- `captureValuesFromSamples`: skip `isProduct` rows.
- `computeFillOffers`: return `[]` for `isProduct` rows.
- `batch-field-enrichment`: skip `isProduct` rows (no useless molecule
  fetches).

### 4 · Panel — `sample-panel.js`

When the flag is ON, each reaction group renders its product cards at the
end under a small "Products" divider:

- green `PRODUCT` badge (new style, analogous to the amber NO SAMPLE
  badge);
- fields via the existing `renderConfiguredFields(sample)`;
- no fill buttons/notices, no quotes, no NO SAMPLE badge.

When OFF, product samples are filtered out of rendering and of the group
counts ("N sample(s)"), and `updateFillAllButton` naturally sees no
product offers (computeFillOffers guard).

### 5 · Print — content-side builders

Where the print sheet assembles per-reaction tables from
`STATE.reactionPayloads`, rows with a product role are excluded as today
when the flag is OFF; when ON they render as a separate "Products"
section after the reagent rows of that reaction, same columns. Lettered
bulk pair blocks are untouched. (Exact insertion point located during
planning in `print-buttons.js` / `panel-print.js`.)

### 6 · Options

Checkbox "Show products in the panel and print sheet" in the
**Remembered batch values** card is the wrong home — it belongs in the
**Panel fields** card (it changes what the panel shows). Saves on change,
live refresh.

## Edge cases

- Product with a real registered batch: still display-only in v1.
- Variable products (bulk): appear only via their lettered pair blocks in
  print (unchanged); in the panel they are product rows like any other.
- Payload dedupe: product rows without batch and sample get a dedupe key
  from `rowUid`.

## Verification

`npm run build` + live on entry 2504170: checkbox OFF → identical
behaviour (incl. print); ON → product cards labeled PRODUCT with the
configured fields in all three reactions, print sheet shows a Products
section per reaction, no fill buttons/capture on products. Release
prepared as 12.6.0 together with the purity thresholds; tag pushed only
after explicit user approval.
