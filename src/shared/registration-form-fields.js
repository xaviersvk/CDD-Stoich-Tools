// shared/registration-form-fields.js
//
// SINGLE SOURCE OF TRUTH for "which fields does registration form X use?".
//
// CDD's field pickers (Search → Keywords, Inventory → Filter Entries) list every
// field the vault owns — 129 options in the vault this was built against. When
// you're looking for a Plasmid, three quarters of that is noise. This module
// holds the map that lets the pickers collapse to the fields the chosen
// registration form actually uses.
//
// Keyed by form NAME, never by `registration_form_definition_id`: the id is
// per-vault, the name is what a person recognises and what survives across
// vaults. Same reasoning (and same discipline) as registration-form.js.
//
// Imported by BOTH execution contexts:
//   - the content script (bundled by vite)     -> filters the pickers
//   - the options page (ES module from dist/)  -> inspects / refreshes the cache
//
// Keep this file free of DOM access, so the very same source runs verbatim in
// both contexts. See docs/REGISTRATION_FORM_FIELD_FILTER.md for how the map is
// harvested and why matching by name is safe.

import { extractVaultId } from "./registration-form.js";

export { extractVaultId };

/* ------------------------------------------------------------------ *
 * Storage contract
 * ------------------------------------------------------------------ */

// Record<vaultId, VaultFieldMap> — the harvested map, one entry per vault.
//
//   VaultFieldMap = {
//     fetchedAt: number,                     // epoch ms
//     known: { entity: string[], batch: string[], sample: string[] },
//     forms: { [formName]: { entity: string[], batch: string[], sample: string[] } }
//   }
//
// `known` is every field name the VAULT defines for that kind. `forms` is the
// subset each registration form lays out. Both are needed — see isFieldInForm.
export const REG_FORM_FIELD_MAP_KEY = "cddRegFormFieldMap";

// Record<vaultId, formName> — the chip the user last picked, per vault.
export const REG_FORM_FILTER_LAST_KEY = "cddRegFormFilterLastUsed";

// How long a harvested map is trusted before a refetch is worth the ~10 s the
// /molecules/new render costs. Vault admins add fields rarely; a visit to the
// Create Entity page refreshes the map for free long before this expires.
export const FIELD_MAP_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// The column kinds a registration form has an opinion about. Anything else a
// picker shows (General on the Search page, Event in Inventory) is never
// filtered: events aren't part of a registration form at all.
export const FILTERABLE_KINDS = ["entity", "batch", "sample"];

// The chip that means "don't filter". Not a form name, so it can never collide
// with one.
export const ALL_FORMS_KEY = "__all__";

/* ------------------------------------------------------------------ *
 * Pure helpers — no storage, no DOM, no clock
 * ------------------------------------------------------------------ */

/**
 * Fold a picker label into a join key.
 *
 * Strips the leading "*" required marker (the pickers show "*Purity [%]", the
 * field definition says "Purity [%]"), collapses internal whitespace, and folds
 * case. Diacritics are deliberately KEPT: two distinct fields could differ only
 * by an accent, and unlike search we must not merge them.
 */
export function fieldKey(label) {
    if (typeof label !== "string") return "";
    return label.replace(/^\*/, "").replace(/\s+/g, " ").trim().toLowerCase();
}

// Fold a list of labels into a Set of join keys, dropping blanks.
export function fieldKeySet(labels) {
    const out = new Set();
    for (const label of Array.isArray(labels) ? labels : []) {
        const key = fieldKey(label);
        if (key) out.add(key);
    }
    return out;
}

/**
 * Should a picker item stay visible?
 *
 * The rule is deliberately NOT "is this field on the form" — that would hide
 * CDD's built-ins (Entity Name, Salt, Formula Weight, Current Amount, …), which
 * belong to no registration form yet must always be searchable:
 *
 *   - kind isn't filterable (general / event)      -> keep
 *   - no form selected, or the form is unknown     -> keep
 *   - the vault doesn't define this field at all
 *     (i.e. it's a CDD built-in)                   -> keep
 *   - otherwise                                    -> keep iff the form uses it
 *
 * Deriving "is a built-in" from the harvested `known` set rather than from a
 * hardcoded list is what makes this work in a vault we've never seen.
 *
 * `sets` comes from buildLookup(); `label` is the picker's own text.
 */
