// shared/eln-id-carry.js
//
// Carrying the ELN entry ID (IDEMO-MDX-0014) from an ELN entry into the
// "Create a New Entity" form the Register link opens.
//
// Two settings live here:
//
//   1. Enabled     — on by default; the whole point of the feature is that it
//                    needs no ceremony.
//   2. Field label — WHICH field on the registration form receives the ID.
//                    "Internal ID" in this vault, something else in the next:
//                    the label is per-vault configuration, not a constant.
//
// Imported by BOTH execution contexts, exactly like registration-form.js:
//   - the content script (bundled by vite)     -> rewrites the link, fills the field
//   - the options page (ES module from dist/)  -> edits the settings
//
// Keep this file free of DOM access so the very same source runs in both.

/* ------------------------------------------------------------------ *
 * Storage contract
 * ------------------------------------------------------------------ */

// boolean — absent means ON. A feature that silently does nothing until you
// find its checkbox is a feature nobody has.
export const ELN_ID_CARRY_ENABLED_KEY = "cddElnIdCarryEnabled";

// string — the registration-form field label the ID is written into.
export const ELN_ID_CARRY_FIELD_KEY = "cddElnIdCarryFieldLabel";

export const DEFAULT_ELN_ID_CARRY_FIELD = "Internal ID";

// "global" | "vault" | "vault-user" — which of CDD's three ELN identifier
// formats this vault is set to. CDD keeps that choice on a settings page only an
// admin can open, so it cannot be read from a normal session; the user tells us
// instead, and the wording here matches CDD's own so the two are picked from the
// same list.
export const ELN_ID_FORMAT_KEY = "cddElnIdFormat";

export const ELN_ID_FORMATS = ["global", "vault", "vault-user"];

// Vault-User is what the vaults this plugin is written for are set to, so it is
// what a fresh install assumes. A vault on one of the other two formats has
// nothing to cut anyway: applyIdentifierFormat() only ever cuts an ID that
// actually reads <vault>-<user>-<number>.
export const DEFAULT_ELN_ID_FORMAT = "vault-user";

/* ------------------------------------------------------------------ *
 * The wire between the two pages
 * ------------------------------------------------------------------ */

// The Register link opens a NEW TAB, so the ELN page and the registration page
// never share a JavaScript world -- and storage would be a race against the new
// tab's load. The ID travels in the URL instead: the link is rewritten on the
// way out, and the registration page reads its own query string. One click, one
// ID, no timing.
//
// CDD's Rails side ignores query params it does not know.
export const ELN_ID_PARAM = "cdd_eln_id";

/* ------------------------------------------------------------------ *
 * Pure helpers — no storage, no DOM
 * ------------------------------------------------------------------ */

