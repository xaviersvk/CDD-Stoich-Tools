# Copy a Location Tree Into Another Vault — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** *Copy tree* in *Edit Locations* puts the whole location tree on the clipboard as Scan-racks text; pasting it into *Scan racks* in another (even empty) vault builds the same tree.

**Architecture:** A DOM-free `tree-text.js` turns the bridge's flat tree into lines and parses pasted lines (moved out of `scan-panel.js`). The page-world bridge adds plate/size fields. *Scan racks* gets a per-row box kind and works in a vault with no box-capable location. A footer button does the copy.

**Tech Stack:** plain ES modules, MV3 content + page-world inject, Vite, `node` checks.

Spec: `docs/superpowers/specs/2026-10-01-copy-location-tree-design.md`.

## Global Constraints

- Line format: `<root> > … > <name>`; organized box `⇥ columns ⇥ rows`; unorganized box `⇥ capacity`; empty location ends ` >`. TAB is the only column separator.
- Under one parent: locations (with subtrees) before boxes. Plates (`plate_id != null`) are never copied.
- Save is never pressed by the extension. Nothing in CDD is written by *Copy tree*.
- *Scan racks* keeps its duplicate rule (a box name once per tree and list) and its node list (plates included).
- Test vaults: source **1000000109** (read only), target **1000000075** (writes allowed after the user is told what *Create* makes). Never 8289.
- Work on branch `copy-location-tree`, in place (no worktree). No push, no tag.

## File Structure

| File | Responsibility |
|---|---|
| `src/content/features/ui-fixes/inventory-location-scan/tree-text.js` (new) | `treeToLines`, `parsePastedLine` |
| `src/content/features/ui-fixes/inventory-location-scan/scan-panel.js` | per-row kind, empty vault, import `parsePastedLine` |
| `src/content/features/ui-fixes/inventory-location-scan/tree-model.js` | `classifyScan` blocks relative rows with no target |
| `src/inject/hooks/location-tree-bridge.js` | `isPlate, organized, columns, rows, capacity` per node |
| `src/content/features/ui-fixes/inventory-location-scan/tree-source.js` | `readRawTree()` |
| `src/content/features/ui-fixes/inventory-location-scan/tree-copy-button.js` (new) | the footer button |
| `src/content/features/ui-fixes/inventory-location-scan/init.js` | mounts the button, always on |
| `src/content/features/ui-fixes/inventory-location-scan/styles.js` | the button shares `.cdd-scan-open`'s look |
| `scripts/check-location-tree.mjs` (new) | `node` check |

---

### Task 1: `tree-text.js` — the tree as text, both ways

**Files:** Create `tree-text.js`, `scripts/check-location-tree.mjs`; modify `scan-panel.js` (drop local `parsePastedLine`, import it).

**Interfaces — Produces:** `treeToLines(nodes) -> { text, locations, boxes }` where `nodes = [{ id, parentId, name, isBox, isPlate, organized, columns, rows, capacity }]` (root has `parentId == null`); `parsePastedLine(line) -> { name, size: { columns, rows, organized: true } | { capacity, organized: false } | null }`.

- [ ] **Step 1: Branch**

```bash
git checkout -b copy-location-tree
```

- [ ] **Step 2: Failing check** — create `scripts/check-location-tree.mjs`:

