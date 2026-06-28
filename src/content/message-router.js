// content/message-router.js
import { STATE } from "./state.js";
import { renderFromState, removePanel } from "./features/sample-panel.js";
import { ensurePrintButtons } from "./features/print-buttons.js";
import { markDepletedSamplesInSelector } from "./features/depleted-marker.js";
import { prefetchMolecules } from "./api/molecule-image.js";
import { updateBoxData } from "./features/ui-fixes/inventory-grid-colors.js";
import { setCapturedCreate } from "./features/multi-position-sample-create/capture-store.js";
import {EVENT_SOURCE, EVENTS} from "../shared/event-types";



export function handleMessage(event) {
    if (event.source !== window) return;

    const data = event.data;
    if (!data || data.source !== EVENT_SOURCE) return;

    switch (data.type) {
        case EVENTS.REACTION_VISIBILITY: {
            STATE.hasReactionFeature = !!data.payload?.visible;

            if (!STATE.hasReactionFeature) {
                removePanel();
            } else {
                renderFromState();
            }
            break;
        }

        case EVENTS.SAMPLE_DATA: {
            STATE.lastPayload = data.payload || null;
            renderFromState();
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

        case EVENTS.CREATE_SAMPLE_CAPTURED: {
            setCapturedCreate(data.payload || null);
            break;
        }

        default:
            break;
    }
}