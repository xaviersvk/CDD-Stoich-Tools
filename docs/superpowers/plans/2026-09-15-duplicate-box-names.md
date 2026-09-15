# Duplicate Box Names Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In *Edit Locations*, paint orange every box whose name another box in the vault already carries, and make the Scan racks duplicate check see collapsed branches.

**Architecture:** A page-world bridge (`inject/hooks/location-tree-bridge.js`) reads the whole tree from the React props behind `ul[role="tree"]` and answers over `window.postMessage`. The content side (`tree-source.js`) merges that list with the DOM's `canTakeBox`, a pure function in `tree-model.js` finds the twins, `name-marks.js` paints attributes React does not manage, and `init.js` runs a pass on every mutation. The scan panel swaps its DOM read for the same source.

**Tech Stack:** Plain ES modules, Vite bundles (`npm run build`), no test runner — pure modules are checked with throwaway `node` scripts in the scratchpad. Spec: `docs/superpowers/specs/2026-09-15-duplicate-box-names-design.md`.

## Global Constraints

- Box rule, verbatim from the spec: a node is a **box** when `organized === false` or `num_columns > 0`.
- Names compare with `normalizeScan` (whitespace collapsed, trimmed) lower-cased.
- Only boxes are marked; locations and the root never are.
- Colour only: `#e65100` on the label text. No weight change.
- Tooltip text: `Same name: <path>; <path>` — paths joined with `; `, tree order.
- Always on. No setting, no switch.
- The extension never presses Save. Nothing here writes.
- Bridge timeout 500 ms; on `null` or timeout fall back to the DOM read (`buildNodes(readTreeRows(dialog))`), which must behave exactly as 15.9.0.
- Every attribute painted on CDD's DOM is one React does not set: `data-cdd-dup` on the `li`, `title` on `.MuiTreeItem-label`.
- Commit after each task. Do not push.

---

### Task 1: The pure rule and the twin finder — `tree-model.js`

**Files:**
- Modify: `src/content/features/ui-fixes/inventory-location-scan/tree-model.js`
- Test: scratchpad `tree-model.test.mjs` (throwaway)

**Interfaces:**
- Produces: `isBoxNode(raw: { organized?, num_columns? }) -> boolean`
- Produces: `buildNodes(rows)` now copies `isBox: row.isBox === true` onto every node.
- Produces: `duplicateBoxNames(nodes) -> Map<string id, string[] twinPaths>`

- [ ] **Step 1: Write the failing test**

Scratchpad file `tree-model.test.mjs` (import path is absolute to the repo):

