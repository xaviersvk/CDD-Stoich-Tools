// content/api/molecule-page.js
//
// Shared, parse-once accessor for a molecule's server-rendered page.
//
// The ELN payload carries no synonym, so the panel has to read it off
// `/vaults/<vault>/molecules/<id>` — the same page the inventory and heat-map
// tooltips already fetch. Those two want a structure SVG and batch fields and
// each pay their own parsing; the panel wants nothing but the `Synonyms` row,
// so going through `getMoleculeData()` would mean rendering a SMILES structure
// per molecule that nobody looks at.
//
// One fetch + one DOMParser pass per (vault, molecule) per session. Failures
// are evicted from the cache so a later payload can retry; a molecule page
// that simply has no synonym is an ordinary empty result, not a failure.

import { extractSynonym } from "./molecule-image.js";

const LOG_PREFIX = "[CDD stoich plugin]";

// cacheKey (`${vaultId}:${moleculeId}`) -> Promise<Document|null>
const pageCache = new Map();

// Split from fetchMoleculePage so the HTTP-status throw is raised OUTSIDE the
// try that reports it: same two warnings, same rejection, but the throw is no
// longer caught by its own catch.
async function requestMoleculePage(vaultId, moleculeId) {
    const res = await fetch(`/vaults/${vaultId}/molecules/${moleculeId}`, {
        credentials: "include",
        headers: { Accept: "text/html" },
    });

    if (!res.ok) {
        console.warn(`${LOG_PREFIX} molecule page request failed`, {
            vaultId,
            moleculeId,
            httpStatus: res.status,
        });
        throw new Error(`HTTP ${res.status}`);
    }

    return new DOMParser().parseFromString(await res.text(), "text/html");
}

async function fetchMoleculePage(vaultId, moleculeId) {
    try {
        return await requestMoleculePage(vaultId, moleculeId);
    } catch (err) {
        console.warn(`${LOG_PREFIX} failed to load molecule page`, {
            vaultId,
            moleculeId,
            error: err?.message || String(err),
        });
        throw err;
    }
}

// Cached Promise<Document>. Rejects on a failed fetch — callers that only want
// a value should use the resolvers below rather than handling this themselves.
export function getMoleculePage(vaultId, moleculeId) {
    if (!vaultId || moleculeId == null || moleculeId === "") {
        return Promise.reject(new Error("missing vault or molecule id"));
    }

    const cacheKey = `${vaultId}:${moleculeId}`;
    const cached = pageCache.get(cacheKey);
    if (cached) return cached;

    const promise = fetchMoleculePage(vaultId, moleculeId);

    // A failed page must not poison the cache for the rest of the session.
    promise.catch(() => {
        if (pageCache.get(cacheKey) === promise) pageCache.delete(cacheKey);
    });

    pageCache.set(cacheKey, promise);
    return promise;
}

// The molecule's FIRST synonym. Resolves to null when the molecule simply has
// no synonym, and REJECTS when the page could not be loaded — the two are not
// the same to a caller that remembers what it already looked up: "no synonym"
// is a final answer, a failed fetch is worth retrying.
//
// `extractSynonym` owns the "first of N" rule (and the separator handling that
// keeps names like "N,N-diethylhydroxylamine" intact); this is only the fetch.
export async function getMoleculeSynonym(vaultId, moleculeId) {
    return extractSynonym(await getMoleculePage(vaultId, moleculeId));
}
