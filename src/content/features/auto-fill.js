// content/features/auto-fill.js
//
// EXPERIMENTAL, opt-in (options checkbox): runs the same fills the card
// buttons offer, without the click. Sequential by design — every fill
// drives CDD's real editing UI and triggers an autosave, so overlapping
// runs would fight each other. Each (row, field) is attempted once per
// page session; a failure stops that row and is shown in the panel status.

import { STATE } from "../state.js";
import { setStatus, renderFromState } from "./sample-panel.js";
import { computeFillOffers, runFillOffer, markOfferFilled } from "./fill-offers.js";
import { touchValueUsed } from "../../shared/density-memory.js";
import { AUTO_FILL_STORAGE_KEY, getAutoFillEnabled } from "../../shared/auto-fill-flag.js";

let enabled = false;
let running = false;
let timer = null;
const attempted = new Set();

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
            for (const offer of computeFillOffers(sample)) {
                const key = `${sample.reactionIndex}:${sample.rowUid ?? sample.batchId}:${offer.field}`;
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
