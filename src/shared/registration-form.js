// shared/registration-form.js
//
// SINGLE SOURCE OF TRUTH for the "Registration Form" picklist on the Create a
// New Entity page (`#registration-form-select`: Animal, Antibody, Molecule,
// Plasmid, Protein, ...).
//
// Two settings live here, both keyed by the form's NAME rather than its
// `value`. The value is a per-vault `registration_form_definition_id`, so
// "Molecule" is 1000000170 in one vault and something else in the next; the
// name is what a person recognises and what survives across vaults.
//
//   1. Order   — the sequence the options appear in. A cell biologist wants
//                Eukaryote on top, a chemist wants Molecule.
//   2. Default — which form is preselected: the last one you used in this
//                vault, a fixed one you pin, or whatever CDD chose.
//
// Imported by BOTH execution contexts, exactly like prefix-colors.js:
//   - the content script (bundled by vite)          -> reorders + preselects
//   - the options page (ES module from dist/)       -> edits the settings
//
// Keep this file free of DOM access and of imports from other modules so the
// very same source runs verbatim in both contexts.

/* ------------------------------------------------------------------ *
 * Storage contract
 * ------------------------------------------------------------------ */

// string[] — every form name the content script has ever seen, so the options
// page can list forms without the user being on a CDD page.
export const REG_FORM_NAMES_KEY = "cddRegistrationFormNames";

// string[] — the user's preferred order, by name. Names absent from this list
// keep their CDD order and sort after the ones that are in it.
export const REG_FORM_ORDER_KEY = "cddRegistrationFormOrder";

// "remember" | "fixed" | "off"
export const REG_FORM_MODE_KEY = "cddRegistrationFormMode";

// string — the pinned form name, used when mode === "fixed".
export const REG_FORM_FIXED_KEY = "cddRegistrationFormFixedName";

// Record<vaultId, formName> — the last form used, per vault.
export const REG_FORM_LAST_USED_KEY = "cddRegistrationFormLastUsed";

export const REG_FORM_MODES = ["remember", "fixed", "off"];
export const DEFAULT_REG_FORM_MODE = "remember";

/* ------------------------------------------------------------------ *
 * Pure helpers — no storage, no DOM, no clock
 * ------------------------------------------------------------------ */

// Trim, drop blanks, drop non-strings, de-duplicate. Order preserved.
export function sanitizeNames(list) {
    const out = [];
    const seen = new Set();

    for (const raw of Array.isArray(list) ? list : []) {
        if (typeof raw !== "string") continue;
        const name = raw.trim();
        if (!name || seen.has(name)) continue;
        seen.add(name);
        out.push(name);
    }

    return out;
}

export function sanitizeMode(value) {
    return REG_FORM_MODES.includes(value) ? value : DEFAULT_REG_FORM_MODE;
}

// Fold newly-seen names into the known list. New names are APPENDED, so a form
// added to the vault later shows up at the bottom of the user's order instead
// of silently jumping to the top. Returns { list, changed }.
export function mergeNames(known, found) {
    const list = sanitizeNames(known);
    const seen = new Set(list);
    let changed = false;

    for (const name of sanitizeNames(found)) {
        if (seen.has(name)) continue;
        seen.add(name);
        list.push(name);
        changed = true;
    }

    return { list, changed };
}

/**
 * orderNames(names, order) — sort `names` by the user's `order`.
 *
 * A name listed in `order` sorts by its position there. A name that is not
 * listed (a form the user has never reordered, or one CDD added since) keeps
 * its incoming relative position and sorts AFTER every ordered name. Pure.
 */
export function orderNames(names, order) {
    const clean = sanitizeNames(names);
    const rank = new Map(sanitizeNames(order).map((name, i) => [name, i]));

    return clean
        .map((name, i) => ({ name, i }))
        .sort((a, b) => {
            const ra = rank.has(a.name) ? rank.get(a.name) : Infinity;
            const rb = rank.has(b.name) ? rank.get(b.name) : Infinity;
            if (ra !== rb) return ra - rb;
            return a.i - b.i; // stable: keep CDD's order among unranked names
        })
        .map((entry) => entry.name);
}

