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

// "letter" | "dash-letter" | "number" — how a product is marked with the
// stoichiometry table it came from. Second and third table:
//
//   letter (the original)   MDX-113B    MDX-113C
//   dash-letter             MDX-113-B   MDX-113-C
//   number                  MDX-113-2   MDX-113-3
//
// The mark is this plugin's own convention, not something CDD prints, so a
// vault that numbers its reactions can say so. Absent means "letter": the
// setting must never change an ID nobody asked it to change.
export const ELN_TABLE_SUFFIX_STYLE_KEY = "cddElnTableSuffixStyle";

export const ELN_TABLE_SUFFIX_STYLES = ["letter", "dash-letter", "number"];

export const DEFAULT_ELN_TABLE_SUFFIX_STYLE = "letter";

// boolean — does the FIRST table get a mark of its own?
//
//   off (the original)   MDX-113     MDX-113B   MDX-113C
//   on                   MDX-113A    MDX-113B   MDX-113C
//   on, numbered         MDX-113-1   MDX-113-2  MDX-113-3
//
// Independent of the style, because the two questions are independent: an
// entry with one reaction reading MDX-113 is either what you want or it is
// not, whichever alphabet the others are in. Absent means off — one reaction
// is the normal case and it should read the way it always has.
export const ELN_TABLE_SUFFIX_FIRST_KEY = "cddElnTableSuffixFirst";

export const DEFAULT_ELN_TABLE_SUFFIX_FIRST = false;

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

// The spreadsheet column name of n: 1 -> A, 2 -> B, 26 -> Z, 27 -> AA. Which
// also settles what a 27th table gets, instead of running off the end of the
// alphabet.
function columnName(n) {
    let left = n;
    let out = "";

    while (left > 0) {
        out = String.fromCharCode(65 + ((left - 1) % 26)) + out;
        left = Math.floor((left - 1) / 26);
    }

    return out;
}

// Which stoichiometry table of the entry the registration came from, as a
// suffix on the entry ID. Two settings decide what it looks like:
//
//   style      letter        PHA-MDX-0095B    PHA-MDX-0095C
//              dash-letter   PHA-MDX-0095-B   PHA-MDX-0095-C
//              number        PHA-MDX-0095-2   PHA-MDX-0095-3
//
//   markFirst  off           table 1 -> PHA-MDX-0095
//              on            table 1 -> PHA-MDX-0095A / -A / -1
//
// The defaults are the original behaviour: letters, first table bare.
export function tableSuffix(
    index,
    style = DEFAULT_ELN_TABLE_SUFFIX_STYLE,
    markFirst = DEFAULT_ELN_TABLE_SUFFIX_FIRST
) {
    if (!Number.isInteger(index) || index < 0) return "";

    // An entry with one reaction is the normal case, and unless asked it
    // should read the way it always has.
    if (index === 0 && !markFirst) return "";

    const n = index + 1;

    if (style === "number") return `-${n}`;
    if (style === "dash-letter") return `-${columnName(n)}`;

    return columnName(n);
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
//   style, markFirst: see tableSuffix
//
// The two settings reach the table branch only. A parallel pair's letter is
// CDD's own, printed beside the row, and stays exactly that in every style.
export function productSuffix({ parallel, tableIndex, style, markFirst }) {
    if (parallel) {
        const s = parallelSuffix(parallel.ordinal, parallel.letter);
        if (s) return s;
    }
    return tableSuffix(tableIndex, style, markFirst);
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
            [ELN_TABLE_SUFFIX_FIRST_KEY]: DEFAULT_ELN_TABLE_SUFFIX_FIRST,
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
            // Only an explicit `true` marks the first table.
            markFirst: stored[ELN_TABLE_SUFFIX_FIRST_KEY] === true,
        };
    } catch {
        return {
            enabled: true,
            fieldLabel: DEFAULT_ELN_ID_CARRY_FIELD,
            format: DEFAULT_ELN_ID_FORMAT,
            style: DEFAULT_ELN_TABLE_SUFFIX_STYLE,
            markFirst: DEFAULT_ELN_TABLE_SUFFIX_FIRST,
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

export async function saveElnTableSuffixFirst(value) {
    try {
        await chrome.storage.local.set({
            [ELN_TABLE_SUFFIX_FIRST_KEY]: value === true,
        });
    } catch {
        // Orphaned content script — nothing useful to do.
    }
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
