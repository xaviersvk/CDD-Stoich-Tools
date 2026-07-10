// content/features/ui-fixes/options-menu-link.js
//
// Adds a "CDD Plugin options" entry to CDD's own user dropdown (the menu behind
// the account name, next to Account and Vault Administrator), so the settings
// are reachable from the page you are already on rather than from the browser's
// toolbar.
//
// A content script cannot call chrome.runtime.openOptionsPage() -- that API is
// not exposed to it -- so the click asks the background script to do it. Going
// through the background also means a second click focuses the settings tab
// that is already open instead of piling up new ones.

import { OPEN_OPTIONS_MESSAGE } from "../../../shared/event-types.js";

const ITEM_CLASS = "cdd-plugin-options-item";
const MENU_SELECTOR = ".user-dropdown ul";

let started = false;

function buildItem() {
    const item = document.createElement("li");
    item.className = ITEM_CLASS;

    // A plain <a> inside CDD's own <li>, so the menu's styling applies for free.
    const link = document.createElement("a");
    link.href = "#";
    link.textContent = "CDD Plugin options";

    link.addEventListener("click", (event) => {
        event.preventDefault();
        chrome.runtime.sendMessage({ type: OPEN_OPTIONS_MESSAGE });
    });

    item.appendChild(link);
    return item;
}

// The dropdown is built and torn down as the user opens it, so this runs on
// every mutation and must stay idempotent: one item per menu, appended last.
function ensureItem() {
    for (const menu of document.querySelectorAll(MENU_SELECTOR)) {
        if (menu.querySelector(`.${ITEM_CLASS}`)) continue;
        menu.appendChild(buildItem());
    }
}

export function initOptionsMenuLink() {
    if (started) return;
    started = true;

    let scheduled = false;

    const run = () => {
        if (scheduled) return;
        scheduled = true;

        requestAnimationFrame(() => {
            scheduled = false;
            ensureItem();
        });
    };

    new MutationObserver(run).observe(document.body, {
        childList: true,
        subtree: true,
    });

    run();
}
