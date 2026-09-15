// inject/hooks/field-rows-bridge.js
//
// Page-world access to a settings page's field definitions.
//
// Every "… Fields" settings page is React, and the definitions sit in the
// state or props of a component above each <table>: an array of rows with
// `name`, `data_type_name`, `unique_value`, `overwritable`,
// `required_group_number`, `disabled`, `pick_list_values` and the page's own
// flags. There is no JSON endpoint for most of these pages, and the read-mode
// table shows neither pick-list values nor which rows are built in — the
// props do. Only the page world can read fiber expandos, hence this bridge.
//
// Protocol (window.postMessage, source EVENT_SOURCE):
//   FIELD_ROWS_REQUEST { requestId, tableIndex }
//     -> FIELD_ROWS    { requestId, rows: [...] | null }
//
// Rows come back JSON-safe: scalars copied, `pick_list_values` reduced to
// [{ value, hidden }]. `null` means no table or no rows found.

import { post } from "../bus.js";
import { EVENTS, EVENT_SOURCE } from "../../shared/event-types.js";

const MAX_WALK = 40;

function fiberOf(element) {
    if (!element) return null;
    const key = Object.keys(element).find((k) => k.startsWith("__reactFiber$"));
    return key ? element[key] : null;
}

function isRowArray(value) {
    return Array.isArray(value) && value.length > 0 && value[0] && typeof value[0] === "object"
        && "data_type_name" in value[0];
}

// Up the `return` chain, looking one level into props and state — measured:
// `memoizedState.rows` on the vault_* pages, `memoizedProps.rows` on the
// Sample/Inventory page.
function findRows(fiber) {
    let cursor = fiber;
    for (let step = 0; cursor && step < MAX_WALK; step += 1) {
        for (const source of ["memoizedProps", "memoizedState"]) {
            const bag = cursor[source];
            if (!bag || typeof bag !== "object") continue;
            for (const value of Object.values(bag)) {
                if (isRowArray(value)) return value;
            }
        }
        cursor = cursor.return;
    }
    return null;
}

function plainValue(value) {
    return value == null || ["string", "number", "boolean"].includes(typeof value) ? value : undefined;
}

function serializeRow(row) {
    const out = {};
    for (const [key, value] of Object.entries(row)) {
        if (key === "pick_list_values") {
            out[key] = (Array.isArray(value) ? value : []).map((entry) => (
                entry && typeof entry === "object"
                    ? { value: plainValue(entry.value), hidden: entry.hidden === true }
                    : { value: plainValue(entry), hidden: false }
            ));
            continue;
        }
        const plain = plainValue(value);
        if (plain !== undefined) out[key] = plain;
    }
    return out;
}

function readRows(tableIndex) {
    const table = document.querySelectorAll("table")[Number(tableIndex) || 0];
    const rows = findRows(fiberOf(table));
    return rows ? rows.map(serializeRow) : null;
}

export function installFieldRowsBridge() {
    window.addEventListener("message", (event) => {
        if (event.source !== window) return;
        const data = event.data;
        if (!data || data.source !== EVENT_SOURCE) return;
        if (data.type !== EVENTS.FIELD_ROWS_REQUEST) return;

        const { requestId, tableIndex } = data.payload || {};
        let rows = null;
        try {
            rows = readRows(tableIndex);
        } catch (err) {
            console.warn("[CDD Stoich Tools] field rows read failed:", err);
        }
        post(EVENTS.FIELD_ROWS, { requestId, rows });
    });
}
