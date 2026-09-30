// content/utils/form-definitions-api.js
//
// CDD's internal form definition endpoints (protocol and registration forms),
// called the way the settings pages call them — same headers, same wrapper,
// same-origin cookies. Measured: the body must be { form_definition: … };
// without the wrapper the server answers 400 with an empty body.
//
// They are undocumented, so every answer is checked and every failure is
// reported with the status and whatever the server said, never swallowed.
// `url` is the collection: /api/internal/v1/vaults/{id}/…_form_definitions.

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

function send(url, method, form) {
    return fetch(url, {
        method,
        credentials: "same-origin",
        headers: headers(true),
        body: JSON.stringify({ form_definition: form }),
    });
}

export async function listFormDefinitions(url) {
    const response = await fetch(url, { credentials: "same-origin", headers: headers(false) });
    if (!response.ok) throw await failure(response);
    const forms = await response.json();
    if (!Array.isArray(forms)) throw new Error("the form list did not come back as a list");
    return forms;
}

export async function createFormDefinition(url, form) {
    const response = await send(url, "POST", form);
    if (!response.ok) throw await failure(response);
    const created = await response.json();
    if (!created || created.id == null) throw new Error("the server answered without a form");
    return created;
}

// What comes back is not read; callers that care list the forms again.
export async function updateFormDefinition(url, form) {
    const response = await send(url, "PUT", form);
    if (!response.ok) throw await failure(response);
}