```js
import assert from "node:assert/strict";
import { buildNodes, duplicateBoxNames, isBoxNode } from "C:/Users/matus.drexler/WebstormProjects/CDD-Stoich-Tools/src/content/features/ui-fixes/inventory-location-scan/tree-model.js";

// The nine shapes measured live in vault 6772.
assert.equal(isBoxNode({}), false, "root");
assert.equal(isBoxNode({ organized: true, num_columns: 0, num_rows: 0 }), false, "saved location");
assert.equal(isBoxNode({ organized: false, capacity: 102 }), true, "saved unorganized box");
assert.equal(isBoxNode({ organized: true, num_columns: 9, num_rows: 9 }), true, "saved organized box");
assert.equal(isBoxNode({ organized: true, num_columns: 9, capacity: 100 }), true, "pending organized box");
assert.equal(isBoxNode({ organized: false, num_columns: 9 }), true, "pending box, organized unticked");
assert.equal(isBoxNode({ capacity: undefined }), false, "pending location");
assert.equal(isBoxNode(null), false, "nothing");

const rows = [
    { id: "-2", parentId: "undefined", name: "Locations", canTakeBox: false, isBox: false },
    { id: "1", parentId: "-2", name: "room", canTakeBox: true, isBox: false },
    { id: "2", parentId: "1", name: "AAA", canTakeBox: false, isBox: true },
    { id: "3", parentId: "-2", name: "Racks", canTakeBox: true, isBox: false },
    { id: "4", parentId: "3", name: "aaa ", canTakeBox: false, isBox: true },
    { id: "5", parentId: "3", name: "BBB", canTakeBox: false, isBox: true },
    { id: "6", parentId: "-2", name: "AAA", canTakeBox: true, isBox: false }, // a LOCATION named AAA
    { id: "7", parentId: "3", name: "BBB", canTakeBox: false, isBox: true },
    { id: "8", parentId: "3", name: "bbb", canTakeBox: false, isBox: true },
];
const nodes = buildNodes(rows);
assert.equal(nodes[2].isBox, true);
assert.equal(nodes[1].isBox, false);
assert.equal(buildNodes([{ id: "9", parentId: null, name: "x" }])[0].isBox, false, "DOM rows default to false");

const twins = duplicateBoxNames(nodes);
assert.deepEqual([...twins.keys()].sort(), ["2", "4", "5", "7", "8"]);
assert.deepEqual(twins.get("2"), ["Locations > Racks > aaa"]);
assert.deepEqual(twins.get("4"), ["Locations > room > AAA"]);
assert.deepEqual(twins.get("5"), ["Locations > Racks > BBB", "Locations > Racks > bbb"]);
assert.deepEqual(twins.get("7"), ["Locations > Racks > BBB", "Locations > Racks > bbb"]);
assert.equal(twins.has("6"), false, "a location is never a key");
assert.equal(duplicateBoxNames([]).size, 0);
assert.equal(duplicateBoxNames(null).size, 0);

console.log("tree-model: ok");
```

- [ ] **Step 2: Run it, expect failure**

Run: `node <scratchpad>/tree-model.test.mjs`
Expected: `SyntaxError: The requested module ... does not provide an export named 'duplicateBoxNames'`

- [ ] **Step 3: Implement**

In `tree-model.js`, after `normalizeScan`/`key`:

```js
// Box versus location is not a typed field in CDD's tree. Nine node shapes
// were measured (saved and pending, organized and not, root, saved and
// pending location) and this is the rule that holds for all of them: a
// saved location is `organized: true, num_columns: 0`, a pending location
// has neither key, and every box is either unorganized or has columns.
export function isBoxNode(raw) {
    if (!raw || typeof raw !== "object") return false;
    if (raw.organized === false) return true;
    return Number(raw.num_columns) > 0;
}
```

In `buildNodes`, add `isBox: row.isBox === true,` after `canTakeBox`.

After `boxTargets`:

```js
// Every box whose name another box carries, mapped to where the others are.
// Locations are neither keys nor twins: a rack barcode names a rack, and a
// shelf called the same thing is not a second rack.
export function duplicateBoxNames(nodes) {
    const groups = new Map();
    for (const node of nodes || []) {
        if (!node.isBox) continue;
        const k = key(node.name);
        if (!k) continue;
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(node);
    }

    const twins = new Map();
    for (const group of groups.values()) {
        if (group.length < 2) continue;
        for (const node of group) {
            twins.set(node.id, group.filter((other) => other !== node).map((other) => other.path));
        }
    }
    return twins;
}
```

- [ ] **Step 4: Run it, expect pass**

Run: `node <scratchpad>/tree-model.test.mjs`
Expected: `tree-model: ok`

- [ ] **Step 5: Commit**

```bash
git add src/content/features/ui-fixes/inventory-location-scan/tree-model.js
git commit -m "duplicate box names: the rule and the twin finder"
```

---

### Task 2: The page-world bridge

**Files:**
- Modify: `src/shared/event-types.js` (add two events after `SELECTBOX_SELECT`)
- Create: `src/inject/hooks/location-tree-bridge.js`
- Modify: `src/inject/main.js` (import + `installLocationTreeBridge()` after `installSelectBoxBridge()`)

