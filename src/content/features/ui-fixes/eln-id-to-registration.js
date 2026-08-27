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
// How much of the ID travels depends on the vault's ELN identifier format. On
// "Vault-User Identifier" the ID reads <vault>-<user>-<number>, and the vault
// prefix is the same on every entry in the vault -- so IDEMO-MDX-0014 registers
// as MDX-0014. The other two formats are carried whole. CDD keeps that choice on
// an admin-only settings page, so it is a plugin setting rather than something
// read off the page.
//
// An entry can hold several products -- two reactions, or one reaction with two
// products -- and they cannot all register under the same ID. Which product of
// the entry this is is carried too, as a letter on the end:
//
//   1st product -> MDX-0095     2nd -> MDX-0095B     3rd -> MDX-0095C
//
// The first stays bare -- one product is the ordinary case and reads the way it
// always has. Both the mark's style and whether the first one gets one are
// settings; see shared/eln-id-carry.js.
//
// ONLY products are stamped. A Register link on a reagent row leaves the field
// empty: a starting material is not a product of the entry, and inventing an ID
// for it would collide with one that is. Which rows are products is read from
// the entry payload the panel is built from (STATE.lastPayload.samples), never
// guessed from the markup -- ordinary product rows carry no autotest id of
// their own.
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
import { STATE } from "../../state.js";
import {
    ELN_ID_CARRY_ENABLED_KEY,
    ELN_ID_CARRY_FIELD_KEY,
    ELN_ID_FORMAT_KEY,
    ELN_ID_PARAM,
    ELN_TABLE_SUFFIX_STYLE_KEY,
    ELN_TABLE_SUFFIX_FIRST_KEY,
    applyIdentifierFormat,
    DEFAULT_ELN_ID_FORMAT,
    DEFAULT_ELN_TABLE_SUFFIX_STYLE,
    DEFAULT_ELN_TABLE_SUFFIX_FIRST,
    fieldLabelsMatch,
    findRowSample,
    getElnIdCarrySettings,
    productOrdinalOf,
    productSuffix,
} from "../../../shared/eln-id-carry.js";
import { readElnEntryId } from "../../utils/eln-entry-id.js";

const STYLE_ID = "cdd-eln-id-carry-style";
const FLASH_CLASS = "cdd-eln-id-filled";

// Matches the Register link in a stoichiometry row and any other route to the
// same page; the ELN-entry guard below is what keeps this narrow.
const REGISTER_LINK_SELECTOR = 'a[href*="/molecules/new"]';

// An entry can hold several reactions, each rendered as
// <figure data-autotest-id="reaction"> around one
// <div data-autotest-id="stoichiometry">. The TABLES are counted, not the
// reactions: a reaction that carries only a scheme has no table and so cannot
// shift the letters of the ones that do. CDD's own autotest hook, not the
// emotion class hash next to it — that changes on every deploy.
const TABLE_SELECTOR = '[data-autotest-id="stoichiometry"]';

// Both selectors, and the guards that go with them, are shared with
// registration-defaults.js — see registration-fill.js. Two features writing
// into the same form must not disagree about which form that is.
import { FORM_SELECTOR, CELL_SELECTOR } from "./registration-fill.js";

let started = false;

// The settings snapshot the synchronous listeners and the observer callback
// read; storage cannot be awaited from either.
let settings = {
    enabled: true,
    fieldLabel: "Internal ID",
    format: DEFAULT_ELN_ID_FORMAT,
    style: DEFAULT_ELN_TABLE_SUFFIX_STYLE,
    markFirst: DEFAULT_ELN_TABLE_SUFFIX_FIRST,
};

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

// The suffix for an ordinary (non-parallel) Register link, or null when the row
// is not one of the entry's products.
//
// Null means "write nothing at all". That covers the reagent rows this used to
// stamp, and it covers the payload not having arrived yet: an empty field is a
// nuisance, a wrong ID on a registration is a wrong record.
function ordinaryProductSuffix(link) {
    const samples = STATE.lastPayload?.samples;
    if (!Array.isArray(samples) || !samples.length) return null;

    // Outside a stoichiometry table there is no row, so there is no product.
    const table = link.closest(TABLE_SELECTOR);
    if (!table) return null;

    const row = link.closest("tr");
    if (!row) return null;

    // Document order is the order the tables are read in -- Slate renders the
    // entry body top to bottom, and the parser numbers reactions the same way.
    const tableIndex = [...document.querySelectorAll(TABLE_SELECTOR)].indexOf(table);

    // The number the table prints in the row's first cell is the row's only
    // reliable key; name-watch.js reads rows the same way.
    const printed = (row.cells?.[0]?.innerText || "").trim();
    const sample = findRowSample(samples, tableIndex, printed);
    if (!sample?.isProduct) return null;

    const productIndex = productOrdinalOf(samples, sample);
    if (productIndex < 0) return null;

    return productSuffix({
        productIndex,
        style: settings.style,
        markFirst: settings.markFirst,
    });
}

