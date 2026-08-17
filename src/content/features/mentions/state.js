// content/features/mentions/state.js
//
// The mention cards, kept apart from the scanner on purpose.
//
// The panel READS this list and the scanner WRITES it. If both lived in
// init.js the panel would have to import the scanner while the scanner
// imports the panel — a cycle that happens to work today only because every
// call is deferred to runtime. One small module in the middle removes the
// question entirely.

import { isMentionsEnabled } from "../../../shared/panel-sources-flag.js";

let cards = [];

/** The mention cards, in the order they appear in the entry. */
export function getMentionSamples() {
    return isMentionsEnabled() ? cards : [];
}

export function setMentionSamples(list) {
    cards = Array.isArray(list) ? list : [];
}
