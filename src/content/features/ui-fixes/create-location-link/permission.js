// content/features/ui-fixes/create-location-link/permission.js
//
// May this user edit the vault's locations? Two gates, the cheap one first.
//
// The header's user dropdown names the user's ROLE in this vault as a link to
// the help topic `user_roles` — "Vault Administrator" for an admin. That
// answers for vault admins with no request at all. It cannot answer for
// inventory administrators: that is not a role but a grant on top of one
// (the help page lists Read Only … Full Access, Vault Admin, and nothing
// about inventory), and the header does not show it.
//
// So everyone else is judged by the door itself: one GET of the settings page
// the dialog lives on. CDD answers an authorised user with 200 at that path;
// anyone else is sent elsewhere. Remembered per vault for the session, so the
// probe runs once, not on every page.

const ROLE_LINK_SELECTOR = '.user-dropdown a[data-tooltip-path*="user_roles"]';
const ADMIN_ROLE = "Vault Administrator";
const CACHE_PREFIX = "cddCanEditLocations:";

export function vaultIdFromPath(pathname) {
    const match = /^\/vaults\/(\d+)(?:\/|$)/.exec(pathname || "");
    return match ? match[1] : null;
}

export function settingsPath(vaultId) {
    return `/vaults/${vaultId}/inventory_field_definitions`;
}

export function headerSaysAdmin(doc = document) {
    const link = doc.querySelector(ROLE_LINK_SELECTOR);
    return Boolean(link) && link.textContent.trim() === ADMIN_ROLE;
}

function cached(vaultId) {
    try {
        const value = sessionStorage.getItem(CACHE_PREFIX + vaultId);
        if (value === "1") return true;
        if (value === "0") return false;
    } catch {
        // storage can be off; then we simply probe each page load
    }
    return null;
}

function remember(vaultId, allowed) {
    try {
        sessionStorage.setItem(CACHE_PREFIX + vaultId, allowed ? "1" : "0");
    } catch {
        // see above
    }
}

// `ok` alone is not enough: a redirect to the vault home also ends in 200.
// The path has to be the one we asked for.
async function probe(vaultId) {
    const path = settingsPath(vaultId);
    try {
        const response = await fetch(path, {
            credentials: "same-origin",
            redirect: "follow",
            headers: { Accept: "text/html" },
        });
        return response.ok && new URL(response.url).pathname === path;
    } catch {
        return false;
    }
}

const inflight = new Map();

export async function canEditLocations(vaultId) {
    if (!vaultId) return false;
    if (headerSaysAdmin()) return true;

    const known = cached(vaultId);
    if (known !== null) return known;

    if (inflight.has(vaultId)) return inflight.get(vaultId);
    const pending = probe(vaultId).then((allowed) => {
        remember(vaultId, allowed);
        inflight.delete(vaultId);
        return allowed;
    });
    inflight.set(vaultId, pending);
    return pending;
}