/**
 * resolveDefaultName(settings, vaultId) — which form should be preselected?
 *
 * Returns a name, or null when the extension should keep its hands off (mode
 * "off", nothing remembered yet, or no form pinned). Pure.
 */
export function resolveDefaultName(settings, vaultId) {
    const mode = sanitizeMode(settings?.mode);

    if (mode === "off") return null;

    if (mode === "fixed") {
        const pinned = settings?.fixedName;
        return typeof pinned === "string" && pinned.trim() ? pinned.trim() : null;
    }

    const remembered = settings?.lastUsed?.[vaultId];
    return typeof remembered === "string" && remembered.trim()
        ? remembered.trim()
        : null;
}

// The vault a CDD url belongs to, e.g. "/vaults/1000000109/molecules/new".
// Returns null off a vault page. Pure.
export function extractVaultId(pathname) {
    const match = /^\/vaults\/(\d+)(?:\/|$)/.exec(pathname || "");
    return match ? match[1] : null;
}

/* ------------------------------------------------------------------ *
 * Storage access (async) — used by the content script and the options page
 * ------------------------------------------------------------------ */

export async function getRegistrationFormSettings() {
    try {
        const stored = await chrome.storage.local.get([
            REG_FORM_NAMES_KEY,
            REG_FORM_ORDER_KEY,
            REG_FORM_MODE_KEY,
            REG_FORM_FIXED_KEY,
            REG_FORM_LAST_USED_KEY,
        ]);

        const lastUsedRaw = stored?.[REG_FORM_LAST_USED_KEY];
        const lastUsed = {};
        if (lastUsedRaw && typeof lastUsedRaw === "object") {
            for (const [vaultId, name] of Object.entries(lastUsedRaw)) {
                if (typeof name === "string" && name.trim()) {
                    lastUsed[vaultId] = name.trim();
                }
            }
        }

        const fixedName = stored?.[REG_FORM_FIXED_KEY];

        return {
            names: sanitizeNames(stored?.[REG_FORM_NAMES_KEY]),
            order: sanitizeNames(stored?.[REG_FORM_ORDER_KEY]),
            mode: sanitizeMode(stored?.[REG_FORM_MODE_KEY]),
            fixedName: typeof fixedName === "string" ? fixedName.trim() : "",
            lastUsed,
        };
    } catch {
        return { names: [], order: [], mode: DEFAULT_REG_FORM_MODE, fixedName: "", lastUsed: {} };
    }
}

export async function saveRegistrationFormNames(names) {
    await chrome.storage.local.set({ [REG_FORM_NAMES_KEY]: sanitizeNames(names) });
}

export async function saveRegistrationFormOrder(order) {
    await chrome.storage.local.set({ [REG_FORM_ORDER_KEY]: sanitizeNames(order) });
}

export async function saveRegistrationFormMode(mode) {
    await chrome.storage.local.set({ [REG_FORM_MODE_KEY]: sanitizeMode(mode) });
}

export async function saveRegistrationFormFixedName(name) {
    await chrome.storage.local.set({
        [REG_FORM_FIXED_KEY]: typeof name === "string" ? name.trim() : "",
    });
}

// Record `name` as the last form used in `vaultId`, leaving every other vault's
// memory alone.
export async function saveRegistrationFormLastUsed(vaultId, name) {
    if (!vaultId || typeof name !== "string" || !name.trim()) return;

    const { lastUsed } = await getRegistrationFormSettings();

    await chrome.storage.local.set({
        [REG_FORM_LAST_USED_KEY]: { ...lastUsed, [vaultId]: name.trim() },
    });
}

export async function clearRegistrationFormLastUsed(vaultId) {
    const { lastUsed } = await getRegistrationFormSettings();

    if (vaultId) delete lastUsed[vaultId];

    await chrome.storage.local.set({
        [REG_FORM_LAST_USED_KEY]: vaultId ? lastUsed : {},
    });
}
