// inject/hooks/xhr-hook.js
export function installXhrHook(tryParseText) {
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this.__cdd_url = url;
        return origOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function (...args) {
        this.addEventListener("load", function () {
            try {
                if (
                    this.responseType &&
                    this.responseType !== "" &&
                    this.responseType !== "text"
                ) {
                    return;
                }

                // Skip non-JSON responses (HTML pages, CSS, JS bundles, images…)
                // to avoid parsing megabytes of irrelevant text on every XHR.
                const contentType = this.getResponseHeader("content-type") || "";
                if (
                    !contentType.includes("application/json") &&
                    !contentType.includes("text/json")
                ) {
                    return;
                }

                tryParseText(this.responseText);
            } catch (err) {
                console.debug("[CDD Stoich Tools] xhr parse failed", err);
            }
        });

        return origSend.apply(this, args);
    };
}