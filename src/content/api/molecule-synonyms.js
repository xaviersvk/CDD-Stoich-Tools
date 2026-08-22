// content/api/molecule-synonyms.js
//
// ONE read of a molecule's synonyms per page session, shared by everything
// that wants them.
//
// Two features ask the same question of the same page row. The panel's
// Synonym field wants the FIRST synonym; the row-name feature wants the
// SHORTEST to offer, and the WHOLE list to put in the Name editor. Each used
// to walk the payload, call its own resolver on api/molecule-page.js and keep
// its own map — two passes, two parses, two half-answers.
//
// The list is the answer to all three questions, so it is the only thing
// stored. An empty array means "asked, has none" (a final answer); `null`
// from getSynonyms means nobody has asked yet.

import { getMoleculePage } from "./molecule-page.js";
import { extractSynonymsText } from "./molecule-image.js";
import { readBatchFieldsByName } from "./batch-registration-props.js";
import { splitSynonyms } from "../../shared/pretty-name.js";

// moleculeId -> Map(batchName -> fieldMap), from the same parse.
//
// The page carries every existing batch of the molecule as its own
// registration renderer, keyed by the batch name the row prints after the dash
// ("RGT-0000246-001" -> "001"). That is the only way to know a batch's
// Internal ID before the entry is saved: the ELN payload does not carry batch
// metafields at all, so waiting for it means waiting for the autosave.
const batchesByMolecule = new Map();

// moleculeId -> string[]
const lists = new Map();
// moleculeId -> Promise<string[]>, so N callers cost one page parse
const inFlight = new Map();
// moleculeId -> failed attempts, so a page that will not load is asked for a
// bounded number of times and then left alone.
const failures = new Map();

// Two, because the interesting failures are the permanent ones. A molecule
// whose page 404s — measured on an EU vault, where a molecule the entry
// references does not resolve in the vault the entry lives in — would
// otherwise be re-requested by every caller that asks: name-watch.js scans on
// each DOM mutation, so "retry on the next scan" is a request per redraw.
const MAX_ATTEMPTS = 2;

/** The molecule's synonyms, or null when nothing has asked for them yet. */
export function getSynonyms(moleculeId) {
    return lists.get(String(moleculeId)) ?? null;
}

/** The first synonym — what the panel's Synonym field has always shown. */
export function getFirstSynonym(moleculeId) {
    return getSynonyms(moleculeId)?.[0] ?? null;
}

/**
 * loadSynonyms(vaultId, moleculeId) -> Promise<string[]>
 *
 * Resolves to the list (possibly empty). REJECTS when the page could not be
 * loaded: "no synonyms" is final, "no answer" is not, and only the caller
 * knows which of the two it can live with.
 *
 * A failure is retried ONCE and then remembered as a failure, so a molecule
 * whose page never loads costs two requests for the life of the page rather
 * than one per caller per scan.
 */
export function loadSynonyms(vaultId, moleculeId) {
    // Not String(moleculeId) first: that turns a missing id into the string
    // "null", which then sails past every emptiness check and asks the server
    // for `/molecules/null`.
    if (moleculeId == null || moleculeId === "") {
        return Promise.reject(new Error("no molecule id"));
    }

    const id = String(moleculeId);

    const known = lists.get(id);
    if (known) return Promise.resolve(known);

    const pending = inFlight.get(id);
    if (pending) return pending;

    if ((failures.get(id) || 0) >= MAX_ATTEMPTS) {
        return Promise.reject(new Error("molecule page kept failing"));
    }

    const promise = getMoleculePage(vaultId, id)
        .then((doc) => {
            const list = splitSynonyms(extractSynonymsText(doc));
            lists.set(id, list);
            batchesByMolecule.set(id, readBatchFieldsByName(doc));
            failures.delete(id);
            return list;
        })
        .catch((err) => {
            failures.set(id, (failures.get(id) || 0) + 1);
            throw err;
        })
        .finally(() => {
            inFlight.delete(id);
        });

    inFlight.set(id, promise);
    return promise;
}

/**
 * getBatchField(moleculeId, batchLabel, fieldName)
 *
 * A field of one batch of this molecule, from the page already fetched for its
 * synonyms — null when the page has not been read yet, when the batch is not
 * on it, or when the field is simply empty.
 *
 * `batchLabel` is what the stoichiometry row prints ("RGT-0000246-001"); the
 * page keys its batches by the suffix alone ("001").
 */
export function getBatchField(moleculeId, batchLabel, fieldName) {
    const batches = batchesByMolecule.get(String(moleculeId));
    if (!batches || !batchLabel) return null;

    const suffix = String(batchLabel).split("-").pop();
    const fields = batches.get(String(batchLabel)) || batches.get(suffix);
    const value = fields?.[fieldName];
    return value == null || value === "" ? null : String(value);
}
