// content/api/search-plates.js
//
// Collects every distinct plate referenced by the current search's results,
// across pagination, for the "Export Plate Locations" button
// (features/ui-fixes/plate-location-export.js).
//
// The results table only renders the first page of results; the rest sit behind
// CDD's "Load next 100 results…" incremental loader. That loader does NOT page
// the search page itself -- re-fetching the search URL with offset just returns
// the first page again (every page would yield the same handful of plates).
// The real paginator is the per-render `search_results` endpoint
// (`/vaults/<v>/search_results/<id>`), the same one "Load next 100" and sorting
// hit. We page that with limit/offset and read plate links from each chunk:
//     <div class="plate_name"><a href="/vaults/<v>/plates/<p>">platenew123</a></div>

const LOG_PREFIX = "[CDD plate plugin]";

const PLATE_LINK_SELECTOR = '.plate_name a[href*="/plates/"]';

// The search_results endpoint for the current render. `#incrementalLoadLink`
// carries it as data-url; otherwise rebuild it from the `#search_results_id`
// hidden field and the vault in the path. Null if neither is present (we are
// probably not on a results page).
function getResultsEndpoint() {
    const dataUrl = document
        .querySelector("#incrementalLoadLink[data-url]")
        ?.getAttribute("data-url");
    if (dataUrl) return new URL(dataUrl, location.origin);

    const id = document.querySelector("#search_results_id")?.value;
    const vault = location.pathname.match(/\/vaults\/(\d+)/)?.[1];
    if (id && vault) {
        return new URL(`/vaults/${vault}/search_results/${id}`, location.origin);
    }

    return null;
}

// CDD's CSRF token (needed for the PUT below).
function getCsrf() {
    return (
        document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") || ""
    );
}

// Current sort, read from the live sorting/display form (defaults match CDD's).
function getSortParams() {
    const by =
        document.querySelector('#sorting_form [name="sort_by"]')?.value ||
        document.querySelector('[name="sort_by"]')?.value ||
        "molecule_header";
    const dir =
        document.querySelector('#sorting_form [name="sort_direction"]')?.value ||
        document.querySelector('[name="sort_direction"]')?.value ||
        "DESC";
    return { by, dir };
}

// CDD returns the rows wrapped in <template name="ujs-replace-content"> (its UJS
// "replace #result_rows" payload). Template contents live in a separate
// DocumentFragment that querySelectorAll on the document does NOT traverse, so
// we must query the template's `.content`. Falls back to the doc itself.
function contentRoot(doc) {
    const tpl =
        doc.querySelector('template[name="ujs-replace-content"]') ||
        doc.querySelector("template");
    return tpl ? tpl.content : doc;
}

// Parse a results chunk's plate links into [{ id, name, href }]. We match
// `.plate_name a` across the whole parsed fragment (the chunk may be just rows,
// not wrapped in #result_rows).
function extractPlates(root) {
    const out = [];
    root.querySelectorAll(PLATE_LINK_SELECTOR).forEach((a) => {
        const href = a.getAttribute("href");
        const name = a.textContent?.trim();
        const id = href?.match(/\/plates\/(\d+)/)?.[1];
        if (id && href) out.push({ id, name: name || `Plate ${id}`, href });
    });
    return out;
}

// How many *results* (distinct entities) a chunk rendered. CDD's limit/offset
// count results, NOT table rows: in "Details" view one entity spans several
// readout <tr>s (rowspan), so we advance `offset` by the entity count, not the
// row count. Each row carries its entity id in a `molecule_row_<id>` class. We
// scan the whole fragment (a chunk may be bare rows, not wrapped in #result_rows).
function countResults(root) {
    const ids = new Set();
    root.querySelectorAll('tr[class*="molecule_row_"]').forEach((tr) => {
        const match = tr.className.match(/molecule_row_(\d+)/);
        if (match) ids.add(match[1]);
    });
    return ids.size;
}

// Total number of results CDD reports for this search, or null if unreadable.
// `#selectedResultCount` carries it as data-totalcount; the header text
// ("10 Results") is the fallback. Exported so the export button can warn about
// large sets using the already-rendered live page, with no extra fetch.
export function readResultTotal(doc = document) {
    const attr = doc
        .querySelector("[data-totalcount]")
        ?.getAttribute("data-totalcount");
    if (attr && /^\d+$/.test(attr)) return Number(attr);

    const header = doc.querySelector("#num_search_structures")?.textContent || "";
    const match = header.match(/([\d,]+)\s+results?/i);
    if (match) return Number(match[1].replace(/,/g, ""));

    return null;
}

// Walk the search results, deduping plates by id (a plate recurs across every
// well/row that uses it). Returns [{ id, name, href }] in first-seen order.
//
// Options:
//   pageSize   rows requested per fetch (server may cap this; we cope).
//   maxPages   runaway guard, not an expected limit.
//   signal     AbortSignal; aborts the in-flight fetch and stops paging.
//   onProgress called per page with { pages, plates, total, scanned }.
export async function collectAllPlates({
    pageSize = 1000,
    maxPages = 500,
    signal,
    onProgress,
} = {}) {
    const base = getResultsEndpoint();
    const seen = new Map();

    if (!base) {
        console.warn(`${LOG_PREFIX} no search_results endpoint on page`);
        return [];
    }

    const csrf = getCsrf();
    const { by: sortBy, dir: sortDir } = getSortParams();

    let offset = 0;
    // Total comes from the live page (the chunk fragments may not carry it).
    let total = readResultTotal(document);

    for (let page = 0; page < maxPages; page += 1) {
        if (signal?.aborted) break;

        // Replicate the request CDD makes to re-render the results table (the
        // same endpoint sorting and "Load next 100" use): a PUT with the sort +
        // limit/offset as form data. A bare GET returns no rows.
        const body = new URLSearchParams({
            authenticity_token: csrf,
            sort_by: sortBy,
            sort_direction: sortDir,
            flagging_readouts: "false",
            limit: String(pageSize),
            offset: String(offset),
        });

        let doc;
        try {
            const res = await fetch(base.toString(), {
                method: "PUT",
                credentials: "include",
                headers: {
                    "X-Requested-With": "XMLHttpRequest",
                    "X-CSRF-Token": csrf,
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                    Accept: "text/html, */*; q=0.01",
                },
                body: body.toString(),
                signal,
            });
            if (!res.ok) {
                const msg = `results endpoint HTTP ${res.status}`;
                console.warn(`${LOG_PREFIX} ${msg}`, { url: base.toString() });
                if (page === 0) throw new Error(msg);
                break;
            }
            const html = await res.text();
            doc = new DOMParser().parseFromString(html, "text/html");
        } catch (err) {
            if (err?.name === "AbortError") break;
            if (page === 0) throw err;
            console.warn(`${LOG_PREFIX} failed to load results page`, { err });
            break;
        }

        const root = contentRoot(doc);
        for (const plate of extractPlates(root)) {
            if (!seen.has(plate.id)) seen.set(plate.id, plate);
        }

        const results = countResults(root);
        if (total == null && page === 0) total = readResultTotal(doc);

        // Advance by entities actually returned (handles a server-capped limit),
        // in the same unit CDD's offset uses.
        offset += results;
        onProgress?.({
            pages: page + 1,
            plates: seen.size,
            total,
            scanned: offset,
        });

        // Empty page => nothing more to read.
        if (results === 0) break;

        // Stop once we've covered the reported total. When the total is unknown,
        // fall back to "a page returning fewer entities than requested is last".
        if (total != null) {
            if (offset >= total) break;
        } else if (results < pageSize) {
            break;
        }
    }

    return [...seen.values()];
}