```js
// scripts/check-location-tree.mjs
//
// node scripts/check-location-tree.mjs — Copy tree and the paste it feeds,
// on the tree measured in vault 1000000109 (2026-10-01). Silent on success.

import assert from "node:assert/strict";
import { parsePastedLine, treeToLines } from "../src/content/features/ui-fixes/inventory-location-scan/tree-text.js";
import { SCAN_BLOCKED, SCAN_OK, buildNodes, classifyScan } from "../src/content/features/ui-fixes/inventory-location-scan/tree-model.js";

let next = 1;
const nodes = [];
const loc = (name, parentId) => { const id = String(next++); nodes.push({ id, parentId, name, isBox: false, isPlate: false, organized: true, columns: 0, rows: 0, capacity: 0 }); return id; };
const box = (name, parentId, columns, rows) => nodes.push({ id: String(next++), parentId, name, isBox: true, isPlate: false, organized: true, columns, rows, capacity: 0 });
const ubox = (name, parentId, capacity) => nodes.push({ id: String(next++), parentId, name, isBox: true, isPlate: false, organized: false, columns: 0, rows: 0, capacity });
const plate = (name, parentId) => nodes.push({ id: String(next++), parentId, name, isBox: false, isPlate: true, organized: true, columns: 0, rows: 0, capacity: 0 });

const root = loc("Locations", null);
const lab1 = loc("Lab 1", root);
const fridge1 = loc("Fridge 1", lab1);
box("Box 1", fridge1, 9, 9);
box("IOCB_1", fridge1, 24, 16);
box("IOCB_3", fridge1, 24, 16);
box("IOCB_2", fridge1, 24, 16);
plate("plate_35465", fridge1);
plate("IOCB_3", fridge1);
const hood1 = loc("Hood 1", lab1);
const bench1 = loc("Bench 1", hood1);
ubox("UBox1", bench1, 100);
loc("1 plate at this", bench1);
loc("1 plate at this lon", bench1);
loc("1 plate at this location", bench1);
plate("Plate002ABC", bench1);
const lab2 = loc("Lab 2", root);
const fridge2 = loc("Fridge 2", lab2);
box("Box 2", fridge2, 9, 9);
box("Box 3", fridge2, 9, 9);
plate("platenew123", fridge2);
const lab3 = loc("Lab 3", root);
const hood2 = loc("hood 2", lab3);
box("Box 4", hood2, 9, 9);

const expected = [
    "Locations > Lab 1 > Fridge 1 > Box 1\t9\t9",
    "Locations > Lab 1 > Fridge 1 > IOCB_1\t24\t16",
    "Locations > Lab 1 > Fridge 1 > IOCB_3\t24\t16",
    "Locations > Lab 1 > Fridge 1 > IOCB_2\t24\t16",
    "Locations > Lab 1 > Hood 1 > Bench 1 > 1 plate at this >",
    "Locations > Lab 1 > Hood 1 > Bench 1 > 1 plate at this lon >",
    "Locations > Lab 1 > Hood 1 > Bench 1 > 1 plate at this location >",
    "Locations > Lab 1 > Hood 1 > Bench 1 > UBox1\t100",
    "Locations > Lab 2 > Fridge 2 > Box 2\t9\t9",
    "Locations > Lab 2 > Fridge 2 > Box 3\t9\t9",
    "Locations > Lab 3 > hood 2 > Box 4\t9\t9",
].join("\n");

const copied = treeToLines(nodes);
assert.equal(copied.text, expected);
assert.equal(copied.locations, 11);
assert.equal(copied.boxes, 8);

// The paste side reads each line back with its own kind.
assert.deepEqual(parsePastedLine("A > B\t9\t9"), { name: "A > B", size: { columns: 9, rows: 9, organized: true } });
assert.deepEqual(parsePastedLine("A > U\t100"), { name: "A > U", size: { capacity: 100, organized: false } });
assert.deepEqual(parsePastedLine("A > B >"), { name: "A > B >", size: null });
```

- [ ] **Step 3: Run — expect failure**

Run: `node scripts/check-location-tree.mjs`
Expected: `ERR_MODULE_NOT_FOUND` for `tree-text.js`.

- [ ] **Step 4: Create `tree-text.js`**

