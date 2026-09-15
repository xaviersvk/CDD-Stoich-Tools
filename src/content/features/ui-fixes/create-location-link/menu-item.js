// content/features/ui-fixes/create-location-link/menu-item.js
//
// The entry itself: a plain <li><a> appended to CDD's own "Create a new…"
// list, so the menu's styling and Turbo's link handling apply for free. The
// hash is what tells the settings page to open the dialog on arrival.

import { settingsPath } from "./permission.js";

export const ITEM_CLASS = "cdd-create-location-item";
export const EDIT_LOCATIONS_HASH = "#edit-locations";
const MENU_SELECTOR = "#dataSources-createNew ul";

export function hasCreateMenu() {
    return Boolean(document.querySelector(MENU_SELECTOR));
}

// Idempotent: the sidebar is re-rendered by Turbo, and the observer calls
// this on every mutation.
export function ensureMenuItem(vaultId) {
    for (const menu of document.querySelectorAll(MENU_SELECTOR)) {
        if (menu.querySelector(`.${ITEM_CLASS}`)) continue;

        const item = document.createElement("li");
        item.className = ITEM_CLASS;

        const link = document.createElement("a");
        link.href = settingsPath(vaultId) + EDIT_LOCATIONS_HASH;
        link.textContent = "Location";

        item.appendChild(link);
        menu.appendChild(item);
    }
}
