import { INJECT_SCRIPT_ID, INJECT_BUNDLE_PATH } from "../shared/plugin-constants.js";

export function injectPageScript() {
    if (document.getElementById(INJECT_SCRIPT_ID)) return;

    const script = document.createElement("script");
    script.id = INJECT_SCRIPT_ID;
    script.src = chrome.runtime.getURL(INJECT_BUNDLE_PATH);
    script.onload = () => script.remove();

    (document.head || document.documentElement).appendChild(script);
}