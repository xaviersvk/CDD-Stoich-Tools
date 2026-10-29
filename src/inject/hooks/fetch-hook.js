// @ts-nocheck — not yet type-clean; remove this line once `npm run typecheck` passes without it.
// inject/hooks/fetch-hook.js
//
// `processJsonPayload` is called with the parsed body AND the URL it came
// from. Most callers ignore the URL — an ELN payload is recognised by its
// shape — but the reagent search is only recognisable by where it came from,
// and it is the one answer that carries a molecule's synonyms before the entry
// has been saved.
import { isSurelyNotJson } from "./content-type.js";

export function installFetchHook(tryParseText) {
    const origFetch = window.fetch;

    window.fetch = async function (...args) {
        const res = await origFetch.apply(this, args);

        // HTML pages, scripts, images…: no payload in there, and cloning and
        // reading them costs a whole body per request.
        if (isSurelyNotJson(res.headers.get("content-type"))) return res;

        const url = res.url || (typeof args[0] === "string" ? args[0] : args[0]?.url) || "";

        let clone;
        try {
            clone = res.clone();
        } catch {
            return res;
        }

        // Detached: CDD gets its response now, not after we have read and
        // parsed the whole body. Read once, as text — the body of a clone
        // cannot be read a second time.
        void (async () => {
            try {
                tryParseText(await clone.text(), url);
            } catch (err) {
                console.warn("[CDD Stoich Tools] fetch parse failed", err);
            }
        })();

        return res;
    };
}