**Interfaces:**
- Produces: `EVENTS.LOCATION_TREE_REQUEST` payload `{ requestId }`; `EVENTS.LOCATION_TREE` payload `{ requestId, nodes: Array<{ id: string, parentId: string|null, name: string, isBox: boolean }> | null }`.
- Consumes: `isBoxNode` rule — **repeated** in the bridge, because the inject bundle must not import content modules; keep both copies identical.

- [ ] **Step 1: Add the events**

In `src/shared/event-types.js`, after `SELECTBOX_SELECT`:

```js
  // Content -> page world: "read the whole Edit Locations tree". MUI does not
  // render the children of a collapsed node at all, so the DOM is not the
  // tree; the props behind ul[role="tree"] are. The bridge
  // (inject/hooks/location-tree-bridge.js) answers with LOCATION_TREE.
  LOCATION_TREE_REQUEST: "LOCATION_TREE_REQUEST",
  LOCATION_TREE: "LOCATION_TREE",
```

- [ ] **Step 2: Write the bridge**

`src/inject/hooks/location-tree-bridge.js`:

```js
// inject/hooks/location-tree-bridge.js
//
// Page-world access to the Edit Locations tree for the content script.
//
// MUI's tree renders only the children of EXPANDED nodes — collapsing a
// location removes its boxes from the DOM outright. The whole tree, pending
// nodes included, lives in the props of the component behind ul[role="tree"],
// and React's fiber tree hangs off DOM nodes as `__reactFiber$…` expandos that
// only the page world can read. This bridge flattens that tree on request.
//
// Protocol (window.postMessage, source EVENT_SOURCE):
//   LOCATION_TREE_REQUEST { requestId }
//     -> LOCATION_TREE    { requestId, nodes: [{ id, parentId, name, isBox }] | null }
//
// `null` means "could not read it" — no dialog, no fiber, or a shape this
// file does not recognise — and the content side falls back to the DOM.

import { post } from "../bus.js";
import { EVENTS, EVENT_SOURCE } from "../../shared/event-types.js";

const DIALOG_SELECTOR = ".edit-locations-dialog-paper";
const MAX_WALK = 40;

function fiberOf(element) {
    if (!element) return null;
    const key = Object.keys(element).find((k) => k.startsWith("__reactFiber$"));
    return key ? element[key] : null;
}

// Up the `return` chain from the <ul> to the first component whose props carry
// a `nodes` array — measured: the root of CDD's tree, one entry, with
// `children` all the way down and a `parent` back-pointer on every node.
function findTreeNodes(fiber) {
    let cursor = fiber;
    for (let step = 0; cursor && step < MAX_WALK; step += 1) {
        const nodes = cursor.memoizedProps?.nodes;
        if (Array.isArray(nodes)) return nodes;
        cursor = cursor.return;
    }
    return null;
}

// The same rule as content/.../tree-model.js isBoxNode. Repeated because the
// inject bundle must not pull content modules in; keep the two identical.
function isBoxNode(raw) {
    if (!raw || typeof raw !== "object") return false;
    if (raw.organized === false) return true;
    return Number(raw.num_columns) > 0;
}

function flatten(roots) {
    const out = [];
    const seen = new Set();
    const walk = (node, parentId) => {
        if (!node || typeof node !== "object" || node.id == null) return;
        const id = String(node.id);
        if (seen.has(id)) return; // a malformed tree must not hang the page
        seen.add(id);
        out.push({
            id,
            parentId,
            name: String(node.value ?? "").trim(),
            isBox: isBoxNode(node),
        });
        for (const child of node.children || []) walk(child, id);
    };
    for (const root of roots) walk(root, null);
    return out;
}

function readTree() {
    const tree = document.querySelector(`${DIALOG_SELECTOR} ul[role="tree"]`);
    const nodes = findTreeNodes(fiberOf(tree));
    return nodes ? flatten(nodes) : null;
}

export function installLocationTreeBridge() {
    window.addEventListener("message", (event) => {
        if (event.source !== window) return;
        const data = event.data;
        if (!data || data.source !== EVENT_SOURCE) return;
        if (data.type !== EVENTS.LOCATION_TREE_REQUEST) return;

        const requestId = data.payload?.requestId;
        let nodes = null;
        try {
            nodes = readTree();
        } catch (err) {
            console.warn("[CDD Stoich Tools] location tree read failed:", err);
        }
        post(EVENTS.LOCATION_TREE, { requestId, nodes });
    });
}
```

