// content/api/plate-info.js
//
// Resolves a plate's Inventory Location and its Location field for the
// search-results hover tooltip (features/ui-fixes/plate-location-tooltip.js),
// the Plates list columns and the plate-location CSV -- and the plate's runs
// for the Protocols column on a molecule's Plates tab
// (features/ui-fixes/molecule-plate-protocols.js).
//
// The search results list plate links as `<a href="/vaults/<v>/plates/<p>">`,
// but both values live only on the plate page itself, in
//     <td id="plate_data_table_inventory_location">Lab 2 > Fridge 2</td>
//     <td id="plate_data_table_location">Used: 2</td>
// (the second is the plate definition's free-text Location field). The runs
// are the table in div#plate-runs, one row per run:
//     <th><a href="/vaults/<v>/protocols/<p>">GloSensor optimization</a></th>
//     <td><a href="/vaults/<v>/runs/<r>">2026-02-13</a></td>
// (an unassayed plate shows a .noDataMessage instead of the table).
// A plain `fetch` of that page yields the server HTML, which already contains
// the values -- no API/JSON endpoint needed.
//
// We fetch each plate page once and cache the resulting Promise -- including
// failures -- for the session, so repeated hovers never re-request. Mirrors the
// caching approach in api/molecule-image.js.

const LOG_PREFIX = "[CDD plate plugin]";

// cacheKey (plate page path) -> Promise<{ inventoryLocation, location, runs }>
const plateCache = new Map();

// `runs: null` = the page could not be read; [] = the plate has no runs.
const EMPTY = { inventoryLocation: null, location: null, runs: null };

// Read one plate-definition cell off a fetched plate page, or null when the row
// is absent/blank (CDD renders "0.0"-style placeholders only for numeric
// fields; an unset location is simply empty).
function extractField(doc, id) {
    const value = doc.getElementById(id)?.textContent?.trim();
    return value || null;
}

// The plate's runs, in page order:
// [{ protocol, protocolHref, date, runHref }].
function extractRuns(doc) {
    const rows = doc.querySelectorAll("#plate-runs table tbody tr");

    return [...rows].flatMap((row) => {
        const protocolLink = row.querySelector('a[href*="/protocols/"]');
        if (!protocolLink) return [];

        const runLink = row.querySelector('a[href*="/runs/"]:not([href*="/heat_maps"])');
        return [{
            protocol: protocolLink.textContent.trim(),
            protocolHref: protocolLink.getAttribute("href"),
            date: runLink?.textContent.trim() || null,
            runHref: runLink?.getAttribute("href") || null,
        }];
    });
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

        return {
            inventoryLocation: extractField(doc, "plate_data_table_inventory_location"),
            location: extractField(doc, "plate_data_table_location"),
            runs: extractRuns(doc),
        };
    } catch (err) {
        console.warn(`${LOG_PREFIX} failed to load plate info`, { platePath, err });
        return EMPTY;
    }
}

// Public API: returns a cached Promise<{ inventoryLocation, location, runs }>. Safe to
// call on every hover -- the fetch happens at most once per plate path per
// session, failures included.
export function getPlateInfo(platePath) {
    if (!platePath) return Promise.resolve(EMPTY);

    if (plateCache.has(platePath)) {
        return plateCache.get(platePath);
    }

    const promise = fetchPlateInfo(platePath);
    plateCache.set(platePath, promise);
    return promise;
}
