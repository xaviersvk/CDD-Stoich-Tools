// shared/dose-response-drag-flag.js — on a dose-response plot in Edit
// Outliers & Override, Shift-drag a box to mark the points in it as outliers
// and Ctrl-drag to unmark them. Nothing is saved until CDD's own Save.
// On by default; an explicit `false` in storage turns it off.

import { createBooleanFlag } from "./boolean-flag.js";

export const DOSE_RESPONSE_DRAG_STORAGE_KEY = "cddDoseResponseDrag";

const flag = createBooleanFlag(DOSE_RESPONSE_DRAG_STORAGE_KEY, true);

export const getDoseResponseDragEnabled = flag.get;
export const saveDoseResponseDragEnabled = flag.save;
export const isDoseResponseDragEnabled = flag.isEnabled;
export const onDoseResponseDragChanged = flag.onChanged;
export const initDoseResponseDrag = flag.init;
