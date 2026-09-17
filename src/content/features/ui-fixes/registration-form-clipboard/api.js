// content/features/ui-fixes/registration-form-clipboard/api.js
//
// The internal API the Registration page uses for its forms, and the id ↔
// name map the page already carries.
//
// Measured in CDD's own bundle: the page saves through
// POST /api/internal/v1/vaults/{vault_id}/registration_form_definitions with
// { form_definition: { name, form_type, components, registration_type,
// structureless_image_name, allow_new_molecules, registration_system_id } }.
//
// The field definitions (with their pick list values) and the registration
// systems are in the react_props of the RegistrationFormDefinitionsPage
// element, so the map needs no bridge and no extra request.

import { vaultIdFromPath } from "../form-clipboard/api.js";

export { vaultIdFromPath };

const PAGE_PROPS = '[component_class="RegistrationFormDefinitionsPage"]';

function base(vaultId) {
    return `/api/internal/v1/vaults/${vaultId}/registration_form_definitions`;
}

function headers(withBody) {
    const out = {
        Accept: "application/json",
        "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.content || "",
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

export async function listRegistrationForms(vaultId) {
    const response = await fetch(base(vaultId), { credentials: "same-origin", headers: headers(false) });
    if (!response.ok) throw await failure(response);
    const forms = await response.json();
    if (!Array.isArray(forms)) throw new Error("the form list did not come back as a list");
    return forms;
}

export async function createRegistrationForm(vaultId, form) {
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

// { defs: { molecule, batch, sample, inventory }, systems } or null.
export async function readRegistrationMap() {
    try {
        const raw = document.querySelector(PAGE_PROPS)?.getAttribute("react_props");
        if (!raw) return null;
        const props = JSON.parse(raw);
        const defs = {
            molecule: props.molecule_field_definitions,
            batch: props.batch_field_definitions,
            sample: props.sample_field_definitions,
            inventory: props.inventory_field_definitions,
        };
        if (!Object.values(defs).every(Array.isArray) || !Array.isArray(props.registration_systems)) return null;
        return { defs, systems: props.registration_systems };
    } catch {
        return null;
    }
}
