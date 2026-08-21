// shared/registration-defaults.js
//
// Two things a registration opened FROM an ELN entry can know without being
// told twice:
//
//   1. constants the user always types  — Origin is Synthesized for anything
//      that came out of a reaction, every time
//   2. the amount in the row            — written in the stoichiometry table
//      the Register link sits in
//
// (1) is configuration and lives here, keyed BY VAULT: vault 8158 has an
// Origin field, the next vault may not, and a value that is right in one is
// meaningless in another. The Record<vaultId, …> shape follows the two the
// codebase already uses (cddRegFormFieldMap, cddRegFormFilterLastUsed), and
// the vault id comes from the same extractVaultId().
//
// (2) is not configuration at all — it travels on the Register link, like the
// ELN id already does. Only the parsing and the unit spelling live here.
//
// DOM-free, so the same source runs in the content script and the options
// page.

import { extractVaultId } from "./registration-form.js";

export { extractVaultId };

/* ------------------------------------------------------------------ *
 * Storage contract
 * ------------------------------------------------------------------ */

// Record<vaultId, { label?: string, fields: Array<{ label, value }> }>
//
// `label` is a name the USER types for the vault, so the options page reads
// better than a bare number. It is not harvested: CDD carries the vault name
// only inside the vault-switcher dropdown, which lists every vault the
// account can reach — other groups' included — and every one of its links
// carries the CURRENT vault id, so the active one cannot be picked out of it
// anyway. Storing other people's vault names to decorate a heading is a bad
// trade.
export const REGISTRATION_DEFAULTS_KEY = "cddRegistrationDefaults";

/* ------------------------------------------------------------------ *
 * The wire — extra parameters on the Register link
 * ------------------------------------------------------------------ */

export const AMOUNT_PARAM = "cdd_amount";
export const AMOUNT_UNIT_PARAM = "cdd_amount_unit";

/* ------------------------------------------------------------------ *
 * Pure helpers
 * ------------------------------------------------------------------ */

// CDD's unit list spells micro with the MICRO SIGN (U+00B5): "µL", "µg".
// A stoichiometry row — or a person — may write "uL", or the Greek mu
// (U+03BC), which looks identical and is not the same character. Nothing in
// CDD's list begins with a literal "u", so a leading one is always the micro
// that was meant.
export function normalizeUnit(raw) {
    const unit = String(raw ?? "").trim();
    if (!unit) return "";
    return unit.replace(/^[uμµ]/, "µ");
}

// Every unit CDD's sample Units select offers, plus the "u" spellings of the
// micro ones. LONGEST FIRST — regex alternation takes the first branch that
// matches, so "mol" listed before "mmol" would cut "mmol" in half.
const KNOWN_UNITS = [
    "count", "mmol", "µmol", "umol", "nmol", "pmol",
    "kg", "mg", "µg", "ug", "ng", "mL", "µL", "uL", "mM", "µM", "uM", "nM",
    "mol", "g", "L", "M",
];

// "Mass: 6.38 g" -> { value: "6.38", unit: "g" }
//
// Mass first, Volume second: a solid product is registered by what was
// isolated, and a row carrying only a volume is a liquid. A row with neither
// — "Mass: Required", the untouched product row — returns null, and nothing
// is stamped or filled.
//
// The unit is matched against the KNOWN list rather than "a run of letters",
// because a row's textContent runs its cells together with no separator:
// "Mass: 6.38 gVolume: 3.16 mL". A greedy letter run reads that unit as
// "gVolume".
//
// An unrecognised unit does not throw the amount away — the number is still
// worth carrying, and an empty unit simply leaves the select alone.
export function parseRowAmount(rowText) {
    const text = String(rowText ?? "");
    const units = KNOWN_UNITS.join("|");

    for (const label of ["Mass", "Volume"]) {
        const match = new RegExp(
            `${label}\\s*:\\s*([0-9]+(?:[.,][0-9]+)?)\\s*(${units})?`
        ).exec(text);

        if (match) {
            return {
                value: match[1].replace(",", "."),
                unit: normalizeUnit(match[2] || ""),
            };
        }
    }

    return null;
}

// One row of the settings table is worth keeping only if it names a field AND
// says what to put in it. A half-filled row is a row being typed, not a rule.
export function sanitizeDefaultsList(list) {
    if (!Array.isArray(list)) return [];

    const out = [];
    const seen = new Set();

    for (const row of list) {
        const label = String(row?.label ?? "").trim();
        const value = String(row?.value ?? "").trim();
        if (!label || !value) continue;

        // Two rules for one field would race; the first one wins, which is
        // the one nearer the top of the list the user is looking at.
        const key = label.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        out.push({ label, value });
    }

    return out;
}

export function sanitizeVaultEntry(entry) {
    return {
        label: String(entry?.label ?? "").trim(),
        fields: sanitizeDefaultsList(entry?.fields),
    };
}

/* ------------------------------------------------------------------ *
 * Storage access (async) — content script and options page
 * ------------------------------------------------------------------ */

export async function loadRegistrationDefaults() {
    try {
        const stored = await chrome.storage.local.get(REGISTRATION_DEFAULTS_KEY);
        const all = stored?.[REGISTRATION_DEFAULTS_KEY];
        if (!all || typeof all !== "object") return {};

        const clean = {};
        for (const [vaultId, entry] of Object.entries(all)) {
            clean[vaultId] = sanitizeVaultEntry(entry);
        }
        return clean;
    } catch {
        return {};
    }
}

export async function getVaultDefaults(vaultId) {
    if (!vaultId) return { label: "", fields: [] };

    const all = await loadRegistrationDefaults();
    return all[vaultId] || { label: "", fields: [] };
}

// Write the whole record at once. The options page edits several vaults on
// one screen, and a per-vault save would be a read-modify-write per keystroke
// racing the others.
export async function saveRegistrationDefaults(record) {
    const clean = {};

    for (const [vaultId, entry] of Object.entries(record || {})) {
        const id = String(vaultId).trim();
        if (!/^\d+$/.test(id)) continue;

        const vault = sanitizeVaultEntry(entry);
        // A vault with nothing in it is dropped rather than stored as an empty
        // shell, so the options page does not accumulate empty headings.
        if (!vault.fields.length && !vault.label) continue;

        clean[id] = vault;
    }

    try {
        await chrome.storage.local.set({ [REGISTRATION_DEFAULTS_KEY]: clean });
    } catch {
        // Orphaned content script — nothing useful to do.
    }
}

export async function saveVaultDefaults(vaultId, entry) {
    if (!vaultId) return;

    try {
        const all = await loadRegistrationDefaults();
        const clean = sanitizeVaultEntry(entry);

        // An empty vault is dropped rather than stored as an empty shell, so
        // the options page does not accumulate headings for vaults nobody
        // configured.
        if (!clean.fields.length && !clean.label) delete all[vaultId];
        else all[vaultId] = clean;

        await chrome.storage.local.set({ [REGISTRATION_DEFAULTS_KEY]: all });
    } catch {
        // Orphaned content script — nothing useful to do.
    }
}
