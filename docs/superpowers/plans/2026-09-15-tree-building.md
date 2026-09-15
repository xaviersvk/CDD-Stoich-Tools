# Tree Building Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In *Edit Locations*: scan or paste `Shelf A > R-1` and get the shelf made on the way; filter the tree by name; pick a rack size from a preset.

**Architecture:** Path parsing and resolution are pure (`tree-model.js`); creation goes through CDD's own buttons (`dialog-dom.js`, a `createLocationUnder` beside `createBoxUnder`); the run in `scan-panel.js` re-reads the tree through the 15.11.0 bridge after every node it makes. The filter is a new `tree-filter.js` that hides rows by attribute and expands branches by asking the bridge to call the tree's own `onExpandedItemsChange`. Presets are a `<select>` in the panel that writes the two number fields.

**Tech Stack:** Plain ES modules, Vite (`npm run build`), throwaway `node` scripts for pure modules. Spec: `docs/superpowers/specs/2026-09-15-tree-building-design.md`.

## Global Constraints

- Path separator is `>`; whitespace around it is trimmed; a trailing `>` means locations only; the last segment is otherwise a box.
- A path is relative to *Into*; it is absolute when its first segment equals the root's name case-insensitively (root name read from the tree).
- Existing segments are reused (case-insensitive match among the children of the current node); a segment that is a box, or a location whose `Create new location` button is hidden, stops the run with a sentence naming it.
- Filter: always on, hides non-matches with `data-cdd-filtered`, expands ancestors of matches through `LOCATION_TREE_EXPAND`, restores the pre-filter expansion on clear. Enter in it is swallowed; Escape clears.
- Presets: `SBS 96 · 12 × 8`, `SBS 384 · 24 × 16`, `Cryobox 9 × 9`, `Cryobox 10 × 10`, `Custom`. Settings unchanged.
- Never press Save. Commit per task. Do not push.

---

### Task 1: Paths — `tree-model.js`

**Files:** Modify `src/content/features/ui-fixes/inventory-location-scan/tree-model.js`; test in scratchpad `tree-paths.test.mjs`.

**Produces:**
- `parsePath(raw, rootName) -> { segments: string[], box: string|null, absolute: boolean } | null`
- `rootOf(nodes) -> node|null` (the node with `parentId === null`)
- `childNamed(nodes, parentId, name) -> node|null` (case-insensitive, normalized)
- `resolvePath(nodes, anchorId, segments) -> { nodeId, missing: string[], error: string|null }`
- `classifyScan(raw, nodes, scans, context)` now takes `context = { targetId }` and returns `{ name, status, where, segments, box, absolute, pathLabel }`.
- `locationsToCreate(scans, nodes, targetId) -> number` (distinct missing prefixes over accepted rows).
- `findPreset(presets, columns, rows) -> preset|null`

- [ ] Test (scratchpad), then implement per the code below, then commit `duplicate box names → tree building: paths in tree-model`.

```js
export function parsePath(raw, rootName) {
    const text = normalizeScan(raw);
    if (!text) return null;
    if (!text.includes(">")) return { segments: [], box: text, absolute: false };
    const parts = text.split(">").map((part) => part.trim());
    const locationsOnly = parts[parts.length - 1] === "";
    const segments = parts.filter(Boolean);
    if (!segments.length) return null;
    let absolute = false;
    if (rootName && key(segments[0]) === key(rootName)) {
        absolute = true;
        segments.shift();
    }
    const box = locationsOnly ? null : (segments.pop() ?? null);
    if (!box && !segments.length) return null;
    return { segments, box, absolute };
}

export function rootOf(nodes) {
    return (nodes || []).find((node) => node.parentId === null) || null;
}

export function childNamed(nodes, parentId, name) {
    const k = key(name);
    return (nodes || []).find((node) => node.parentId === String(parentId) && key(node.name) === k) || null;
}

// Walk the segments down from the anchor. Stops at the first missing one —
// everything after it is `missing` — or at a segment that names a box.
export function resolvePath(nodes, anchorId, segments) {
    let nodeId = String(anchorId);
    const missing = [];
    for (let index = 0; index < segments.length; index += 1) {
        if (missing.length) { missing.push(segments[index]); continue; }
        const child = childNamed(nodes, nodeId, segments[index]);
        if (!child) { missing.push(segments[index]); continue; }
        if (child.isBox) return { nodeId, missing: [], error: `"${child.name}" is a box, not a location` };
        nodeId = child.id;
    }
    return { nodeId, missing, error: null };
}
```

`classifyScan(raw, nodes, scans, context = {})`:

