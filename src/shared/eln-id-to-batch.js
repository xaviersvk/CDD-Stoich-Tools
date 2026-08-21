// shared/eln-id-to-batch.js
//
// Writing the ELN entry ID onto a batch that ALREADY exists.
//
// eln-id-carry.js covers the compound you register FROM an entry. This covers
// the one registered first: a target with a molecule, a batch, no inventory
// sample and an empty Internal ID, which only becomes the product of an entry
// once someone actually makes it.
//
// Two caches live here, both read SYNCHRONOUSLY by the panel render:
//   1. this feature's own on/off flag;
//   2. a copy of eln-id-carry's { fieldLabel, format }, because the panel
//      cannot await storage while building a card.
//
// Keep this file free of DOM access — the options page imports it too.

import {
    ELN_ID_CARRY_ENABLED_KEY,
    ELN_ID_CARRY_FIELD_KEY,
    ELN_ID_FORMAT_KEY,
    DEFAULT_ELN_ID_CARRY_FIELD,
    DEFAULT_ELN_ID_FORMAT,
    getElnIdCarrySettings,
    applyIdentifierFormat,
    tableSuffix,
} from "./eln-id-carry.js";

// boolean — absent means OFF. This one writes to a batch record without
// asking a second time, so it must never appear because someone updated.
export const ELN_ID_TO_BATCH_ENABLED_KEY = "cddElnIdToBatchEnabled";

/* ------------------------------------------------------------------ *
 * Pure helpers — no storage, no DOM
 * ------------------------------------------------------------------ */

// The ONLY safe way to find the Internal ID control on a molecule page.
//
// The read-only page also carries an "Add a batch" form whose Internal ID
// control matches by label and by name, and filling THAT one would create a
// batch instead of editing one. The per-batch id is the thing that cannot be
// confused: specified_batch_<batchId>_field_<defId>.
export function batchFieldControlId(batchId, defId) {
    return `specified_batch_${batchId}_field_${defId}`;
}

// Where CDD's own edit form posts. Used only to sanity-check the action we
// read off the rendered form — never to build a request from scratch.
export function batchEditAction(vaultId, batchId) {
    return `/vaults/${vaultId}/specified_batches/${batchId}`;
}

// The batches tab. The `/specified_batches/<id>/edit` route server-redirects
// here and renders nothing editable, so the hash is what actually opens the
// form — React builds it in the browser.
export function moleculeBatchesUrl(vaultId, moleculeId) {
    return `/vaults/${vaultId}/molecules/${moleculeId}#molecule-batches`;
}

// The same string the Register link stamps, so a batch filled this way and
// one registered from the entry are indistinguishable.
//
// Trim first, THEN letter: the letter marks which stoichiometry table the
// product came from and belongs on the end of whatever the ID was cut to.
export function composeBatchElnId(entryId, format, reactionIndex) {
    const trimmed = applyIdentifierFormat(entryId, format);
    if (!trimmed) return "";
    return `${trimmed}${tableSuffix(reactionIndex)}`;
}

/* ------------------------------------------------------------------ *
 * Storage access
 * ------------------------------------------------------------------ */

export async function getElnIdToBatchEnabled() {
    try {
        const result = await chrome.storage.local.get(ELN_ID_TO_BATCH_ENABLED_KEY);
        return result?.[ELN_ID_TO_BATCH_ENABLED_KEY] === true;
    } catch {
        return false;
    }
}

export async function saveElnIdToBatchEnabled(value) {
    try {
        await chrome.storage.local.set({
            [ELN_ID_TO_BATCH_ENABLED_KEY]: value === true,
        });
    } catch {
        // Orphaned content script — nothing useful to do.
    }
}

/* ------------------------------------------------------------------ *
 * Sync caches for the panel render
 * ------------------------------------------------------------------ */

let enabledCache = false;
let carryCache = {
    enabled: true,
    fieldLabel: DEFAULT_ELN_ID_CARRY_FIELD,
    format: DEFAULT_ELN_ID_FORMAT,
};
let listenerAttached = false;
const changeListeners = new Set();

function notify() {
    for (const cb of changeListeners) {
        try {
            cb(enabledCache);
        } catch {
            /* a misbehaving listener must not break the others */
        }
    }
}

export function isElnIdToBatchEnabled() {
    return enabledCache;
}

export function getCarrySettings() {
    return carryCache;
}

export function onElnIdToBatchChanged(cb) {
    changeListeners.add(cb);
    return () => changeListeners.delete(cb);
}

export async function initElnIdToBatch() {
    if (!listenerAttached && chrome?.storage?.onChanged) {
        listenerAttached = true;
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== "local") return;

            let changed = false;

            if (changes[ELN_ID_TO_BATCH_ENABLED_KEY]) {
                enabledCache = changes[ELN_ID_TO_BATCH_ENABLED_KEY].newValue === true;
                changed = true;
            }

            // The label and the format belong to eln-id-carry; this feature
            // only mirrors them so the panel can read them synchronously.
            if (
                changes[ELN_ID_CARRY_ENABLED_KEY] ||
                changes[ELN_ID_CARRY_FIELD_KEY] ||
                changes[ELN_ID_FORMAT_KEY]
            ) {
                getElnIdCarrySettings().then((fresh) => {
                    carryCache = fresh;
                    notify();
                });
            }

            if (changed) notify();
        });
    }

    enabledCache = await getElnIdToBatchEnabled();
    carryCache = await getElnIdCarrySettings();
    notify();
    return enabledCache;
}
