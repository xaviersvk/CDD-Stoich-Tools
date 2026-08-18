// content/features/ui-fixes/eln-id-to-registration.js
//
// Registering a product straight out of a reaction: in the stoichiometry table
// each unregistered row offers "Entity: Register", which opens the Create a New
// Entity page in a new tab. CDD carries the structure and the project across --
// but not the one thing that says WHERE the compound came from. Every entity
// registered this way needs its ELN entry ID typed in by hand, from memory or
// from the other tab.
//
// This types it for you: the ID printed on the entry (IDEMO-MDX-0014) lands in
// the registration form's "Internal ID" field (the label is configurable -- see
// shared/eln-id-carry.js).
//
// HOW THE ID TRAVELS
//
// The Register control is a plain anchor:
//
//   <a data-autotest-id="registerLink" target="_blank"
//      href="/vaults/1000000109/molecules/new?eln_attached_structure_id=1000440503">
//
// A new tab is a new JavaScript world, so the two halves cannot simply talk.
// Storage would work but would be a race against the new tab's load; instead
// the ID rides in the URL. On the way out we append `cdd_eln_id=...` to the
// href; on the way in the registration page reads its own query string. One
// click, one ID, no timing, and a reload still fills the field.
//
// The href is rewritten in the CAPTURE phase of `mousedown` -- before the click
// that follows it, and before React gets a chance to re-render the link back.
// mousedown also covers middle-click and Ctrl+click (which fire `auxclick`,
// never `click`); `click` is kept as a second hook for keyboard activation.
//
// WHAT IS AND IS NOT OVERWRITTEN
//
// Only an EMPTY field is filled, and only once per rendered input. CDD re-renders
// the whole form when the project or the registration form changes, which yields
// a fresh (again empty) input -- that one is filled again, because the value the
// re-render threw away was ours. A field the user cleared by hand is the same
// node, so it stays cleared.

import { isElnEntryPage } from "../../../shared/page-detection.js";
import {
    ELN_ID_CARRY_ENABLED_KEY,
    ELN_ID_CARRY_FIELD_KEY,
    ELN_ID_PARAM,
    fieldLabelsMatch,
    getElnIdCarrySettings,
} from "../../../shared/eln-id-carry.js";
import { readElnEntryId } from "../../utils/eln-entry-id.js";

const STYLE_ID = "cdd-eln-id-carry-style";
const FLASH_CLASS = "cdd-eln-id-filled";

// Matches the Register link in a stoichiometry row and any other route to the
// same page; the ELN-entry guard below is what keeps this narrow.
const REGISTER_LINK_SELECTOR = 'a[href*="/molecules/new"]';

// CDD renders two `form#new_molecule` copies -- the live one and a hidden
// template for the other registration types -- so every lookup is scoped to the
// displayed one (same selector as registration-project-mirror.js).
const FORM_SELECTOR = ".displayed_form_content form.new_molecule";

// Each editable cell of the registration form announces its own label:
//   <td data-editable-cell-label="*Internal ID" data-field-id="1000001975">
const CELL_SELECTOR = "[data-editable-cell-label]";

let started = false;

// The settings snapshot the synchronous listeners and the observer callback
// read; storage cannot be awaited from either.
let settings = { enabled: true, fieldLabel: "Internal ID" };

// Inputs already filled, by node identity. A re-render hands us a new node (fill
// it again -- it lost OUR value); a field the user emptied is the same node
// (leave it alone).
const filledInputs = new WeakSet();

function isRegistrationPage() {
    return /^\/vaults\/\d+\/molecules\/new/.test(location.pathname || "");
}

/* ------------------------------------------------------------------ *
 * ELN entry side — put the ID into the link
 * ------------------------------------------------------------------ */

