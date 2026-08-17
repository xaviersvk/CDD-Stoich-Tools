// content/features/ui-fixes/form-filter-chips.js
//
// The "Form" chip row shared by both field pickers (Search → Keywords and
// Inventory → Filter Entries). It turns the harvested registration-form map
// (see content/api/registration-form-fields.js) into the `chips` spec that
// field-picker-core.js renders, and answers the one question the core asks:
// "under chip X, is this item visible?"
//
// Both pickers get the identical row because both suffer the identical problem
// — one flat list of every field the vault owns. The only thing that differs is
// how an item reports its column kind, which each adapter supplies as `getKind`.

import {
    ALL_FORMS_KEY,
    buildLookup,
    formNames,
    isFieldInForm,
    saveFilterChoice,
} from "../../../shared/registration-form-fields.js";
import {
    extractVaultId,
    getRegistrationFormSettings,
    orderNames,
    REG_FORM_ORDER_KEY,
} from "../../../shared/registration-form.js";
import {
    ensureFieldMap,
    getActiveFormName,
    getCachedFieldMap,
    initRegistrationFormFields,
    setActiveFormName,
} from "../../api/registration-form-fields.js";

// The user's preferred form order, from the options page. Read once at init and
// kept current, because the chip row is built inside a synchronous mousedown
// handler and cannot await storage.
let preferredOrder = [];

// buildLookup() allocates a Set per column kind, so memoise it: the predicate is
// called once per item (129 times on the Search page) for the same chip.
let lookupCacheKey = null;
let lookupCacheValue = null;

function lookupFor(formKey) {
    if (formKey === lookupCacheKey) return lookupCacheValue;
    lookupCacheKey = formKey;
    lookupCacheValue = buildLookup(getCachedFieldMap(), formKey);
    return lookupCacheValue;
}

function vaultId() {
    return extractVaultId(location.pathname);
}

/**
 * The spec for field-picker-core's chip row, or null when there is nothing to
 * offer and nothing to say (no vault, no map, no load running) — in that case
 * the picker renders exactly as it always has, with no row at all.
 *
 * `getKind(item)` maps one picker item to its column kind ("entity", "batch",
 * "sample", …); see shared/registration-form-fields.js for which kinds filter.
 */
export function buildChipSpec(getKind) {
    const id = vaultId();
    if (!id) return null;

    // A picker is opening: drop the memo, in case a background refresh replaced
    // the map since the last one.
    lookupCacheKey = null;
    lookupCacheValue = null;

    const vaultMap = getCachedFieldMap(id);
    const names = orderNames(formNames(vaultMap), preferredOrder);

    if (!names.length) {
        // Nothing cached. Opening a picker is the first moment we know the user
        // actually wants this, so start the harvest here rather than on every
        // page load, and say so instead of showing a silently unfiltered list.
        ensureFieldMap(id);
        return {
            label: "Form",
            items: [],
            note: "Loading vault fields…",
        };
    }

    // The remembered chip, unless that form has since been removed from the
    // vault — then fall back to All rather than filtering by a ghost.
    const remembered = getActiveFormName(id);
    const activeKey = remembered && names.includes(remembered) ? remembered : ALL_FORMS_KEY;

    return {
        label: "Form",
        activeKey,
        items: [
            { key: ALL_FORMS_KEY, label: "All" },
            ...names.map((name) => ({ key: name, label: name })),
        ],
        onPick: (key) => {
            const name = key === ALL_FORMS_KEY ? "" : key;
            setActiveFormName(name || null, id);
            saveFilterChoice(id, name);
        },
        predicate: (key, item) =>
            isFieldInForm(lookupFor(key), getKind(item), item?.label || ""),
    };
}

/**
 * Fill in a chip row that was built before the map arrived.
 *
 * Harmless if the picker has since closed — the panel is detached and nobody
 * sees the update. Only does anything when the row currently has no chips, so
 * a map refresh can never yank the row out from under a user mid-choice.
 */
export function refreshChipsWhenReady(setChips, getKind) {
    if (typeof setChips !== "function") return;

    const id = vaultId();
    if (!id || getCachedFieldMap(id)) return; // chips were rendered already

    ensureFieldMap(id).then((vaultMap) => {
        // Still nothing (offline, logged out, a vault with no forms): leave the
        // placeholder row alone rather than starting another harvest.
        if (!vaultMap) return;
        const spec = buildChipSpec(getKind);
        if (spec?.items?.length) setChips(spec);
    });
}

let started = false;

/**
 * Load the form order the options page controls, and keep following it. Both
 * pickers call this; only the first call does anything.
 */
export async function initFormFilterChips() {
    if (started) return;
    started = true;

    // Memory-only warm-up: the remembered chip and any map already stored. No
    // network — see initRegistrationFormFields.
    initRegistrationFormFields();

    const settings = await getRegistrationFormSettings();
    preferredOrder = settings?.order || [];

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local" || !changes[REG_FORM_ORDER_KEY]) return;
        getRegistrationFormSettings().then((fresh) => {
            preferredOrder = fresh?.order || [];
        });
    });
}