```js
    const root = rootOf(nodes);
    const parsed = parsePath(raw, root?.name);
    if (!parsed) return null;
    const { segments, box, absolute } = parsed;
    const anchorId = absolute ? root?.id : context.targetId;
    const pathLabel = segments.join(" > ");
    const base = { segments, box, absolute, pathLabel, where: null };

    if (box) {
        const k = key(box);
        const inTree = (nodes || []).find((node) => key(node.name) === k);
        if (inTree) return { ...base, name: box, status: SCAN_IN_TREE, where: inTree.path };
        if ((scans || []).some((scan) => scan.box && key(scan.box) === k)) return { ...base, name: box, status: SCAN_IN_LIST };
        return { ...base, name: box, status: SCAN_OK };
    }

    // Locations only: refused when the whole path is already there, or when
    // another row in the list already promises it.
    const name = segments[segments.length - 1];
    const pathKey = `${anchorId}/${segments.map(key).join(">")}`;
    const resolved = anchorId == null ? null : resolvePath(nodes, anchorId, segments);
    if (resolved && !resolved.error && !resolved.missing.length) {
        const node = (nodes || []).find((n) => n.id === resolved.nodeId);
        return { ...base, name, status: SCAN_IN_TREE, where: node?.path ?? pathLabel };
    }
    if ((scans || []).some((scan) => !scan.box && scan.pathKey === pathKey)) return { ...base, name, status: SCAN_IN_LIST };
    return { ...base, name, status: SCAN_OK, pathKey };
```

`locationsToCreate(scans, nodes, targetId)`: for each accepted scan, anchor as above, `resolvePath`; for each missing segment push `${resolved.nodeId}/${missingPrefix.map(key).join(">")}` into a Set; return its size.

`findPreset(presets, columns, rows)`: first preset with both equal, else null.

---

### Task 2: `createLocationUnder` — `dialog-dom.js`

Generalise the creation: `createNamedNode(dialog, { parentId, buttonLabel, name, cannot })` does click → wait → selected → set name → confirm label, and returns the created `li`. `createBoxUnder` calls it with `ADD_BOX_LABEL` then sizes; new `createLocationUnder(dialog, { parentId, name })` calls it with `"Create new location"` and the message `"X" already holds boxes and cannot hold a location`. Both keep their current error sentences. Commit `tree building: create a location through CDD's own button`.

---

### Task 3: The panel — paths, counts, presets (`scan-panel.js`, `styles.js`)

- `addScan(raw, size)` passes `{ targetId: state.targetId }` to `classifyScan`; the row stores what it returns. Size fields only for rows with `box`.
- `render()`: a row with `pathLabel` shows `<span class="cdd-scan-path">Shelf A ›</span>` before the name; a locations-only row shows a `<span class="cdd-scan-kind">location</span>` chip in place of the size.
- Button text: `Create N boxes` plus `, M locations` when `M = locationsToCreate(...) > 0`; a run with only locations reads `Create M locations`. Enabled when `count + M > 0`.
- Run: per accepted scan, `anchor = scan.absolute ? rootOf(nodes).id : state.targetId`; loop `resolvePath` → `createLocationUnder` for the first missing segment → `nodes = await readTreeNodes(dialog)` → repeat until none missing; then `createBoxUnder` if `scan.box`. `resolvePath.error` throws.
- Presets: `PRESETS` constant; `<select class="cdd-scan-preset">` inserted first in the *New rows* label; `change` sets the pair, writes both inputs, `applyDefaultSize()`, `render()`; the two number `change` handlers end with `syncPreset()`, which sets the select to `findPreset(...)?.label ?? "custom"`. Called once on open.
- CSS: `.cdd-scan-path { color: rgba(0,0,0,0.5); font-weight: 400; margin-right: 4px; }`, `.cdd-scan-kind { color: rgba(0,0,0,0.5); font-style: italic; }`.

Commit `tree building: paths, a location count and size presets in the panel`.

---

### Task 4: The filter (`location-tree-bridge.js`, `event-types.js`, `tree-source.js`, `tree-filter.js`, `init.js`, `styles.js`)

- Bridge: `LOCATION_TREE` payload gains `expanded: (props.expandedItems || []).map(String)`; handle `LOCATION_TREE_EXPAND { ids }` by calling `props.onExpandedItemsChange(null, ids.map(String))`. Event names added to `event-types.js`.
- `tree-source.js`: `readTreeNodes` unchanged; new `readTreeState(dialog) -> { nodes, expanded }` (the same request; `expanded` `[]` on fallback) and `expandTree(ids)` posting `LOCATION_TREE_EXPAND`.
- `tree-filter.js`: `mountTreeFilter(dialog)` (idempotent), `paintTreeFilter(dialog)` (re-applies `data-cdd-filtered` from module state), logic per spec §B.
- `init.js`: `sync()` mounts the filter when the dialog has a `.left-column`; `markPass` calls `paintTreeFilter(dialog)` after the marks.
- CSS: `.cdd-tree-filter { … }` and `li[role="treeitem"][data-cdd-filtered] { display: none; }`.

Commit `tree building: a filter over the location tree`.

---

### Task 5: Release 15.12.0

`manifest.json` → `15.12.0`; CHANGELOG, RELEASES, FEATURE_CATALOG §6.10; `npm run build`; commit `15.12.0 — paths, a filter and presets for the location tree`. Stop. No push, no tag.
