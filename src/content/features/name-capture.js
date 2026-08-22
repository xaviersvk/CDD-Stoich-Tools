// content/features/name-capture.js
//
// Remembers a row Name the user types, so the same molecule is offered it
// again everywhere else.
//
// THE BASELINE RULE. Only a name that CHANGES while the page is open is
// remembered. The first payload after a load is a baseline and teaches this
// module nothing.
//
// Why: an old ELN is full of one-off row labels — entry 2504170 carries
// MR-0256, MR-0265-B, MR-0266-B, which name that experiment's fractions, not
// the molecule. Capturing whatever an opened entry happens to hold would turn
// every such label into an offer on unrelated future rows. A name typed with
// the panel open is, by contrast, exactly the correction the feature exists
// to reuse.
//
// Role-agnostic on purpose: products included. Products get no fill OFFER
// (they are display-only in the panel), but if someone writes a name on a
// product row it is still a name that molecule answers to.

import { isFillRowNameEnabled } from "../../shared/row-name-flag.js";
import { rememberName } from "../../shared/name-memory.js";
import { pickShortest } from "../../shared/pretty-name.js";
import { getSynonyms } from "../api/molecule-synonyms.js";

// `${reactionIndex}:${rowUid ?? batchId}` -> the name the row had when this
// page load first saw it (empty string for "had none").
const baseline = new Map();
let baselineHref = null;

function rowKey(sample) {
    return `${sample.reactionIndex}:${sample.rowUid ?? sample.batchId}`;
}

export function captureRowNames(samples) {
    if (!isFillRowNameEnabled()) return;
    if (!Array.isArray(samples)) return;

    // New entry (full load or Turbo navigation): start a fresh baseline.
    if (baselineHref !== location.href) {
        baselineHref = location.href;
        baseline.clear();
    }

    for (const sample of samples) {
        if (!sample?.moleculeId) continue;

        const key = rowKey(sample);
        const current = sample.tableName != null ? String(sample.tableName).trim() : "";

        if (!baseline.has(key)) {
            // First sighting of this row: record what it already said and
            // stop. A row ADDED while working starts out with no name, so its
            // baseline is "" and the name typed next is a change.
            baseline.set(key, current);
            continue;
        }

        if (current === baseline.get(key)) continue;

        baseline.set(key, current);
        // Clearing a name is not a name — nothing to remember, and nothing to
        // unlearn either (the previous value may still be right).
        if (!current) continue;

        // The memory is for the choices we could not have made ourselves. A
        // name that IS the molecule's shortest synonym is exactly what the
        // feature would offer unprompted — storing it spends one of 300 slots
        // to reach the same answer, and does it for every row the automatic
        // fill writes.
        const derivable = pickShortest(getSynonyms(sample.moleculeId));
        if (derivable && derivable.toLowerCase() === current.toLowerCase()) continue;

        rememberName(sample.moleculeId, current, sample.moleculeName);
    }
}
