# ELN ID onto a product's existing batch — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One click on a product card writes the ELN entry ID into that
batch's *Internal ID*, directly from the ELN page, but only while the field
is empty.

**Architecture:** The samples panel already knows the product's `batchId`
and `moleculeId` from the intercepted ELN payload. The existing batch-field
enrichment pass is widened to cover products, which is how the panel learns
whether *Internal ID* is empty. The write itself never builds a request
body: a hidden same-origin iframe loads the molecule page, lets CDD render
its own Rails edit form with its own values and CSRF token, changes one
input, and posts that form's own `FormData` to its own action.

**Tech Stack:** Chrome MV3 content script bundled by vite; `chrome.storage.local`
with the `onChanged` sync-cache pattern; no test runner — pure logic is
checked with throwaway `node` scripts.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-21-eln-id-onto-product-batch-design.md`.
- The feature is **off by default** and gets a checkbox in the options page.
- **Never overwrite.** No button and no request when *Internal ID* is non-empty.
- **Products only.** Never a reactant.
- The field label is whatever `eln-id-carry` is configured for — never the
  literal `"Internal ID"` in new code. Match with `fieldLabelsMatch`.
- The target control is found by the id `specified_batch_<batchId>_field_<defId>`
  and by nothing else. A label or name match hits the *Add a batch* form.
- The written value is `applyIdentifierFormat(entryId, format)` +
  `tableSuffix(sample.reactionIndex)`.
- No request body is assembled by hand. Everything except the one field is
  CDD's own.
- `src/shared/` stays DOM-free — the options page imports from it.
- Every `chrome.storage.local.set` gets a `try/catch`, matching its siblings.
- Verify with `node --check <file>` and `npm run build` after every task;
  the options page is copied, not bundled, so a syntax error there does NOT
  fail the build.
- Do not push, tag, or release. Per `CLAUDE.md`, commits wait for the user.

---

### Task 1: `shared/eln-id-to-batch.js` — the flag, the settings cache, the pure helpers

**Files:**
- Create: `src/shared/eln-id-to-batch.js`
- Test: `<scratchpad>/check-eln-id-to-batch.mjs` (throwaway)

**Interfaces:**
- Consumes: `applyIdentifierFormat`, `tableSuffix`, `getElnIdCarrySettings`
  from `src/shared/eln-id-carry.js` (all already exported).
- Produces:
  - `ELN_ID_TO_BATCH_ENABLED_KEY: string`
  - `getElnIdToBatchEnabled(): Promise<boolean>`
  - `saveElnIdToBatchEnabled(value: boolean): Promise<void>`
  - `isElnIdToBatchEnabled(): boolean` — sync, cache-backed
  - `getCarrySettings(): { enabled: boolean, fieldLabel: string, format: string }` — sync
  - `onElnIdToBatchChanged(cb: (enabled: boolean) => void): () => void`
  - `initElnIdToBatch(): Promise<boolean>`
  - `batchFieldControlId(batchId, defId): string`
  - `batchEditAction(vaultId, batchId): string`
  - `moleculeBatchesUrl(vaultId, moleculeId): string`
  - `composeBatchElnId(entryId, format, reactionIndex): string`

- [ ] **Step 1: Write the file**

```js
// shared/eln-id-to-batch.js
//
// Writing the ELN entry ID onto a batch that ALREADY exists.
//
// eln-id-carry.js covers the compound you register FROM an entry. This covers
// the one registered first: a target with a molecule, a batch, no inventory
// sample and an empty Internal ID, which only becomes the product of an entry
// once someone actually makes it.
//
// Two caches live here, both read SYNCHRONOUSLY by the panel render:
//   1. this feature's own on/off flag;
//   2. a copy of eln-id-carry's { fieldLabel, format }, because the panel
//      cannot await storage while building a card.
//
// Keep this file free of DOM access — the options page imports it too.

import {
    ELN_ID_CARRY_ENABLED_KEY,
    ELN_ID_CARRY_FIELD_KEY,
    ELN_ID_FORMAT_KEY,
    DEFAULT_ELN_ID_CARRY_FIELD,
    DEFAULT_ELN_ID_FORMAT,
    getElnIdCarrySettings,
    applyIdentifierFormat,
    tableSuffix,
} from "./eln-id-carry.js";

// boolean — absent means OFF. This one writes to a batch record without
// asking a second time, so it must never appear because someone updated.
export const ELN_ID_TO_BATCH_ENABLED_KEY = "cddElnIdToBatchEnabled";

/* ------------------------------------------------------------------ *
 * Pure helpers — no storage, no DOM
 * ------------------------------------------------------------------ */

// The ONLY safe way to find the Internal ID control on a molecule page.
//
// The read-only page also carries an "Add a batch" form whose Internal ID
// control matches by label and by name, and filling THAT one would create a
// batch instead of editing one. The per-batch id is the thing that cannot be
// confused: specified_batch_<batchId>_field_<defId>.
export function batchFieldControlId(batchId, defId) {
    return `specified_batch_${batchId}_field_${defId}`;
}

// Where CDD's own edit form posts. Used only to sanity-check the action we
// read off the rendered form — never to build a request from scratch.
export function batchEditAction(vaultId, batchId) {
    return `/vaults/${vaultId}/specified_batches/${batchId}`;
}

