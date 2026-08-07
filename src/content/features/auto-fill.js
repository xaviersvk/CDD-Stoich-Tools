// content/features/auto-fill.js
//
// EXPERIMENTAL, opt-in (options checkbox): runs the same fills the card
// buttons offer, without the click — but ONLY for rows that were ADDED
// while the user works on the page. Rows that already existed when the
// entry loaded are never written automatically (deliberate policy: opening
// an old ELN must not mutate it; the card buttons and the panel's
// "Fill all" button are the conscious path for those).
//
// Sequential by design — every fill drives CDD's real editing UI and
// triggers an autosave, so overlapping runs would fight each other. Each
// (row, field) is attempted once per page session; a failure stops that
// row and is shown in the panel status.

import { STATE } from "../state.js";
import { setStatus, renderFromState } from "./sample-panel.js";
import { computeFillOffers, runFillOffer, markOfferFilled } from "./fill-offers.js";
import { touchValueUsed } from "../../shared/density-memory.js";
import { AUTO_FILL_STORAGE_KEY, getAutoFillEnabled } from "../../shared/auto-fill-flag.js";

let enabled = false;
let running = false;
let timer = null;
const attempted = new Set();

// The rows that existed when the entry loaded — auto-fill never touches
// them. The baseline stays open for a short window because the first
// payloads arrive in a burst (initial parse, enrichment, partial
// responses) and all of them describe pre-existing rows.
const baselineRows = new Set();
let baselineHref = null;
let baselineUntil = 0;
const BASELINE_WINDOW_MS = 5000;

function rowKey(sample) {
    return `${sample.reactionIndex}:${sample.rowUid ?? sample.batchId}`;
}

// Called on every SAMPLE_DATA payload (before any fill is considered).
export function onSamplePayload() {
    const samples = STATE.lastPayload?.samples || [];

    if (baselineHref !== location.href) {
        // New entry (full load or Turbo navigation): start a fresh baseline
        // and forget the previous page's attempts.
        baselineHref = location.href;
        baselineRows.clear();
        attempted.clear();
        baselineUntil = Date.now() + BASELINE_WINDOW_MS;
    }

    if (Date.now() < baselineUntil) {
        for (const sample of samples) baselineRows.add(rowKey(sample));
        return;
    }

    scheduleAutoFill();
}

export function initAutoFill() {
    getAutoFillEnabled().then((value) => {
        enabled = value;
        if (enabled) scheduleAutoFill();
    });

    if (chrome?.storage?.onChanged) {
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== "local" || !changes[AUTO_FILL_STORAGE_KEY]) return;
            enabled = changes[AUTO_FILL_STORAGE_KEY].newValue === true;
            if (enabled) scheduleAutoFill();
        });
    }
}

// Debounced: payloads arrive in bursts (parse, enrichment re-render);
// wait for the dust to settle before touching the table.
export function scheduleAutoFill() {
    if (!enabled) return;
    clearTimeout(timer);
    timer = setTimeout(runQueue, 1500);
}

async function runQueue() {
    if (running || !enabled) return;
    running = true;

    let filled = 0;
    try {
        const samples = STATE.lastPayload?.samples || [];
        for (const sample of samples) {
            if (baselineRows.has(rowKey(sample))) continue;   // pre-existing row
            for (const offer of computeFillOffers(sample)) {
                const key = `${rowKey(sample)}:${offer.field}`;
                if (attempted.has(key)) continue;
                attempted.add(key);

                const result = await runFillOffer(sample, offer);
                if (result.ok) {
                    filled += 1;
                    markOfferFilled(sample, offer);
                    if (offer.source === "memory") touchValueUsed(sample.batchId);
                } else {
                    setStatus(`Auto-fill ${offer.field} for ${sample.name}: ${result.reason || "failed"} — use the card button or edit manually.`);
                    break;   // stop this row, keep going with the next
                }
                await new Promise((resolve) => setTimeout(resolve, 600));
            }
        }
    } finally {
        running = false;
    }

    if (filled) renderFromState();
}
