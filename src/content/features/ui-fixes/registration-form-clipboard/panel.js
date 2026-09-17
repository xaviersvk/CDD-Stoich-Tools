// content/features/ui-fixes/registration-form-clipboard/panel.js
//
// Copy / Paste above the Registration Forms table: the shared form bar with
// the registration endpoint, the page's own props for the map, and the
// registration form model. Each form that will be made says which
// registration system it gets, since that is picked by prefix.

import { buildFormBar } from "../form-clipboard/form-bar.js";
import { createRegistrationForm, listRegistrationForms, readRegistrationMap } from "./api.js";
import {
    onRegistrationFormClipboardChanged,
    readRegistrationFormClipboard,
    writeRegistrationFormClipboard,
} from "./clipboard.js";
import { formFieldNames, neutralize, planForms, resolve } from "./form-model.js";

export const BAR_CLASS = "cdd-regform-clip-bar";

function describe(neutral, map) {
    const { system, droppedDefaults } = resolve(neutral, map);
    const notes = [`system ${system}`];
    if (droppedDefaults.length) notes.push(`no default for ${droppedDefaults.join(", ")}`);
    return notes.join(" · ");
}

export function buildBar() {
    return buildFormBar({
        barClass: BAR_CLASS,
        copyTitle: "Copy registration forms",
        pasteTitle: "Paste registration forms",
        pageName: "Registration",
        list: listRegistrationForms,
        create: createRegistrationForm,
        readMap: readRegistrationMap,
        neutralize,
        formFieldNames,
        planForms,
        resolve,
        describe,
        clipboard: {
            read: readRegistrationFormClipboard,
            write: writeRegistrationFormClipboard,
            onChanged: onRegistrationFormClipboardChanged,
        },
    });
}
