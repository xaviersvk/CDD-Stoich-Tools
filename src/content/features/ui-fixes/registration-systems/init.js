// content/features/ui-fixes/registration-systems/init.js
//
// Discovery + wiring. The only thing content/main.js imports from this feature.
//
// One observer on <html> (Turbo swaps <body>), debounced. On Settings →
// Registration, once CDD's own "Create a new System" link is there — its way
// of saying the user is an administrator — "Create multiple systems" goes
// beside it. The card is built once per <body> and hangs off it. It borrows
// the field clipboard's stylesheet: same buttons, same card.

import { injectFieldClipboardStyles } from "../field-clipboard/styles.js";
import { findCreateLink } from "./page-dom.js";
import { LINK_CLASS, buildCard, buildLink } from "./panel.js";

const PAGE = /\/vaults\/\d+\/vault_registration_form_definitions$/;
const ACTIONS_CLASS = "cdd-regsys-actions";

let started = false;
let controller = null;

function injectStyles() {
    if (document.getElementById("cdd-regsys-style")) return;
    const style = document.createElement("style");
    style.id = "cdd-regsys-style";
    style.textContent = `
    .${ACTIONS_CLASS} { display: flex !important; justify-content: flex-end; align-items: center; gap: 20px; }
    .cdd-regsys-card {
        position: absolute;
        z-index: 1200;
        width: 380px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
        font-size: 13px;
        line-height: 1.4;
        color: rgba(0, 0, 0, 0.87);
    }
    .cdd-regsys-text {
        font: 13px/1.4 monospace;
        padding: 6px 8px;
        border: 1px solid rgba(0, 0, 0, 0.25);
        border-radius: 3px;
        resize: vertical;
    }
    .cdd-regsys-card .cdd-fc-foot { flex-wrap: wrap; }
    .cdd-regsys-card .cdd-fc-status.is-done { color: #2e7d32; }
    `;
    (document.head || document.documentElement).appendChild(style);
}

function mount() {
    if (!PAGE.test(location.pathname)) return;
    const create = findCreateLink();
    if (!create) return;

    if (!controller || !controller.card.isConnected) {
        controller = buildCard();
        document.body.append(controller.card);
    }

    const box = create.parentElement;
    let link = box.querySelector(`.${LINK_CLASS}`);
    if (!link) {
        box.classList.add(ACTIONS_CLASS);
        link = buildLink(create, (clicked) => controller.toggle(clicked));
        box.insertBefore(link, create);
    }
    controller.anchorTo(link);
}

export function initRegistrationSystems() {
    injectFieldClipboardStyles();
    injectStyles();
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
                console.warn("[CDD registration-systems] mount failed", error);
            }
        }, 48);
    };

    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
    schedule();
}
