// inject/hooks/fetch-hook.js
export function installFetchHook(processJsonPayload, tryParseText) {
    const origFetch = window.fetch;

    window.fetch = async function (...args) {
        const res = await origFetch.apply(this, args);

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
                    processJsonPayload(json);
                } catch {
                    tryParseText(await clone.text());
                }
            } else {
                tryParseText(await clone.text());
            }
        } catch (err) {
            console.debug("[CDD Stoich Tools] fetch parse failed", err);
        }

        return res;
    };
}