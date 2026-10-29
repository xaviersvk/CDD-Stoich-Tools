// shared/heat-map-outlier-drag-flag.js — on a run heat map, Shift-drag a box
// to flag the wells in it as outliers and Ctrl-drag to unflag them. Saved at
// once, as CDD's own flag link saves.
// On by default; an explicit `false` in storage turns it off.

import { createBooleanFlag } from "./boolean-flag.js";

export const HEAT_MAP_OUTLIER_DRAG_STORAGE_KEY = "cddHeatMapOutlierDrag";

const flag = createBooleanFlag(HEAT_MAP_OUTLIER_DRAG_STORAGE_KEY, true);

export const getHeatMapOutlierDragEnabled = flag.get;
export const saveHeatMapOutlierDragEnabled = flag.save;
export const isHeatMapOutlierDragEnabled = flag.isEnabled;
export const onHeatMapOutlierDragChanged = flag.onChanged;
export const initHeatMapOutlierDrag = flag.init;
