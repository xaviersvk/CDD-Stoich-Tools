// content/api/plate-info.js
//
// Resolves a plate's Inventory Location for the search-results hover tooltip
// (see features/ui-fixes/plate-location-tooltip.js).
//
// The search results list plate links as `<a href="/vaults/<v>/plates/<p>">`,
// but the inventory location lives only on the plate page itself, in
//     <td id="plate_data_table_inventory_location">Lab 2 > Fridge 2</td>
// A plain `fetch` of that page yields the server HTML, which already contains
// the value -- no API/JSON endpoint needed.
//
// We fetch each plate page once and cache the resulting Promise -- including
// failures -- for the session, so repeated hovers never re-request. Mirrors the
// caching approach in api/molecule-image.js.

const LOG_PREFIX = "[CDD plate plugin]";

// cacheKey (plate page path) -> Promise<{ inventoryLocation }>
const plateCache = new Map();

const EMPTY = { inventoryLocation: null };

// Read the Inventory Location off a fetched plate page, or null when the row is
// absent/blank (CDD renders it as "0.0"-style placeholders only for numeric
// fields; an unset location is simply empty).
function extractInventoryLocation(doc) {
    const cell = doc.getElementById("plate_data_table_inventory_location");
    const value = cell?.textContent?.trim();
    return value || null;
}

async function fetchPlateInfo(platePath) {
    try {
        const res = await fetch(platePath, { credentials: "include" });

        if (!res.ok) {
            console.warn(`${LOG_PREFIX} plate page HTTP ${res.status}`, { platePath });
            return EMPTY;
        }

        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, "text/html");

        return { inventoryLocation: extractInventoryLocation(doc) };
    } catch (err) {
        console.warn(`${LOG_PREFIX} failed to load plate info`, { platePath, err });
        return EMPTY;
    }
}

// Public API: returns a cached Promise<{ inventoryLocation }>. Safe to call on
// every hover -- the fetch happens at most once per plate path per session,
// failures included.
export function getPlateInfo(platePath) {
    if (!platePath) return Promise.resolve(EMPTY);

    if (plateCache.has(platePath)) {
        return plateCache.get(platePath);
    }

    const promise = fetchPlateInfo(platePath);
    plateCache.set(platePath, promise);
    return promise;
}
