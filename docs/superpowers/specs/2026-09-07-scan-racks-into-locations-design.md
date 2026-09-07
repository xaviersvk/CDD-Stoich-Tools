# Scan racks into a location — design

Date: 2026-09-07
Status: designed

## Problem

Boxes are added to the inventory location tree one at a time, through
*Settings → Sample/Inventory Fields → Add/Edit Inventory Fields → Edit
Locations*. Registering a shelf of SBS racks that way costs three separate
annoyances per rack:

1. **The scanner's Enter saves the dialog.** A handheld barcode scanner sends
   the code followed by a carriage return. `Edit Locations` has no `<form>`;
   React treats Enter as *Save*, so the dialog closes and writes. After every
   single rack the user has to walk back in through three screens.
2. **The name has to be retyped.** A new box arrives pre-named `Box 3`, with
   the text selected — which is exactly why the scan lands in it, and exactly
   why the Enter that follows is fatal.
3. **The layout is wrong every time.** A new box is 9 × 9. An SBS rack is
   12 × 8, so both number fields need correcting for every rack.

Forty racks is forty round trips.

## What exists today (verified live, vault 6772)

The dialog is MUI, rendered under `.EditLocationsDialog` /
`.edit-locations-dialog-paper`.

- **Tree** — `ul[role="tree"]`, one `li[role="treeitem"]` per node carrying
  `data-nodeid` and `data-parentid`. Saved nodes have positive ids; nodes
  created in the open dialog get negative ones. The **root** also has a
  negative id (it was `-2` on one mount and `-4` on the next), so a negative id
  does not mean "unsaved" — the root is the node whose `data-parentid` is the
  string `"undefined"`, and its id must never be hard-coded.
- **Selection** — the selected row carries `.Mui-selected` on its
  `.MuiTreeItem-content`. `aria-selected` is not set, so it cannot be used.
- **Row buttons** — icon buttons identified by `aria-label`: `Create new
  location`, `Create new organized or unorganized box`, `Duplicate`, `Delete`
  (the delete label is replaced by an explanation when the node holds samples).
  All four are in the DOM on **every** row; CDD hides the ones that do not
  apply with `display: none`. So "can this node take a box?" is not a guess
  about icons — it is whether that row's add-box button is displayed. Measured:
  the root shows only `Create new location`, a location shows the add-box
  button, a box shows neither.
- **Right pane, box selected** — `#location-box-node-name` (text, stable id),
  two `input[type="number"]` for *# columns* / *# rows* (MUI-generated ids, so
  they must be found positionally within the paper), an `Organized` checkbox,
  and a grid preview.
- **Right pane, location selected** — the Name field plus two large cards,
  *Add an organized box at this location* and *Add an unorganized box at this
  location*. These are the location editor, **not** a step in adding a box —
  see below.
- **Footer** — `Print Labels`, `Cancel`, `Save`. Nothing is written until
  `Save`; `Cancel` discards every pending node.

Two behaviours were confirmed by driving the dialog directly:

- **The add-box icon always creates the box outright.** One click appends an
  **organized 9 × 9** box named `Box N` under that location and selects it, so
  `#location-box-node-name` is the new node's. Measured on two different
  locations, twice each; the chooser cards never appeared. (They showed up once
  early on only because a stray click had landed on the row rather than on the
  icon, which selected the *location* and painted its editor.) An unorganized
  box therefore means creating the box and then unticking `Organized`.
- **Native value setters work.** Setting `#location-box-node-name` and the two
  number inputs through
  `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set`
  followed by `input` + `change` events renames the node in the tree and
  resizes the grid preview. This is the same trick
  `run-form-templates/form-model.js` already uses.

## Decisions (from brainstorming)

- **Collect first, create in one go.** Not "Enter makes the next box" — a
  visible list that can be corrected before anything touches the tree.
- **The panel opens from the footer**, next to `Print Labels`, and picks its
  parent location from its own dropdown rather than from the tree selection.
- **The extension never presses Save.** It creates the pending nodes and steps
  aside; committing them stays a conscious click, as with every other write
  this extension makes.
- **The scanned code is the box name**, verbatim apart from trimming. No
  prefix field.
- **A duplicate is refused, not just flagged**, and duplicates are looked for
  across the **whole tree**, not only under the target location. A rack
  barcode is unique to a rack; the same code appearing twice means a
  double-scan or a rack already registered somewhere else, and neither should
  quietly produce a second box.
- **Off after installing**, with a switch in options.

## Design

New feature directory `src/content/features/ui-fixes/inventory-location-scan/`,
following the shape of `inventory-location-tree/`:

| File | Responsibility |
| --- | --- |
| `init.js` | The only export `main.js` imports. Watches for the dialog, mounts the footer button, tears down with it. |
| `dialog-model.js` | Everything that knows CDD's DOM: read the tree, list locations, create a box under a parent, set name and layout. No UI. |
| `scan-panel.js` | The panel: markup, the scan input, the list, the create run. No CDD selectors beyond what `dialog-model.js` hands it. |
| `styles.js` | Injected CSS, card styling consistent with the rest of the extension. |

