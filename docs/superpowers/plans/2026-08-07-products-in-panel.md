# Products in Panel & Print Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Opt-in (options checkbox, default OFF) display of reaction product rows in the CDD Samples panel — labeled PRODUCT, same configurable fields as reagents — and in both print flows.

**Architecture:** The inject parsers stop filtering products and mark rows with `isProduct`; ALL gating happens content-side against a new cached flag (`show-products-flag.js`, same pattern as `purity-threshold.js`). Products are display-only: capture, fill offers and batch-field enrichment skip them.

**Tech Stack:** Vanilla JS MV3 extension, Vite build, `chrome.storage.local`. No test framework — verify with `npm run build` + live walkthrough on entry 2504170.

**Spec:** `docs/superpowers/specs/2026-08-07-products-in-panel-design.md`

## Global Constraints

- Default OFF ⇒ behaviour and print output byte-for-byte identical to today.
- Product = role `product` or `parallelproduct` (case-insensitive), carried as `sample.isProduct`.
- Products are display-only in v1: no fill buttons, no density-memory capture, no enrichment, no NO SAMPLE quotes/badges.
- Work continues on the current `purity-threshold` branch — release 12.6.0 bundles both features; the tag is pushed only after explicit user approval.
- Shared modules stay DOM-free. UI copy in English.

---

### Task 1: The flag module + options checkbox

**Files:**
- Create: `src/shared/show-products-flag.js`
- Modify: `src/options/options.html` (Panel fields card), `src/options/options.js`

**Interfaces:**
- Produces: `SHOW_PRODUCTS_STORAGE_KEY`, `getShowProducts(): Promise<boolean>`, `saveShowProducts(v)`, sync `isShowProductsEnabled()`, `initShowProducts(): Promise<boolean>`, `onShowProductsChanged(cb) → unsubscribe`.

- [ ] **Step 1: `show-products-flag.js`**

```js
// shared/show-products-flag.js — opt-in display of reaction PRODUCT rows
// in the Samples panel and the print flows. DOM-free; options page uses
// the async pair, the content script the sync cache.

export const SHOW_PRODUCTS_STORAGE_KEY = "cddShowProducts";

export async function getShowProducts() {
    try {
        const result = await chrome.storage.local.get(SHOW_PRODUCTS_STORAGE_KEY);
        return result?.[SHOW_PRODUCTS_STORAGE_KEY] === true;
    } catch {
        return false;
    }
}

export async function saveShowProducts(value) {
    try {
        await chrome.storage.local.set({ [SHOW_PRODUCTS_STORAGE_KEY]: value === true });
    } catch {
        // Orphaned content script — nothing useful to do.
    }
}

let cached = false;
let listenerAttached = false;
const changeListeners = new Set();

function notify() {
    for (const cb of changeListeners) {
        try { cb(cached); } catch { /* keep the others alive */ }
    }
}

export function isShowProductsEnabled() {
    return cached;
}

export function onShowProductsChanged(cb) {
    changeListeners.add(cb);
    return () => changeListeners.delete(cb);
}

export async function initShowProducts() {
    if (!listenerAttached && chrome?.storage?.onChanged) {
        listenerAttached = true;
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== "local" || !changes[SHOW_PRODUCTS_STORAGE_KEY]) return;
            cached = changes[SHOW_PRODUCTS_STORAGE_KEY].newValue === true;
            notify();
        });
    }
    cached = await getShowProducts();
    notify();
    return cached;
}
```

- [ ] **Step 2: options checkbox** — in `options.html`, inside the Panel
fields card (`aria-labelledby="col-fields-heading"`), directly after the
`<div id="samplePanelCustomFields" class="stack"></div>` line:

```html
            <label class="field-item show-products-toggle">
                <input type="checkbox" id="showProducts" />
                <span>Show <strong>products</strong> of each reaction in the
                panel and in the print sheets (display only — no fill
                buttons, no remembered values)</span>
            </label>
```

In `options.js`: add
`import { getShowProducts, saveShowProducts } from "../shared/show-products-flag.js";`
and next to the other section-2 code:

