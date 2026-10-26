# Drag to select positions in a box — design

Date: 2026-10-26
Status: approved in chat

## Goal

One way to mark an area everywhere in the plugin. Outliers on heat maps and
dose-response plots are already marked with a Shift/Ctrl-drag box; picking
positions for *Create samples* (box selection framework) only knows clicks.
Give the box picker the same drag, with the same box.

## Behaviour (box picker, any grid the framework is attached to)

- **Shift-drag** over the grid adds every empty well the box touches to the
  selection. Occupied wells are skipped silently, as with Shift-click.
- **Ctrl/Cmd-drag** removes every well the box touches from the selection.
- While dragging, a dashed box with a label follows the pointer:
  *Add positions* in the selection blue (`#0a62e6`), *Remove positions* in the
  same grey the outlier "unflag" box uses (`#455a64`).
- After the drag, the toast says how many positions are selected, the same
  toast the Shift-click rectangle uses.
- A movement under 3 px in both directions is a click, not a drag: the
  existing click rules apply unchanged (click, Ctrl-click toggle, Shift-click
  rectangle from the last plain click). The anchor is not changed by a drag.
- Escape, pointercancel or window blur cancel a drag without changing the
  selection. The click that ends a real drag is swallowed so it does not also
  toggle a well.
- No new setting: drag is part of the box selection that its consumer
  (multi-position sample create) already switches.

## Shared box

The heat map and dose-response hooks each draw the same dashed box with near
identical code. Move it to `src/shared/drag-box.js`, used by all three:

- `dragArea(x0, y0, x1, y1)` → `{ left, right, top, bottom, isClick }`; a
  click-sized area collapses to the end point.
- `touches(area, rect)` → whether a client rect intersects the area.
- `DRAG_TONES` — `mark` (red), `unmark` (grey), `select` (blue).
- `createDragBox(tone, label, ownerAttr)` → `{ draw(area), remove() }`.

The first two are pure and get tests in `tests/drag-box.test.js`. The hooks
keep their own labels (*Flag outliers*, *Mark outliers*, …) and behaviour;
only the drawing moves.

## Out of scope

- Plain drag without a key, and changing what Shift-click does in the picker
  (asked; Shift-click stays the rectangle from the last click).
- Selecting occupied wells.