export function isFieldInForm(sets, kind, label) {
    if (!sets) return true;
    if (!FILTERABLE_KINDS.includes(kind)) return true;

    const known = sets.known[kind];
    const used = sets.used[kind];
    if (!known || !used) return true;

    const key = fieldKey(label);
    if (!key) return true;
    if (!known.has(key)) return true; // a CDD built-in, not a vault field

    return used.has(key);
}

/**
 * buildLookup(vaultMap, formName) — turn the stored arrays into Sets once, so a
 * picker with 129 items does 129 Set lookups instead of 129 array scans.
 *
 * Returns null when there is nothing to filter by (no map, no form, "All", or a
 * form this vault doesn't offer), which callers treat as "show everything".
 */
export function buildLookup(vaultMap, formName) {
    if (!vaultMap || !formName || formName === ALL_FORMS_KEY) return null;

    const form = vaultMap.forms?.[formName];
    if (!form) return null;

    const known = {};
    const used = {};
    for (const kind of FILTERABLE_KINDS) {
        known[kind] = fieldKeySet(vaultMap.known?.[kind]);
        used[kind] = fieldKeySet(form[kind]);
    }

    return { formName, known, used };
}

// Names of the forms in a stored map, in the order they were harvested.
export function formNames(vaultMap) {
    return Object.keys(vaultMap?.forms || {});
}

/**
 * A stored map is usable if it has at least one form. Freshness is a separate
 * question (see isFresh): a stale map is still shown — refetching in the
 * background beats an empty chip row.
 */
export function isUsable(vaultMap) {
    return formNames(vaultMap).length > 0;
}

export function isFresh(vaultMap, now) {
    const at = Number(vaultMap?.fetchedAt);
    if (!Number.isFinite(at)) return false;
    // A clock that jumped backwards must not pin a map as fresh forever.
    return now - at >= 0 && now - at < FIELD_MAP_TTL_MS;
}

/* ------------------------------------------------------------------ *
 * Storage access (async) — content script and options page
 * ------------------------------------------------------------------ */

export async function getFieldMaps() {
    try {
        const stored = await chrome.storage.local.get([REG_FORM_FIELD_MAP_KEY]);
        const maps = stored?.[REG_FORM_FIELD_MAP_KEY];
        return maps && typeof maps === "object" ? maps : {};
    } catch {
        return {};
    }
}

export async function getFieldMap(vaultId) {
    if (!vaultId) return null;
    const maps = await getFieldMaps();
    return maps[vaultId] || null;
}

export async function saveFieldMap(vaultId, vaultMap) {
    if (!vaultId || !isUsable(vaultMap)) return;
    const maps = await getFieldMaps();
    await chrome.storage.local.set({
        [REG_FORM_FIELD_MAP_KEY]: { ...maps, [vaultId]: vaultMap },
    });
}

export async function getFilterChoice(vaultId) {
    if (!vaultId) return null;
    try {
        const stored = await chrome.storage.local.get([REG_FORM_FILTER_LAST_KEY]);
        const all = stored?.[REG_FORM_FILTER_LAST_KEY];
        const name = all && typeof all === "object" ? all[vaultId] : null;
        return typeof name === "string" && name ? name : null;
    } catch {
        return null;
    }
}

export async function saveFilterChoice(vaultId, formName) {
    if (!vaultId) return;
    try {
        const stored = await chrome.storage.local.get([REG_FORM_FILTER_LAST_KEY]);
        const all =
            stored?.[REG_FORM_FILTER_LAST_KEY] &&
            typeof stored[REG_FORM_FILTER_LAST_KEY] === "object"
                ? stored[REG_FORM_FILTER_LAST_KEY]
                : {};
        await chrome.storage.local.set({
            [REG_FORM_FILTER_LAST_KEY]: { ...all, [vaultId]: formName },
        });
    } catch {
        /* storage full / unavailable: the choice is a convenience, not state */
    }
}
