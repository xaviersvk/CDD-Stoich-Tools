// content/features/ui-fixes/form-clipboard/api.js
//
// The internal API the Protocol Forms page itself uses, called the way the
// page calls it — same headers, same wrapper, same-origin cookies. Measured:
// the body must be { form_definition: { name, form_type, components } };
// without the wrapper the server answers 400 with an empty body.
//
// This is the extension's first write through an internal CDD endpoint
// rather than a CDD button. It is undocumented, so every answer is checked
// and every failure is reported with the status and whatever the server
// said, never swallowed (utils/form-definitions-api.js).

import { EVENTS, EVENT_SOURCE } from "../../../../shared/event-types.js";
import { createFormDefinition, listFormDefinitions } from "../../../utils/form-definitions-api.js";

const BRIDGE_TIMEOUT_MS = 500;

function base(vaultId) {
    return `/api/internal/v1/vaults/${vaultId}/protocol_form_definitions`;
}

export function listForms(vaultId) {
    return listFormDefinitions(base(vaultId));
}

export function createForm(vaultId, form) {
    return createFormDefinition(base(vaultId), form);
}

export function vaultIdFromPath(pathname) {
    const match = /^\/vaults\/(\d+)(?:\/|$)/.exec(pathname || "");
    return match ? match[1] : null;
}

export function vaultName() {
    return document.querySelector("#headerSwitcher-current-title")?.textContent.trim() || "";
}

/* ----- the bridge ----- */

let requestCounter = 0;

// { protocol: [{ id, name }], run: [{ id, name }] } or null.
export function requestFieldMap() {
    return new Promise((resolve) => {
        const requestId = `cdd-form-map-${++requestCounter}`;
        let settled = false;
        const finish = (map) => {
            if (settled) return;
            settled = true;
            window.removeEventListener("message", onMessage);
            clearTimeout(timer);
            resolve(map);
        };
        const onMessage = (event) => {
            if (event.source !== window) return;
            const data = event.data;
            if (!data || data.source !== EVENT_SOURCE || data.type !== EVENTS.FORM_FIELD_MAP) return;
            if (data.payload?.requestId !== requestId) return;
            const map = data.payload.map;
            finish(map && Array.isArray(map.protocol) && Array.isArray(map.run) ? map : null);
        };
        const timer = setTimeout(() => finish(null), BRIDGE_TIMEOUT_MS);
        window.addEventListener("message", onMessage);
        window.postMessage({ source: EVENT_SOURCE, type: EVENTS.FORM_FIELD_MAP_REQUEST, payload: { requestId } }, "*");
    });
}
