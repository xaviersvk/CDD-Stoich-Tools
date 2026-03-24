// content/url-watcher.js
import { STATE } from "./state.js";

export function watchUrlChanges(onChange) {
    const check = () => {
        if (location.href === STATE.lastUrl) return;

        STATE.lastUrl = location.href;

        if (typeof onChange === "function") {
            onChange(location.href);
        }
    };

    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });

    setInterval(check, 700);
}