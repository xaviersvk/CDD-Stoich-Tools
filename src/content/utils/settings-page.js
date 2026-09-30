// content/utils/settings-page.js
//
// Finding and watching CDD's settings pages, for the bars the field and form
// clipboards, the registration form rows and the registration systems put
// on them.

export const PROTOCOL_FORMS_PAGE = /\/vaults\/\d+\/vault_protocol_form_definitions$/;
// Settings → Registration: the Registration Forms and Registration Systems
// tables share it.
export const REGISTRATION_PAGE = /\/vaults\/\d+\/vault_registration_form_definitions$/;
const REGISTRATION_FORMS_ROOT = ".registrationFormDefinitionsPage";

// One observer on <html> (Turbo swaps <body>), debounced: `mount` runs 48 ms
// after the first change of a burst, and once straight away. A deliberate
// timer rather than a frame — these bars are not worth a pass per frame.
// `label` names the feature in the console.
export function watchPageSettled(label, mount) {
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
                console.warn(`[CDD ${label}] mount failed`, error);
            }
        }, 48);
    };

    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
    schedule();
}

// The first visible link or button inside `root` whose text matches, or null.
export function findVisibleControl(root, pattern) {
    return [...root.querySelectorAll("a, button")]
        .find((el) => pattern.test(el.textContent) && el.offsetParent !== null) || null;
}

// The forms table on `page`, once it and CDD's own "Create a new form" link
// are there — the link is CDD's way of saying the user is an administrator —
// or null. Everything is looked up inside `root`.
export function findFormsTable(page, root = document) {
    if (!page.test(location.pathname)) return null;
    const table = root?.querySelector("table");
    if (!table) return null;
    return findVisibleControl(root, /Create a new form/) ? table : null;
}

// The Registration page also carries the Registration Systems table, so the
// forms table is looked up inside the forms section only.
export function findRegistrationFormsTable() {
    return findFormsTable(REGISTRATION_PAGE, document.querySelector(REGISTRATION_FORMS_ROOT));
}

// One bar per page, right above the table.
export function mountBarAbove(table, barClass, buildBar) {
    if (!document.querySelector(`.${barClass}`)) table.parentElement.insertBefore(buildBar(), table);
}
