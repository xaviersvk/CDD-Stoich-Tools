// shared/eln-shift-flag.js — on an ELN entry page, push CDD's centred entry
// to the left edge while the sample panel is open, so the panel has the
// empty margin to sit in instead of the entry's right-hand columns.
// On by default; an explicit `false` in storage turns it off.

import { createBooleanFlag } from "./boolean-flag.js";

export const ELN_SHIFT_STORAGE_KEY = "cddElnShiftLeft";

const flag = createBooleanFlag(ELN_SHIFT_STORAGE_KEY, true);

export const getElnShiftEnabled = flag.get;
export const saveElnShiftEnabled = flag.save;
export const isElnShiftEnabled = flag.isEnabled;
export const onElnShiftChanged = flag.onChanged;
export const initElnShift = flag.init;