```js
// content/features/ui-fixes/inventory-location-scan/tree-text.js
//
// The location tree as text, both ways — the format Scan racks has always
// taken from Excel, one line per thing:
//
//   Locations > Lab 1 > Fridge 1 > Box 1 ⇥ 9 ⇥ 9    an organized box
//   Locations > Lab 1 > Bench 1 > UBox1 ⇥ 100       an unorganized box
//   Locations > Lab 2 > Freezer >                   an empty location
//
// Copy tree writes it from one vault's tree; a paste into Scan racks in
// another vault reads it back. TAB is the only column separator — a comma
// may sit inside a rack code. No DOM here, so `node` can check the round trip.

import { sanitizeBoxSide, sanitizeCapacity } from "../../../../shared/inventory-scan.js";

// A line is a name or a path, then optionally two numbers (columns and rows:
// an organized box) or one (capacity: an unorganized box). The numbers decide
// the box's kind; a line without them follows the panel's checkbox.
export function parsePastedLine(line) {
    const parts = String(line ?? "").split("\t").map((part) => part.trim());
    const name = parts.shift() || "";
    const columns = sanitizeBoxSide(parts[0], null);
    const rows = sanitizeBoxSide(parts[1], null);
    if (columns && rows) return { name, size: { columns, rows, organized: true } };
    const capacity = parts[1] === undefined || parts[1] === "" ? sanitizeCapacity(parts[0], null) : null;
    return { name, size: capacity ? { capacity, organized: false } : null };
}

// `nodes`: the bridge's flat list (inject/hooks/location-tree-bridge.js),
// depth first, root first with parentId null. Plates are not locations and
// are left out. Under one parent, locations go before boxes: CDD offers no
// "Create new location" on a location that already holds a box (measured on
// Bench 1, vault 1000000109), so built box-first the paste would stop.
// A location gets a line of its own only when nothing copied sits under it;
// the rest are path segments of their children.
export function treeToLines(nodes) {
    const list = (nodes || []).filter((node) => node && !node.isPlate);
    const children = new Map();
    for (const node of list) {
        const parent = node.parentId == null ? null : String(node.parentId);
        if (!children.has(parent)) children.set(parent, []);
        children.get(parent).push(node);
    }
    const root = list.find((node) => node.parentId == null);
    const lines = [];
    let locations = 0;
    let boxes = 0;
    if (!root) return { text: "", locations, boxes };

    const walk = (node, path) => {
        const kids = children.get(String(node.id)) || [];
        if (node !== root && !kids.length) lines.push(`${path} >`);
        for (const child of kids.filter((kid) => !kid.isBox)) {
            locations += 1;
            walk(child, `${path} > ${child.name}`);
        }
        for (const child of kids.filter((kid) => kid.isBox)) {
            boxes += 1;
            const at = `${path} > ${child.name}`;
            if (child.organized === false) lines.push(child.capacity > 0 ? `${at}\t${child.capacity}` : at);
            else lines.push(child.columns > 0 && child.rows > 0 ? `${at}\t${child.columns}\t${child.rows}` : at);
        }
    };
    walk(root, root.name);
    return { text: lines.join("\n"), locations, boxes };
}
```

- [ ] **Step 5: `scan-panel.js` uses it**

Delete the local `parsePastedLine` function and its comment block (the `// Excel puts a TAB between columns…` comment through the closing `}`), and add to the imports:

```js
import { parsePastedLine } from "./tree-text.js";
```

If `sanitizeBoxSide` is still used elsewhere in `scan-panel.js` it stays imported (it is — the size inputs); leave the shared import as is.

- [ ] **Step 6: Check + build**

Run: `node scripts/check-location-tree.mjs && npm run build`
Expected: silent check, two `✓ built`.

- [ ] **Step 7: Commit**

```bash
git add scripts/check-location-tree.mjs src/content/features/ui-fixes/inventory-location-scan/tree-text.js src/content/features/ui-fixes/inventory-location-scan/scan-panel.js
git commit -m "location tree as text: treeToLines, parsePastedLine with the box kind per line"
```

---

### Task 2: The bridge carries plates and box sizes

**Files:** `src/inject/hooks/location-tree-bridge.js`, `src/content/features/ui-fixes/inventory-location-scan/tree-source.js`.

**Interfaces — Produces:** bridge node `{ id, parentId, name, isBox, isPlate, organized, columns, rows, capacity }`; `readRawTree() -> Promise<node[] | null>`.

- [ ] **Step 1: `flatten()`** — replace the `out.push({...})` with:

```js
        out.push({
            id,
            parentId,
            name: String(node.value ?? "").trim(),
            isBox: isBoxNode(node),
            // A plate sits in the tree like a location but is not one: it has
            // plate_id and neither organized nor num_columns (measured, vault
            // 1000000109). Copy tree leaves it out.
            isPlate: node.plate_id != null,
            organized: node.organized !== false,
            columns: Number(node.num_columns) || 0,
            rows: Number(node.num_rows) || 0,
            // An unorganized box's size; measured `capacity: 100` on UBox1.
            capacity: Number(node.capacity) || 0,
        });
```

and in the header protocol comment change `nodes: [{ id, parentId, name, isBox }]` to `nodes: [{ id, parentId, name, isBox, isPlate, organized, columns, rows, capacity }]`.

- [ ] **Step 2: `readRawTree()` in `tree-source.js`** — append:

```js
// The bridge's own list — sizes and plates included — for Copy tree, or null
// when the bridge is silent. No DOM fallback: the DOM shows only what is
// expanded, and half a tree copied without a word is worse than none.
export async function readRawTree() {
    return (await requestBridge())?.nodes ?? null;
}
```

