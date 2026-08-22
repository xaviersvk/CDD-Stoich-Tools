// content/features/name-enrichment.js
//
// The row-name feature's PREFETCH: makes sure every row that could be offered
// a name has its molecule's synonyms in hand, so fill-offers.js can decide
// synchronously inside a render pass.
//
// The synonyms themselves live in api/molecule-synonyms.js, shared with the
// panel's Synonym field — this module only decides WHICH molecules are worth
// asking about, and re-renders when the answers land.
//
// Gated on the row-name mode: while that is off, not a single molecule page
// is requested.

import { STATE } from "../state.js";
import { renderFromState } from "./sample-panel.js";
import { detectVaultId } from "../api/molecule-image.js";
import { getSynonyms, loadSynonyms } from "../api/molecule-synonyms.js";
import { pickShortest } from "../../shared/pretty-name.js";
import {
    isFillRowNameEnabled,
    onFillRowNameChanged,
} from "../../shared/row-name-flag.js";

const inFlight = new Set();

/** The name to offer for this molecule: its shortest synonym, or null. */
export function getPrettyName(moleculeId) {
    return pickShortest(getSynonyms(moleculeId));
}

// Ticking the checkbox should fill in the panel that is already open, not the
// next one. Safe to call once at content-script startup.
export function initRowNameEnrichment() {
    onFillRowNameChanged(() => {
        enrichRowNameSynonyms();
        renderFromState();
    });
}

export function enrichRowNameSynonyms() {
    if (!isFillRowNameEnabled()) return;

    const samples = STATE.lastPayload?.samples;
    if (!Array.isArray(samples) || !samples.length) return;

    // The molecule's HOME vault may differ from the entry's; the server
    // redirects and fetch() follows it, so the page's own vault is enough.
    const vaultId = detectVaultId();
    if (!vaultId) return;

    const wanted = new Set();
    for (const sample of samples) {
        if (!sample?.moleculeId) continue;
        if (sample.isProduct || sample.isMention) continue;   // no offer, no fetch
        const id = String(sample.moleculeId);
        if (getSynonyms(id) || inFlight.has(id)) continue;
        wanted.add(id);
    }
    if (!wanted.size) return;

    const payloadAtStart = STATE.lastPayload;

    Promise.all(
        Array.from(wanted, async (moleculeId) => {
            inFlight.add(moleculeId);
            try {
                return pickShortest(await loadSynonyms(vaultId, moleculeId)) != null;
            } catch {
                // The page did not load. Nothing is recorded, so the next
                // payload retries.
                return false;
            } finally {
                inFlight.delete(moleculeId);
            }
        })
    ).then((results) => {
        if (!results.some(Boolean)) return;
        // Re-render only if what was enriched is still what is on screen.
        if (STATE.lastPayload === payloadAtStart) renderFromState();
    });
}
