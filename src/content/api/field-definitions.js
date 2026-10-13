// content/api/field-definitions.js
//
// A vault's field definitions and registration forms, as CDD's own Create
// Entity form loads them:
//
//   GET /api/internal/v1/vaults/{v}/data_sets/{v}/registration_form_definitions
//
// Works on the session cookie for anyone who can register, admin or not.
// ~70 kB with top-level
//   registration_form_definitions        forms, each a layout tree of fieldIDs
//   molecule_field_definitions           { id, name, data_type_name,
//   batch_field_definitions                pick_list_values, … }
//   inventory_sample_field_definitions
//   inventory_event_field_definitions
//
// The same JSON used to be embedded in every RegistrationFormRenderer's
// react_props (Create Entity page, molecule pages). CDD has since moved it
// out: the props now carry only `definitions_url` and the data rows, so
// anything that needs id -> name has to come here.

// vaultId -> Promise<json|null>. A failure is dropped so the next caller
// retries rather than inheriting "no definitions" for the page session.
const cache = new Map();

export function definitionsUrl(vaultId) {
    return `/api/internal/v1/vaults/${vaultId}/data_sets/${vaultId}/registration_form_definitions`;
}

async function request(vaultId) {
    const response = await fetch(definitionsUrl(vaultId), {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    const json = await response.json();
    return json && typeof json === "object" ? json : null;
}

// Promise<json|null>, one request per vault per page session.
export function loadFieldDefinitions(vaultId) {
    if (!vaultId) return Promise.resolve(null);
    const key = String(vaultId);

    const cached = cache.get(key);
    if (cached) return cached;

    const promise = request(key)
        .catch(() => null)
        .then((json) => {
            if (!json && cache.get(key) === promise) cache.delete(key);
            return json;
        });

    cache.set(key, promise);
    return promise;
}

// Fetch again next time — after the definitions may have changed.
export function forgetFieldDefinitions(vaultId) {
    cache.delete(String(vaultId));
}

// [{ id, name }] of the batch fields, the join key for a renderer's data rows.
export function batchFieldDefs(json) {
    return (Array.isArray(json?.batch_field_definitions) ? json.batch_field_definitions : [])
        .filter((d) => d && d.id != null && d.name)
        .map((d) => ({ id: d.id, name: d.name }));
}
