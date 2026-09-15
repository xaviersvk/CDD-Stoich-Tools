# Building the location tree faster — design

Date: 2026-09-15
Status: designed

Three additions to *Edit Locations*, all on top of the 15.11.0 bridge that
reads the whole tree from React props. One release, 15.12.0.

1. **Paths in Scan racks** — a line may carry a path, and the missing
   locations along it are created before the box.
2. **A filter over the tree** — type a name, see the matches and nothing
   else.
3. **Size presets** — pick *SBS 96* instead of typing 12 and 8.

## What exists today (verified live, vault 6772)

- A location that already holds a **box** shows only the add-box button;
  CDD allows no sub-location under it. A location that holds locations, or
  nothing, shows both `Create new location` and
  `Create new organized or unorganized box`. The root shows only
  `Create new location`.
- `Create new location` on a location appends a pending `Location N` under
  it and selects it, and the Name field for a **location** carries the same
  id `location-box-node-name` as the one for a box. Nesting is unbounded as
  far as measured (three levels).
- The tree is a controlled MUI `SimpleTreeView`: props carry `expandedItems`
  (an array of **string** ids) and `onExpandedItemsChange(event, ids)`.
  Calling the handler with a new array expands and collapses accordingly;
  calling it with a number where a string is expected does nothing.
- Collapsed children are not rendered. Anything that hides or shows rows has
  to expand first, then hide.
- The scan panel's Enter handler sits on `window` in the capture phase and
  claims Enter anywhere inside the dialog while the panel is open.

## Decisions

- **Paths are relative to *Into*.** A line whose first segment is the
  root's own name (case-insensitively; read from the tree, not hard-coded)
  is absolute. So a whole vault can be pasted from one column.
- **The last segment is a box.** A line ending in `>` creates locations
  only. Racks are the common case and get no marker.
- **Existing segments are reused, missing ones created.** A segment that
  names a box, or a location that holds boxes and so cannot take a
  sub-location, stops the run with a sentence that says which.
- **The filter hides what does not match** and shows every match with the
  path above it. Clearing it restores the expansion the user had before
  typing. Always on, no switch.
- **Four presets plus Custom.** SBS 96 (12 × 8), SBS 384 (24 × 16),
  Cryobox 9 × 9, Cryobox 10 × 10. The two number fields stay; the preset
  fills them, and editing them flips the preset back to whatever matches or
  to Custom. Settings keep their numeric defaults.

## A. Paths in Scan racks

### Parsing — `tree-model.js`

`parsePath(raw, rootName)` → `{ segments: string[], box: string|null,
absolute: boolean }`, or `null` for an empty line.

- Split on `>` with surrounding whitespace trimmed; empty inner segments
  are dropped, a trailing empty segment means *locations only*.
- `absolute` when the first segment equals `rootName` case-insensitively;
  that segment is then removed.
- One segment and no trailing `>` is today's plain box name: `segments: []`.

The paste parser (`parsePastedLine` in `scan-panel.js`) keeps its TAB rule:
column 1 is the path, columns 2 and 3 the size.

### Rows

A scan row grows `segments` (the location path, possibly empty),
`absolute`, and `box` (`null` for a locations-only row). `classifyScan`
takes the parsed path: a box name is checked against the whole tree and the
list exactly as today. A locations-only row whose path already exists in
full is refused *already in the tree*; otherwise it is accepted.

`acceptedScans` is unchanged. The footer counts boxes and, when any row
will create locations, says so: *Create 3 boxes, 2 locations* — the
location count is the number of distinct path prefixes not yet in the tree,
computed against the current nodes so that two rows sharing a new shelf
count it once.

### The run — `dialog-dom.js` and `scan-panel.js`

`createLocationUnder(dialog, { parentId, name })` mirrors
`createBoxUnder`: find the parent row, require its `Create new location`
button to be shown (else throw *"X" already holds boxes and cannot hold a
location*), click, wait for the new node, require it selected, set the name
through `#location-box-node-name`, confirm the label.

For every accepted row, in list order:

1. `anchor` = the root when `absolute`, else `state.targetId`.
2. For each segment: re-read nodes through the bridge; find a child of the
   current node whose name matches case-insensitively. A box → throw
   *"X" is a box, not a location*. Missing → `createLocationUnder`. Move
   down.
