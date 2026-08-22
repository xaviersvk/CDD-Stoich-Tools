// inject/hooks/fetch-hook.js
//
// `processJsonPayload` is called with the parsed body AND the URL it came
// from. Most callers ignore the URL — an ELN payload is recognised by its
// shape — but the reagent search is only recognisable by where it came from,
// and it is the one answer that carries a molecule's synonyms before the entry
// has been saved.
export function installFetchHook(processJsonPayload, tryParseText) {
    const origFetch = window.fetch;

    window.fetch = async function (...args) {
        const res = await origFetch.apply(this, args);
        const url = res.url || (typeof args[0] === "string" ? args[0] : args[0]?.url) || "";

        let clone;
        try {
            clone = res.clone();
        } catch {
            return res;
        }

        try {
            const contentType = clone.headers.get("content-type") || "";

            if (
                contentType.includes("application/json") ||
                contentType.includes("text/json")
            ) {
                try {
                    const json = await clone.json();
                    processJsonPayload(json, url);
                } catch {
                    tryParseText(await clone.text(), url);
                }
            } else {
                tryParseText(await clone.text(), url);
            }
        } catch (err) {
            console.debug("[CDD Stoich Tools] fetch parse failed", err);
        }

        return res;
    };
}