// The batches tab. The `/specified_batches/<id>/edit` route server-redirects
// here and renders nothing editable, so the hash is what actually opens the
// form — React builds it in the browser.
export function moleculeBatchesUrl(vaultId, moleculeId) {
    return `/vaults/${vaultId}/molecules/${moleculeId}#molecule-batches`;
}

// The same string the Register link stamps, so a batch filled this way and
// one registered from the entry are indistinguishable.
//
// Trim first, THEN letter: the letter marks which stoichiometry table the
// product came from and belongs on the end of whatever the ID was cut to.
export function composeBatchElnId(entryId, format, reactionIndex) {
    const trimmed = applyIdentifierFormat(entryId, format);
    if (!trimmed) return "";
    return `${trimmed}${tableSuffix(reactionIndex)}`;
}

/* ------------------------------------------------------------------ *
 * Storage access
 * ------------------------------------------------------------------ */

export async function getElnIdToBatchEnabled() {
    try {
        const result = await chrome.storage.local.get(ELN_ID_TO_BATCH_ENABLED_KEY);
        return result?.[ELN_ID_TO_BATCH_ENABLED_KEY] === true;
    } catch {
        return false;
    }
}

export async function saveElnIdToBatchEnabled(value) {
    try {
        await chrome.storage.local.set({
            [ELN_ID_TO_BATCH_ENABLED_KEY]: value === true,
        });
    } catch {
        // Orphaned content script — nothing useful to do.
    }
}

/* ------------------------------------------------------------------ *
 * Sync caches for the panel render
 * ------------------------------------------------------------------ */

let enabledCache = false;
let carryCache = {
    enabled: true,
    fieldLabel: DEFAULT_ELN_ID_CARRY_FIELD,
    format: DEFAULT_ELN_ID_FORMAT,
};
let listenerAttached = false;
const changeListeners = new Set();

function notify() {
    for (const cb of changeListeners) {
        try {
            cb(enabledCache);
        } catch {
            /* a misbehaving listener must not break the others */
        }
    }
}

export function isElnIdToBatchEnabled() {
    return enabledCache;
}

export function getCarrySettings() {
    return carryCache;
}

export function onElnIdToBatchChanged(cb) {
    changeListeners.add(cb);
    return () => changeListeners.delete(cb);
}

export async function initElnIdToBatch() {
    if (!listenerAttached && chrome?.storage?.onChanged) {
        listenerAttached = true;
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== "local") return;

            let changed = false;

            if (changes[ELN_ID_TO_BATCH_ENABLED_KEY]) {
                enabledCache = changes[ELN_ID_TO_BATCH_ENABLED_KEY].newValue === true;
                changed = true;
            }

            // The label and the format belong to eln-id-carry; this feature
            // only mirrors them so the panel can read them synchronously.
            if (
                changes[ELN_ID_CARRY_ENABLED_KEY] ||
                changes[ELN_ID_CARRY_FIELD_KEY] ||
                changes[ELN_ID_FORMAT_KEY]
            ) {
                getElnIdCarrySettings().then((fresh) => {
                    carryCache = fresh;
                    notify();
                });
            }

            if (changed) notify();
        });
    }

    enabledCache = await getElnIdToBatchEnabled();
    carryCache = await getElnIdCarrySettings();
    notify();
    return enabledCache;
}
```

- [ ] **Step 2: Write the throwaway check**

Write to the session scratchpad as `check-eln-id-to-batch.mjs`. It cannot
import the module directly (the module touches `chrome` at call time only,
but the import is fine — no top-level `chrome` access), so import it and
stub nothing:

```js
import {
    batchFieldControlId,
    batchEditAction,
    moleculeBatchesUrl,
    composeBatchElnId,
} from "../../src/shared/eln-id-to-batch.js";

