# Duplicate box names in the location tree — design

Date: 2026-09-15
Status: designed

## Problem

A rack barcode belongs to one rack, so every box in the vault should carry a
different name. CDD does not enforce that. Measured in the sandbox vault
(6772): a new box under *room* named `AAA` was accepted without a word while
`AAA` already existed under *Racks*, and *Save* stayed enabled. Two boxes with
one name are a mis-shelved rack waiting to happen, and nothing in the *Edit
Locations* dialog shows it.

A second problem hides behind the first. MUI's tree does not render the
children of a collapsed node at all — collapsing *Racks* removed `AAA` and
`BBB` from the DOM. The 15.9.0 *Scan racks* panel reads the tree from the DOM,
so its duplicate check, documented as "against the whole tree", misses every
rack sitting in a collapsed branch. The same data source fixes both.

## What exists today (verified live, vault 6772)

- The dialog is `.edit-locations-dialog-paper`; the tree is `ul[role="tree"]`
  with one `li[role="treeitem"]` per **rendered** node, carrying
  `data-nodeid` and `data-parentid`. Collapsed children are absent, not
  hidden.
- The whole tree lives in React props. Walking `return` from the `ul`'s fiber
  reaches a component whose props carry `nodes` — an array holding the root,
  each node `{ id, value, display_order, children, ... }` with a back-pointer
  `parent`. Pending nodes (negative ids) are in it, and a rename typed into
  `#location-box-node-name` changes `value` before the label repaints.
- Box versus location is not a typed field. Nine node shapes were measured
  (saved and pending, organized and not, root, saved and pending location) and
  the rule that holds for all of them is:

  > a node is a **box** when `organized === false` or `num_columns > 0`.

  A saved location has `organized: true, num_columns: 0`; a pending location
  has neither key; a pending box arrives `organized: true, num_columns: 9`;
  an unorganized box has `organized: false` and no `num_columns`.
- `/vaults/<v>/inventory_event_field_definitions/<f>/inventory_locations.json`
  serves the same shape with no type field either, and knows nothing about
  pending nodes. It offers nothing the props do not.
- React does not touch attributes it did not set. A `data-*` attribute or a
  `title` placed on a tree row survives its re-renders; a class added to
  `.MuiTreeItem-label` may not, because React owns `className` there.
- `src/inject/hooks/selectbox-bridge.js` is the existing pattern for reading
  fiber props from the page world on request over `window.postMessage`, keyed
  by `requestId`. `eln-filter-field-picker.js` is its content-side client.

## Decisions

- **Box against box only.** Two boxes with the same name anywhere in the
  vault are marked. A location sharing a box's name is not a clash; two
  locations sharing a name are not either.
- **Colour plus a tooltip.** The box's name turns orange, and hovering it
  reads *Same name: Locations > Racks > AAA*, one path per twin. Collapsed
  branches are left as they are: the tree is not unfolded on the user's
  behalf.
- **Always on, no switch.** It is a colour in a dialog; it writes nothing and
  blocks nothing. A UI fix, not a feature.
- **The tree comes from React props through a page-world bridge**, not from
  the DOM and not from the network. It sees collapsed branches and pending
  nodes, live.
- **The scan panel's duplicate check moves to the same source.** Its rule
  stays as it is — a scan is refused against any node, location included —
  which is stricter than the colour. The target list (*Into*) keeps reading
  the DOM: a target has to be clickable anyway.
- Names compare case-insensitively with whitespace collapsed, the
  `normalizeScan` rule the panel already uses.

## Design

### 1. The bridge — `src/inject/hooks/location-tree-bridge.js`

Registered from `inject/main.js` beside the SelectBox bridge. Two events in
`shared/event-types.js`:

```
LOCATION_TREE_REQUEST { requestId }
  -> LOCATION_TREE     { requestId, nodes: [{ id, parentId, name, isBox }] | null }
```