```js
const showProductsCheckbox = document.getElementById("showProducts");

showProductsCheckbox.addEventListener("change", () => {
    saveShowProducts(showProductsCheckbox.checked);
});

async function initShowProductsUI() {
    showProductsCheckbox.checked = await getShowProducts();
}
```

Add `initShowProductsUI();` to the init calls at the bottom.

- [ ] **Step 3:** `npm run build` — exit 0.
- [ ] **Step 4: Commit**

```bash
git add src/shared/show-products-flag.js src/options/options.html src/options/options.js
git commit -m "Options: opt-in show-products flag (default off)"
```

---

### Task 2: Parsers emit products

**Files:**
- Modify: `src/inject/parsers/sample-data.js` (the `!hasSample` skip block; the output object)
- Modify: `src/inject/parsers/print-data.js:94-100` (`extractRows` filter)

**Interfaces:**
- Produces: `sample.isProduct: boolean` on every panel sample; print rows keep `role` (already present) and now include product rows.

- [ ] **Step 1: `sample-data.js`** — replace the skip block

```js
        if (!hasSample) {
            if (!rowBatchId) continue;
            if (role === "product" || role === "parallelproduct") continue;
        }
```

with:

```js
        const isProduct = role === "product" || role === "parallelproduct";

        // Rows without a sample are still worth a card when they carry a
        // registered batch — or when they are PRODUCTS, which often have
        // neither sample nor batch ("Unspecified Batch"): their identity
        // comes from the molecule. Display gating happens content-side.
        if (!hasSample && !isProduct && !rowBatchId) continue;
        if (isProduct && !rowBatchId && !row?.moleculeName && !rowUid) continue;
```

NOTE: `rowUid` is currently read AFTER this block — move the
`const rowUid = row?.uid ?? null;` line above it. Add `isProduct,` to the
`output.push({...})` object (next to `hasSample`).

- [ ] **Step 2: `print-data.js`** — in `extractRows`, delete the
`.filter(...)` so it is just `return rows.map(resolveRowData);` (the
role rides along; the content-side builder decides).

- [ ] **Step 3:** `npm run build` — exit 0.
- [ ] **Step 4: Commit**

```bash
git add src/inject/parsers/sample-data.js src/inject/parsers/print-data.js
git commit -m "Parsers emit product rows with isProduct/role; gating moves content-side"
```

---

### Task 3: Display-only guards

**Files:**
- Modify: `src/shared/density-memory.js` (`captureValuesFromSamples`)
- Modify: `src/content/features/fill-offers.js` (`computeFillOffers`)
- Modify: `src/content/features/batch-field-enrichment.js` (targets loop)

- [ ] **Step 1:** In `captureValuesFromSamples`, right after
`if (!sample?.batchId) continue;` add:

```js
        if (sample.isProduct) continue;   // products are display-only
```

- [ ] **Step 2:** First line of `computeFillOffers`:

```js
    if (sample?.isProduct) return [];   // products are display-only
```

(before the existing `const offers = [];`).

- [ ] **Step 3:** In `enrichBatchOnlySamples`'s target loop, after
`if (sample?.hasSample !== false) continue;` add:

```js
        if (sample.isProduct) continue;   // no metafield fetches for products
```

- [ ] **Step 4:** `npm run build` — exit 0.
- [ ] **Step 5: Commit**

```bash
git add src/shared/density-memory.js src/content/features/fill-offers.js src/content/features/batch-field-enrichment.js
git commit -m "Products are display-only: no capture, no offers, no enrichment"
```

---

### Task 4: Panel rendering

**Files:**
- Modify: `src/content/features/sample-panel.js` (imports, `renderSamples`, styles)
- Modify: `src/content/main.js` (init + live re-render)

**Interfaces:**
- Consumes: `isShowProductsEnabled`, `initShowProducts`, `onShowProductsChanged` (Task 1); `sample.isProduct` (Task 2).

