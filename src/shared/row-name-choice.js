// shared/row-name-choice.js
//
// What a stoichiometry row should be called, in order of preference.
//
// ONE rule, three readers: the automatic fill takes the first entry, the
// panel's offer takes the first entry, and the Name editor lists all of them.
// They used to be able to disagree — the editor grew the Internal ID before
// the fill knew about it — and a suggestion that differs from what the button
// writes is worse than either alone.
//
// The order is:
//
//   1. the name remembered for this molecule — a choice already made by hand
//      beats anything derived, always
//   2. the shortest synonym, which is what a chemist writes on the bench
//   3. the batch's Internal ID, for a substance the registrant gave no synonym
//   4. the remaining synonyms, shortest first
//
// The synonym leads deliberately. It describes the SUBSTANCE and is the same
// wherever the molecule turns up; an Internal ID describes one bottle of it.
// So the ID is the answer when there is no synonym to give, not a rival to it.
//
// Pure: no DOM, no chrome.*.

import { pickShortest } from "./pretty-name.js";

/**
 * rowNameCandidates({ remembered, internalId, synonyms }) -> [{ name, source }]
 *
 * `source` is one of "remembered" | "internalId" | "synonym", and is what the
 * editor prints beside each entry. Empty values are dropped and duplicates
 * removed case-insensitively, so a remembered name that came from a synonym
 * appears once, under the reason that earned it its place.
 */
export function rowNameCandidates(parts) {
    const out = [];
    const seen = new Set();

    const add = (value, source) => {
        const name = typeof value === "string" ? value.trim() : "";
        if (!name) return;
        const key = name.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ name, source });
    };

    const synonyms = (parts?.synonyms || [])
        .filter((s) => typeof s === "string" && s.trim())
        .slice()
        .sort((a, b) => a.length - b.length);

    add(parts?.remembered, "remembered");
    add(pickShortest(synonyms), "synonym");
    add(parts?.internalId, "internalId");
    for (const synonym of synonyms) add(synonym, "synonym");

    return out;
}

/** The one name to write without asking. Null when there is nothing to write. */
export function pickRowName(parts) {
    return rowNameCandidates(parts)[0]?.name ?? null;
}
