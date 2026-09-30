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

import {
    createFormDefinition,
    listFormDefinitions,
    updateFormDefinition,
} from "../../../utils/form-definitions-api.js";
import { vaultIdFromPath } from "../form-clipboard/api.js";

export { vaultIdFromPath };

const PAGE_PROPS = '[component_class="RegistrationFormDefinitionsPage"]';

function base(vaultId) {
    return `/api/internal/v1/vaults/${vaultId}/registration_form_definitions`;
}

export function listRegistrationForms(vaultId) {
    return listFormDefinitions(base(vaultId));
}

export function createRegistrationForm(vaultId, form) {
    return createFormDefinition(base(vaultId), form);
}

// Measured in the same bundle: updateFormDefinition sends
// PUT …/registration_form_definitions/{form_id} with { form_definition: {
// name, components, registration_type, structureless_image_name,
// allow_new_molecules, registration_system_id } } — the whole document, so
// the caller sends back everything it was given. What comes back is not
// relied on; the caller lists the forms again and compares.
export function updateRegistrationForm(vaultId, formId, form) {
    return updateFormDefinition(`${base(vaultId)}/${formId}`, form);
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
