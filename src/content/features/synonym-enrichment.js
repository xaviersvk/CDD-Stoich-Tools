// content/features/synonym-enrichment.js
//
// Fills in the `synonym` of every panel card, because CDD's eln_entry JSON
// does not carry one. The value lives on the molecule page, so showing it
// costs one GET per DISTINCT molecule in the entry — which is why the whole
// module is gated on the "Synonym" panel field being enabled. With the field
// off, nothing here touches the network.
//
// Unlike batch-field-enrichment.js this covers EVERY card, products and
// mentions included: a product is exactly the case the feature was asked for
// (PRO-… rows carry a synonym as readily as any reagent), and the value is
// molecule-level, so nothing about a row's kind makes it unavailable.

import { STATE } from "../state.js";
import {
    renderFromState,
    isPanelFieldVisible,
    onPanelFieldsChanged,
} from "./sample-panel.js";
import { detectVaultId } from "../api/molecule-image.js";
import { getMoleculeSynonym } from "../api/molecule-page.js";

const SYNONYM_FIELD_KEY = "synonym";

// Ticking the checkbox should fill in the panel that is already open, not the
// next one. Safe to call once at content-script startup.
export function initSynonymEnrichment() {
    onPanelFieldsChanged(enrichSampleSynonyms);
}

// Called after every SAMPLE_DATA payload lands in STATE, and again whenever the
// panel-field settings change. Safe to call often: already-resolved samples and
// cached molecules cost nothing.
export function enrichSampleSynonyms() {
    if (!isPanelFieldVisible(SYNONYM_FIELD_KEY)) return;

    const samples = STATE.lastPayload?.samples;
    if (!Array.isArray(samples) || !samples.length) return;

    // The molecule's HOME vault may differ from the entry's (an ELN vault
    // links to a registration vault); the server redirects and fetch() follows
    // it, so the page's own vault is enough — mention cards, which know their
    // home vault but do not carry it on the sample, rely on the same thing.
    const vaultId = detectVaultId();
    if (!vaultId) return;

    const targetsByMolecule = new Map();

    for (const sample of samples) {
        if (!sample?.moleculeId) continue;
        if (sample.synonymFetched) continue;

        const list = targetsByMolecule.get(sample.moleculeId) || [];
        list.push(sample);
        targetsByMolecule.set(sample.moleculeId, list);
    }

    if (!targetsByMolecule.size) return;

    const payloadAtStart = STATE.lastPayload;

    Promise.all(
        Array.from(targetsByMolecule, async ([moleculeId, targets]) => {
            let synonym;
            try {
                synonym = await getMoleculeSynonym(vaultId, moleculeId);
            } catch {
                // The page did not load. Leave the samples unmarked so the next
                // payload retries — molecule-page.js drops failures from its
                // cache for exactly this.
                return false;
            }

            for (const sample of targets) {
                sample.synonym = synonym;
                // Set even when there is no synonym: "this molecule has none"
                // is an answer, and re-asking every render would be a fetch
                // per payload for nothing.
                sample.synonymFetched = true;
            }

            // A molecule with no synonym changed no visible row.
            return synonym != null;
        })
    ).then((results) => {
        // Re-render only if the enriched payload is still the one on screen.
        if (results.some(Boolean) && STATE.lastPayload === payloadAtStart) {
            renderFromState();
        }
    });
}
