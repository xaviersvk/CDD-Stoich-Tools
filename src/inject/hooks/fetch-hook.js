// inject/hooks/fetch-hook.js
export function installFetchHook(processJsonPayload, tryParseText) {
    const origFetch = window.fetch;

    window.fetch = async function (...args) {
        const res = await origFetch.apply(this, args);

        // Read content-type from the real response (no clone needed at this point).
        const contentType = res.headers.get("content-type") || "";

        // Skip responses that are definitely not JSON: HTML, CSS, JS, images,
        // fonts, etc. Cloning + reading those bodies is wasteful and can consume
        // megabytes per navigation (e.g. full HTML page responses from Turbo).
        if (
            !contentType.includes("application/json") &&
            !contentType.includes("text/json")
        ) {
            return res;
        }

        let clone;
        try {
            clone = res.clone();
        } catch {
            return res;
        }

        try {
            try {
                const json = await clone.json();
                processJsonPayload(json);
            } catch {
                tryParseText(await clone.text());
            }
        } catch (err) {
            console.debug("[CDD Stoich Tools] fetch parse failed", err);
        }

        return res;
    };
}