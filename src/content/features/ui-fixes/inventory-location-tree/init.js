// content/features/ui-fixes/inventory-location-tree/init.js
//
// Discovery + wiring. The only thing content/main.js imports from this feature.
//
// What we are looking for
// -----------------------
// CDD renders the inventory location field as `.locationPickerFormField`, and
// its MUI autocomplete popup is NOT portalled (popperDisablePortal), so the
// listbox lives inside that same container. That is the precise anchor. We fall
// back to a shape test - "most options are breadcrumb paths, and there are
// enough of them to be worth folding" - so the feature also catches the same
// widget on any other CDD form that portals its popup.
//
// Why the observer looks the way it does
//   - CDD is a Turbo SPA and MUI mounts a FRESH <ul> every time the popup opens,
//     so we watch `document.documentElement` (survives <body> swaps) and rescan.
//   - rAF-debounced, and de-duped per <ul> node with a WeakSet, so one popup
//     opening mounts exactly one tree.
//   - The view tears itself down with the popup: its container is a child of the
//     MUI Paper, so React removing the popup removes our tree with it.
//
// What it must NOT do: no location ids, no form writes, no network. Choosing a
// location is CDD's own <li> click - see tree-view.js.

import { injectLocationTreeStyles } from "./styles.js";
import { createLocationTreeView } from "./tree-view.js";

// Folding fewer than this many options buys less than the extra click costs.
const MIN_OPTIONS = 12;

const LISTBOX_SELECTOR = "ul.MuiAutocomplete-listbox";
const FIELD_SELECTOR = ".locationPickerFormField";

let started = false;

function isLocationListbox(listbox) {
    if (listbox.closest(FIELD_SELECTOR)) return true;

    const items = listbox.querySelectorAll("li");
    if (items.length < MIN_OPTIONS) return false;

    // Shape test for a portalled popup: a location list is mostly breadcrumbs.
    let paths = 0;
    for (const item of items) {
        if (item.textContent.includes(" > ")) paths++;
    }
    return paths / items.length >= 0.5;
}

// The search box that drives this listbox. MUI points the input at the listbox
// by id via aria-controls, which is more reliable than walking the DOM.
function findInput(listbox) {
    if (listbox.id) {
        const byAria = document.querySelector(
            `input[aria-controls="${CSS.escape(listbox.id)}"]`,
        );
        if (byAria) return byAria;
    }
    const root = listbox.closest(FIELD_SELECTOR) || document;
    return root.querySelector(".MuiAutocomplete-root input");
}

export function initInventoryLocationTree() {
    injectLocationTreeStyles();

    if (started) return;
    started = true;

    const seen = new WeakSet();
    let scheduled = false;

    function scan() {
        scheduled = false;

        for (const listbox of document.querySelectorAll(LISTBOX_SELECTOR)) {
            if (seen.has(listbox)) continue;
            if (!isLocationListbox(listbox)) continue;
            seen.add(listbox);

            try {
                createLocationTreeView(listbox, findInput(listbox));
            } catch (err) {
                // A broken tree must never cost the user the field itself: the
                // original list is still there, so unhide it and step aside.
                listbox.classList.remove("cdd-loc-source-hidden");
                console.warn("[CDD location-tree] mount failed", err);
            }
        }
    }

    function schedule() {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(scan);
    }

    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
    });

    schedule(); // a popup could already be open when we start
}
