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

import { injectFieldClipboardStyles } from "../field-clipboard/styles.js";
import { BAR_CLASS, buildBar } from "./panel.js";

const PAGE = /\/vaults\/\d+\/vault_registration_form_definitions$/;
const ROOT = ".registrationFormDefinitionsPage";

let started = false;

function mount() {
    if (!PAGE.test(location.pathname)) return;
    const root = document.querySelector(ROOT);
    const table = root?.querySelector("table");
    if (!table) return;
    const create = [...root.querySelectorAll("a, button")]
        .find((el) => /Create a new form/.test(el.textContent) && el.offsetParent !== null);
    if (!create) return;
    if (!document.querySelector(`.${BAR_CLASS}`)) table.parentElement.insertBefore(buildBar(), table);
}

export function initRegistrationFormClipboard() {
    injectFieldClipboardStyles();
    if (started) return;
    started = true;

    let scheduled = false;
    const schedule = () => {
        if (scheduled) return;
        scheduled = true;
        setTimeout(() => {
            scheduled = false;
            try {
                mount();
            } catch (error) {
                // A missing button must never cost the user the page.
                console.warn("[CDD registration-form-clipboard] mount failed", error);
            }
        }, 48);
    };

    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
    schedule();
}
