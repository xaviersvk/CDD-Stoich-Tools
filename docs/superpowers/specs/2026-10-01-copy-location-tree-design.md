# Copy a location tree into another vault — design

Date: 2026-10-01
Status: designed, source and target measured live (vaults 1000000109 → 1000000075)

A **Copy tree** button in the *Edit Locations* footer puts the whole location
tree on the clipboard as text, one line per location or box. In another
vault, the same text pasted into *Scan racks* builds that tree. Nothing new
creates anything: the paste goes through the panel that already builds
paths and boxes, and **Save stays the user's**.

## What was measured (2026-10-01)

**Source, vault 1000000109.** One root (`Locations`), 19 locations, 8 boxes,
4 levels deep. Boxes: 4 × organized 9 × 9, 3 × organized 24 × 16, 1 ×
unorganized (`UBox1`). The tree also holds **7 plates** — nodes with
`plate_id` and `can_drag`, no `organized` / `num_columns` — such as
`plate_35465` and "1 plate at this location". Today's `isBoxNode` reads them
as locations.

Raw node keys (React props behind `ul[role=tree]`): `id, value,
display_order, children, parent, parent_id, organized, num_columns,
num_rows, position_limit, filled_position_count, has_event_history, plates,
num_of_inaccessible_plates`, plus `capacity` on the unorganized box and
`plate_id, can_drag` on plates. The name is `value`.

**Target, vault 1000000075.** Empty: the root `Locations` alone. *Scan
racks* opens with **Into empty and the scan box disabled** — the root
takes locations but no box, and `boxTargets()` lists only nodes that can
take a box. Today nothing can be pasted into an empty vault.

**Scan racks today** (`inventory-location-scan/`): a pasted line is
`path ⇥ columns ⇥ rows` or `path ⇥ capacity`; a path starting with the
root's name is absolute; a trailing `>` means locations only; missing
locations are created on the way (`ensurePath`). *Organized* is one
checkbox for the whole panel, passed to every `createBoxUnder`. A box name
already in the tree or in the list is refused (a barcode is one rack).

## Design

### 1. The bridge tells plates and box sizes apart

`inject/hooks/location-tree-bridge.js` `flatten()` adds to each node:

- `isPlate`: `node.plate_id != null`;
- `organized`: `node.organized === false ? false : true`;
- `columns`, `rows`: `Number(node.num_columns) || 0`, `Number(node.num_rows) || 0`;
- `capacity`: `Number(node.capacity) || 0` — measured on `UBox1`:
  `organized: false, capacity: 100`, no `position_limit`.

`isBox` is unchanged (a plate has neither `organized` nor `num_columns`, so it
was never a box). `tree-source.js` gains `readRawTree()` — the bridge's flat
list, or null — for the copy. The scan panel's own node list is **not**
changed: plates keep counting in its duplicate check as today, so *Scan
racks* behaves exactly as before for everything but the two points in §3.

### 2. Copy tree — `tree-text.js` (DOM-free) + a footer button

`tree-text.js` holds both directions of the text: `treeToLines` (new) and
`parsePastedLine` (moved out of `scan-panel.js`, so `node` can check the
round trip; it imports only the sanitizers from `shared/inventory-scan.js`,
which touch `chrome` inside functions only).

`treeToLines(rawNodes)` takes the bridge's flat list (root first) and
returns the text:

- Order: depth first, as the bridge lists them — but under one parent
  **locations (with their subtrees) before boxes**. Measured: `Bench 1`
  holds a box *and* three locations, and CDD offers no "Create new location"
  on a location that already holds a box; built in the other order, the run
  would stop at the first sub-location.
- Each line is absolute: `<root name> > … > <name>`.
- A **box**: organized → `path ⇥ columns ⇥ rows`; unorganized →
  `path ⇥ capacity`.
- A **location** gets its own line, ending ` >`, only when nothing that is
  copied sits under it (no box, no location) — the others appear as path
  segments of their children. A location that held only plates is therefore
  copied empty.
- **Plates** are skipped.
- Lines joined with `\n`; returns `{ text, locations, boxes }`.

The button **Copy tree** goes in the footer next to *Scan racks*, always on
(it only reads). Click → bridge read → `treeToLines` → `copyText`. The
button's text reads *Copied 19 locations, 8 boxes* for 2 s, then returns.
Bridge silent → *Could not read the tree* (the DOM alone is not the tree).

### 3. Scan racks takes a whole tree

- **Per-row box kind.** A pasted line with two numbers makes an organized
  row, one number an unorganized row (`scan.organized`); a row with no
  numbers follows the panel's checkbox, as now. `createBoxUnder` gets
  `scan.organized ?? state.organized`. A row shows ×-inputs or a capacity
  input by its own kind.
- **Empty vault.** The scan box is enabled when there are no targets.
  A relative row with no *Into* is `SCAN_BLOCKED` with "pick a location in
  Into first, or start the line with Locations"; absolute rows are judged
  as now. *Create* is enabled when there are accepted rows and either a
  target or no relative rows among them. The opening status for a tree with
  no targets becomes "No location can hold a box yet — paste paths that
  start with Locations, or create one first."
- Duplicate box names stay refused, as now.

### Error handling

Unchanged: the run stops at the first failure with how far it got; what was
created stays pending in the tree for CDD's own *Cancel*; Save is never
pressed.

## Testing

- `scripts/check-location-tree.mjs` (`node`): `treeToLines` on a fixture
  shaped like vault 1000000109 (root, nested locations, organized and
  unorganized boxes, plates, a location holding only plates) — exact text;
  `parsePastedLine` / classification of the produced lines against an empty
  tree (root only): every line accepted, none blocked; a relative line with
  no target → blocked.
- `npm run build`.
- Live, after the user reloads: *Copy tree* in 1000000109 (read only),
  paste into *Scan racks* in 1000000075, read the list; the user is told
  what *Create* will make before it is pressed; after *Create*, the bridge's
  tree in 1000000075 is compared with the source (names, nesting, sizes,
  kinds). Save is the user's.

## Out of scope

- Plates and samples (they are data, not locations).
- Copying into a sub-location of a non-empty tree with relative paths
  (possible by editing the text: drop the leading `Locations >` and pick
  *Into*).
- Renaming duplicates.
