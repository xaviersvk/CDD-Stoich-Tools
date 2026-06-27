// content/features/ui-fixes/plate-location-export.js
//
// Adds a "Plate Locations" section to CDD's native Export dialog (the popup
// opened from the search-results "Export" link). It gathers every distinct
// plate across the whole result set -- not just the loaded page -- looks up each
// plate's Inventory Location, and downloads a CSV of unique plate name +
// location so the bench scientist can walk the lab and find them.
//
// Why a separate CSV instead of CDD's export: the Inventory Location is not a
// search-result column CDD can emit; it lives on each plate page. So we collect
// the plate ids from the results (api/search-plates.js, paginated), resolve the
// location per plate (api/plate-info.js, fetch-once-and-cached), and build the
// file ourselves.
//
// Cost & safety: thousands of compounds usually sit on only a handful of plates
// (deduped by id), so the per-plate fetches are few. The real cost is paging the
// (heavy) results HTML, so for large searches we warn before starting, show live
// progress, and let the user cancel (AbortController).

import { collectAllPlates, readResultTotal } from "../../api/search-plates.js";
import { getPlateInfo } from "../../api/plate-info.js";

const LOG_PREFIX = "[CDD plate plugin]";

const STYLE_ID = "cdd-plate-export-style";
const BLOCK_ID = "cdd-plate-export-block";
const DIALOG_BODY_SELECTOR = "#exportOptions-light-box .subcontainer";

// Concurrent plate-page fetches: enough to be quick, polite to CDD.
const CONCURRENCY = 4;

// Above this many results we ask the user to confirm before paging everything.
const WARN_THRESHOLD = 1000;

let started = false;
let running = false;

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        #${BLOCK_ID} {
            margin-top: 12px;
            padding-top: 12px;
            border-top: 1px solid #e0e0e0;
        }

        #${BLOCK_ID} > .cdd-plate-export-summary {
            cursor: pointer;
            font-size: 12px;
            opacity: 0.7;
            list-style-position: inside;
        }

        #${BLOCK_ID}[open] > .cdd-plate-export-summary {
            margin-bottom: 8px;
            opacity: 0.9;
        }

        #${BLOCK_ID} .cdd-plate-export-desc {
            margin: 0 0 8px;
            font-size: 12px;
            opacity: 0.75;
        }

        #${BLOCK_ID} .cdd-plate-export-status {
            display: block;
            margin-top: 8px;
            font-size: 12px;
            word-break: break-word;
            user-select: text;
        }

        #${BLOCK_ID} .cdd-plate-export-cancel {
            margin-left: 10px;
            font-size: 12px;
            color: #0074d9;
            cursor: pointer;
        }

        #${BLOCK_ID} .cdd-plate-export-button.cdd-busy {
            opacity: 0.6;
            pointer-events: none;
        }
    `;

    document.head.appendChild(style);
}

// Run `task` over `items` with at most `limit` in flight, preserving order.
// Stops launching new tasks once `shouldStop()` returns true (cancellation).
async function mapLimit(items, limit, task, shouldStop) {
    const results = new Array(items.length);
    let next = 0;

    async function worker() {
        while (next < items.length) {
            if (shouldStop?.()) return;
            const index = next;
            next += 1;
            results[index] = await task(items[index], index);
        }
    }

    const workers = [];
    for (let i = 0; i < Math.min(limit, items.length); i += 1) {
        workers.push(worker());
    }
    await Promise.all(workers);

    return results;
}

// Quote a CSV field per RFC 4180: wrap in quotes, double any embedded quote.
// Locations like "Lab 2 > Fridge 2" are safe but plate names can carry commas.
function csvField(value) {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function buildCsv(rows) {
    const header = ["Plate Name", "Inventory Location"];
    const lines = [header, ...rows].map((cols) => cols.map(csvField).join(","));
    // Leading BOM so Excel reads UTF-8 (accented location names) correctly.
    return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

function downloadCsv(filename, text) {
    const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    // Give the download a tick to start before releasing the blob.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function runExport({ button, status, cancel }) {
    if (running) return;
    running = true;

    const controller = new AbortController();
    let cancelled = false;
    const stop = () => cancelled || controller.signal.aborted;

    const finish = () => {
        running = false;
        button.classList.remove("cdd-busy");
        cancel.hidden = true;
    };

    // Warn before paging a large result set (read from the live page, no fetch).
    const total = readResultTotal(document);
    if (total == null || total >= WARN_THRESHOLD) {
        const sizeText =
            total == null ? "a large number of" : total.toLocaleString();
        const ok = window.confirm(
            `This search has ${sizeText} results. Collecting every plate's ` +
                `inventory location may take a while and load each result page. ` +
                `Continue?`
        );
        if (!ok) {
            running = false;
            return;
        }
    }

    button.classList.add("cdd-busy");
    cancel.hidden = false;
    cancel.onclick = (event) => {
        event.preventDefault();
        cancelled = true;
        controller.abort();
        status.textContent = "Cancelling…";
    };

    let lastScanned = 0;
    let lastTotal = null;

    try {
        status.textContent = "Collecting plates…";
        const plates = await collectAllPlates({
            signal: controller.signal,
            onProgress: ({ plates: found, scanned, total: t }) => {
                lastScanned = scanned;
                lastTotal = t;
                const of = t != null ? ` / ${t.toLocaleString()}` : "";
                status.textContent =
                    `Scanning results… ${scanned.toLocaleString()}${of}, ` +
                    `${found} plate(s)`;
            },
        });

        if (stop()) {
            status.textContent = "Cancelled";
            return;
        }

        if (!plates.length) {
            const totalText = lastTotal != null ? lastTotal.toLocaleString() : "?";
            status.textContent =
                `No plates found (scanned ${lastScanned.toLocaleString()} of ` +
                `${totalText} results)`;
            return;
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

        // One row per unique plate, sorted by name for an easy walk of the lab.
        const resolved = rows.filter(Boolean);
        resolved.sort((a, b) =>
            a[0].localeCompare(b[0], undefined, { numeric: true, sensitivity: "base" })
        );

        downloadCsv("cdd-plate-locations.csv", buildCsv(resolved));
        status.textContent = `Exported ${resolved.length} plate(s)`;
    } catch (err) {
        console.warn(`${LOG_PREFIX} plate export failed`, err);
        status.textContent = `Failed: ${err?.message || err}`;
    } finally {
        finish();
    }
}