let failed = 0;
function eq(label, got, want) {
    const ok = got === want;
    if (!ok) failed += 1;
    console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${JSON.stringify(got)}`);
}

// The real ids from the verified case (vault 6884, batch 192201177,
// Internal ID definition 150242).
eq("control id", batchFieldControlId(192201177, 150242),
   "specified_batch_192201177_field_150242");
eq("edit action", batchEditAction(6884, 192201177),
   "/vaults/6884/specified_batches/192201177");
eq("batches url", moleculeBatchesUrl(6884, 165290233),
   "/vaults/6884/molecules/165290233#molecule-batches");

// Vault-user format cuts the vault prefix; the first table stays bare.
eq("first table", composeBatchElnId("PHA-MDX-0095", "vault-user", 0), "MDX-0095");
eq("second table", composeBatchElnId("PHA-MDX-0095", "vault-user", 1), "MDX-0095B");
eq("third table", composeBatchElnId("PHA-MDX-0095", "vault-user", 2), "MDX-0095C");

// The other two formats carry the ID whole.
eq("vault format", composeBatchElnId("PHA-MDX-0095", "vault", 0), "PHA-MDX-0095");
eq("global format", composeBatchElnId("PHA-MDX-0095", "global", 0), "PHA-MDX-0095");

// An ID with too few dashes is left whole rather than sawn in half.
eq("short id", composeBatchElnId("MDX0095", "vault-user", 0), "MDX0095");
eq("blank id", composeBatchElnId("", "vault-user", 0), "");

process.exit(failed ? 1 : 0);
```

- [ ] **Step 3: Run it and see it pass**

```bash
node --check src/shared/eln-id-to-batch.js
node "<scratchpad>/check-eln-id-to-batch.mjs"
```

Expected: every line `ok`, exit 0.

- [ ] **Step 4: Build**

```bash
npm run build
```

Expected: two `✓ built in …` lines, no errors.

- [ ] **Step 5: Commit**

```bash
git add src/shared/eln-id-to-batch.js
git commit -m "Add the eln-id-to-batch flag and its pure helpers"
```

---

### Task 2: `content/api/batch-registration-props.js` — one reader for the batch props

**Files:**
- Create: `src/content/api/batch-registration-props.js`
- Test: `<scratchpad>/check-batch-props.mjs` (throwaway)

**Interfaces:**
- Consumes: `fieldLabelsMatch` from `src/shared/eln-id-carry.js`.
- Produces:
  - `readBatchProps(doc, batchId): { fieldMap, defs } | null`
    where `fieldMap` is `Record<fieldName, string|number>` (only fields with
    a readable value) and `defs` is `Array<{ id, name }>`.
  - `findDefId(defs, label): number | null`
  - `readFieldByLabel(fieldMap, label): string | null`
  - `vaultIdFromUrl(url): string | null`

**Why this file exists:** the enrichment pass and the pre-write re-check must
agree, byte for byte, on what "Internal ID is empty" means. Two copies of
this parse would eventually disagree, and the one that drifted would be the
one guarding a write.

- [ ] **Step 1: Write the file**

```js
// content/api/batch-registration-props.js
//
// The RegistrationFormRenderer props a molecule page embeds, read once and
// the same way by everyone who needs them.
//
// A molecule page carries one renderer per lot plus a molecule-level one and
// some blank templates; only a renderer whose `object_id` is the batch we
// asked for is a real lot. The molecule-level renderer joins nothing (its
// data rows have no batch_field_definition_id), which is why the join below
// is safe to run over all of them.

import { fieldLabelsMatch } from "../../shared/eln-id-carry.js";

const RENDERER_SELECTOR = '[component_class="RegistrationFormRenderer"]';

// `<html>` documents only — pass a parsed DOMParser document or `document`.
export function readBatchProps(doc, batchId) {
    const wanted = Number(batchId);
    if (!Number.isFinite(wanted)) return null;

    for (const el of doc.querySelectorAll(RENDERER_SELECTOR)) {
        let props;
        try {
            props = JSON.parse(el.getAttribute("react_props") || "");
        } catch {
            continue;
        }

        if (Number(props?.object_id) !== wanted) continue;

        const defs = (Array.isArray(props.batch_field_definitions)
            ? props.batch_field_definitions
            : []
        )
            .filter((d) => d && d.id != null && d.name)
            .map((d) => ({ id: d.id, name: d.name }));

        const nameById = new Map(defs.map((d) => [d.id, d.name]));
        const fieldMap = {};

        for (const entry of Object.values(props.data || {})) {
            const name = nameById.get(entry?.batch_field_definition_id);
            if (!name) continue;

            // Pick-list ids and file uploads have no readable value here.
            const value =
                entry?.text_value ?? entry?.float_value ?? entry?.date_value ?? null;
            if (value == null || value === "") continue;

            fieldMap[name] = value;
        }

        return { fieldMap, defs };
    }

    return null;
}

// The definition id behind a user-configured label. `fieldLabelsMatch`
// already strips CDD's required marker, so a setting of "Internal ID" finds
// a definition named "*Internal ID".
export function findDefId(defs, label) {
    const hit = (defs || []).find((d) => fieldLabelsMatch(d.name, label));
    return hit ? hit.id : null;
}

// The value stored under a user-configured label, or null when the field is
// absent or empty. "Empty" and "absent" are deliberately the same answer:
// both mean there is nothing to overwrite.
export function readFieldByLabel(fieldMap, label) {
    for (const [name, value] of Object.entries(fieldMap || {})) {
        if (!fieldLabelsMatch(name, label)) continue;
        const text = String(value ?? "").trim();
        return text || null;
    }
    return null;
}

// The vault a fetch actually landed in. A molecule can live in a different
// vault than the ELN entry that mentions it, and the server redirects there
// transparently — so the vault must be read off the FINAL url, never off
// location.pathname.
export function vaultIdFromUrl(url) {
    return String(url || "").match(/\/vaults\/(\d+)\//)?.[1] || null;
}
```

- [ ] **Step 2: Write the throwaway check**

`readBatchProps` needs a DOM. Node 20 has no `DOMParser`, so the check builds
a minimal fake document with the two methods the parser uses:

```js
import {
    readBatchProps,
    findDefId,
    readFieldByLabel,
    vaultIdFromUrl,
} from "../../src/content/api/batch-registration-props.js";

let failed = 0;
function eq(label, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) failed += 1;
    console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${JSON.stringify(got)}`);
}

// A stand-in for the two renderers a molecule page really carries: the
// molecule-level one (object_id = the molecule, data rows with no
// batch_field_definition_id) and the lot.
function fakeDoc(renderers) {
    return {
        querySelectorAll: () =>
            renderers.map((r) => ({
                getAttribute: () => JSON.stringify(r),
            })),
    };
}

const defs = [
    { id: 150242, name: "Internal ID", data_type_name: "Text" },
    { id: 150233, name: "Vendor ID", data_type_name: "Text" },
];

const moleculeLevel = {
    object_id: 165290233,
    batch_field_definitions: defs,
    data: { 0: { batch_field_definition_id: null, text_value: "ignored" } },
};

