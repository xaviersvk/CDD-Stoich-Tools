// content/features/ui-fixes/readout-clipboard/api.js
//
// The endpoints CDD's own readout editor uses, called the way it calls them:
// flat JSON bodies, same-origin cookies, the page's CSRF token. Undocumented,
// so every failure carries the status and the server's own words.

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

// 400s come back as { field: ["message", …] }; flatten that into one line.
async function failure(response) {
    let text = "";
    try {
        text = await response.text();
        const json = JSON.parse(text);
        if (json && typeof json === "object") {
            text = Object.entries(json)
                .map(([field, messages]) => `${field} ${[].concat(messages).join(", ")}`)
                .join("; ");
        }
    } catch {
        // not JSON; keep the raw text
    }
    text = text.slice(0, 200).replace(/\s+/g, " ").trim();
    return new Error(`HTTP ${response.status}${text ? `: ${text}` : ""}`);
}

async function getJson(url) {
    const response = await fetch(url, { credentials: "same-origin", headers: headers(false) });
    if (!response.ok) throw await failure(response);
    return response.json();
}

async function postJson(url, body) {
    const response = await fetch(url, {
        method: "POST",
        credentials: "same-origin",
        headers: headers(true),
        body: JSON.stringify(body),
    });
    if (!response.ok) throw await failure(response);
    const created = await response.json();
    if (!created || created.id == null) throw new Error("the server answered without an id");
    return created;
}

function protocolBase(vaultId, protocolId) {
    return `/vaults/${vaultId}/protocols/${protocolId}`;
}

export async function listReadouts(vaultId, protocolId) {
    const list = await getJson(`${protocolBase(vaultId, protocolId)}/readout_definitions`);
    if (!Array.isArray(list)) throw new Error("the readout list did not come back as a list");
    return list;
}

export function getCalculation(vaultId, protocolId, calculationId) {
    return getJson(`${protocolBase(vaultId, protocolId)}/custom_calculations/${calculationId}`);
}

export function createReadout(vaultId, protocolId, body) {
    return postJson(`${protocolBase(vaultId, protocolId)}/readout_definitions`, body);
}

// formatted_formula is what the server reads; `formula` (ids) is ignored.
export function createCalculation(vaultId, protocolId, body) {
    return postJson(`${protocolBase(vaultId, protocolId)}/custom_calculations`, body);
}

export function getDoseResponse(vaultId, protocolId, calculationId) {
    return getJson(`${protocolBase(vaultId, protocolId)}/dose_response_calculations/${calculationId}`);
}

// Flat body with dose_readout_definition_id / response_readout_definition_id
// of the TARGET protocol; CDD creates the fit's other outputs itself.
export function createDoseResponse(vaultId, protocolId, body) {
    return postJson(`${protocolBase(vaultId, protocolId)}/dose_response_calculations`, body);
}