- [ ] **Step 3: Check + build + commit**

Run: `node --check src/inject/hooks/location-tree-bridge.js && npm run build`

```bash
git add src/inject/hooks/location-tree-bridge.js src/content/features/ui-fixes/inventory-location-scan/tree-source.js
git commit -m "location tree bridge: plates, box kind and size per node; readRawTree"
```

---

### Task 3: *Scan racks* takes a whole tree

**Files:** `tree-model.js` (`classifyScan`), `scan-panel.js`, `scripts/check-location-tree.mjs`.

- [ ] **Step 1: Failing check** — append to `scripts/check-location-tree.mjs`:

```js
// Pasted into an empty vault (the root alone, no Into): every copied line is
// accepted; a relative line is refused until Into is picked.
{
    const empty = buildNodes([{ id: "1", parentId: "undefined", name: "Locations", rendered: true, canTakeLocation: true, canTakeBox: false }]);
    const kept = [];
    for (const line of copied.text.split("\n")) {
        const scan = classifyScan(parsePastedLine(line).name, empty, kept, { targetId: null });
        assert.equal(scan.status, SCAN_OK, line);
        kept.push(scan);
    }
    assert.equal(kept.length, 11);
    assert.equal(classifyScan("Shelf A > R-1", empty, [], { targetId: null }).status, SCAN_BLOCKED);
}
```

Run: `node scripts/check-location-tree.mjs` — Expected: FAIL on the `SCAN_BLOCKED` assertion (relative row is `ok` today).

- [ ] **Step 2: `classifyScan`** — in `tree-model.js`, right after `const base = { … };` add:

```js
    // No Into (a vault with no location that holds a box yet): only a path
    // from the root says where the row goes. `null`, not undefined — a caller
    // that passes no context keeps today's behaviour.
    if (!absolute && context.targetId === null) {
        const name = box ?? segments[segments.length - 1];
        return { ...base, name, status: SCAN_BLOCKED, where: `pick a location in Into first, or start the line with ${root?.name ?? "the root"}` };
    }
```

Run the check — Expected: silent.

- [ ] **Step 3: Per-row kind in `scan-panel.js`**

In `addScan`, after `scan.capacity = …;` add:

```js
        // Two numbers made an organized box, one an unorganized one; no
        // numbers, and the row follows the Organized checkbox.
        scan.organized = size?.organized;
```

In `render()`, replace `} else if (state.organized && !state.busy) {` with:

```js
            } else if ((scan.organized ?? state.organized) && !state.busy) {
```

In `createAll()`, replace `organized: state.organized,` with `organized: scan.organized ?? state.organized,`.

- [ ] **Step 4: Empty vault in `scan-panel.js`**

- In `render()`: `scanInput.disabled = state.busy || !targets.length;` → `scanInput.disabled = state.busy;`
- In `render()`: `createButton.disabled = state.busy || (boxes + locations) === 0 || !state.targetId;` → `createButton.disabled = state.busy || (boxes + locations) === 0;` (a relative row with no target is blocked, so every accepted row has an anchor).
- In `createAll()`: `if (state.busy || !pending.length || !state.targetId) return;` → `if (state.busy || !pending.length) return;`
- The opening status: `"There is no location that can hold a box. Create one first."` → `"No location can hold a box yet — paste paths that start with Locations, or create one first."`

- [ ] **Step 5: Check + build + commit**

Run: `node scripts/check-location-tree.mjs && node scripts/check-form-rows.mjs && npm run build`

```bash
git add src/content/features/ui-fixes/inventory-location-scan/tree-model.js src/content/features/ui-fixes/inventory-location-scan/scan-panel.js scripts/check-location-tree.mjs
git commit -m "Scan racks: box kind per row, and paths from the root into an empty vault"
```

---

### Task 4: The *Copy tree* button

**Files:** Create `tree-copy-button.js`; modify `init.js`, `styles.js`.

- [ ] **Step 1: `tree-copy-button.js`**

