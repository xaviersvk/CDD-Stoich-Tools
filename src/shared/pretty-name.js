// shared/pretty-name.js
//
// Which of a molecule's synonyms belongs at the top of a stoichiometry row?
//
// The shortest one. A chemist writes DIPEA, not N,N-Diisopropylethylamine,
// and CDD's synonym list carries both — measured against the names the user
// had already typed by hand on entry 2504170, "shortest" picked exactly
// theirs (DIPEA, HATU).
//
// Pure: no DOM, no chrome.*, no imports. Loaded by the content script.

// A separator is a comma or semicolon FOLLOWED BY WHITESPACE. A bare comma
// belongs to the name — "N,N-diethylhydroxylamine" is one synonym, and CDD
// also joins two long names with a bare comma inside a single entry.
const SEPARATOR = /\s*[,;]\s+/;

// A name has to say something. Punctuation left over by an odd separator run
// ("A, ; B") splits into parts that are pure punctuation, and the shortest of
// those would otherwise win every comparison.
const HAS_SUBSTANCE = /[\p{L}\p{N}]/u;

export function splitSynonyms(rawText) {
    if (typeof rawText !== "string") return [];
    return rawText
        .split(SEPARATOR)
        .map((part) => part.trim())
        .filter((part) => HAS_SUBSTANCE.test(part));
}

// The shortest synonym, or null when there is none. Ties resolve to the
// first in document order — CDD lists the registrant's own name first.
export function pickPrettyName(rawText) {
    let best = null;
    for (const candidate of splitSynonyms(rawText)) {
        if (best === null || candidate.length < best.length) best = candidate;
    }
    return best;
}