const emptyLot = {
    object_id: 192201177,
    batch_field_definitions: defs,
    data: {
        0: { batch_field_definition_id: 150242, text_value: null, id: null },
        1: { batch_field_definition_id: 150233, text_value: "1956", id: 7 },
    },
};

const doc = fakeDoc([moleculeLevel, emptyLot]);

const read = readBatchProps(doc, 192201177);
eq("empty Internal ID is absent from the map", read.fieldMap, { "Vendor ID": "1956" });
eq("defs are kept", read.defs.length, 2);

eq("def id by label", findDefId(read.defs, "Internal ID"), 150242);
eq("def id ignores the required marker", findDefId(read.defs, "*Internal ID"), 150242);
eq("def id is case- and space-insensitive", findDefId(read.defs, "  internal   id "), 150242);
eq("unknown label", findDefId(read.defs, "Nope"), null);

eq("empty field reads null", readFieldByLabel(read.fieldMap, "Internal ID"), null);
eq("filled field reads its value", readFieldByLabel(read.fieldMap, "Vendor ID"), "1956");

// A whitespace-only value counts as empty — there is nothing to overwrite.
eq("whitespace is empty", readFieldByLabel({ "Internal ID": "   " }, "Internal ID"), null);

eq("wrong batch id", readBatchProps(doc, 999), null);

eq("vault from a redirected url",
   vaultIdFromUrl("https://app.collaborativedrug.com/vaults/7965/molecules/164033132"),
   "7965");
eq("vault from a url without one", vaultIdFromUrl("https://example.com/x"), null);

