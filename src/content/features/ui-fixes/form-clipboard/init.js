// content/features/ui-fixes/form-clipboard/init.js
//
// Discovery + wiring. The only thing content/main.js imports from this feature.
//
// One observer on <html> (Turbo swaps <body>), debounced. On the Protocol
// Forms page, once the forms table and CDD's own "Create a new form" link
// are there — the link is CDD's way of saying the user is an administrator
// — the bar goes above the table. It dies with the page. The bar borrows
// the field clipboard's stylesheet: same buttons, same card.

import { injectFieldClipboardStyles } from "../field-clipboard/styles.js";
import { BAR_CLASS, buildBar } from "./panel.js";
import { ensureDuplicateLinks } from "./row-actions.js";

const PAGE = /\/vaults\/\d+\/vault_protocol_form_definitions$/;

let started = false;

function mount() {
    if (!PAGE.test(location.pathname)) return;
    const table = document.querySelector("table");
    if (!table) return;
    const create = [...document.querySelectorAll("a, button")]
        .find((el) => /Create a new form/.test(el.textContent) && el.offsetParent !== null);
    if (!create) return;
    if (!document.querySelector(`.${BAR_CLASS}`)) table.parentElement.insertBefore(buildBar(), table);
    // Rows are repainted by React; the links are re-checked on every pass.
    ensureDuplicateLinks(table);
}

export function initFormClipboard() {
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
                console.warn("[CDD form-clipboard] mount failed", error);
            }
        }, 48);
    };

    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
    schedule();
}
