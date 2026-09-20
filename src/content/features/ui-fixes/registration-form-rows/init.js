// content/features/ui-fixes/registration-form-rows/init.js
//
// Discovery + wiring. The only thing content/main.js imports from this feature.
//
// Same page and same rule as the registration form clipboard: Settings →
// Registration, the Registration Forms table, and CDD's own "Create a new
// form" link as the sign of an administrator. The bar goes right above the
// table, under the clipboard's Copy / Paste.

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

export function initRegistrationFormRows() {
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
                console.warn("[CDD registration-form-rows] mount failed", error);
            }
        }, 48);
    };

    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
    schedule();
}