// Registration-form labels carry CDD's own required marker: the cell for
// "Internal ID" is labelled "*Internal ID". Users type the name they see on
// EITHER page, so the star (and case, and spacing) must not decide a match.
export function normalizeFieldLabel(label) {
    return String(label ?? "")
        .replace(/^\s*\*+/, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}

export function fieldLabelsMatch(a, b) {
    const left = normalizeFieldLabel(a);
    return left !== "" && left === normalizeFieldLabel(b);
}

// The part of the entry ID worth carrying, given the vault's identifier format.
//
//   Vault-User Identifier   IDEMO-MDX-0014 -> MDX-0014
//   Vault Identifier        left alone
//   Global Identifier       left alone
//
// The vault-user format reads <vault>-<user>-<number>, and the vault prefix is
// the same on every entry in the vault -- it says nothing a batch registered
// there does not already say, so it goes. The other two formats carry no such
// repeated piece, so nothing is cut from them.
//
// The cut needs TWO dashes to be a vault-user ID, and an ID with fewer is left
// whole: better to carry one prefix too many than to saw a real ID in half
// because the setting says one thing and the vault does another.
export function applyIdentifierFormat(entryId, format) {
    const id = String(entryId ?? "").trim();
    if (format !== "vault-user") return id;

    const firstDash = id.indexOf("-");
    if (firstDash <= 0) return id;

    const rest = id.slice(firstDash + 1);
    if (!rest.includes("-")) return id;

    return rest;
}

// Which stoichiometry table of the entry the registration came from, as a
// suffix on the entry ID:
//
//   table 1 -> PHA-MDX-0095      table 2 -> PHA-MDX-0095B
//   table 3 -> PHA-MDX-0095C     table 4 -> PHA-MDX-0095D
//
// The first table is bare rather than "...A": an entry with one reaction is the
// normal case, and it should read the way it always has. So the letters are the
// spreadsheet column names of `index + 1` with the first one left off -- which
// also settles what a 27th table gets (AA, then AB), instead of running off the
// end of the alphabet.
export function tableSuffix(index) {
    if (!Number.isInteger(index) || index <= 0) return "";

    let n = index + 1;
    let out = "";

    while (n > 0) {
        out = String.fromCharCode(65 + ((n - 1) % 26)) + out;
        n = Math.floor((n - 1) / 26);
    }

    return out;
}

// "ID: IDEMO-MDX-0014" -> "IDEMO-MDX-0014". Also copes with the bare value, so
// a caller that already stripped the prefix is not punished for it.
export function cleanElnEntryId(raw) {
    return String(raw ?? "")
        .replace(/^\s*ID\s*:\s*/i, "")
        .replace(/\s+/g, " ")
        .trim();
}

/* ------------------------------------------------------------------ *
 * Storage access
 * ------------------------------------------------------------------ */

export async function getElnIdCarrySettings() {
    try {
        const stored = await chrome.storage.local.get({
            [ELN_ID_CARRY_ENABLED_KEY]: true,
            [ELN_ID_CARRY_FIELD_KEY]: DEFAULT_ELN_ID_CARRY_FIELD,
            [ELN_ID_FORMAT_KEY]: DEFAULT_ELN_ID_FORMAT,
        });

        return {
            // Only an explicit `false` turns it off -- an unset key is ON.
            enabled: stored[ELN_ID_CARRY_ENABLED_KEY] !== false,
            fieldLabel:
                String(stored[ELN_ID_CARRY_FIELD_KEY] ?? "").trim() ||
                DEFAULT_ELN_ID_CARRY_FIELD,
            format: ELN_ID_FORMATS.includes(stored[ELN_ID_FORMAT_KEY])
                ? stored[ELN_ID_FORMAT_KEY]
                : DEFAULT_ELN_ID_FORMAT,
        };
    } catch {
        return {
            enabled: true,
            fieldLabel: DEFAULT_ELN_ID_CARRY_FIELD,
            format: DEFAULT_ELN_ID_FORMAT,
        };
    }
}

export async function saveElnIdFormat(value) {
    const format = ELN_ID_FORMATS.includes(value) ? value : DEFAULT_ELN_ID_FORMAT;

    try {
        await chrome.storage.local.set({ [ELN_ID_FORMAT_KEY]: format });
    } catch {
        // Orphaned content script — nothing useful to do.
    }

    return format;
}

export async function saveElnIdCarryEnabled(value) {
    try {
        await chrome.storage.local.set({ [ELN_ID_CARRY_ENABLED_KEY]: value !== false });
    } catch {
        // Orphaned content script — nothing useful to do.
    }
}

// An empty box means "the default", not "no field at all": a blank label would
// match nothing and the feature would look broken rather than reset.
export async function saveElnIdCarryFieldLabel(value) {
    const label = String(value ?? "").trim() || DEFAULT_ELN_ID_CARRY_FIELD;

    try {
        await chrome.storage.local.set({ [ELN_ID_CARRY_FIELD_KEY]: label });
    } catch {
        // Orphaned content script — nothing useful to do.
    }

    return label;
}