- [ ] **Step 3: Register it**

In `src/inject/main.js`: add `import { installLocationTreeBridge } from "./hooks/location-tree-bridge.js";` after the SelectBox import, and `installLocationTreeBridge();` right after `installSelectBoxBridge();`.

- [ ] **Step 4: Build and check live**

Run: `npm run build` — expected: both bundles succeed, no warnings about the new file.

Then in the sandbox tab (extension reloaded from `dist/`, *Edit Locations* open, *Racks* collapsed), run in the page console:

```js
window.addEventListener("message", (e) => { if (e.data?.type === "LOCATION_TREE") console.log("TREE", JSON.stringify(e.data.payload)); }, { once: true });
window.postMessage({ source: "CDD_STOICH_TOOLS", type: "LOCATION_TREE_REQUEST", payload: { requestId: "t1" } }, "*");
```

Expected: a `TREE` line listing all seven nodes including `AAA` and `BBB` under `Racks` with `isBox: true`, `room` and `Racks` with `isBox: false`, and `Locations` with `parentId: null`.

- [ ] **Step 5: Commit**

```bash
git add src/shared/event-types.js src/inject/hooks/location-tree-bridge.js src/inject/main.js
git commit -m "duplicate box names: a page-world bridge for the whole location tree"
```

---

### Task 3: The content-side client — `tree-source.js`

**Files:**
- Create: `src/content/features/ui-fixes/inventory-location-scan/tree-source.js`

**Interfaces:**
- Consumes: `readTreeRows(dialog)` and `buildNodes(rows)` (existing), `EVENTS.LOCATION_TREE_REQUEST` / `EVENTS.LOCATION_TREE` (Task 2).
- Produces: `readTreeNodes(dialog) -> Promise<Node[]>` where a `Node` is what `buildNodes` returns: `{ id, parentId, name, canTakeBox, isBox, path, depth }`.

- [ ] **Step 1: Write it**

```js
// content/features/ui-fixes/inventory-location-scan/tree-source.js
//
// Where the tree comes from. The DOM shows only the expanded part of it —
// MUI does not render a collapsed node's children at all — so the list is
// asked of the page-world bridge, which reads it from React props and sees
// every node, pending ones included. The DOM still supplies `canTakeBox`:
// that is a style question on a rendered row, and a target has to be
// clickable anyway, so a node that is not on screen cannot take a box.
//
// If the bridge does not answer, or answers null, the DOM read is the
// answer, exactly as it was before the bridge existed.

import { EVENTS, EVENT_SOURCE } from "../../../../shared/event-types.js";
import { readTreeRows } from "./dialog-dom.js";
import { buildNodes } from "./tree-model.js";

const BRIDGE_TIMEOUT_MS = 500;
let requestCounter = 0;
let warned = false;

function requestBridgeNodes() {
    return new Promise((resolve) => {
        const requestId = `cdd-loc-tree-${++requestCounter}`;
        let settled = false;

        const finish = (nodes) => {
            if (settled) return;
            settled = true;
            window.removeEventListener("message", onMessage);
            clearTimeout(timer);
            resolve(nodes);
        };
        const onMessage = (event) => {
            if (event.source !== window) return;
            const data = event.data;
            if (!data || data.source !== EVENT_SOURCE || data.type !== EVENTS.LOCATION_TREE) return;
            if (data.payload?.requestId !== requestId) return;
            finish(Array.isArray(data.payload.nodes) ? data.payload.nodes : null);
        };
        const timer = setTimeout(() => finish(null), BRIDGE_TIMEOUT_MS);

        window.addEventListener("message", onMessage);
        window.postMessage(
            { source: EVENT_SOURCE, type: EVENTS.LOCATION_TREE_REQUEST, payload: { requestId } },
            "*",
        );
    });
}

export async function readTreeNodes(dialog) {
    const domRows = readTreeRows(dialog);
    const bridged = await requestBridgeNodes();

    if (!bridged) {
        if (!warned) {
            warned = true;
            console.warn("[CDD scan-racks] tree bridge silent; collapsed branches are not checked");
        }
        return buildNodes(domRows);
    }

    const canTakeBox = new Map(domRows.map((row) => [String(row.id), row.canTakeBox]));
    return buildNodes(bridged.map((node) => ({
        id: node.id,
        parentId: node.parentId,
        name: node.name,
        isBox: node.isBox,
        canTakeBox: canTakeBox.get(String(node.id)) === true,
    })));
}
```

