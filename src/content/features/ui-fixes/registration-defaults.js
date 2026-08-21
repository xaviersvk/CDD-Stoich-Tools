// content/features/ui-fixes/registration-defaults.js
//
// Registering the product of a reaction, without typing what the ELN already
// knows.
//
// Two halves, one workflow:
//
//   D  Per-vault constants. Origin is Synthesized for anything that came out
//      of a reaction — every time, regardless of which reaction. Configured
//      per vault, because vault 8158 has an Origin field and the next one may
//      not.
//
//   E  The amount. It is written in the stoichiometry row the Register link
//      sits in, and then typed again by hand into the new sample.
//
// Both ride the wire eln-id-to-registration.js already runs: the Register link
// is stamped on the way out, and the registration page reads its own query
// string. The two pages never share a JavaScript world — the link opens a new
// tab — so storage would be a race and the URL is not.
//
// Everything here is gated on `cdd_eln_id` being present, i.e. on having come
// from an ELN entry. A registration form opened by hand from Explore Data is
// left alone: nobody said that compound was synthesized.

import { isElnEntryPage } from "../../../shared/page-detection.js";
import { ELN_ID_PARAM } from "../../../shared/eln-id-carry.js";
import {
    AMOUNT_PARAM,
    AMOUNT_UNIT_PARAM,
    REGISTRATION_DEFAULTS_KEY,
    extractVaultId,
    getVaultDefaults,
    parseRowAmount,
} from "../../../shared/registration-defaults.js";
import {
    findLabelledControl,
    isFillable,
    isRegistrationPage,
    setControlValue,
} from "./registration-fill.js";

const REGISTER_LINK_SELECTOR = 'a[href*="/molecules/new"]';

// The row CDD prints one reagent on. Its Amounts cell reads "Mass: 6.38 g".
const ROW_SELECTOR = '[data-autotest-id="stoichiometry-row"]';

// The gate. Until this is ticked, the sample fields below it are inert and a
// save creates no sample record — so nothing is filled either. Ticking it is
// the user's decision, not the plugin's.
const CREATE_SAMPLE_SELECTOR = 'input[name="molecule[batch][create_new_sample]"]';

// Located by `name`, never by `id`: the amount input's id in vault 8158 is
// `inventory_event_field_159500`, and that number is a per-vault field
// definition id. Hardcoding it would make this quietly do nothing everywhere
// else.
const AMOUNT_SELECTOR = '[name*="inventory_events_attributes"][name$="[value]"]';
const UNITS_SELECTOR = '[name$="[inventory_samples_attributes][0][units]"]';

let started = false;
let vaultDefaults = { label: "", fields: [] };

// Controls already filled, by node identity. A re-render hands us a new node
// (fill it again — it lost OUR value); a field the user emptied is the same
// node (leave it alone).
const filled = new WeakSet();

/* ------------------------------------------------------------------ *
 * ELN entry side — put the amount into the link
 * ------------------------------------------------------------------ */

function stampAmount(target) {
    // Asked per click, not once at startup: Turbo reaches an ELN entry without
    // a reload.
    if (!isElnEntryPage()) return;

    const link = target?.closest?.(REGISTER_LINK_SELECTOR);
    if (!link) return;

    // The row the link is IN, not a row matched back from the parsed payload.
    // The payload's order is not the table's display order, so matching would
    // be inventing a chance to register the wrong row's mass.
    const row = link.closest(ROW_SELECTOR);
    if (!row) return;

    const amount = parseRowAmount(row.textContent);
    if (!amount) return;

    let url;
    try {
        url = new URL(link.getAttribute("href"), location.href);
    } catch {
        return;
    }

    if (
        url.searchParams.get(AMOUNT_PARAM) === amount.value &&
        url.searchParams.get(AMOUNT_UNIT_PARAM) === amount.unit
    ) {
        return;
    }

    url.searchParams.set(AMOUNT_PARAM, amount.value);
    url.searchParams.set(AMOUNT_UNIT_PARAM, amount.unit);

    link.setAttribute("href", `${url.pathname}${url.search}`);
}

function watchRegisterLinks() {
    for (const type of ["mousedown", "click"]) {
        document.addEventListener(type, (event) => stampAmount(event.target), true);
    }
}

/* ------------------------------------------------------------------ *
 * Registration side
 * ------------------------------------------------------------------ */

function cameFromEln() {
    return !!new URLSearchParams(location.search).get(ELN_ID_PARAM);
}

function carriedAmount() {
    const params = new URLSearchParams(location.search);
    const value = (params.get(AMOUNT_PARAM) || "").trim();
    const unit = (params.get(AMOUNT_UNIT_PARAM) || "").trim();
    return value ? { value, unit } : null;
}

// D — the per-vault constants.
function fillDefaults() {
    for (const { label, value } of vaultDefaults.fields) {
        const control = findLabelledControl(label);
        if (!control || filled.has(control)) continue;

        filled.add(control);
        if (!isFillable(control)) continue;

        const ok = setControlValue(control, value);
        if (ok) {
            control.title = `Filled from your ${label} default for this vault`;
        }
    }
}

// E — the amount, once the user has ticked Create a New Sample.
function fillSampleAmount() {
    const amount = carriedAmount();
    if (!amount) return;

    const gate = document.querySelector(CREATE_SAMPLE_SELECTOR);
    if (!gate?.checked) return;

    const form = document.querySelector("form.new_molecule") || document;

    const amountInput = form.querySelector(AMOUNT_SELECTOR);
    if (amountInput && !filled.has(amountInput)) {
        filled.add(amountInput);
        if (isFillable(amountInput)) {
            setControlValue(amountInput, amount.value);
            amountInput.title = "Filled from the stoichiometry row this was registered from";
        }
    }

    // A number with the WRONG unit is worse than a number with no unit, and
    // the select is right there — so a unit that matches no option is simply
    // left unset.
    const unitSelect = form.querySelector(UNITS_SELECTOR);
    if (amount.unit && unitSelect && !filled.has(unitSelect)) {
        filled.add(unitSelect);
        if (isFillable(unitSelect)) setControlValue(unitSelect, amount.unit);
    }
}

function fillEverything() {
    if (!cameFromEln()) return;
    fillDefaults();
    fillSampleAmount();
}

/* ------------------------------------------------------------------ *
 * Wiring
 * ------------------------------------------------------------------ */

export async function initRegistrationDefaults() {
    if (started) return;
    started = true;

    watchRegisterLinks();

    if (!isRegistrationPage()) return;
    if (!cameFromEln()) return;

    const vaultId = extractVaultId(location.pathname);
    vaultDefaults = await getVaultDefaults(vaultId);

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local" || !changes[REGISTRATION_DEFAULTS_KEY]) return;
        getVaultDefaults(vaultId).then((fresh) => {
            vaultDefaults = fresh;
            fillEverything();
        });
    });

    // Ticking Create a New Sample is what makes the sample fields matter, and
    // it happens long after load.
    document.addEventListener("change", (event) => {
        if (event.target?.matches?.(CREATE_SAMPLE_SELECTOR)) fillSampleAmount();
    }, true);

    let scheduled = false;
    const run = () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            fillEverything();
        });
    };

    // The form is rebuilt whenever the project or the registration form
    // changes, so this is not a one-shot. <html>, not <body>: Turbo swaps
    // <body>.
    new MutationObserver(run).observe(document.documentElement, {
        childList: true,
        subtree: true,
    });

    run();
}
