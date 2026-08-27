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

// "letter" | "number" — how a product is marked with the stoichiometry table
// it came from.
//
//   letter (the original)   MDX-113   MDX-113B   MDX-113C
//   number                  MDX-113-1 MDX-113-2  MDX-113-3
//
// Letters are this plugin's own convention, not something CDD prints, so a
// vault that numbers its reactions can say so. Absent means "letter": the
// setting must never change an ID nobody asked it to change.
export const ELN_TABLE_SUFFIX_STYLE_KEY = "cddElnTableSuffixStyle";

export const ELN_TABLE_SUFFIX_STYLES = ["letter", "number"];

export const DEFAULT_ELN_TABLE_SUFFIX_STYLE = "letter";

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
// The style decides which of the two it is; "letter" is what this has always
// written, and what an install that never opens the setting keeps writing.
export function tableSuffix(index, style = DEFAULT_ELN_TABLE_SUFFIX_STYLE) {
    if (!Number.isInteger(index) || index < 0) return "";

    // Numbering counts from the FIRST table, so a one-reaction entry reads
    // MDX-113-1. That is the point of the setting: every product carries the
    // number of the reaction it came out of, with no exception to remember.
    if (style === "number") return `-${index + 1}`;

    if (index === 0) return "";

    let n = index + 1;
    let out = "";

    while (n > 0) {
        out = String.fromCharCode(65 + ((n - 1) % 26)) + out;
        n = Math.floor((n - 1) / 26);
    }

    return out;
}

// A product of a parallel ("bulk") reaction gets a different suffix: the
// reaction's number among the entry's PARALLEL reactions, then the letter CDD
// prints beside its reagent/product pair.
//
//   1st parallel reaction, pair A -> PHA-MDX-0095-1A
//   1st parallel reaction, pair B -> PHA-MDX-0095-1B
//   2nd parallel reaction, pair A -> PHA-MDX-0095-2A
//
// The number counts parallel reactions only — an ordinary table before the
// first parallel one does not push it to "-2". Ordinary tables keep
// tableSuffix; the two schemes never meet on one product.
export function parallelSuffix(ordinal, letter) {
    const n = Number(ordinal);
    const l = String(letter ?? "").trim().toUpperCase();
    if (!Number.isInteger(n) || n <= 0 || !/^[A-Z]+$/.test(l)) return "";
    return `-${n}${l}`;
}

// The suffix for one product row, whichever kind of table it sits in.
//   parallel: { ordinal, letter } of the bulk pair -> "-1A"
//   tableIndex: position of the table among ALL tables
//   style: "letter" -> "", "B", "C"…   "number" -> "-1", "-2", "-3"…
//
// The style reaches the table branch only. A parallel pair's letter is CDD's
// own, printed beside the row, and stays a letter in both styles.
export function productSuffix({ parallel, tableIndex, style }) {
    if (parallel) {
        const s = parallelSuffix(parallel.ordinal, parallel.letter);
        if (s) return s;
    }
    return tableSuffix(tableIndex, style);
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
            [ELN_TABLE_SUFFIX_STYLE_KEY]: DEFAULT_ELN_TABLE_SUFFIX_STYLE,
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
            style: ELN_TABLE_SUFFIX_STYLES.includes(stored[ELN_TABLE_SUFFIX_STYLE_KEY])
                ? stored[ELN_TABLE_SUFFIX_STYLE_KEY]
                : DEFAULT_ELN_TABLE_SUFFIX_STYLE,
        };
    } catch {
        return {
            enabled: true,
            fieldLabel: DEFAULT_ELN_ID_CARRY_FIELD,
            format: DEFAULT_ELN_ID_FORMAT,
            style: DEFAULT_ELN_TABLE_SUFFIX_STYLE,
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

export async function saveElnTableSuffixStyle(value) {
    const style = ELN_TABLE_SUFFIX_STYLES.includes(value)
        ? value
        : DEFAULT_ELN_TABLE_SUFFIX_STYLE;

    try {
        await chrome.storage.local.set({ [ELN_TABLE_SUFFIX_STYLE_KEY]: style });
    } catch {
        // Orphaned content script — nothing useful to do.
    }

    return style;
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
