// content/message-router.js
import { STATE } from "./state.js";
import { renderFromState } from "./features/sample-panel.js";
import { enrichBatchOnlySamples } from "./features/batch-field-enrichment.js";
import { enrichInventorySamples } from "./features/inventory-sample-enrichment.js";
import { enrichSampleSynonyms } from "./features/synonym-enrichment.js";
import { captureRowNames } from "./features/name-capture.js";
import { learnFromSearchResponse } from "./features/search-learning.js";
import { enrichRowNameSynonyms } from "./features/name-enrichment.js";
import { onSamplePayload, scheduleAutoFill } from "./features/auto-fill.js";
import { ensurePrintButtons } from "./features/print-buttons.js";
import { markDepletedSamplesInSelector } from "./features/depleted-marker.js";
import { noteMoleculeSamples, notePickedMolecule } from "./features/sample-picker-hints.js";
import { prefetchMolecules } from "./api/molecule-image.js";
import { updateBoxData } from "./features/ui-fixes/inventory-grid-colors.js";
import { setCapturedCreate } from "./features/multi-position-sample-create/capture-store.js";
import { notifyCreateResponse } from "./features/multi-position-sample-create/response-store.js";
import {EVENT_SOURCE, EVENTS} from "../shared/event-types";


// How long a new payload may wait for its samples before it is drawn anyway.
const HOLD_MS = 1500;

// The payload waiting for its samples, so a newer one can supersede it.
let incoming = null;

// A reaction payload is drawn once, full — not bare first.
//
// The entry carries only a stripped copy of each sample; the rest is fetched
// (inventory-sample-enrichment, batch-field-enrichment). Drawing the payload
// before that fetch lands showed, on entry 1000000814: full "mentioned in
// text" cards, then bare reaction cards, then full ones. So the payload is
// held — the panel keeps what it shows — until its samples are in, and is
// committed to STATE only then, so no other render can draw it bare either.
// Anything already loaded is applied synchronously and costs no wait.
function acceptSamplePayload(payload) {
    incoming = payload;
    const samples = payload?.samples;
    const pending = [enrichInventorySamples(samples), enrichBatchOnlySamples(samples)]
        .filter(Boolean);

    if (!pending.length) {
        commitSamplePayload(payload);
        return;
    }

    let committed = false;
    const commit = () => {
        if (committed || incoming !== payload) return;
        committed = true;
        commitSamplePayload(payload);
    };

    Promise.all(pending).then((changed) => {
        if (!committed) {
            commit();
            return;
        }
        // Drawn by the timeout before the samples arrived: draw again.
        if (changed.some(Boolean) && STATE.lastPayload === payload) {
            renderFromState();
            scheduleAutoFill();
        }
    }, commit);

    setTimeout(commit, HOLD_MS);
}

function commitSamplePayload(payload) {
    STATE.lastPayload = payload;
    renderFromState();
    captureRowNames(STATE.lastPayload?.samples);
    enrichSampleSynonyms();
    enrichRowNameSynonyms();
    onSamplePayload();
}

export function handleMessage(event) {
    if (event.source !== window) return;

    const data = event.data;
    if (!data || data.source !== EVENT_SOURCE) return;

    switch (data.type) {
        case EVENTS.REACTION_VISIBILITY: {
            STATE.hasReactionFeature = !!data.payload?.visible;

            // "No reaction" is no longer the same as "nothing to show": an
            // entry can earn its panel purely by linking to a batch or a
            // sample in its text. renderFromState() takes the panel away
            // itself when neither reason is left.
            renderFromState();
            break;
        }

        case EVENTS.SAMPLE_DATA: {
            acceptSamplePayload(data.payload || null);
            break;
        }

        case EVENTS.PRINT_DATA: {
            STATE.reactionPayloads = Array.isArray(data.payload?.reactionPayloads)
                ? data.payload.reactionPayloads
                : [];

            const incoming = Array.isArray(data.payload?.depletedIdentifiers)
                ? data.payload.depletedIdentifiers
                : [];

            if (incoming.length > 0) {
                const next = new Set(STATE.depletedIdentifiers || []);
                for (const id of incoming) {
                    const normalized = String(id || "").replace(/\s+/g, " ").trim();
                    if (normalized) next.add(normalized);
                }
                STATE.depletedIdentifiers = next;
            }

            setTimeout(() => {
                ensurePrintButtons();
                markDepletedSamplesInSelector();
            }, 50);
            break;
        }

        case EVENTS.INVENTORY_MOLECULES: {
            const ids = Array.isArray(data.payload?.moleculeIds)
                ? data.payload.moleculeIds
                : [];
            if (ids.length) prefetchMolecules(ids);
            break;
        }

        case EVENTS.INVENTORY_BOX: {
            updateBoxData(data.payload?.positions || []);
            break;
        }

        case EVENTS.MOLECULE_SEARCH: {
            learnFromSearchResponse(data.payload?.body);
            break;
        }

        case EVENTS.MOLECULE_LOADED: {
            notePickedMolecule(data.payload);
            break;
        }

        case EVENTS.MOLECULE_SAMPLES: {
            noteMoleculeSamples(data.payload);
            break;
        }

        case EVENTS.CREATE_SAMPLE_CAPTURED: {
            setCapturedCreate(data.payload || null);
            break;
        }

        case EVENTS.CREATE_SAMPLE_RESPONDED: {
            notifyCreateResponse(data.payload || null);
            break;
        }

        default:
            break;
    }
}