```js
// content/features/ui-fixes/inventory-location-scan/tree-copy-button.js
//
// "Copy tree" in the Edit Locations footer: the whole tree — collapsed
// branches included, plates left out — onto the clipboard as the lines Scan
// racks reads (tree-text.js). It only reads, so it is always there, with or
// without the Scan racks switch. Pasted into Scan racks in another vault, the
// text builds the same tree.

import { copyText } from "../../../utils/clipboard.js";
import { footerAnchor } from "./dialog-dom.js";
import { treeToLines } from "./tree-text.js";
import { readRawTree } from "./tree-source.js";

const BUTTON_CLASS = "cdd-tree-copy";
const LABEL = "Copy tree";
const FLASH_MS = 2500;

function plural(count, noun) {
    return `${count} ${noun}${count === 1 ? "" : (noun === "box" ? "es" : "s")}`;
}

async function copyTree(button) {
    button.disabled = true;
    let said;
    try {
        const nodes = await readRawTree();
        if (!nodes) said = "Could not read the tree";
        else {
            const { text, locations, boxes } = treeToLines(nodes);
            if (!text) said = "Nothing to copy";
            else if (await copyText(text)) said = `Copied ${plural(locations, "location")}, ${plural(boxes, "box")}`;
            else said = "Could not copy";
        }
    } catch (error) {
        console.warn("[CDD scan-racks] copy tree failed", error);
        said = "Could not copy";
    }
    button.textContent = said;
    setTimeout(() => {
        button.textContent = LABEL;
        button.disabled = false;
    }, FLASH_MS);
}

export function ensureTreeCopyButton(dialog, footer) {
    if (!footer || footer.querySelector(`.${BUTTON_CLASS}`)) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = BUTTON_CLASS;
    button.textContent = LABEL;
    button.addEventListener("click", () => copyTree(button));
    const anchor = footerAnchor(footer);
    if (anchor) footer.insertBefore(button, anchor);
    else footer.prepend(button);
}
```

- [ ] **Step 2: `init.js`** — import `ensureTreeCopyButton` from `./tree-copy-button.js`; in `sync()`, after `void markPass(dialog);` add:

```js
    // Copy tree only reads, so it does not wait for the Scan racks switch.
    ensureTreeCopyButton(dialog, findFooter(dialog));
```

and update the header comment's first paragraph to mention the second button.

- [ ] **Step 3: `styles.js`** — change the three `.cdd-scan-open` selectors to also cover `.cdd-tree-copy`:

```css
    .cdd-scan-open,
    .cdd-tree-copy {
    ...
    .cdd-scan-open:hover,
    .cdd-tree-copy:hover { text-decoration: underline; }
    .cdd-scan-open[disabled],
    .cdd-tree-copy[disabled] { color: rgba(0, 0, 0, 0.38); cursor: default; }
```

- [ ] **Step 4: Build + commit**

Run: `node scripts/check-location-tree.mjs && npm run build`

```bash
git add src/content/features/ui-fixes/inventory-location-scan
git commit -m "Copy tree in the Edit Locations footer"
```

- [ ] **Step 5: Test (stop here)** — the user reloads the extension. Then:
1. Vault 1000000109 → *Edit Locations* → *Copy tree*: label reads *Copied 11 locations, 8 boxes*; read the clipboard text back (paste into the Scan racks box of the same vault and Cancel, or `navigator.clipboard.readText()`), compare with the expected text in the check.
2. Vault 1000000075 → *Edit Locations* → *Scan racks* → paste: 11 rows, all accepted, UBox1 with a capacity input, the rest with × inputs.
3. Tell the user exactly what *Create* makes; on their yes, press *Create* (not Save), then compare the bridge's tree with the source (names, nesting, kinds, sizes). The user presses Save (or Cancel).

---

### Task 5: Docs — Unreleased

- [ ] `docs/FEATURE_CATALOG.md` §6.10: a **Copy tree** bullet (button, text format, plates skipped, locations before boxes) and the two *Scan racks* changes (box kind per row; empty vault with paths from the root); entry files `tree-text.js`, `tree-copy-button.js`; `node scripts/check-location-tree.mjs`.
- [ ] `CHANGELOG.md` `## [Unreleased]`: add under *Added* — Copy tree; *Changed* — Scan racks per-row kind (a one-number line now makes an unorganized box whatever the checkbox says), empty-vault paste; the bridge fields; measurements. Update the note's manifest number.
- [ ] `RELEASES.md` `## Unreleased`: add one bullet — `**Copy tree** in *Edit Locations* copies the whole location tree; paste it into **Scan racks** in another vault to build it there.`
- [ ] `manifest.json` → `18.9.0`; `npm run build`; commit; merge `copy-location-tree` into `main` with `--no-ff` (message from a file, not stdin). No push, no tag.