- [ ] **Step 2: Build and check live**

Run: `npm run build`. The module is not yet imported anywhere, so this only checks syntax through Vite's parse of files reachable later — proceed to Task 4, which wires it, and verify there.

- [ ] **Step 3: Commit**

```bash
git add src/content/features/ui-fixes/inventory-location-scan/tree-source.js
git commit -m "duplicate box names: the tree, bridged with a DOM fallback"
```

---

### Task 4: Paint the marks — `name-marks.js`, `styles.js`, `init.js`

**Files:**
- Create: `src/content/features/ui-fixes/inventory-location-scan/name-marks.js`
- Modify: `src/content/features/ui-fixes/inventory-location-scan/styles.js` (new block before `/* ===== THE FOOTER BUTTON ===== */`)
- Modify: `src/content/features/ui-fixes/inventory-location-scan/init.js`

**Interfaces:**
- Consumes: `readTreeNodes(dialog)` (Task 3), `duplicateBoxNames(nodes)` (Task 1), `treeItems(dialog)` (existing in dialog-dom.js).
- Produces: `markDuplicateNames(dialog, twinsById: Map<string, string[]>)` — idempotent; safe to call on every pass.

- [ ] **Step 1: Write the painter**

```js
// content/features/ui-fixes/inventory-location-scan/name-marks.js
//
// Paints "this box's name is not unique" onto the rows CDD has rendered.
//
// Two attributes, both ones React never sets on these elements, so its
// re-renders leave them alone: `data-cdd-dup` on the <li> (the CSS hook) and
// `title` on the label (the tooltip naming the twins). A class on the label
// would not survive — React owns className there.

import { treeItems } from "./dialog-dom.js";

export const DUP_ATTR = "data-cdd-dup";

function labelOf(item) {
    return item.querySelector(":scope > .MuiTreeItem-content .MuiTreeItem-label");
}

export function markDuplicateNames(dialog, twinsById) {
    for (const item of treeItems(dialog)) {
        const paths = twinsById.get(String(item.dataset.nodeid));
        const label = labelOf(item);
        if (paths && paths.length) {
            item.setAttribute(DUP_ATTR, "");
            if (label) label.title = `Same name: ${paths.join("; ")}`;
        } else if (item.hasAttribute(DUP_ATTR)) {
            item.removeAttribute(DUP_ATTR);
            if (label) label.removeAttribute("title");
        }
    }
}
```

- [ ] **Step 2: The CSS**

In `styles.js`, insert before `/* ===== THE FOOTER BUTTON ===== */`:

```css
    /* ===== A BOX NAME ANOTHER BOX ALREADY CARRIES ===== */
    /* Colour only: weight is for structure, this is state. */
    li[role="treeitem"][data-cdd-dup] > .MuiTreeItem-content .MuiTreeItem-label {
        color: #e65100;
    }
```

- [ ] **Step 3: Wire the pass into `init.js`**

Add imports:

```js
import { duplicateBoxNames } from "./tree-model.js";
import { readTreeNodes } from "./tree-source.js";
import { markDuplicateNames } from "./name-marks.js";
```

Add above `function sync()`:

