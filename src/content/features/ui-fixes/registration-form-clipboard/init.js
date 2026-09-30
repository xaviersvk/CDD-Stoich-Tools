// content/features/ui-fixes/registration-form-clipboard/init.js
//
// Discovery + wiring. The only thing content/main.js imports from this feature.
//
// One observer on <html> (Turbo swaps <body>), debounced. On Settings →
// Registration, once the Registration Forms table and CDD's own "Create a new
// form" link are there — the link is CDD's way of saying the user is an
// administrator — the bar goes above that table. The page also carries the
// Registration Systems table, so everything is looked up inside the forms
// section only.

import { findRegistrationFormsTable, mountBarAbove, watchPageSettled } from "../../../utils/settings-page.js";
import { injectFieldClipboardStyles } from "../field-clipboard/styles.js";
import { BAR_CLASS, buildBar } from "./panel.js";

let started = false;

function mount() {
    const table = findRegistrationFormsTable();
    if (table) mountBarAbove(table, BAR_CLASS, buildBar);
}

export function initRegistrationFormClipboard() {
    injectFieldClipboardStyles();
    if (started) return;
    started = true;
    watchPageSettled("registration-form-clipboard", mount);
}
