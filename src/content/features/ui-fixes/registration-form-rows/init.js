// content/features/ui-fixes/registration-form-rows/init.js
//
// Discovery + wiring. The only thing content/main.js imports from this feature.
//
// Same page and same rule as the registration form clipboard: Settings →
// Registration, the Registration Forms table, and CDD's own "Create a new
// form" link as the sign of an administrator. The bar goes right above the
// table, under the clipboard's Copy / Paste.

import { findRegistrationFormsTable, mountBarAbove, watchPageSettled } from "../../../utils/settings-page.js";
import { injectFieldClipboardStyles } from "../field-clipboard/styles.js";
import { BAR_CLASS, buildBar } from "./panel.js";

let started = false;

function mount() {
    const table = findRegistrationFormsTable();
    if (table) mountBarAbove(table, BAR_CLASS, buildBar);
}

export function initRegistrationFormRows() {
    injectFieldClipboardStyles();
    if (started) return;
    started = true;
    watchPageSettled("registration-form-rows", mount);
}