```js
// One pass in flight at a time; a mutation that lands during one asks for a
// single follow-up rather than a queue of them. The marks are attributes and
// the observer watches childList only, so a pass never re-triggers itself.
let marking = false;
let markAgain = false;

async function markPass(dialog) {
    if (marking) {
        markAgain = true;
        return;
    }
    marking = true;
    try {
        const nodes = await readTreeNodes(dialog);
        if (dialog.isConnected) markDuplicateNames(dialog, duplicateBoxNames(nodes));
    } catch (error) {
        // A missed colour must never cost the user the dialog.
        console.warn("[CDD scan-racks] duplicate-name pass failed", error);
    } finally {
        marking = false;
        if (markAgain) {
            markAgain = false;
            if (dialog.isConnected) markPass(dialog);
        }
    }
}
```

In `sync()`, after `const existing = ...` and before the `if (isInventoryScanEnabled())` block, add:

```js
    // Always on: a colour in a dialog, no switch. Runs whether or not the
    // scan button is mounted.
    markPass(dialog);
```

Also update the header comment of `init.js` to mention the pass: after the paragraph about the switch, add:

```js
// Independently of the switch, every sync also runs the duplicate-name pass:
// the whole tree from the bridge, the twins from tree-model, the colour from
// name-marks. A rename typed into CDD's name field repaints the label, which
// is a childList mutation, which is a pass — so the row turns orange while
// the user is still typing.
```

- [ ] **Step 4: Build, reload, verify live**

Run: `npm run build`. Reload the unpacked extension, refresh the sandbox tab, open *Edit Locations*:

1. Collapse *Racks*. Click the add-box icon on *room*, type `AAA` in the Name field. Expected: the new row's label turns orange while typing; hover reads `Same name: Locations > Racks > AAA`.
2. Expand *Racks*. Expected: its `AAA` is orange too, tooltip `Same name: Locations > room > AAA`.
3. Change the name to `AAB`. Expected: both labels black, no `title`.
4. Select *room*, rename it to `AAA`. Expected: nothing orange.
5. *Cancel*. Reopen. Expected: no marks; console has no errors from `[CDD scan-racks]`.

- [ ] **Step 5: Commit**

```bash
git add src/content/features/ui-fixes/inventory-location-scan/name-marks.js src/content/features/ui-fixes/inventory-location-scan/styles.js src/content/features/ui-fixes/inventory-location-scan/init.js
git commit -m "duplicate box names: paint them orange in the location tree"
```

---

### Task 5: The scan panel reads the whole tree

**Files:**
- Modify: `src/content/features/ui-fixes/inventory-location-scan/scan-panel.js`

**Interfaces:**
- Consumes: `readTreeNodes(dialog)` (Task 3).
- Produces: `openScanPanel(dialog)` is now `async`; `init.js` calls it without awaiting, which is fine.

- [ ] **Step 1: Swap the source**

Replace the `readTreeRows` import from `./dialog-dom.js` with nothing (remove it from that list), remove `buildNodes` from the `./tree-model.js` import list, and add:

```js
import { readTreeNodes } from "./tree-source.js";
```

Change the signature and the two reads:

```js
// Two clicks on the footer button before the first answer arrives must not
// open two panels.
let opening = false;

export async function openScanPanel(dialog) {
    if (opening) return;
    opening = true;
    closeScanPanel();

    const content = findContent(dialog);
    if (!content) {
        opening = false;
        return;
    }

    // Re-read on every tree click: CDD's own + button can add a location while
    // the panel is up, and a stale snapshot would neither offer it nor catch a
    // duplicate against it. The bridge sees collapsed branches; the DOM does not.
    let nodes = await readTreeNodes(dialog);
    opening = false;
    if (!dialog.isConnected) return;
    let targets = boxTargets(nodes);
```

And in `onTreeClick`, replace `nodes = buildNodes(readTreeRows(dialog));` with `nodes = await readTreeNodes(dialog);`.

- [ ] **Step 2: Build, reload, verify live**

