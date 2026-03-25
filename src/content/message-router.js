// content/message-router.js
import { STATE } from "./state.js";
import { renderFromState, removePanel } from "./features/sample-panel.js";
import { ensurePrintButtons } from "./features/print-buttons.js";
import { markDepletedSamplesInSelector } from "./features/depleted-marker.js";
import {EVENT_SOURCE} from "../shared/event-types";



export function handleMessage(event) {
    if (event.source !== window) return;

    const data = event.data;
    if (!data || data.source !== EVENT_SOURCE) return;

    switch (data.type) {
        case "REACTION_VISIBILITY": {
            STATE.hasReactionFeature = !!data.payload?.visible;

            if (!STATE.hasReactionFeature) {
                removePanel();
            } else {
                renderFromState();
            }
            break;
        }

        case "SAMPLE_DATA": {
            STATE.lastPayload = data.payload || null;
            renderFromState();
            break;
        }

        case "PRINT_DATA": {
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

        default:
            break;
    }
}