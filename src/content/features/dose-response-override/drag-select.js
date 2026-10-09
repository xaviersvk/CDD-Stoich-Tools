// Shift/Ctrl-drag outlier selection on dose-response plots. The work happens
// in the page world (inject/hooks/dose-response-drag.js), where CDD's store
// and plot props are; this side only tells it whether Settings has it on.

import {
    initDoseResponseDrag,
    isDoseResponseDragEnabled,
    onDoseResponseDragChanged
} from "../../../shared/dose-response-drag-flag.js";
import { EVENTS, EVENT_SOURCE } from "../../../shared/event-types.js";

function postEnabled() {
    window.postMessage(
        {
            source: EVENT_SOURCE,
            type: EVENTS.DOSE_RESPONSE_DRAG_ENABLED,
            payload: { enabled: isDoseResponseDragEnabled() }
        },
        "*"
    );
}

export function initDoseResponseDragSelect() {
    // The page-world script may load after the first post; it says hello when
    // it is listening, and gets the switch again.
    window.addEventListener("message", (event) => {
        if (event.source !== window) return;
        const data = event.data;
        if (data?.source !== EVENT_SOURCE || data.type !== EVENTS.DOSE_RESPONSE_DRAG_HELLO) return;
        postEnabled();
    });

    onDoseResponseDragChanged(postEnabled);
    void initDoseResponseDrag();
}
