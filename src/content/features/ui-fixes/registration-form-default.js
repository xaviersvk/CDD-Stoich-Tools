// content/features/ui-fixes/registration-form-default.js
//
// Two conveniences on the "Registration Form" picklist of the Create a New
// Entity page (`#registration-form-select`):
//
//   1. Order    — the options are reordered into the sequence configured on the
//                 options page. Vaults hand the list out alphabetically, which
//                 suits nobody: a cell biologist reaches for Eukaryote, a
//                 chemist for Molecule.
//   2. Default  — the form is preselected from the last one used in THIS vault,
//                 or from a form pinned on the options page.
//
// Both work on the form's NAME, never its `value` -- the value is a per-vault
// definition id (see shared/registration-form.js).
//
// Reordering moves `<option>` nodes, which changes neither `select.value` nor
// which option is selected (selectedness is a property of the option element,
// not of its position). CDD's Stimulus controller keeps working untouched.
//
// Preselecting, on the other hand, MUST dispatch `change`: the select carries
// `data-action="new-molecule#handleRegistrationFormChange"`, and that handler
// is what rebuilds the type-specific form below. Setting `.value` alone would
// leave the picklist saying "Plasmid" over a Molecule form.

import {
    extractVaultId,
    getRegistrationFormSettings,
    mergeNames,
    orderNames,
    resolveDefaultName,
    saveRegistrationFormLastUsed,
    saveRegistrationFormNames,
    REG_FORM_ORDER_KEY,
    REG_FORM_MODE_KEY,
    REG_FORM_FIXED_KEY,
} from "../../../shared/registration-form.js";

const SELECT_SELECTOR = "#registration-form-select";

let started = false;

// The settings snapshot the sync pass reads. Kept in module scope because the
// MutationObserver callback is synchronous and cannot await storage.
let settings = null;

// Preselecting is a one-shot per registration page: after that the picklist
// belongs to the user, and re-applying on every CDD re-render would fight them.
// Keyed by pathname so a Turbo navigation to a second Create Entity page gets
// its own preselect.
let defaultAppliedForPath = null;

// Set while we drive the select ourselves, so our own `change` event is not
// mistaken for the user picking a form.
let applyingDefault = false;

function getSelect() {
    return document.querySelector(SELECT_SELECTOR);
}

function optionNames(select) {
    return Array.from(select.options).map((option) => option.text.trim());
}

function currentVaultId() {
    return extractVaultId(location.pathname);
}

/* ------------------------------------------------------------------ *
 * Order
 * ------------------------------------------------------------------ */

// Reorder the option nodes in place. No-op (and no DOM writes, so no observer
// feedback loop) when they already sit in the wanted order.
function applyOrder(select) {
    if (!settings?.order?.length) return;

    const options = Array.from(select.options);
    const byName = new Map();
    for (const option of options) {
        const name = option.text.trim();
        if (!byName.has(name)) byName.set(name, []);
        byName.get(name).push(option);
    }

    const wanted = orderNames(optionNames(select), settings.order)
        .map((name) => byName.get(name)?.shift())
        .filter(Boolean);

    if (wanted.length !== options.length) return; // duplicate/odd names: leave alone
    if (wanted.every((option, i) => option === options[i])) return; // already sorted

    // Appending an existing child moves it; the selected option stays selected.
    for (const option of wanted) select.appendChild(option);
}

/* ------------------------------------------------------------------ *
 * Default
 * ------------------------------------------------------------------ */

function applyDefault(select) {
    if (!settings || defaultAppliedForPath === location.pathname) return;

    const wantedName = resolveDefaultName(settings, currentVaultId());
    if (!wantedName) return;

    const target = Array.from(select.options).find(
        (option) => option.text.trim() === wantedName
    );

    // A form the vault doesn't offer (pinned elsewhere, renamed, removed):
    // leave CDD's own default alone rather than guessing.
    if (!target) return;

    defaultAppliedForPath = location.pathname;

    if (target.selected) return;

    applyingDefault = true;
    select.value = target.value;
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
    applyingDefault = false;
}

/* ------------------------------------------------------------------ *
 * Discovery + recording
 * ------------------------------------------------------------------ */

// Teach the options page which forms this vault offers, so its order list and
// its "always use" picker have something to show without a CDD page open.
function discoverNames(select) {
    const { list, changed } = mergeNames(settings.names, optionNames(select));
    if (!changed) return;

    settings.names = list;
    saveRegistrationFormNames(list);
}

function onUserPickedForm(select) {
    if (applyingDefault) return;

    const name = select.selectedOptions[0]?.text.trim();
    if (!name) return;

    // Recorded on every pick, in every mode -- so switching the options page to
    // "remember" later already has something to remember. Only mode
    // "remember" ever reads it back.
    settings.lastUsed = { ...settings.lastUsed, [currentVaultId()]: name };
    saveRegistrationFormLastUsed(currentVaultId(), name);
}

/* ------------------------------------------------------------------ *
 * Wiring
 * ------------------------------------------------------------------ */

function sync() {
    const select = getSelect();
    if (!select || !settings) return;

    discoverNames(select);
    applyOrder(select);
    applyDefault(select);
}

export async function initRegistrationFormDefault() {
    if (started) return;
    started = true;

    // Nothing on this page until the settings land; the observer below re-runs
    // sync() as soon as they do.
    settings = await getRegistrationFormSettings();

    // An options-page edit should re-sort a picklist that is already on screen.
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local") return;
        if (!changes[REG_FORM_ORDER_KEY] && !changes[REG_FORM_MODE_KEY] && !changes[REG_FORM_FIXED_KEY]) {
            return;
        }

        getRegistrationFormSettings().then((fresh) => {
            settings = fresh;
            sync();
        });
    });

    document.addEventListener("change", (event) => {
        if (event.target?.matches?.(SELECT_SELECTOR)) onUserPickedForm(event.target);
    });

    let scheduled = false;

    const run = () => {
        if (scheduled) return;
        scheduled = true;

        requestAnimationFrame(() => {
            scheduled = false;
            sync();
        });
    };

    new MutationObserver(run).observe(document.body, {
        childList: true,
        subtree: true,
    });

    run();
}
