// content/features/ui-fixes/form-clipboard/init.js
//
// Discovery + wiring. The only thing content/main.js imports from this feature.
//
// One observer on <html> (Turbo swaps <body>), debounced. On the Protocol
// Forms page, once the forms table and CDD's own "Create a new form" link
// are there — the link is CDD's way of saying the user is an administrator
// — the bar goes above the table. It dies with the page. The bar borrows
// the field clipboard's stylesheet: same buttons, same card.

import { PROTOCOL_FORMS_PAGE, findFormsTable, mountBarAbove, watchPageSettled } from "../../../utils/settings-page.js";
import { injectFieldClipboardStyles } from "../field-clipboard/styles.js";
import { BAR_CLASS, buildBar } from "./panel.js";
import { ensureDuplicateLinks } from "./row-actions.js";

let started = false;

function mount() {
    const table = findFormsTable(PROTOCOL_FORMS_PAGE);
    if (!table) return;
    mountBarAbove(table, BAR_CLASS, buildBar);
    // Rows are repainted by React; the links are re-checked on every pass.
    ensureDuplicateLinks(table);
}

export function initFormClipboard() {
    injectFieldClipboardStyles();
    if (started) return;
    started = true;
    watchPageSettled("form-clipboard", mount);
}
