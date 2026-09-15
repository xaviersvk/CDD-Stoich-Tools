// content/features/ui-fixes/create-location-link/init.js
//
// Discovery + wiring. The only thing content/main.js imports from this feature.
//
// One observer on <html> (Turbo swaps <body>), debounced to a frame, and each
// pass does two things: consumes an #edit-locations hash if this is the
// settings page, and mounts the "Location" entry when a Create a new… menu is
// on the page and the user may edit locations. The permission answer is
// cached, so a pass costs a selector and, at most once per vault and
// session, one GET.

import { autoOpenIfAsked } from "./auto-open.js";
import { ensureMenuItem, hasCreateMenu } from "./menu-item.js";
import { canEditLocations, vaultIdFromPath } from "./permission.js";

let started = false;

async function mountIfAllowed() {
    if (!hasCreateMenu()) return;
    const vaultId = vaultIdFromPath(location.pathname);
    if (!vaultId) return;
    if (await canEditLocations(vaultId)) ensureMenuItem(vaultId);
}

function pass() {
    autoOpenIfAsked();
    mountIfAllowed().catch((error) => {
        // A missing menu entry must never cost the user the page.
        console.warn("[CDD create-location] mount failed", error);
    });
}

export function initCreateLocationLink() {
    if (started) return;
    started = true;

    let scheduled = false;
    const schedule = () => {
        if (scheduled) return;
        scheduled = true;
        // A timer rather than rAF alone: rAF is paused in a hidden tab, and the
        // settings page can be opened into one.
        setTimeout(() => {
            scheduled = false;
            pass();
        }, 32);
    };

    new MutationObserver(schedule).observe(document.documentElement, {
        childList: true,
        subtree: true,
    });
    window.addEventListener("hashchange", schedule);

    schedule();
}
