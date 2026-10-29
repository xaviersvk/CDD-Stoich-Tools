// shared/active-reaction-flag.js — on an ELN entry with several reactions,
// mark the reaction in view in the sample panel (heavier frame, panel
// scrolled to it). See content/features/active-reaction.js.
// On by default; an explicit `false` in storage turns it off.

import { createBooleanFlag } from "./boolean-flag.js";

export const ACTIVE_REACTION_STORAGE_KEY = "cddActiveReaction";

const flag = createBooleanFlag(ACTIVE_REACTION_STORAGE_KEY, true);

export const getActiveReactionEnabled = flag.get;
export const saveActiveReactionEnabled = flag.save;
export const isActiveReactionEnabled = flag.isEnabled;
export const onActiveReactionChanged = flag.onChanged;
export const initActiveReactionFlag = flag.init;
