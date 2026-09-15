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
// said, never swallowed.

import { EVENTS, EVENT_SOURCE } from "../../../../shared/event-types.js";

const BRIDGE_TIMEOUT_MS = 500;

function base(vaultId) {
    return `/api/internal/v1/vaults/${vaultId}/protocol_form_definitions`;
}

function csrfToken() {
    return document.querySelector('meta[name="csrf-token"]')?.content || "";
}

function headers(withBody) {
    const out = {
        Accept: "application/json",
        "X-CSRF-Token": csrfToken(),
        "X-Requested-With": "XMLHttpRequest",
    };
    if (withBody) out["Content-Type"] = "application/json";
    return out;
}

async function failure(response) {
    let text = "";
    try {
        text = (await response.text()).slice(0, 200).replace(/\s+/g, " ").trim();
    } catch {
        // nothing to add
    }
    return new Error(`HTTP ${response.status}${text ? `: ${text}` : ""}`);
}

export async function listForms(vaultId) {
    const response = await fetch(base(vaultId), { credentials: "same-origin", headers: headers(false) });
    if (!response.ok) throw await failure(response);
    const forms = await response.json();
    if (!Array.isArray(forms)) throw new Error("the form list did not come back as a list");
    return forms;
}

export async function createForm(vaultId, form) {
    const response = await fetch(base(vaultId), {
        method: "POST",
        credentials: "same-origin",
        headers: headers(true),
        body: JSON.stringify({ form_definition: form }),
    });
    if (!response.ok) throw await failure(response);
    const created = await response.json();
    if (!created || created.id == null) throw new Error("the server answered without a form");
    return created;
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