3. If `box` is set: `createBoxUnder` under the final node, as today.

The panel closes on success as today; on failure it stops, keeps what it
made, and reports *Created 2 of 5. Stopped at "…" — reason.*

### The list

A row with a path shows the path dimmed before the box name
(`Miestnosť 2 > Polica 3 ›` then `RACK-0417`), a locations-only row shows
the path and a *location* chip where the size would be. Size inputs appear
only on rows with a box.

## B. The filter

### Bridge — `location-tree-bridge.js`

`LOCATION_TREE` answers grow an `expanded: string[]` field (the current
`expandedItems`). One new request:

```
LOCATION_TREE_EXPAND { ids: string[] }
```

The bridge finds the tree props and calls `onExpandedItemsChange(null,
ids)`. No answer; the tree repaints and the observer sees it.

### Content — `inventory-location-scan/tree-filter.js`

Mounted by `init.js` inside `.left-column`, above `ul[role="tree"]`, as
`<input class="cdd-tree-filter" placeholder="Filter locations and boxes">`.
Once per dialog, like the footer button.

State: `query`, `snapshot` (the `expanded` list captured the moment the
query goes from empty to non-empty), `visibleIds`.

On input (debounced through `nextFrame`):

- Empty query → remove every `data-cdd-filtered` attribute, send
  `LOCATION_TREE_EXPAND` with `snapshot`, forget it.
- Otherwise read the nodes; `matches` = nodes whose normalized name contains
  the normalized query; `visibleIds` = matches plus all their ancestors;
  send `LOCATION_TREE_EXPAND` with the union of the current `expanded` and
  the ancestors of every match; then paint.

`paint(dialog)`: for every rendered `li`, set `data-cdd-filtered=""` when a
query is active and the id is not in `visibleIds`, otherwise remove it.
CSS: `li[role="treeitem"][data-cdd-filtered] { display: none; }`. The paint
is also called from the discovery pass in `init.js` after the duplicate
marks, so rows React re-renders are hidden again.

Keys: a `keydown` listener on the input, capture phase on `window`, as the
scan panel does — Enter is swallowed (it would be *Save*), Escape clears
the field and runs the empty-query branch.

## C. Presets — `scan-panel.js`

```js
const PRESETS = [
    { label: "SBS 96 · 12 × 8", columns: 12, rows: 8 },
    { label: "SBS 384 · 24 × 16", columns: 24, rows: 16 },
    { label: "Cryobox 9 × 9", columns: 9, rows: 9 },
    { label: "Cryobox 10 × 10", columns: 10, rows: 10 },
];
```

A `<select class="cdd-scan-preset">` before the two number boxes in the
*New rows* control, options from `PRESETS` plus *Custom*. Choosing one sets
`state.gridColumns` / `state.gridRows`, writes the boxes, runs
`applyDefaultSize()` and `render()` exactly as a typed change does. A
`change` on either number box sets the select to the preset whose pair
matches, else *Custom*. On open the select reflects the settings defaults
the same way.

## Verification

Pure (`node`): `parsePath` on a plain name, a relative path, an absolute
path, a trailing `>`, stray spaces around `>`; the locations-to-create count
with two rows sharing a prefix; preset lookup for 12 × 8 and for 7 × 7.

Live, vault 6772, reloaded extension:

1. Paste `Shelf A > R-1`, `Shelf A > R-2`, `Shelf B >` with *Into* = Racks.
   Button reads *Create 2 boxes, 2 locations*. Create: Racks gains Shelf A
   with R-1 and R-2, and an empty Shelf B. Cancel the dialog.
2. Paste `Locations > Cold room > R-9` with *Into* = room: Cold room appears
   under the root, not under room.
3. Scan `room > R-3`: refused at run time with *"room" already holds boxes*.
4. Filter `aa` with Racks collapsed: Racks expands, only Locations › Racks ›
   AAA remain; clear the field: the tree is as before, Racks collapsed.
5. Enter in the filter does nothing; Escape clears it.
6. Pick *SBS 384*: boxes read 24 and 16, untouched rows follow; type 7 into
   columns: the select reads *Custom*.

## Not in scope

- Presets in the settings page.
- Moving or renaming existing nodes.
- Filtering the location picker on the sample form.