- [ ] **Step 1: imports & init** — `sample-panel.js`: add
`import { isShowProductsEnabled } from "../../shared/show-products-flag.js";`
`main.js`: add
`import {initShowProducts, onShowProductsChanged} from "../shared/show-products-flag.js";`
and next to the purity-threshold init:

```js
  initShowProducts().then(() => {
    onShowProductsChanged(() => renderFromState());
  });
```

- [ ] **Step 2: group partition** — in `renderSamples`, replace the group
items loop header. After `const groups = groupSamplesByReaction(samples);`
nothing changes, but inside the per-group code replace

```js
        const groupCount = document.createElement("span");
        groupCount.className = "cdd-stoich-group-count";
        groupCount.textContent = `${group.items.length} sample(s)`;
```

with:

```js
        const showProducts = isShowProductsEnabled();
        const regulars = group.items.filter((s) => !s.isProduct);
        const products = showProducts ? group.items.filter((s) => s.isProduct) : [];

        const groupCount = document.createElement("span");
        groupCount.className = "cdd-stoich-group-count";
        groupCount.textContent = `${regulars.length} sample(s)` +
            (products.length ? ` · ${products.length} product(s)` : "");
```

and change the card loop from `for (const sample of group.items) {` to
`for (const sample of regulars) {` (existing body unchanged).

- [ ] **Step 3: product cards** — after the regulars loop (still inside
the group loop, before `groupEl.appendChild(groupHeader);`):

```js
        if (products.length) {
            const divider = document.createElement("div");
            divider.className = "cdd-products-divider";
            divider.textContent = "Products";
            groupBody.appendChild(divider);

            for (const sample of products) {
                const card = document.createElement("div");
                card.className = "cdd-stoich-card";
                card.style.borderLeftColor = color.border;
                card.style.boxShadow = `0 0 0 1px ${color.glow} inset`;

                const cardTop = document.createElement("div");
                cardTop.className = "cdd-stoich-card-top";

                const badge = document.createElement("div");
                badge.className = "cdd-stoich-reaction-badge";
                badge.style.background = color.badgeBg;
                badge.style.color = color.badgeText;
                badge.textContent = group.reactionLabel;
                cardTop.appendChild(badge);

                const productBadge = document.createElement("div");
                productBadge.className = "cdd-product-badge";
                productBadge.textContent = "PRODUCT";
                cardTop.appendChild(productBadge);

                card.appendChild(cardTop);

                for (const rowEl of renderConfiguredFields(sample)) {
                    card.appendChild(rowEl);
                }

                groupBody.appendChild(card);
            }
        }
```

- [ ] **Step 4: styles** — in the panel style block, after the
`.cdd-density-memory-note` rule:

```css
  #${PANEL_ID} .cdd-product-badge {
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.4px;
    background: rgba(74, 222, 128, 0.15);
    color: #4ade80;
    border: 1px solid rgba(74, 222, 128, 0.4);
  }

  #${PANEL_ID} .cdd-products-divider {
    margin: 8px 2px 2px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    color: #4ade80;
    opacity: 0.9;
  }
```

- [ ] **Step 5:** `npm run build` — exit 0.
- [ ] **Step 6: Commit**

```bash
git add src/content/features/sample-panel.js src/content/main.js
git commit -m "Panel: optional Products section per reaction group"
```

---

### Task 5: Print flows

**Files:**
- Modify: `src/content/features/print-buttons.js` (`buildPrintHtml`)
- Modify: `src/content/features/panel-print.js` (`printPanel`)

- [ ] **Step 1: per-reaction sheet** — `print-buttons.js`: add
`import { isShowProductsEnabled } from "../../shared/show-products-flag.js";`
In `buildPrintHtml`, replace

```js
    const { plainRows, pairs } = splitParallelPairs(rows);

    const rowsHtml = buildRowsHtml(plainRows);
```

with:

