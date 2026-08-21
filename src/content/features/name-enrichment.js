// content/features/name-enrichment.js
//
// Keeps a per-session map moleculeId -> shortest synonym, so the offer in
// fill-offers.js can be computed synchronously inside a render pass.
//
// Modelled on synonym-enrichment.js, with two differences: the value is the
// SHORTEST synonym rather than the first, and it is not written onto the
// sample (no panel field shows it) but held here, because the offer is the
// only consumer.
//
// Gated on the row-name checkbox: with the feature off, not a single
// molecule page is requested.

import { STATE } from "../state.js";
import { renderFromState } from "./sample-panel.js";
import { detectVaultId } from "../api/molecule-image.js";
import { getMoleculeSynonymsText } from "../api/molecule-page.js";
import { pickPrettyName } from "../../shared/pretty-name.js";
import {
    isFillRowNameEnabled,
    onFillRowNameChanged,
} from "../../shared/row-name-flag.js";

// moleculeId -> string | null. A stored null means "asked, has none" — a
// final answer, not a reason to ask again.
const prettyNames = new Map();
const inFlight = new Set();

export function getPrettyName(moleculeId) {
    return prettyNames.get(String(moleculeId)) ?? null;
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
        if (prettyNames.has(id) || inFlight.has(id)) continue;
        wanted.add(id);
    }
    if (!wanted.size) return;

    const payloadAtStart = STATE.lastPayload;

    Promise.all(
        Array.from(wanted, async (moleculeId) => {
            inFlight.add(moleculeId);
            try {
                const text = await getMoleculeSynonymsText(vaultId, moleculeId);
                prettyNames.set(moleculeId, pickPrettyName(text));
                return prettyNames.get(moleculeId) != null;
            } catch {
                // The page did not load. Leave the molecule unrecorded so the
                // next payload retries — molecule-page.js drops failures from
                // its cache for exactly this.
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
