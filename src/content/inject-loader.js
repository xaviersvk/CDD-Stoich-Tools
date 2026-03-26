import { INJECT_SCRIPT_ID, INJECT_BUNDLE_PATH } from "../shared/plugin-constants.js";

export function injectPageScript() {
    if (document.getElementById(INJECT_SCRIPT_ID)) return;

    const runtime =
        typeof browser !== "undefined" && browser?.runtime?.getURL
            ? browser.runtime
            : chrome.runtime;

    const script = document.createElement("script");
    script.id = INJECT_SCRIPT_ID;
    script.src = runtime.getURL(INJECT_BUNDLE_PATH);
    script.onload = () => script.remove();

    (document.head || document.documentElement).appendChild(script);
}