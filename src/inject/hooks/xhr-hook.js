// inject/hooks/xhr-hook.js
import { isSurelyNotJson } from "./content-type.js";

export function installXhrHook(tryParseText) {
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        /** @type {any} */ (this).__cdd_url = url;
        return origOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function (...args) {
        this.addEventListener("load", function () {
            try {
                if (
                    this.responseType &&
                    /** @type {string} */ (this.responseType) !== "" &&
                    this.responseType !== "text"
                ) {
                    return;
                }

                if (isSurelyNotJson(this.getResponseHeader("content-type"))) return;

                tryParseText(this.responseText, /** @type {any} */ (this).__cdd_url);
            } catch (err) {
                console.warn("[CDD Stoich Tools] xhr parse failed", err);
            }
        });

        return origSend.apply(this, args);
    };
}