process.exit(failed ? 1 : 0);
```

- [ ] **Step 3: Run it and see it pass**

```bash
node --check src/content/api/batch-registration-props.js
node "<scratchpad>/check-batch-props.mjs"
```

Expected: every line `ok`, exit 0. In particular
`empty Internal ID is absent from the map` must pass — the whole guard rests
on an empty field never reaching the map.

- [ ] **Step 4: Commit**

```bash
git add src/content/api/batch-registration-props.js
git commit -m "One reader for a molecule page's batch registration props"
```

---

### Task 3: Enrichment covers products, and records the map and the vault

**Files:**
- Modify: `src/content/features/batch-field-enrichment.js`

**Interfaces:**
- Consumes: `readBatchProps`, `vaultIdFromUrl` from Task 2.
- Produces, on every enriched sample:
  - `sample.batchFieldMap: Record<string, string|number>`
  - `sample.batchVaultId: string | null`
  - `sample.batchFieldsEnriched: true` (unchanged)

- [ ] **Step 1: Replace the parse with the shared reader**

The file currently has its own `parseMoleculeBatchFields(html)` returning a
`Map<batchId, fieldMap>`. Replace it so the fetch returns the document and
the final vault, and the per-batch read goes through Task 2's reader.

Replace the import block at the top by adding:

```js
import { readBatchProps, vaultIdFromUrl } from "../api/batch-registration-props.js";
```

Delete `parseMoleculeBatchFields` entirely and change
`fetchMoleculeBatchFields` to:

```js
// moleculeId -> Promise<{ doc, vaultId }>. Promise-cached so concurrent
// payloads for the same molecule share one request; failures are evicted so
// a later payload can retry.
function fetchMoleculePage(vaultId, moleculeId) {
    const cached = moleculeBatchFieldsCache.get(moleculeId);
    if (cached) return cached;

    const promise = (async () => {
        const response = await fetch(`/vaults/${vaultId}/molecules/${moleculeId}`, {
            credentials: "include",
            headers: { Accept: "text/html" },
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const html = await response.text();

        return {
            doc: new DOMParser().parseFromString(html, "text/html"),
            // The molecule's HOME vault, which is not always the one we asked
            // in: the server redirects (ELN vault 6884 -> registration vault
            // 6885) and fetch follows it. Anything that later builds a URL for
            // this batch must use this, not location.pathname.
            vaultId: vaultIdFromUrl(response.url) || vaultId,
        };
    })();

    promise.catch(() => {
        if (moleculeBatchFieldsCache.get(moleculeId) === promise) {
            moleculeBatchFieldsCache.delete(moleculeId);
        }
    });

    moleculeBatchFieldsCache.set(moleculeId, promise);
    return promise;
}
```

- [ ] **Step 2: Record the raw map and the vault on the sample**

In `applyBatchFields`, add two lines at the end, before
`sample.batchFieldsEnriched = true`:

```js
    // The RAW map, kept beside the resolved fields. resolveBatchFields knows
    // a fixed set of names; the ELN-id-to-batch button has to look up a label
    // the USER configured, which may be none of them.
    sample.batchFieldMap = { ...fieldMap };
```

and change its signature to carry the vault:

```js
function applyBatchFields(sample, fieldMap, vaultId) {
    // …unchanged body…
    sample.batchFieldMap = { ...fieldMap };
    sample.batchVaultId = vaultId;
    sample.batchFieldsEnriched = true;
}
```

- [ ] **Step 3: Let products in**

In `enrichBatchOnlySamples`, delete this line:

```js
        if (sample.isProduct) continue;   // no metafield fetches for products
```

and replace the comment above the loop's guards with:

```js
    // Products used to be skipped here ("display-only in v1"). They are in
    // now: the ELN-id-to-batch button on a product card has to know whether
    // that batch's Internal ID is already set, and this pass is what knows.
    // A product costs one GET per molecule not already fetched.
```

Then update the body of the `Promise.all` mapper to use the new shapes:

```js
        Array.from(targetsByMolecule, async ([moleculeId, targets]) => {
            let page;
            try {
                page = await fetchMoleculePage(vaultId, moleculeId);
            } catch {
                return false;
            }

            let changed = false;
            for (const sample of targets) {
                const props = readBatchProps(page.doc, sample.batchId);

                if (props) {
                    applyBatchFields(sample, props.fieldMap, page.vaultId);
                } else {
                    // The molecule page loaded but carries no renderer for
                    // this batch — enrichment is still COMPLETE: we now know
                    // the batch has no fields, which density-memory's capture
                    // gate needs in order to trust user-typed values.
                    sample.batchFieldMap = {};
                    sample.batchVaultId = page.vaultId;
                    sample.batchFieldsEnriched = true;
                }
                changed = true;
            }
            return changed;
        })
```

- [ ] **Step 4: Check and build**

```bash
node --check src/content/features/batch-field-enrichment.js
npm run build
```

Expected: parses, two `✓ built in …` lines.

- [ ] **Step 5: Verify live**

Reload the unpacked extension from `dist/`, refresh
`https://app.collaborativedrug.com/vaults/6884/eln/entries/2504170`.

Expected: with *Show products* on, product cards now show batch fields they
did not before (Purity, Density, Vendor ID — whichever the vault defines and
the panel is configured to display). Reactant cards are unchanged.

If nothing changes on product cards, the enrichment is not reaching them —
check in the console that a product sample has `batchFieldsEnriched === true`
before assuming the render is at fault.

- [ ] **Step 6: Commit**

```bash
git add src/content/features/batch-field-enrichment.js
git commit -m "Enrich product batches too, and record the map and the vault"
```

---

### Task 4: The options checkbox, and the copy that is about to become false

**Files:**
- Modify: `src/options/options.html` (the panel-sources card, after `#showProducts`)
- Modify: `src/options/options.js`
- Modify: `src/content/main.js`

**Interfaces:**
- Consumes: `getElnIdToBatchEnabled`, `saveElnIdToBatchEnabled`,
  `initElnIdToBatch`, `onElnIdToBatchChanged` from Task 1.
- Produces: the flag is switchable and cached content-side. No button yet.

- [ ] **Step 1: Correct the products copy**

`src/options/options.html` currently says, on the `#showProducts` label:

```html
                    <span>Show <strong>products</strong> of each reaction in the
                    panel and in the print sheets (display only — no fill
                    buttons, no remembered values)</span>
```

That parenthesis stops being true in Task 6. Replace it with:

```html
                    <span>Show <strong>products</strong> of each reaction in the
                    panel and in the print sheets (no remembered values, and no
                    fill buttons for the stoichiometry table)</span>
```

- [ ] **Step 2: Add the checkbox**

Immediately after the `#showProducts` label in the same card:

```html
                <label class="field-item show-products-toggle">
                    <input type="checkbox" id="elnIdToBatch" />
                    <span>On a <strong>product</strong> card, offer a button that
                    writes this entry's ID into the batch's
                    <strong>Internal ID</strong> — but only while that field is
                    empty. This one <strong>saves to the batch record</strong>;
                    everything else in the panel only fills the table.</span>
                </label>
```

The last sentence is not decoration. Every other button in the panel writes
into the ELN table, which the user can undo by retyping; this one writes to a
record and cannot.

- [ ] **Step 3: Wire it in `options.js`**

Add to the import from the shared modules near the top:

```js
import {
    getElnIdToBatchEnabled,
    saveElnIdToBatchEnabled,
} from "../shared/eln-id-to-batch.js";
```

Next to `initShowProductsUI` (around line 905), add:

```js
const elnIdToBatchCheckbox = document.getElementById("elnIdToBatch");

elnIdToBatchCheckbox.addEventListener("change", () => {
    saveElnIdToBatchEnabled(elnIdToBatchCheckbox.checked);
});

async function initElnIdToBatchUI() {
    elnIdToBatchCheckbox.checked = await getElnIdToBatchEnabled();
}
```

Then call `initElnIdToBatchUI()` wherever the other `init*UI()` calls are
made. Those calls are deliberately independent — one section failing must not
stop the other ten — so add it in the same style, not inside another's `then`.

- [ ] **Step 4: Wire the content-side cache in `main.js`**

Next to the other panel flags (around the `initShowProducts()` block):

```js
  // Writing this entry's ID onto a product's existing batch. Off by default:
  // it is the only thing in the panel that saves to a record.
  initElnIdToBatch().then(() => {
    onElnIdToBatchChanged(() => renderFromState());
  });
```

with the matching import:

```js
import { initElnIdToBatch, onElnIdToBatchChanged } from "../shared/eln-id-to-batch.js";
```

- [ ] **Step 5: Check and build**

```bash
node --check src/options/options.js
node --check src/content/main.js
npm run build
```

Expected: all parse, two `✓ built in …` lines. `options.js` is **copied, not
bundled**, so `node --check` is the only thing standing between a typo and a
dead options page.

- [ ] **Step 6: Verify live**

Reload the extension, open the options page.

Expected: the new checkbox is present and **unticked**. Tick it, reload the
page — it stays ticked. Nothing changes in the panel yet.

- [ ] **Step 7: Commit**

```bash
git add src/options/options.html src/options/options.js src/content/main.js
git commit -m "Options switch for writing the ELN ID onto a product batch"
```

---

### Task 5: The write — CDD's own form, one field changed

**Files:**
- Create: `src/content/features/eln-id-to-batch-write.js`

**Interfaces:**
- Consumes: `readBatchProps`, `findDefId`, `readFieldByLabel` (Task 2);
  `batchFieldControlId`, `moleculeBatchesUrl` (Task 1).
- Produces:
  - `writeElnIdToBatch({ vaultId, moleculeId, batchId, fieldLabel, value }): Promise<{ ok: boolean, reason?: string }>`

**The rule this file exists to keep:** no request body is assembled here.
The body is `new FormData(form)` taken off the form CDD rendered, with one
input changed. `_method=put` and `authenticity_token` are the form's own
fields and ride along for free.

- [ ] **Step 1: Write the file**

```js
// content/features/eln-id-to-batch-write.js
//
// Writing one batch field from the ELN page, without opening a tab and
// without the user pressing Save.
//
// WHY AN IFRAME
//
// The endpoint is PUT /vaults/<vault>/specified_batches/<batchId>, and it
// takes the batch's WHOLE field set: a body we assemble decides the fate of
// all thirty fields, not just the one we want. Pick lists, dates, batch links
// and file fields are exactly where such a reconstruction goes wrong, and the
// damage would be to a record, silently.
//
// The molecule page's react_props do carry every current value — but their
// `field_name_prefix` says `molecule[batch][...]`, which is the ADD A BATCH
// form's prefix, not the edit form's `specified_batch[...]`. Anyone building
// the body from the props builds the wrong body.
//
// So the body is never built. `X-Frame-Options: SAMEORIGIN` and
// `frame-ancestors app.collaborativedrug.com` let the ELN page frame the
// molecule page; CDD renders its own form with its own values and its own
// CSRF token, we change one input, and post that form's own FormData to that
// form's own action. Every byte except the ELN ID is CDD's.

import {
    readBatchProps,
    findDefId,
    readFieldByLabel,
} from "../api/batch-registration-props.js";
import { batchFieldControlId, moleculeBatchesUrl } from "../../shared/eln-id-to-batch.js";

// The batches tab renders client-side; a cold frame needs a moment, and a
// slow vault needs more. Ten seconds, then give up and say so — a hung
// iframe is a second CDD session running inside the page.
const RENDER_TIMEOUT_MS = 10000;
const POLL_MS = 150;

function makeFrame(src) {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText =
        "position:fixed;left:-9999px;top:0;width:1024px;height:768px;border:0;visibility:hidden;";
    frame.src = src;
    document.body.appendChild(frame);
    return frame;
}

function waitFor(check, timeoutMs) {
    return new Promise((resolve) => {
        const started = Date.now();

        const tick = () => {
            let value = null;
            try {
                value = check();
            } catch {
                // Cross-document access throws while the frame is between
                // documents. Keep polling; the deadline is the real limit.
                value = null;
            }

            if (value) return resolve(value);
            if (Date.now() - started >= timeoutMs) return resolve(null);
            window.setTimeout(tick, POLL_MS);
        };

        tick();
    });
}

// The batches tab sometimes lands read-only. Its Edit control is an ordinary
// anchor, so a click inside OUR OWN frame is enough to open the form.
function nudgeIntoEditMode(doc, batchId) {
    const link = doc.querySelector(
        `a[href$="/specified_batches/${batchId}/edit"]`
    );
    if (link) link.click();
}

export async function writeElnIdToBatch({
    vaultId,
    moleculeId,
    batchId,
    fieldLabel,
    value,
}) {
    if (!vaultId || !moleculeId || !batchId) {
        return { ok: false, reason: "missing batch identifiers" };
    }

    const wanted = String(value ?? "").trim();
    if (!wanted) return { ok: false, reason: "no ELN ID to write" };

    const frame = makeFrame(moleculeBatchesUrl(vaultId, moleculeId));

    try {
        const doc = await waitFor(
            () => frame.contentDocument?.readyState === "complete"
                ? frame.contentDocument
                : null,
            RENDER_TIMEOUT_MS
        );
        if (!doc) return { ok: false, reason: "the batch page did not load" };

        // The definition id comes from the page we are about to write to, not
        // from the panel's cache: the label is per-vault configuration and the
        // id behind it differs between vaults.
        const props = readBatchProps(doc, batchId);
        if (!props) return { ok: false, reason: "no batch record on that page" };

        const defId = findDefId(props.defs, fieldLabel);
        if (!defId) {
            return { ok: false, reason: `this vault has no “${fieldLabel}” field` };
        }

        // Last read before the write. The panel's copy may be minutes old.
        if (readFieldByLabel(props.fieldMap, fieldLabel)) {
            return { ok: false, reason: `${fieldLabel} is already set` };
        }

        const controlId = batchFieldControlId(batchId, defId);

        let input = await waitFor(() => doc.getElementById(controlId), 2000);
        if (!input) {
            nudgeIntoEditMode(doc, batchId);
            input = await waitFor(() => doc.getElementById(controlId), RENDER_TIMEOUT_MS);
        }
        if (!input) return { ok: false, reason: "the edit form never appeared" };

        // Never the label, never the name: on this page both also match the
        // "Add a batch" form, and filling THAT one creates a batch.
        const form = input.closest("form");
        if (!form) return { ok: false, reason: "the field is not inside a form" };

        if (String(input.value ?? "").trim()) {
            return { ok: false, reason: `${fieldLabel} is already set` };
        }

        input.value = wanted;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));

        const response = await fetch(form.action, {
            method: "POST",
            credentials: "include",
            body: new FormData(form),
        });

        if (!response.ok) {
            return { ok: false, reason: `CDD refused it (HTTP ${response.status})` };
        }

        return { ok: true };
    } finally {
        frame.remove();
    }
}
```

- [ ] **Step 2: Check and build**

```bash
node --check src/content/features/eln-id-to-batch-write.js
npm run build
```

Expected: parses, two `✓ built in …` lines.

- [ ] **Step 3: Do NOT test this against a real batch yet**

There is no button calling it, and the first live write belongs in Task 6's
verification, where a batch is chosen on purpose. Unlike everything else in
this plugin, this one cannot be undone by closing a tab.

- [ ] **Step 4: Commit**

```bash
git add src/content/features/eln-id-to-batch-write.js
git commit -m "Write a batch field by submitting CDD's own edit form"
```

---

### Task 6: The button on the product card

**Files:**
- Modify: `src/content/features/sample-panel.js`

**Interfaces:**
- Consumes: `writeElnIdToBatch` (Task 5); `isElnIdToBatchEnabled`,
  `getCarrySettings`, `composeBatchElnId` (Task 1); `readFieldByLabel`
  (Task 2); `readElnEntryId` from `src/content/utils/eln-entry-id.js`.
- Produces: nothing other modules consume.

- [ ] **Step 1: Add the imports**

```js
import { writeElnIdToBatch } from "./eln-id-to-batch-write.js";
import {
    isElnIdToBatchEnabled,
    getCarrySettings,
    composeBatchElnId,
} from "../../shared/eln-id-to-batch.js";
import { readFieldByLabel } from "../api/batch-registration-props.js";
import { readElnEntryId } from "../utils/eln-entry-id.js";
```

- [ ] **Step 2: Add the offer logic and the button, next to `buildFillButton`**

```js
// What, if anything, a product card should say about its batch's ELN ID
// field. Returns one of:
//   { kind: "offer", value, fieldLabel, … }  -> the button
//   { kind: "set", fieldLabel, value }       -> "already set to X", no button
//   null                                     -> say nothing at all
//
// A card that simply lacks the button, with no reason given, reads as a bug.
// That is why "set" is a state rather than an early return.
function elnIdToBatchState(sample) {
    if (!isElnIdToBatchEnabled()) return null;
    if (!sample?.isProduct) return null;
    if (!sample.batchId || !sample.moleculeId) return null;

    // Enrichment has not answered yet. Saying nothing beats offering a button
    // whose guard has not run.
    if (!sample.batchFieldsEnriched) return null;

    const { enabled, fieldLabel, format } = getCarrySettings();
    if (!enabled || !fieldLabel) return null;

    const existing = readFieldByLabel(sample.batchFieldMap, fieldLabel);
    if (existing) return { kind: "set", fieldLabel, value: existing };

    const entryId = readElnEntryId();
    if (!entryId) return null;

    const value = composeBatchElnId(entryId, format, sample.reactionIndex);
    if (!value) return null;

    return {
        kind: "offer",
        value,
        fieldLabel,
        vaultId: sample.batchVaultId,
        moleculeId: sample.moleculeId,
        batchId: sample.batchId,
    };
}

function buildElnIdToBatchButton(state) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cdd-density-fill-btn";
    btn.textContent = `⤴ Write ${state.value} into ${state.fieldLabel} on this batch`;
    btn.title =
        `Saves ${state.value} to the batch record — not to the table. ` +
        `It runs only while ${state.fieldLabel} is empty, and it cannot be undone ` +
        `by closing a tab.`;

    btn.addEventListener("click", async (event) => {
        // The table enters edit mode on a row click and leaves it on any click
        // outside — and this button IS outside the table.
        event.stopPropagation();

        btn.disabled = true;
        btn.textContent = "Writing…";

        const result = await writeElnIdToBatch({
            vaultId: state.vaultId,
            moleculeId: state.moleculeId,
            batchId: state.batchId,
            fieldLabel: state.fieldLabel,
            value: state.value,
        });

        if (result.ok) {
            btn.textContent = `✓ ${state.fieldLabel} set to ${state.value}`;
        } else {
            btn.textContent = `✗ ${result.reason || "could not write it"}`;
            btn.disabled = false;
        }
    });

    return btn;
}
```

- [ ] **Step 3: Add a neutral note style**

The panel has exactly one note class today, `.cdd-no-sample-quote`, and it is
amber and italic — a warning. "Internal ID is already set" is not a warning,
and borrowing that style would make a normal state look like a problem. Add a
quiet one beside it, in the same stylesheet block:

```css
  #${PANEL_ID} .cdd-batch-field-note {
    margin-top: 4px;
    font-size: 11px;
    line-height: 1.35;
    color: #cbd5e1;
    opacity: 0.85;
  }
```

`#cbd5e1` is the muted grey `.cdd-stoich-status` already uses; 11px matches the
card rows rather than the 12px of the amber quote.

- [ ] **Step 4: Render it on the product card**

In the products loop, after `renderConfiguredFields(sample)` and before
`groupBody.appendChild(card)`:

```js
                const idState = elnIdToBatchState(sample);

                if (idState?.kind === "offer") {
                    card.appendChild(buildElnIdToBatchButton(idState));
                } else if (idState?.kind === "set") {
                    const note = document.createElement("div");
                    note.className = "cdd-batch-field-note";
                    note.textContent =
                        `${idState.fieldLabel} on this batch: ${idState.value}`;
                    card.appendChild(note);
                }
```

- [ ] **Step 5: Check and build**

```bash
node --check src/content/features/sample-panel.js
npm run build
```

Expected: parses, two `✓ built in …` lines.

- [ ] **Step 6: Verify — read-only half first**

Reload the extension, refresh entry `2504170`, options: *Show products* on,
the new checkbox **off**.

Expected: no button anywhere. Then tick the checkbox.

Expected: the product card for `PHA-0334592-001` gains the button; reactant
cards do not; a product whose *Internal ID* is already set shows the note
instead.

- [ ] **Step 7: Verify — the write, once, deliberately**

**Pick the batch on purpose.** `PHA-0334592-001` (molecule `165290233`,
batch `192201177`, vault 6884) was confirmed to have an empty *Internal ID*.

1. Open that batch in another tab and note **every** field: Chem Purpose,
   Batch Status, Synth. Assigned To, Priority, Date, Vendor fields, the
   salt and solvent ratios.
2. Click the button. It reports `✓ Internal ID set to PHA-MDX-0095`.
3. Reload the batch. *Internal ID* holds that value **and every field from
   step 1 is unchanged.** Check them one by one. This is the check the whole
   design exists for.
4. Click again. It refuses without a request — the field is no longer empty.
5. On a second product in the same entry, CDD refuses the write because
   *Internal ID* is `unique_value: true`, and the card shows what it said.

If step 3 shows any other field changed, **stop**. The design has failed at
its one promise, and the fix is not a patch to the button.

- [ ] **Step 8: Commit**

```bash
git add src/content/features/sample-panel.js
git commit -m "Offer the ELN-ID write on product cards"
```

---

### Task 7: Release notes

**Files:**
- Modify: `manifest.json` (version bump)
- Modify: `CHANGELOG.md`
- Modify: `RELEASES.md`

Per `CLAUDE.md`: bump, write both documents in English, rebuild, commit all
changed files, then **STOP**. Do not push and do not tag.

- [ ] **Step 1: Bump the minor version in `manifest.json`**

- [ ] **Step 2: Write the `CHANGELOG.md` entry**

This is the record and may explain why. Say that the write submits CDD's own
edit form rather than a body of ours, and why: the endpoint takes the whole
field set. Record the two traps — the `Add a batch` form matching by label,
and `field_name_prefix` in the props naming the wrong form.

- [ ] **Step 3: Write the `RELEASES.md` entry**

Heading with a concrete ISO date. Roughly 120 words, one line per change,
written for a chemist at the bench:

```markdown
## 14.11.0 — 2026-08-2X

A product that was registered before it was made can now be pointed back at
the entry it came from. On a product card, **Write … into Internal ID** saves
this entry's ID onto that batch.

- It appears only while the batch's Internal ID is empty, and never on a
  reactant. If the field is already set, the card shows what it says.
- It saves to the **batch record**, not to the stoichiometry table — closing
  the tab does not undo it.
- Switch it on in *Settings → Sample panel*.
- Product cards now also show the batch's own fields (purity, density, and
  whatever else your vault records).
```

Confirm the version and the date against the actual bump before writing them.

- [ ] **Step 4: Rebuild and commit**

```bash
npm run build
git add manifest.json CHANGELOG.md RELEASES.md dist
git commit -m "Release 14.11.0: write the ELN ID onto a product's batch"
```

Then stop and tell the user the commit is ready.

---

## Self-review

**Spec coverage.** Problem → Tasks 3, 5, 6. Decisions table: value composition
(Task 1, `composeBatchElnId`), never-overwrite (Task 2 `readFieldByLabel`,
Task 6 offer logic, Task 5 re-check before the write), products only (Task 6),
direct write (Task 5), uniqueness left to CDD (Task 6 step 6.5), product
enrichment (Task 3), no bulk mode (absent by construction). Design §1 → Task 6;
§2 → Task 6; §3 → Task 3; §4 → Task 5; §5 → Tasks 1 and 5; §6 → Task 6; §7 →
Task 4. Files list → Tasks 1–6. Verification → Task 6 steps 6–7.

**Guard depth.** "Never overwrite" is checked three times: when the button is
offered (panel cache), against a freshly-read page inside the iframe, and
against the live input immediately before the value is set. The first can be
stale, the second closes the window, the third catches a re-render.

**Names.** `readBatchProps` / `findDefId` / `readFieldByLabel` /
`vaultIdFromUrl` (Task 2) are used under those names in Tasks 3, 5 and 6.
`batchFieldControlId` and `moleculeBatchesUrl` (Task 1) are used in Task 5.
`writeElnIdToBatch` (Task 5) is called in Task 6 with exactly the five keys it
destructures. `sample.batchFieldMap` and `sample.batchVaultId` are written in
Task 3 and read in Task 6.

**Known gap, deliberately left.** Whether the batches tab lands in edit mode
or read-only is not settled — the live check saw it already in edit mode, but
possibly because of an earlier navigation. Task 5 handles both by nudging the
Edit anchor, so the plan does not depend on the answer.