```js
    const { plainRows, pairs } = splitParallelPairs(rows);

    // The parser no longer filters products: keep them out of the
    // numbered reagent list always, and render them as their own section
    // only when the option is on.
    const isProductRow = (row) => String(row?.role || "").toLowerCase() === "product";
    const reagentRows = plainRows.filter((row) => !isProductRow(row));
    const productRows = isShowProductsEnabled()
        ? plainRows.filter(isProductRow)
        : [];

    const rowsHtml = buildRowsHtml(reagentRows);

    const productSectionHtml = productRows.length
        ? `
            <div class="pair-section-title">Products</div>
            <table>
              <tbody>
                ${productRows.map((row) => renderRowHtml(row, { roleTag: "Product" })).join("")}
              </tbody>
            </table>
          `
        : "";
```

Then find where `${rowsHtml}` is embedded in the returned template (the
main `<table><tbody>${rowsHtml}</tbody></table>`) and insert
`${productSectionHtml}` immediately after that table's closing
`</table>`, BEFORE `${pairSectionHtml}`.

- [ ] **Step 2: panel table print** — `panel-print.js`: add
`import { isShowProductsEnabled } from "../../shared/show-products-flag.js";`
In `printPanel`, replace `const samples = payload.samples;` with:

```js
    const showProducts = isShowProductsEnabled();
    const samples = payload.samples.filter((s) => showProducts || !s.isProduct);
    const anyProduct = samples.some((s) => s.isProduct);
```

Replace the header build with:

```js
    const headHtml = ["Reaction", ...(anyProduct ? ["Type"] : []), ...columns.map((c) => c.label)]
        .map((label) => `<th>${escapeHtml(label)}</th>`)
        .join("");
```

and the row cells with:

```js
            const cells = [
                sample.reactionLabel || "",
                ...(anyProduct ? [sample.isProduct ? "Product" : ""] : []),
                ...columns.map((column) => column.getText(sample, index)),
            ];
```

- [ ] **Step 3:** `npm run build` — exit 0.
- [ ] **Step 4: Commit**

```bash
git add src/content/features/print-buttons.js src/content/features/panel-print.js
git commit -m "Print: optional Products section per reaction; panel print gains a Type column"
```

---

### Task 6: Live verification (entry 2504170; user reloads the extension)

- [ ] **Step 1 (OFF):** default state — panel and both print outputs look
exactly as before (no product cards, no Products sections).
- [ ] **Step 2 (ON):** tick the checkbox → panel re-renders live; each
reaction group ends with a green "Products" divider and PRODUCT-badged
cards showing the configured fields; group header reads
`N sample(s) · M product(s)`.
- [ ] **Step 3:** product cards have NO fill buttons; options Remembered
batch values list gains no product entries.
- [ ] **Step 4:** per-reaction Print shows a "Products" section after the
reagents (bulk lettered blocks unchanged); the panel Print table lists
products with Type = Product.
- [ ] **Step 5:** commit any fix-forward findings.

---

### Task 7: Release 12.6.0 (purity thresholds + products)

- [ ] **Step 1:** Bump `manifest.json` to `12.6.0`; CHANGELOG entry:

```markdown
## [12.6.0] — 2026-08-07

### Added
- **Products in the panel & print (optional).** A Panel-fields checkbox
  (default off) shows each reaction's product rows as PRODUCT-labeled
  cards with the same configurable fields as reagents, and adds a
  Products section to the per-reaction print sheet and a Type column to
  the panel print table. Products are display-only: no fill buttons, no
  remembered values, no metafield fetches.
- **Purity thresholds.** Two independent settings (both default 93 %):
  purity fill offers appear only at or below the fill threshold (a batch
  purity above it stays authoritative and is never replaced by a
  remembered value), and the ⚠ LOW PURITY badge fires at or below the
  warning threshold instead of a hardcoded 93.
```

Matching plain-language entry in `RELEASES.md`.
- [ ] **Step 2:** `npm run build` — exit 0; commit on the branch.
- [ ] **Step 3:** `git checkout main && git merge --no-ff purity-threshold`;
`git tag v12.6.0`; `git push origin main`.
- [ ] **Step 4:** **STOP — ask the user before `git push origin v12.6.0`.**
