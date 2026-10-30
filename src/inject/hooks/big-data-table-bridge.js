// inject/hooks/big-data-table-bridge.js
//
// Page-world access to CDD's rebuildBigDataTable for the content script.
//
// A CDD table with frozen headers (#run-readouts-data and friends) is split by
// setupBigDataTable into four clones of one table: .cells, .columnHeaders,
// .rowHeaders and .corner, each sized to the first. Change the rows of .cells
// and the other three are stale. rebuildBigDataTable(id, options) folds the
// clones back into the .cells table and splits it again — it is a window
// global, which the isolated content world cannot call.
//
// Protocol (window.postMessage, source EVENT_SOURCE):
//   BIG_DATA_TABLE_REBUILD { id, options }   (no answer; the repaint is it)

import { EVENTS, EVENT_SOURCE } from "../../shared/event-types.js";

export function installBigDataTableBridge() {
    window.addEventListener("message", (event) => {
        if (event.source !== window) return;
        const data = event.data;
        if (!data || data.source !== EVENT_SOURCE || data.type !== EVENTS.BIG_DATA_TABLE_REBUILD) return;

        const { id, options } = data.payload || {};
        const rebuild = /** @type {any} */ (window).rebuildBigDataTable;
        if (typeof rebuild !== "function" || typeof id !== "string") {
            console.warn("[CDD Stoich Tools] rebuildBigDataTable is not on this page");
            return;
        }
        try {
            rebuild(id, options || {});
        } catch (err) {
            console.warn("[CDD Stoich Tools] rebuildBigDataTable failed:", err);
        }
    });
}
