// inject/hooks/form-store-bridge.js
//
// Page-world access to the Protocol Forms page's field definitions.
//
// A form's cells refer to protocol and run field definitions BY ID. The
// names behind those ids are not served by any internal endpoint (404), but
// the page keeps them in React props — an object `store.fieldDefinitionsMap`
// with `protocol` and `run` arrays — a few levels above the forms table,
// dialog closed or not. Only the page world can read fiber expandos.
//
// Protocol (window.postMessage, source EVENT_SOURCE):
//   FORM_FIELD_MAP_REQUEST { requestId }
//     -> FORM_FIELD_MAP    { requestId, map: { protocol: [{ id, name }], run: [{ id, name }] } | null }

import { post } from "../bus.js";
import { EVENTS, EVENT_SOURCE } from "../../shared/event-types.js";

const MAX_WALK = 40;
const MAX_DEPTH = 6;

function fiberOf(element) {
    if (!element) return null;
    const key = Object.keys(element).find((k) => k.startsWith("__reactFiber$"));
    return key ? element[key] : null;
}

function findMap(bag, depth, seen) {
    if (!bag || typeof bag !== "object" || depth > MAX_DEPTH || seen.has(bag)) return null;
    if (bag instanceof Element) return null;
    seen.add(bag);
    const candidate = bag.fieldDefinitionsMap;
    if (candidate && Array.isArray(candidate.protocol) && Array.isArray(candidate.run)) return candidate;
    const values = Array.isArray(bag) ? bag.slice(0, 5) : Object.values(bag);
    for (const value of values) {
        if (value && typeof value === "object") {
            const found = findMap(value, depth + 1, seen);
            if (found) return found;
        }
    }
    return null;
}

function reduce(list) {
    return (list || [])
        .filter((entry) => entry && entry.id != null)
        .map((entry) => ({ id: entry.id, name: String(entry.name ?? "") }));
}

function readMap() {
    const table = document.querySelector("table");
    let cursor = fiberOf(table);
    const seen = new Set();
    for (let step = 0; cursor && step < MAX_WALK; step += 1) {
        const found = findMap(cursor.memoizedProps, 0, seen);
        if (found) return { protocol: reduce(found.protocol), run: reduce(found.run) };
        cursor = cursor.return;
    }
    return null;
}

export function installFormStoreBridge() {
    window.addEventListener("message", (event) => {
        if (event.source !== window) return;
        const data = event.data;
        if (!data || data.source !== EVENT_SOURCE) return;
        if (data.type !== EVENTS.FORM_FIELD_MAP_REQUEST) return;

        const requestId = data.payload?.requestId;
        let map = null;
        try {
            map = readMap();
        } catch (err) {
            console.warn("[CDD Stoich Tools] form field map read failed:", err);
        }
        post(EVENTS.FORM_FIELD_MAP, { requestId, map });
    });
}