// A parallel ("bulk") reaction renders its pairs as
//   <tr data-autotest-id="stoichiometry-table-parallelReactant">  A | reagent
//   <tr data-autotest-id="stoichiometry-table-parallelProduct">     | product
// — the letter is printed on the REAGENT row, the product row beneath it has
// an empty first cell (verified on entry 2761893, pairs A–G). A table is
// parallel when it holds such product rows.
const PARALLEL_PRODUCT_ROW = 'tr[data-autotest-id="stoichiometry-table-parallelProduct"]';
const PARALLEL_REACTANT_ROW = 'tr[data-autotest-id="stoichiometry-table-parallelReactant"]';

// { ordinal, letter } for a Register link in a parallel product row; null for
// any other link. The ordinal counts PARALLEL tables only, in document order,
// so the first parallel reaction is "-1" even when an ordinary one precedes it
// — the same rule the panel reads out of the payload.
function parallelInfoOf(link) {
    const row = link.closest(PARALLEL_PRODUCT_ROW);
    if (!row) return null;

    let reagentRow = row.previousElementSibling;
    while (reagentRow && !reagentRow.matches(PARALLEL_REACTANT_ROW)) {
        reagentRow = reagentRow.previousElementSibling;
    }
    const letter = (reagentRow?.cells?.[0]?.innerText || "").trim().toUpperCase();
    if (!/^[A-Z]+$/.test(letter)) return null;

    const table = row.closest(TABLE_SELECTOR);
    const parallelTables = [...document.querySelectorAll(TABLE_SELECTOR)].filter(
        (t) => t.querySelector(PARALLEL_PRODUCT_ROW)
    );
    const ordinal = parallelTables.indexOf(table) + 1;
    if (ordinal <= 0) return null;

    return { ordinal, letter };
}

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

    // Trim first, THEN suffix: the suffix marks the product (or the parallel
    // pair) and belongs on the end of whatever the ID has been cut down to.
    const trimmed = applyIdentifierFormat(entryId, settings.format);
    if (!trimmed) return;

    // The parallel branch is asked FIRST. A parallel row prints no number, so
    // the payload can never match it -- looking there first would silently drop
    // the -1A stamp that works today. Its letter is CDD's own, on the reagent
    // row above.
    const parallel = parallelInfoOf(link);
    const suffix = parallel
        ? productSuffix({ parallel })
        : ordinaryProductSuffix(link);

    // Not a product: nothing is written, and the link keeps the href CDD gave
    // it. `""` is a real answer -- the entry's first product -- so this test is
    // strict.
    if (suffix === null) return;

    // The finished value, suffix and all — the registration page only has to
    // type out what it is handed.
    const value = `${trimmed}${suffix}`;

    // `location.href` as the base: the href is root-relative, and a URL object
    // is what keeps the existing `eln_attached_structure_id` intact.
    let url;
    try {
        url = new URL(link.getAttribute("href"), location.href);
    } catch {
        return;
    }

    if (url.searchParams.get(ELN_ID_PARAM) === value) return;

    url.searchParams.set(ELN_ID_PARAM, value);

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

// The finished value, suffix and all — composed on the ELN side, so nothing
// here has to know what a stoichiometry table is.
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

    const value = carriedElnId();
    if (!value) return;

    const input = findTargetInput();
    if (!input || filledInputs.has(input)) return;

    filledInputs.add(input);

    // Someone got there first -- CDD prefilling it, or the user typing while the
    // form was still settling. Their value wins.
    if (input.value.trim()) return;

    // Never yank a field out from under the cursor.
    if (document.activeElement === input) return;

    injectStyles();

    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));

    input.title = `Filled from the ELN entry this was registered from (${value})`;
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
        if (
            !changes[ELN_ID_CARRY_ENABLED_KEY] &&
            !changes[ELN_ID_CARRY_FIELD_KEY] &&
            !changes[ELN_ID_FORMAT_KEY] &&
            !changes[ELN_TABLE_SUFFIX_STYLE_KEY] &&
            !changes[ELN_TABLE_SUFFIX_FIRST_KEY]
        ) {
            return;
        }

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
