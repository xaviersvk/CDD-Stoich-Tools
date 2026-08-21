// content/features/ui-fixes/slurp-type-default.js
//
// The same two conveniences as registration-form-default.js, applied to the
// OTHER place CDD makes you pick an entity type: the bulk-registration ("slurp")
// type picklist
//
//   <select name="slurp[registration_form_definition_id]"
//           data-action="change->slurp-type#change"> Animal, Antibody, Molecule,
//           Plasmid, ... </select>
//
// Its option values are the very same per-vault registration_form_definition_id
// as the Create-a-New-Entity picklist (Molecule = 1000000170, Plasmid =
// 1000000172, ...), and the option names match too. So it shares ONE memory
// with registration-form-default via shared/registration-form.js:
//
//   1. Order    — reordered into the sequence configured on the options page.
//   2. Default  — preselected from the last entity type used in THIS vault (or a
//                 pinned one), the same "last used" the registration page writes,
//                 so both flows agree on what you last worked with.
//
// Everything is keyed by NAME, never by value (values are per-vault ids).
//
// Reordering moves <option> nodes (each may carry a nested <template> of
// with/without choices, which rides along inside its option) and changes neither
// select.value nor which option is selected. Preselecting MUST dispatch
// input+change: the select carries data-action="change->slurp-type#change", and
// that Stimulus handler rebuilds the dependent "with/without" picklist below.

import {
    extractVaultId,
    getRegistrationFormSettings,
    mergeNames,
    onRegistrationFormSettingsChanged,
    resolveDefaultName,
    saveRegistrationFormLastUsed,
    saveRegistrationFormNames,
} from "../../../shared/registration-form.js";
import { applyOptionOrder, optionNames } from "./entity-type-select.js";

// The bracketed name is stable; the Stimulus target name would do too.
const SELECT_SELECTOR = 'select[name="slurp[registration_form_definition_id]"]';

let started = false;

// Shared settings snapshot (order / mode / fixed / lastUsed), read by the
// synchronous observer callback.
let settings = null;

// Preselecting is one-shot per select instance: after the first apply the
// picklist belongs to the user. A WeakSet (rather than a pathname flag) means a
// slurp dialog reopened on the same URL still gets its default, while a
// re-render of the same live <select> does not re-fight the user.
const defaultedSelects = new WeakSet();

// Set while we drive the select ourselves, so our own `change` is not mistaken
// for the user picking a type.
let applyingDefault = false;

function getSelect() {
    return document.querySelector(SELECT_SELECTOR);
}

function currentVaultId() {
    return extractVaultId(location.pathname);
}

/* ------------------------------------------------------------------ *
 * Default
 * ------------------------------------------------------------------ */

function applyDefault(select) {
    if (!settings || defaultedSelects.has(select)) return;

    const wantedName = resolveDefaultName(settings, currentVaultId());
    if (!wantedName) return;

    const target = Array.from(select.options).find(
        (option) => option.text.trim() === wantedName
    );

    // A type this vault doesn't offer (pinned elsewhere, renamed, removed):
    // leave CDD's own default alone rather than guessing.
    if (!target) return;

    defaultedSelects.add(select);

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

// Keep the shared name list complete even if a type only appears on the slurp
// page, so the options page can order/pin it without a CDD page open.
function discoverNames(select) {
    const { list, changed } = mergeNames(settings.names, optionNames(select));
    if (!changed) return;

    settings.names = list;
    saveRegistrationFormNames(list);
}

function onUserPickedType(select) {
    if (applyingDefault) return;

    const name = select.selectedOptions[0]?.text.trim();
    if (!name) return;

    // Written to the SAME per-vault memory the registration page uses, so "last
    // used entity type" stays unified across both flows. Only mode "remember"
    // reads it back.
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
    applyOptionOrder(select, settings.order);
    applyDefault(select);
}

export async function initSlurpTypeDefault() {
    if (started) return;
    started = true;

    settings = await getRegistrationFormSettings();

    // An options-page edit should re-sort a picklist already on screen.
    onRegistrationFormSettingsChanged((fresh) => {
        settings = fresh;
        sync();
    });

    document.addEventListener("change", (event) => {
        if (event.target?.matches?.(SELECT_SELECTOR)) onUserPickedType(event.target);
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

    // <html>, not <body>: Turbo swaps <body> on in-app navigation.
    new MutationObserver(run).observe(document.documentElement, {
        childList: true,
        subtree: true,
    });

    run();
}
