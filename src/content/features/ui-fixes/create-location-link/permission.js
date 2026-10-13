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
// anyone else is sent elsewhere.
//
// Remembered per vault and per USER for the tab's session. A yes holds for the
// session; a no only for a few minutes. A tab outlives a login switch and an
// admin granting inventory rights, and a "no" kept for the whole session
// hid the entry from someone who had just been given the right.

const ROLE_LINK_SELECTOR = '.user-dropdown a[data-tooltip-path*="user_roles"]';
const ADMIN_ROLE = "Vault Administrator";
const USER_SELECTOR = ".username-text";
const CACHE_PREFIX = "cddCanEditLocations:";
const NO_TTL_MS = 5 * 60 * 1000;

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

// Name and email from the header, whitespace-folded. Empty when the header
// is not there; then answers are shared by whoever is logged in.
export function currentUserKey(doc = document) {
    return (doc.querySelector(USER_SELECTOR)?.textContent || "").replace(/\s+/g, " ").trim();
}

// Pure: is a stored answer still good for this user now? Returns true/false,
// or null to probe again. Old plain "1"/"0" values carry no user and no time.
export function readCachedAnswer(raw, user, now) {
    let entry;
    try {
        entry = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!entry || typeof entry !== "object" || entry.user !== user) return null;
    if (entry.allowed === true) return true;
    if (entry.allowed === false && now - Number(entry.at) >= 0 && now - Number(entry.at) < NO_TTL_MS) {
        return false;
    }
    return null;
}

function cached(vaultId) {
    try {
        return readCachedAnswer(sessionStorage.getItem(CACHE_PREFIX + vaultId), currentUserKey(), Date.now());
    } catch {
        // storage can be off; then we simply probe each page load
        return null;
    }
}

function remember(vaultId, allowed) {
    try {
        sessionStorage.setItem(
            CACHE_PREFIX + vaultId,
            JSON.stringify({ allowed, user: currentUserKey(), at: Date.now() })
        );
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
