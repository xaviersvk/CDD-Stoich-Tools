// Shift/Ctrl-drag outlier flagging on run heat maps. The work happens in the
// page world (inject/hooks/heat-map-outlier-drag.js), where CDD.HeatMap and
// CDD.ConnectionPool are; this side only tells it whether Settings has it on.

import {
    initHeatMapOutlierDrag,
    isHeatMapOutlierDragEnabled,
    onHeatMapOutlierDragChanged
} from "../../../shared/heat-map-outlier-drag-flag.js";
import { EVENTS, EVENT_SOURCE } from "../../../shared/event-types.js";

function postEnabled() {
    window.postMessage(
        {
            source: EVENT_SOURCE,
            type: EVENTS.HEAT_MAP_OUTLIER_DRAG_ENABLED,
            payload: { enabled: isHeatMapOutlierDragEnabled() }
        },
        "*"
    );
}

export function initHeatMapOutlierDragSelect() {
    // The page-world script may load after the first post; it says hello when
    // it is listening, and gets the switch again.
    window.addEventListener("message", (event) => {
        if (event.source !== window) return;
        const data = event.data;
        if (data?.source !== EVENT_SOURCE || data.type !== EVENTS.HEAT_MAP_OUTLIER_DRAG_HELLO) return;
        postEnabled();
    });

    onHeatMapOutlierDragChanged(postEnabled);
    void initHeatMapOutlierDrag();
}
