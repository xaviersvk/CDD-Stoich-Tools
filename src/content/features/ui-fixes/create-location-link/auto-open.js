// content/features/ui-fixes/create-location-link/auto-open.js
//
// The settings page's side of the link. Arriving at
// /vaults/<id>/inventory_field_definitions#edit-locations means "open the
// dialog", which on that page is two of CDD's own clicks: the link
// "Add/Edit Inventory Fields", then "Edit Locations", which only exists once
// the table is in edit mode. Both are React-rendered after load, so each is
// waited for.
//
// The hash is dropped BEFORE the first click. A reload of the settings page,
// or Back landing on it, must not open the dialog again on its own.

import { EDIT_LOCATIONS_HASH } from "./menu-item.js";

const SETTINGS_PATH = /\/vaults\/\d+\/inventory_field_definitions$/;
const ADD_EDIT_TEXT = "Add/Edit Inventory Fields";
const EDIT_LOCATIONS_TEXT = "Edit Locations";
const DIALOG_SELECTOR = ".edit-locations-dialog-paper";
const WAIT_TRIES = 100;
const WAIT_MS = 50;

function visibleWithText(text) {
    return [...document.querySelectorAll("a, button, span")]
        .find((el) => el.textContent.trim() === text && el.offsetParent !== null) || null;
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(find) {
    for (let attempt = 0; attempt < WAIT_TRIES; attempt += 1) {
        const found = find();
        if (found) return found;
        await wait(WAIT_MS);
    }
    return null;
}

let running = false;

export async function autoOpenIfAsked() {
    if (running) return;
    if (location.hash !== EDIT_LOCATIONS_HASH) return;
    if (!SETTINGS_PATH.test(location.pathname)) return;

    running = true;
    try {
        history.replaceState(history.state, "", location.pathname + location.search);
        if (document.querySelector(DIALOG_SELECTOR)) return;

        const addEdit = await waitFor(() => visibleWithText(ADD_EDIT_TEXT));
        if (!addEdit) {
            console.warn("[CDD create-location] Add/Edit Inventory Fields did not appear");
            return;
        }
        addEdit.click();

        const editLocations = await waitFor(() => visibleWithText(EDIT_LOCATIONS_TEXT));
        if (!editLocations) {
            console.warn("[CDD create-location] Edit Locations did not appear");
            return;
        }
        editLocations.click();
    } finally {
        running = false;
    }
}
