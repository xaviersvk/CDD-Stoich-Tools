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
//
// What each caller wants OUT of the page belongs to the caller:
// api/molecule-synonyms.js reads the Synonyms row, api/batch-registration-props
// the registration fields. This module only hands over the parsed document.

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
        // One line, not an object: the console reporters people paste from
        // print `[object Object]` and the status — the only thing that says
        // WHY — never makes it into the report.
        console.warn(
            `${LOG_PREFIX} molecule page failed: HTTP ${res.status} for molecule ` +
            `${moleculeId} in vault ${vaultId} (${res.url || "no url"})`
        );
        throw new Error(`HTTP ${res.status}`);
    }

    return {
        doc: new DOMParser().parseFromString(await res.text(), "text/html"),
        // The vault the request actually LANDED in. A molecule can live in a
        // different vault than the entry that mentions it (ELN vault 6884 ->
        // registration vault 6885); the server redirects and fetch follows it
        // transparently. Anything that later builds a URL for one of this
        // molecule's batches must use this, never location.pathname.
        vaultId: String(res.url || "").match(/\/vaults\/(\d+)\//)?.[1] || vaultId,
    };
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

// Cached Promise<{ doc, vaultId }>. Rejects on a failed fetch — callers that
// only want a value should use the resolvers below rather than handling this
// themselves. `vaultId` is the vault the page CAME FROM, which is not always
// the one asked for.
export function getMoleculePageInfo(vaultId, moleculeId) {
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

// Cached Promise<Document>, for the callers that only ever wanted the page.
export async function getMoleculePage(vaultId, moleculeId) {
    return (await getMoleculePageInfo(vaultId, moleculeId)).doc;
}

/**
 * forgetMoleculePage(moleculeId) — call after WRITING to one of this
 * molecule's batches.
 *
 * The cache lives for the page session, so without this the panel keeps
 * reporting the pre-write state until a reload — and keeps offering a button
 * whose work is already done, whose second click then dies on "already set".
 *
 * Every vault the molecule was reached through is dropped, not just one: the
 * key carries the vault we ASKED in, and a writer only knows the vault the
 * page came BACK from.
 */
export function forgetMoleculePage(moleculeId) {
    const suffix = `:${moleculeId}`;
    for (const key of [...pageCache.keys()]) {
        if (key.endsWith(suffix)) pageCache.delete(key);
    }
}
