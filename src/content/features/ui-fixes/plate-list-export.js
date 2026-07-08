// content/features/ui-fixes/plate-list-export.js
//
// Adds an "Export Plate Locations (CSV)" link to the Plates list page (Explore
// Data -> Plates), next to CDD's native "Export Plates" link. It pages through
// the whole plate list -- not just the visible page -- resolves each plate's
// Inventory Location (api/plate-info.js, fetch-once-and-cached, shared with the
// Location column and the hover bubble), and downloads a name + location CSV.
//
// The current search box query is respected, so filtering the list first
// exports just the filtered set. Distinct from plate-location-export.js, which
// lives in the search-results Export dialog and collects plates from compound
// search results.

import { getPlateInfo } from "../../api/plate-info.js";
import { mapLimit } from "../../utils/concurrency.js";
import { buildCsv, downloadCsv } from "../../utils/csv.js";

const LOG_PREFIX = "[CDD plate plugin]";

const STYLE_ID = "cdd-plate-list-export-style";
const LINK_ID = "cdd-plate-list-export-link";
const TABLE_SELECTOR = "table#plateList";

// Rows per fetched page while collecting; CDD's own per-page select tops out
// at 500, so this keeps the page count minimal.
const PER_PAGE = 500;
// Hard stop on paging, far above any real vault (200 * 500 = 100k plates).
const MAX_PAGES = 200;

// Concurrent plate-page fetches: enough to be quick, polite to CDD.
const CONCURRENCY = 4;

// Above this many plates each needs its own page fetch, so confirm first.
const WARN_THRESHOLD = 500;

let started = false;
let running = false;

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        #${LINK_ID}.cdd-busy {
            opacity: 0.6;
            pointer-events: none;
        }

        .cdd-plate-list-export-status {
            margin-left: 8px;
            font-size: 12px;
            opacity: 0.8;
        }

        .cdd-plate-list-export-cancel {
            margin-left: 8px;
            font-size: 12px;
            color: #0074d9;
            cursor: pointer;
        }
    `;

    document.head.appendChild(style);
}

// "14 Plates" heading on a plates list page -> 14, or null when unreadable.
function readPlateTotal(doc) {
    const heading = doc.querySelector("#pagination_form h2");
    const match = heading?.textContent?.match(/([\d,]+)\s+plates?/i);
    return match ? parseInt(match[1].replace(/,/g, ""), 10) : null;
}

// Page through the plates list (respecting the current search query) and
// collect { name, href } per plate, deduped by href.
async function collectPlates({ onProgress, shouldStop }) {
    const query = new URLSearchParams(location.search).get("query") || "";
    const byHref = new Map();
    let total = null;

    for (let page = 1; page <= MAX_PAGES; page += 1) {
        if (shouldStop()) break;

        const url = new URL(location.pathname, location.origin);
        url.searchParams.set("per_page", String(PER_PAGE));
        url.searchParams.set("page[plates]", String(page));
        if (query) url.searchParams.set("query", query);

        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error(`plate list HTTP ${res.status}`);

        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, "text/html");
        if (total == null) total = readPlateTotal(doc);

        const rows = doc.querySelectorAll(`${TABLE_SELECTOR} tbody tr`);
        for (const row of rows) {
            const link = row.querySelector('td a[href*="/plates/"]');
            const href = link?.getAttribute("href");
            if (href && !byHref.has(href)) {
                byHref.set(href, { name: link.textContent.trim(), href });
            }
        }

        onProgress?.({ collected: byHref.size, total });

        if (rows.length < PER_PAGE) break; // last page
    }

    return { plates: [...byHref.values()], total };
}

async function runExport({ link, status, cancel }) {
    if (running) return;
    running = true;

    let cancelled = false;
    const stop = () => cancelled;

    link.classList.add("cdd-busy");
    cancel.hidden = false;
    cancel.onclick = (event) => {
        event.preventDefault();
        cancelled = true;
        status.textContent = "Cancelling…";
    };

    try {
        status.textContent = "Collecting plates…";
        const { plates } = await collectPlates({
            shouldStop: stop,
            onProgress: ({ collected, total }) => {
                const of = total != null ? ` / ${total.toLocaleString()}` : "";
                status.textContent = `Collecting plates… ${collected.toLocaleString()}${of}`;
            },
        });

        if (stop()) {
            status.textContent = "Cancelled";
            return;
        }

        if (!plates.length) {
            status.textContent = "No plates found";
            return;
        }

        if (plates.length >= WARN_THRESHOLD) {
            const ok = window.confirm(
                `Looking up the inventory location of ${plates.length.toLocaleString()} ` +
                    `plates loads each plate's page and may take a while. Continue?`
            );
            if (!ok) {
                status.textContent = "";
                return;
            }
        }

        let done = 0;
        const rows = await mapLimit(
            plates,
            CONCURRENCY,
            async (plate) => {
                const { inventoryLocation } = await getPlateInfo(plate.href);
                done += 1;
                status.textContent = `Resolving locations… ${done}/${plates.length}`;
                return [plate.name, inventoryLocation || ""];
            },
            stop
        );

        if (stop()) {
            status.textContent = "Cancelled";
            return;
        }

        // Sorted by name for an easy walk of the lab.
        const resolved = rows.filter(Boolean);
        resolved.sort((a, b) =>
            a[0].localeCompare(b[0], undefined, { numeric: true, sensitivity: "base" })
        );

        downloadCsv(
            "cdd-plate-locations.csv",
            buildCsv(["Plate Name", "Inventory Location"], resolved)
        );
        status.textContent = `Exported ${resolved.length} plate(s)`;
    } catch (err) {
        console.warn(`${LOG_PREFIX} plate list export failed`, err);
        status.textContent = `Failed: ${err?.message || err}`;
    } finally {
        running = false;
        link.classList.remove("cdd-busy");
        cancel.hidden = true;
    }
}

// Add our link beside the native "Export Plates" one in the filter bar. Only on
// the Plates list page: keyed off the #plateList table plus that bar.
function ensureLink() {
    if (!document.querySelector(TABLE_SELECTOR)) return;

    const bar = document.querySelector("#browseData .data-filters .right");
    if (!bar || bar.querySelector(`#${LINK_ID}`)) return;

    const item = document.createElement("div");
    item.className = "item";

    const link = document.createElement("a");
    link.id = LINK_ID;
    link.href = "#";
    link.textContent = "Export Plate Locations (CSV)";

    const status = document.createElement("span");
    status.className = "cdd-plate-list-export-status";

    const cancel = document.createElement("a");
    cancel.href = "#";
    cancel.className = "cdd-plate-list-export-cancel";
    cancel.textContent = "Cancel";
    cancel.hidden = true;

    link.addEventListener("click", (event) => {
        event.preventDefault();
        runExport({ link, status, cancel });
    });

    item.append(link, status, cancel);
    bar.appendChild(item);
}

export function initPlateListExport() {
    if (started) return;
    started = true;

    injectStyles();

    let scheduled = false;
    const run = () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            ensureLink();
        });
    };

    // Observe <html>: Turbo swaps <body> on navigation, and the filter bar is
    // re-rendered with it; ensureLink() is idempotent per render.
    const observer = new MutationObserver(run);
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
    });

    run();
}
