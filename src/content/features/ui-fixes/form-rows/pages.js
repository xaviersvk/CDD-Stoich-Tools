// content/features/ui-fixes/form-rows/pages.js
//
// What differs between the two pages the card lives on: where the forms
// and the field definitions come from, how a form is saved, which tables
// the switch offers. `kinds[].key` is the table's key in `components`.

import { listRegistrationForms, readRegistrationMap, updateRegistrationForm } from "../registration-form-clipboard/api.js";
import { listForms, requestFieldMap, updateForm } from "../form-clipboard/api.js";
import { PROTOCOL_SENT, REGISTRATION_SENT } from "./row-model.js";

export const REGISTRATION_FORMS = {
    page: "registration",
    kinds: [
        { key: "molecule", label: "Entity" },
        { key: "batch", label: "Batch" },
        { key: "sample", label: "Sample" },
        { key: "inventory", label: "Inventory" },
    ],
    listForms: listRegistrationForms,
    updateForm: updateRegistrationForm,
    // { molecule, batch, sample, inventory } or null.
    readDefs: async () => readRegistrationMap()?.defs || null,
    sent: REGISTRATION_SENT,
    formTag: (form) => form.registration_system?.prefix || "",
};

export const PROTOCOL_FORMS = {
    page: "protocol",
    kinds: [
        { key: "run", label: "Run" },
        { key: "protocol", label: "Protocol" },
    ],
    listForms,
    updateForm,
    // { protocol, run } or null, through the page-world bridge.
    readDefs: requestFieldMap,
    sent: PROTOCOL_SENT,
    formTag: () => "",
};