function stampLink(target) {
    if (!settings.enabled) return;

    // Asked per click, not once at startup: Turbo reaches an ELN entry without a
    // reload. It also keeps the ID out of the Register links that live elsewhere
    // in CDD -- only an entry on screen has an entry ID to give.
    if (!isElnEntryPage()) return;

    const link = target?.closest?.(REGISTER_LINK_SELECTOR);
    if (!link) return;

    const entryId = readElnEntryId();
    if (!entryId) return;

    // `location.href` as the base: the href is root-relative, and a URL object
    // is what keeps the existing `eln_attached_structure_id` intact.
    let url;
    try {
        url = new URL(link.getAttribute("href"), location.href);
    } catch {
        return;
    }

    if (url.searchParams.get(ELN_ID_PARAM) === entryId) return;

    url.searchParams.set(ELN_ID_PARAM, entryId);

    // Same-origin, so the path+query form keeps the link as CDD wrote it.
    link.setAttribute("href", `${url.pathname}${url.search}`);
}

function watchRegisterLinks() {
    for (const type of ["mousedown", "click"]) {
        document.addEventListener(type, (event) => stampLink(event.target), true);
    }
}

/* ------------------------------------------------------------------ *
 * Registration side — put the ID into the field
 * ------------------------------------------------------------------ */

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        .${FLASH_CLASS} {
            animation: cdd-eln-id-flash 1.6s ease-out;
        }

        @keyframes cdd-eln-id-flash {
            0%   { background: #fef3c7; box-shadow: 0 0 0 3px rgba(217, 119, 6, 0.25); }
            100% { background: transparent; box-shadow: 0 0 0 3px rgba(217, 119, 6, 0); }
        }
    `;

    document.head.appendChild(style);
}

function carriedElnId() {
    const raw = new URLSearchParams(location.search).get(ELN_ID_PARAM);
    return raw ? raw.trim() : "";
}

function findTargetInput() {
    const form = document.querySelector(FORM_SELECTOR);
    if (!form) return null;

    const cell = [...form.querySelectorAll(CELL_SELECTOR)].find((node) =>
        fieldLabelsMatch(node.getAttribute("data-editable-cell-label"), settings.fieldLabel)
    );

    return cell?.querySelector('input[type="text"], textarea') || null;
}

function fillTargetField() {
    if (!settings.enabled) return;

    const entryId = carriedElnId();
    if (!entryId) return;

    const input = findTargetInput();
    if (!input || filledInputs.has(input)) return;

    filledInputs.add(input);

    // Someone got there first -- CDD prefilling it, or the user typing while the
    // form was still settling. Their value wins.
    if (input.value.trim()) return;

    // Never yank a field out from under the cursor.
    if (document.activeElement === input) return;

    injectStyles();

    input.value = entryId;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));

    input.title = `Filled from ELN entry ${entryId}`;
    input.classList.add(FLASH_CLASS);
    window.setTimeout(() => input.classList.remove(FLASH_CLASS), 1800);
}

/* ------------------------------------------------------------------ *
 * Wiring
 * ------------------------------------------------------------------ */

export async function initElnIdToRegistration() {
    if (started) return;
    started = true;

    // The link half is armed on every CDD page: Turbo navigates INTO an ELN
    // entry without a reload, so "are we on an entry?" cannot be decided once at
    // startup. stampLink() answers it per click instead, by asking the DOM for an
    // entry ID -- no entry on screen, no ID, nothing stamped.
    watchRegisterLinks();

    // The registration page, by contrast, is always a fresh load: the Register
    // link opens it in a new tab.
    const onRegistration = isRegistrationPage();

    settings = await getElnIdCarrySettings();

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local") return;
        if (!changes[ELN_ID_CARRY_ENABLED_KEY] && !changes[ELN_ID_CARRY_FIELD_KEY]) return;

        getElnIdCarrySettings().then((fresh) => {
            settings = fresh;
            if (onRegistration) fillTargetField();
        });
    });

    if (!onRegistration) return;

    let scheduled = false;

    const run = () => {
        if (scheduled) return;
        scheduled = true;

        requestAnimationFrame(() => {
            scheduled = false;
            fillTargetField();
        });
    };

    // The form is rebuilt whenever the project or the registration form changes,
    // so this is not a one-shot. <html>, not <body>: Turbo swaps <body>.
    new MutationObserver(run).observe(document.documentElement, {
        childList: true,
        subtree: true,
    });

    run();
}