On a request it finds `ul[role="tree"]` inside `.edit-locations-dialog-paper`,
takes its fiber, walks `return` until `memoizedProps.nodes` is an array
(bounded, 40 steps), and flattens the tree depth-first: `id` and `parentId`
as strings (`parentId` null for the root), `name` from `value` trimmed,
`isBox` by the rule above. Anything unexpected — no dialog, no fiber, no
`nodes` — answers `null`, and it is the content side's job to fall back.

### 2. Content-side client — `inventory-location-scan/tree-source.js`

`readTreeNodes(dialog)` returns a promise. It posts the request and, when
the bridge answers, merges the two reads: the bridge's list supplies every
node, and `canTakeBox` is copied from the DOM row with the same id — `false`
for a node that is not rendered, since a target has to be clickable anyway.
When the bridge answers `null` or not within 500 ms it resolves with
`buildNodes(readTreeRows(dialog))`, today's DOM read, unchanged.

Every consumer therefore gets the shape `buildNodes` produces today (`id`,
`parentId`, `name`, `path`, `depth`, `canTakeBox`) plus `isBox`. `buildNodes`
grows that field, defaulting to `false` for DOM rows. `boxTargets` keeps
filtering on `canTakeBox`, so the *Into* list is exactly what it was.

### 3. Pure logic — `tree-model.js`

```
duplicateBoxNames(nodes) -> Map<id, string[]>
```

Groups boxes by normalized name; for every group with two or more members,
each member maps to the paths of the *others*, in tree order. Locations and
the root never appear as keys or as twins. No DOM.

### 4. Painting — `inventory-location-scan/name-marks.js`

`markDuplicateNames(dialog, twinsById)`:

- for every rendered `li[role="treeitem"]` whose `data-nodeid` is a key: set
  `data-cdd-dup=""` on the `li` and `title="Same name: <path>; <path>"` on
  its `.MuiTreeItem-label`;
- for every rendered row that carries `data-cdd-dup` but is no longer a key:
  remove both.

CSS in `styles.js`:

```
li[data-cdd-dup] > .MuiTreeItem-content .MuiTreeItem-label { color: #e65100; }
```

Colour only. Weight is for structure; this is state.

### 5. Wiring — `init.js`

`sync()` already runs on every DOM mutation, debounced through `nextFrame`.
It gains one step: when the dialog is present, request the tree and paint.
A pass in flight is not doubled; a mutation arriving during one schedules a
single follow-up. The observer watches `childList` only, and the marks are
attributes, so painting does not re-trigger itself.

The panel's `openScanPanel` and `onTreeClick` await `readTreeNodes` instead
of calling `readTreeRows` directly. `classifyScan` is unchanged and simply
sees the full list.

### Error handling

- Bridge silent or malformed → DOM fallback, behaviour identical to 15.9.0.
  A `console.warn` once per dialog, not per pass.
- A paint error must never cost the user the dialog: caught in `sync()` as
  the mount already is.

## Verification

Pure: `duplicateBoxNames` and the `isBox` rule against the nine measured
shapes, run under `node` with a throwaway script, as the earlier modules
were.

Live, in vault 6772, after reloading the unpacked extension:

1. Open *Edit Locations*, collapse *Racks*. Add a box under *room*, type
   `AAA` — the row turns orange while typing; hovering reads
   *Same name: Locations > Racks > AAA*. Expand *Racks*: its `AAA` is orange
   too, pointing back at *room*.
2. Retype the name to `AAB` — both rows return to black.
3. Rename *room* to `AAA` — nothing turns orange.
4. With *Racks* collapsed, open *Scan racks* and scan `aaa` — the row reads
   *already in the tree*.
5. *Cancel* the dialog, reopen: no marks, no console errors.

## Not in scope

- The location field's tree picker on the sample form.
- Unfolding branches, renaming, or any writing.
- Duplicate location names.
- Rewriting the 15.9.0 notes: the tag is public. The next version's notes say
  the scan check now sees collapsed branches.