Run: `npm run build`. Reload, open *Edit Locations*, collapse *Racks*, open *Scan racks*:

1. Scan (type + Enter) `aaa`. Expected: the row is struck out and reads `already in Locations > Racks > AAA`; the button stays `Create 0 boxes`.
2. Scan `NEW-1`. Expected: accepted, `Create 1 box`.
3. *Into* still lists `Locations > room` and `Locations > Racks` — and only those.
4. Cancel the panel and the dialog.

- [ ] **Step 3: Commit**

```bash
git add src/content/features/ui-fixes/inventory-location-scan/scan-panel.js
git commit -m "scan racks: check duplicates against collapsed branches too"
```

---

### Task 6: Release 15.11.0

**Files:**
- Modify: `manifest.json` (version `15.10.0` → `15.11.0`)
- Modify: `CHANGELOG.md` (new section above `## [15.10.0]`)
- Modify: `RELEASES.md` (new section above `## 15.10.0`)
- Modify: `docs/FEATURE_CATALOG.md` §6.10 (mention the bridge and the marks)

- [ ] **Step 1: Bump the version**

`"version": "15.11.0"` in `manifest.json`.

- [ ] **Step 2: CHANGELOG entry**

```markdown
## [15.11.0] — 2026-09-15

### Added
- **A box whose name another box already carries is orange in the *Edit
  Locations* tree.** Hovering it names the twins by path — *Same name:
  Locations > Racks > AAA*. Box against box only, anywhere in the vault,
  case-insensitively; a location sharing a box's name is not a clash, and
  neither are two locations. Always on. CDD itself accepts the duplicate
  without a word — measured: a second `AAA` under a different location, Save
  enabled.
- The rename repaints the row while it is being typed, and *Cancel* clears
  everything with the dialog.

### Fixed
- **The Scan racks duplicate check now sees collapsed branches.** MUI does not
  render a collapsed node's children at all, so the 15.9.0 check — read from
  the DOM — missed every rack in a folded location, contrary to what its
  notes claimed. Both the check and the new colour read the whole tree from
  React props through a page-world bridge, pending nodes included; if the
  bridge cannot answer, the DOM read stands in and behaves as before.

### Technical notes
- New `src/inject/hooks/location-tree-bridge.js` (`LOCATION_TREE_REQUEST` →
  `LOCATION_TREE`), the SelectBox bridge's pattern. The content side is
  `inventory-location-scan/tree-source.js` (merges `canTakeBox` from the DOM,
  500 ms timeout, DOM fallback), `tree-model.js` (`isBoxNode`,
  `duplicateBoxNames`) and `name-marks.js`.
- Box versus location is not typed in CDD's props. The rule that held for all
  nine measured node shapes: `organized === false || num_columns > 0`.
- The marks are `data-cdd-dup` on the `li` and `title` on the label —
  attributes React does not manage, so its re-renders leave them alone.
```

- [ ] **Step 3: RELEASES entry**

```markdown
## 15.11.0 — 2026-09-15

**Two boxes with the same name now show up orange in *Edit Locations*.**
Hover the name to see where the other one is.

- Boxes only, across the whole vault. Rename one and the colour goes.
- Scan racks now refuses a code that is already in a folded branch of the tree.

---
```

- [ ] **Step 4: FEATURE_CATALOG §6.10**

Under the existing entry-point list add:

```markdown
- **Duplicate names:** `inventory-location-scan/name-marks.js` paints orange
  every box whose name another box carries (`tree-model.js
  duplicateBoxNames`). The tree is read whole — collapsed branches included —
  from React props via `inject/hooks/location-tree-bridge.js`, wrapped by
  `tree-source.js` with a DOM fallback. Always on.
```

- [ ] **Step 5: Build and commit**

```bash
npm run build
git add manifest.json CHANGELOG.md RELEASES.md docs/FEATURE_CATALOG.md
git commit -m "15.11.0 — boxes with a shared name are orange in the tree"
```

Do not push. Do not tag. Report that the commit is ready for the reload test.
