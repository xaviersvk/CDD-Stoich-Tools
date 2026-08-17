// content/features/panel-contents.js
//
// ONE answer to "what is the Samples panel showing?", so the panel, the CSV
// export and the print sheet cannot disagree.
//
// They used to: the panel merged the stoichiometry rows with the mention
// cards, while the two exports read STATE.lastPayload directly — which holds
// only the table rows. Everything mentioned in the entry's text was silently
// missing from every CSV and every printed sheet.
//
// Deliberately imports nothing from sample-panel.js: that module imports the
// exports, so putting this there would close a cycle.

import { STATE } from "../state.js";
import { isTableRowsEnabled } from "../../shared/panel-sources-flag.js";
import { splitMentionsAlreadyShown } from "./mentions/dedupe.js";
import { getMentionSamples } from "./mentions/state.js";

/**
 * { tableSamples, mentions, hidden, samples }
 *
 * `mentions` are the ones the stoichiometry table does not already cover,
 * `hidden` is how many it did — a count rather than nothing, so the panel can
 * say so out loud.
 */
export function getPanelContents() {
    const tableSamples = isTableRowsEnabled() ? (STATE.lastPayload?.samples || []) : [];
    const { kept, hidden } = splitMentionsAlreadyShown(getMentionSamples(), tableSamples);

    return {
        tableSamples,
        mentions: kept,
        hidden,
        samples: [...tableSamples, ...kept],
    };
}

/** Just the rows, for the exports. */
export function getVisibleSamples() {
    return getPanelContents().samples;
}
