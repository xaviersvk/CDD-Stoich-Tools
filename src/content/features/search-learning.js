// content/features/search-learning.js
//
// Learns a molecule's synonyms from the search the user is already doing.
//
// Adding a reagent through the row's own Name field — click `Optional`, type
// `RGT-0000246`, pick the result — never tells the page the molecule's numeric
// id. Measured on a live row: in edit mode the row carries no `/molecules/<id>`
// link, the batch popover has no link either, and the only number anywhere near
// it is the attached STRUCTURE. So everything keyed on the molecule id has to
// wait for the entry to be saved, which is where "the name only appears after
// the save" came from.
//
// But the search itself already knows. `POST inventory_search.json` answers
// with the matches CDD then draws — the same list that prints
// `N-Ethyldiisopropylamine, N,N-Diisopropylethylamine, …, DIPEA` under the
// molecule's name — and the fetch hook in the page world sees every response.
// So the answer arrives while the user is still choosing a batch.
//
// The response is walked GENERICALLY rather than by a fixed path: it is not a
// documented endpoint, and a shape read by name would break the day CDD adds a
// wrapper. Anything that looks like {a name, some synonyms} is taken; a
// molecule id is taken too when it is there.

import { rememberSearchResult } from "../api/molecule-synonyms.js";

const NAME_KEYS = ["molecule_name", "moleculeName", "name", "identifier"];
const SYNONYM_KEYS = ["synonyms", "synonym", "molecule_synonyms"];
const ID_KEYS = ["molecule_id", "moleculeId", "id"];

function firstString(node, keys) {
    for (const key of keys) {
        const value = node[key];
        if (typeof value === "string" && value.trim()) return value.trim();
        if (Array.isArray(value) && value.length) {
            const joined = value.filter((v) => typeof v === "string").join(", ");
            if (joined.trim()) return joined.trim();
        }
    }
    return null;
}

function firstId(node) {
    for (const key of ID_KEYS) {
        const value = node[key];
        if (typeof value === "number" && Number.isFinite(value)) return String(value);
        if (typeof value === "string" && /^\d+$/.test(value)) return value;
    }
    return null;
}

// Depth-limited: search answers are shallow, and an unbounded walk over an
// unknown payload is a way to hang the page on a cycle.
function walk(node, depth, out) {
    if (!node || typeof node !== "object" || depth > 6) return;

    if (Array.isArray(node)) {
        for (const item of node) walk(item, depth + 1, out);
        return;
    }

    const name = firstString(node, NAME_KEYS);
    const synonyms = firstString(node, SYNONYM_KEYS);
    if (name && synonyms) out.push({ name, synonyms, moleculeId: firstId(node) });

    for (const value of Object.values(node)) walk(value, depth + 1, out);
}

/**
 * learnFromSearchResponse(payload) — call with any parsed JSON body.
 *
 * Silent and cheap when the body is not a search answer: nothing in it looks
 * like a name beside a synonym list, so nothing is recorded.
 */
export function learnFromSearchResponse(payload) {
    const found = [];
    try {
        walk(payload, 0, found);
    } catch {
        return;   // a payload shaped unlike anything we expect is not an error
    }

    for (const hit of found) rememberSearchResult(hit);
}
