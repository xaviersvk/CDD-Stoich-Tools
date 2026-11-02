// shared/steady-stoich-edit-flag.js — when a click switches a stoichiometry
// table into edit mode (or out of it), keep the clicked value where it was on
// screen and slide the rest of the page out of its way.
// On by default; an explicit `false` in storage turns it off.

import { createBooleanFlag } from "./boolean-flag.js";

export const STEADY_STOICH_EDIT_STORAGE_KEY = "cddSteadyStoichEdit";

const flag = createBooleanFlag(STEADY_STOICH_EDIT_STORAGE_KEY, true);

export const getSteadyStoichEditEnabled = flag.get;
export const saveSteadyStoichEditEnabled = flag.save;
export const isSteadyStoichEditEnabled = flag.isEnabled;
export const initSteadyStoichEditFlag = flag.init;