### Discovery

`init.js` watches `document.documentElement` for the dialog paper, rAF-debounced
and de-duped through a `WeakSet`, exactly as `inventory-location-tree/init.js`
does — CDD is a Turbo SPA and the dialog is mounted fresh each time. When a
paper appears, the button is inserted before `Print Labels` in the footer. The
panel and the button die with the paper, because they are its children.

### The panel

Replaces the right pane while open (the dialog's own right pane is restored on
close). Contents, top to bottom:

- **Into** — a `<select>` of every *location* in the tree (boxes excluded),
  labelled by its breadcrumb path. The list is exactly the nodes whose add-box
  button is displayed, which excludes boxes **and** the root — CDD does not
  allow a box directly under `Locations`. Defaults to the node selected in the
  tree, or its nearest eligible ancestor when a box is selected. The list is
  read once when the panel opens; the tree behind it cannot change while the
  panel is up.
- **Layout** — `# columns`, `# rows`, and an `Organized` checkbox. Seeded from
  the options defaults (12 × 8, organized); edits live in the panel only and
  are never written back to settings.
- **Scan** — a text input, focused on open and refocused after every entry.
- **The list** — one row per scan: ordinal, name, a reason chip when refused,
  and a `✕` that removes the row.
- **Footer** — `Create N boxes` (N counts only the accepted rows) and `Cancel`.

When `Organized` is unchecked the layout inputs are disabled and the run uses
the unorganized card instead.

### Enter

While the panel is open, a `keydown` listener on `window` in the **capture**
phase claims Enter whenever the event's target is the scan input. `window` is
above `document`, so this runs before any handler CDD could have registered,
in either phase; `preventDefault()` and `stopImmediatePropagation()` make sure
Save never hears about it.

An empty or whitespace-only scan is ignored. Otherwise the trimmed value is
appended, the input cleared, focus returned.

### Duplicates

A name is refused when, case-insensitively, it matches either

- the name of any node anywhere in the current tree — including nodes this
  panel created earlier in the same session, and including locations, or
- a row already in the list.

Refused rows stay visible, marked with the reason (`already in the tree` /
`already in the list`), struck through, and excluded from the count. The number
in the button is therefore always the number of boxes that will appear.

### The create run

For each accepted row, in list order:

1. Note the set of node ids in the tree.
2. Click the target location's `Create new organized or unorganized box`
   button.
3. Wait for a node id that was not there before, and check that node is the
   selected one — that is what the right pane is now editing.
4. Set `#location-box-node-name` to the row's name.
5. Set the two number inputs to the panel's columns and rows; when the panel
   asks for unorganized, untick `Organized` instead.
6. Confirm the new node's label reads the expected name before moving on.

Then the panel closes and the tree is left showing the new nodes, unsaved.

If any step fails, the run **stops there**. What has been created stays — those
nodes are visible and removable, and discarding them is what `Cancel` is for.
The panel reports how many boxes were created and which name it stopped on. It
never touches `Save`.

## Settings

New options section, under the existing inventory group:

- `inventoryScanEnabled` — off by default. The footer button does not appear
  until this is on.
- `inventoryScanColumns` — default `12`.
- `inventoryScanRows` — default `8`.
- `inventoryScanOrganized` — default on.

The last three are defaults the panel copies at open. Changing them mid-batch
in the panel affects that batch only.

## Verification

Reload the unpacked extension, refresh a vault, then in
*Settings → Sample/Inventory Fields → Add/Edit Inventory Fields → Edit
Locations*:

1. With the setting off, the footer shows only `Print Labels` — the feature is
   invisible.
2. With it on, `Scan racks` appears. Opening it shows the panel with `12 × 8`,
   `Organized` ticked, and the cursor in the scan field.
3. Scanning three rack barcodes adds three rows and **does not close the
   dialog**.
4. Scanning one of them again marks the fourth row a duplicate and leaves the
   button reading `Create 3 boxes`. Typing the name of an existing box does the
   same.
5. `Create 3 boxes` adds three 12 × 8 organized nodes under the chosen
   location, with the scanned names, and leaves the dialog open and unsaved.
6. `Cancel` on the dialog discards them; reopening shows the tree as it was.
7. Repeating and pressing `Save` persists them, and the location field picker
   then offers the new boxes.

## Not in scope

- Assigning samples to the new boxes, or scanning into wells.
- Printing labels for the boxes just created — `Print Labels` is CDD's and is
  left alone.
- Renaming or resizing boxes that already exist.
- Any use of the CDD API. Everything goes through the dialog's own controls,
  so the vault only ever sees the request `Save` would have made anyway.
