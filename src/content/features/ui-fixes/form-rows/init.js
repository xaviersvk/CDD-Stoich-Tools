// content/features/ui-fixes/form-rows/init.js
//
// Discovery + wiring. The only thing content/main.js imports from this feature.
//
// Two pages, one rule: Settings → Registration (the Registration Forms
// table) and Settings → Protocol Forms, with CDD's own "Create a new form"
// link as the sign of an administrator. The bar goes right above the table,
// under that page's form clipboard (Copy / Paste) — main.js starts this
// feature after both clipboards.

import { PROTOCOL_FORMS_PAGE, findFormsTable, findRegistrationFormsTable, mountBarAbove, watchPageSettled } from "../../../utils/settings-page.js";
import { injectFieldClipboardStyles } from "../field-clipboard/styles.js";
import { PROTOCOL_FORMS, REGISTRATION_FORMS } from "./pages.js";
import { BAR_CLASS, buildBar } from "./panel.js";

let started = false;

function mount() {
    const registration = findRegistrationFormsTable();
    if (registration) mountBarAbove(registration, BAR_CLASS, () => buildBar(REGISTRATION_FORMS));
    const protocol = findFormsTable(PROTOCOL_FORMS_PAGE);
    if (protocol) mountBarAbove(protocol, BAR_CLASS, () => buildBar(PROTOCOL_FORMS));
}

export function initFormRows() {
    injectFieldClipboardStyles();
    if (started) return;
    started = true;
    watchPageSettled("form-rows", mount);
}
