// content/features/ui-fixes/registration-fill.js
//
// The shared half of "write a value into the Create a New Entity form".
//
// Two features fill that form now — the ELN id carry
// (eln-id-to-registration.js) and the per-vault defaults plus sample amount
// (registration-defaults.js) — and they must agree on which form they are
// looking at and what counts as safe to overwrite. The selectors and the
// guards live here so they cannot drift apart.

import { fieldLabelsMatch } from "../../../shared/eln-id-carry.js";

// CDD renders two `form#new_molecule` copies -- the live one and a hidden
// template for the other registration types -- so every lookup is scoped to the
// displayed one (same selector as registration-project-mirror.js).
export const FORM_SELECTOR = ".displayed_form_content form.new_molecule";

// Each editable cell of the registration form announces its own label:
//   <td data-editable-cell-label="*Internal ID" data-field-id="1000001975">
export const CELL_SELECTOR = "[data-editable-cell-label]";

const STYLE_ID = "cdd-registration-fill-style";
export const FLASH_CLASS = "cdd-eln-id-filled";

export function injectFillStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        .${FLASH_CLASS} {
            background: rgba(52, 211, 153, 0.35) !important;
            transition: background 0.6s ease;
        }
    `;
    document.head.appendChild(style);
}

// The control inside the cell whose label matches — text input, textarea or
// select. fieldLabelsMatch already strips CDD's required marker, so a setting
// saying "Purity [%]" finds the cell labelled "*Purity [%]".
export function findLabelledControl(label) {
    const form = document.querySelector(FORM_SELECTOR);
    if (!form) return null;

    const cell = [...form.querySelectorAll(CELL_SELECTOR)].find((node) =>
        fieldLabelsMatch(node.getAttribute("data-editable-cell-label"), label)
    );

    return cell?.querySelector('input[type="text"], textarea, select') || null;
}

// Is this control safe to write into?
//
// Someone got there first -- CDD prefilling it, or the user typing while the
// form was still settling. Their value wins. And a field with the caret in it
// is never yanked out from under the hand using it.
export function isFillable(control) {
    if (!control) return false;
    if (document.activeElement === control) return false;
    return !String(control.value ?? "").trim();
}

// Write `value` and tell the page about it.
//
// A <select> only accepts a value that is actually one of its options. Picking
// the nearest one instead would be a silent wrong answer on a form the user is
// about to save, so a value that matches nothing leaves the field alone and
// returns false — the caller can say so.
export function setControlValue(control, value, { flash = true } = {}) {
    if (!control) return false;

    const wanted = String(value ?? "").trim();
    if (!wanted) return false;

    if (control.tagName === "SELECT") {
        const option = [...control.options].find(
            (o) =>
                o.value.trim().toLowerCase() === wanted.toLowerCase() ||
                o.text.trim().toLowerCase() === wanted.toLowerCase()
        );
        if (!option) return false;
        control.value = option.value;
    } else {
        control.value = wanted;
    }

    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));

    if (flash) {
        injectFillStyles();
        control.classList.add(FLASH_CLASS);
        window.setTimeout(() => control.classList.remove(FLASH_CLASS), 1800);
    }

    return true;
}

export function isRegistrationPage() {
    return /^\/vaults\/\d+\/molecules\/new/.test(location.pathname || "");
}