function ensureBlock() {
    const body = document.querySelector(DIALOG_BODY_SELECTOR);
    if (!body) return;
    if (body.querySelector(`#${BLOCK_ID}`)) return;

    // Collapsed by default (<details>): this is an experimental extra, so keep it
    // tucked away under the native export options rather than front and centre.
    const block = document.createElement("details");
    block.id = BLOCK_ID;

    const summary = document.createElement("summary");
    summary.className = "cdd-plate-export-summary";
    summary.textContent = "Plate locations (experimental)";

    const desc = document.createElement("p");
    desc.className = "cdd-plate-export-desc";
    desc.textContent =
        "Download a CSV of every plate in these results with its inventory location.";

    const button = document.createElement("a");
    button.href = "#";
    button.className = "buttony cdd-plate-export-button";
    button.textContent = "Export Plate Locations (CSV)";

    const status = document.createElement("span");
    status.className = "cdd-plate-export-status";

    const cancel = document.createElement("a");
    cancel.href = "#";
    cancel.className = "cdd-plate-export-cancel";
    cancel.textContent = "Cancel";
    cancel.hidden = true;

    button.addEventListener("click", (event) => {
        event.preventDefault();
        runExport({ button, status, cancel });
    });

    block.append(summary, desc, button, status, cancel);
    body.appendChild(block);
}

export function initPlateLocationExport() {
    if (started) return;
    started = true;

    injectStyles();

    let scheduled = false;
    const run = () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            ensureBlock();
        });
    };

    // Observe <html>: Turbo swaps <body>, and the export dialog is re-rendered
    // when results update, so we re-add our block on any relevant change.
    const observer = new MutationObserver(run);
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
    });

    run();
}
