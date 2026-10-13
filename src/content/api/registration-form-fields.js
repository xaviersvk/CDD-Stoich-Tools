// content/api/registration-form-fields.js
//
// Harvests "which fields does each registration form use?" out of CDD and keeps
// it cached, so the field pickers can filter by form without a round trip.
//
// WHERE THE DATA IS
// -----------------
// The definitions JSON CDD's own Create Entity form loads (see
// api/field-definitions.js), carrying
//   registration_form_definitions        the forms, each with a nested layout
//                                        tree whose leaves hold a `fieldID`
//   molecule_field_definitions           id -> name, per object kind
//   batch_field_definitions
//   inventory_sample_field_definitions
//
// Walking each form's layout tree for `fieldID`s and joining against the
// definitions gives the map. This JSON used to sit in the react_props of
// /vaults/{id}/molecules/new (~1 MB, ~10 s) and was scraped from there; CDD has
// since moved it out of the page, and the scrape found no forms.
//
// A stale map is served immediately and refreshed behind the user's back; only
// a completely missing one ever makes anybody wait.

import {
    buildLookup,
    extractVaultId,
    getFieldMap,
    getFilterChoice,
    isFresh,
    isUsable,
    saveFieldMap,
} from "../../shared/registration-form-fields.js";
import { forgetFieldDefinitions, loadFieldDefinitions } from "./field-definitions.js";

// props key holding the definitions for each column kind, and the key under
// `components` that lays that kind out. CDD calls the Entity object "molecule"
// internally, hence the rename.
const KINDS = [
    { kind: "entity", defs: "molecule_field_definitions", component: "molecule" },
    { kind: "batch", defs: "batch_field_definitions", component: "batch" },
    { kind: "sample", defs: "inventory_sample_field_definitions", component: "sample" },
];

// vaultId -> vaultMap. The pickers open from a synchronous mousedown handler and
// cannot await storage, so the map is mirrored in memory.
const memory = new Map();
// vaultId -> Promise, so concurrent callers share one fetch.
const inflight = new Map();
// vaultId -> form name the user last picked (mirrored for the same reason).
const choices = new Map();

/* --------------------------------------------------------------------------- */
/* Parsing                                                                     */
/* --------------------------------------------------------------------------- */

// Collect every `fieldID` in a layout tree. The nesting is arbitrary
// (sections -> contents -> contents -> cell), so recurse rather than assume a
// depth; cycles are impossible because this came out of JSON.parse.
function collectFieldIds(node, out) {
    if (!node || typeof node !== "object") return out;

    if (Array.isArray(node)) {
        for (const child of node) collectFieldIds(child, out);
        return out;
    }

    if (node.fieldID) out.add(node.fieldID);
    for (const value of Object.values(node)) collectFieldIds(value, out);
    return out;
}

// Reduce the definitions JSON to the few kB worth keeping. Returns null when it
// carries no forms.
export function reduceProps(props) {
    const definitions = props?.registration_form_definitions;
    if (!Array.isArray(definitions) || !definitions.length) return null;

    // id -> name, per kind, plus the flat "every field this vault defines" list
    // that tells built-ins apart from vault fields later on.
    const nameById = new Map();
    const known = {};

    for (const { kind, defs } of KINDS) {
        const list = Array.isArray(props?.[defs]) ? props[defs] : [];
        const names = [];
        for (const def of list) {
            if (!def?.id || typeof def.name !== "string") continue;
            nameById.set(def.id, { kind, name: def.name });
            names.push(def.name);
        }
        known[kind] = names;
    }

    const forms = {};
    for (const definition of definitions) {
        const name = typeof definition?.name === "string" ? definition.name.trim() : "";
        if (!name || !definition.components) continue;

        const entry = { entity: [], batch: [], sample: [] };

        for (const { kind, component } of KINDS) {
            const layout = definition.components[component];
            if (!layout) continue;

            for (const id of collectFieldIds(layout, new Set())) {
                const hit = nameById.get(id);
                // A form may reference a field of another kind through a shared
                // layout; trust the definition's kind, not the component it was
                // found under.
                if (hit && hit.kind === kind) entry[kind].push(hit.name);
            }
        }

        forms[name] = entry;
    }

    if (!Object.keys(forms).length) return null;
    return { fetchedAt: Date.now(), known, forms };
}

/* --------------------------------------------------------------------------- */
/* Cache                                                                       */
/* --------------------------------------------------------------------------- */

function currentVaultId() {
    return extractVaultId(location.pathname);
}

function remember(vaultId, vaultMap) {
    if (!vaultId || !isUsable(vaultMap)) return;
    memory.set(vaultId, vaultMap);
    saveFieldMap(vaultId, vaultMap);
}

async function fetchFieldMap(vaultId) {
    // A refresh is asked for because the map may be out of date; never answer
    // it from this page session's copy.
    forgetFieldDefinitions(vaultId);
    return reduceProps(await loadFieldDefinitions(vaultId));
}

// One fetch per vault at a time; the promise is dropped on settle so a failure
// can be retried by the next caller rather than being cached as "no map".
function refresh(vaultId) {
    if (inflight.has(vaultId)) return inflight.get(vaultId);

    const promise = fetchFieldMap(vaultId)
        .then((vaultMap) => {
            if (vaultMap) remember(vaultId, vaultMap);
            return vaultMap;
        })
        .catch(() => null)
        .finally(() => inflight.delete(vaultId));

    inflight.set(vaultId, promise);
    return promise;
}

/**
 * The map for this vault, or null. Serves memory, then storage, then the
 * network. A stale-but-usable map is returned straight away and refreshed in
 * the background — the caller never waits on a refresh.
 */
export async function ensureFieldMap(vaultId = currentVaultId()) {
    if (!vaultId) return null;

    const cached = memory.get(vaultId);
    if (cached) {
        if (!isFresh(cached, Date.now())) refresh(vaultId);
        return cached;
    }

    const stored = await getFieldMap(vaultId);
    if (isUsable(stored)) {
        memory.set(vaultId, stored);
        if (!isFresh(stored, Date.now())) refresh(vaultId);
        return stored;
    }

    return refresh(vaultId);
}

// Synchronous view of the cache, for the pickers' mousedown handlers. Null just
// means "no chips this time" — initRegistrationFormFields() has a load running.
export function getCachedFieldMap(vaultId = currentVaultId()) {
    return memory.get(vaultId) || null;
}

// True while the first load for this vault is still running, so a picker can say
// "loading" instead of silently showing no chips.
export function isFieldMapLoading(vaultId = currentVaultId()) {
    return inflight.has(vaultId);
}

/**
 * The lookup a picker filters with: the user's remembered chip resolved against
 * the cached map. Null means "show everything".
 */
export function getActiveLookup(vaultId = currentVaultId()) {
    return buildLookup(getCachedFieldMap(vaultId), choices.get(vaultId) || null);
}

export function getActiveFormName(vaultId = currentVaultId()) {
    return choices.get(vaultId) || null;
}

export function setActiveFormName(formName, vaultId = currentVaultId()) {
    if (!vaultId) return;
    if (formName) choices.set(vaultId, formName);
    else choices.delete(vaultId);
}

/**
 * Refresh this vault's map now. Called on the Create Entity page, where a form
 * the user just edited would otherwise wait out the stale-map timer.
 */
export function refreshFieldMap(vaultId = currentVaultId()) {
    return vaultId ? refresh(vaultId) : Promise.resolve(null);
}

/**
 * Warm memory from what we already have — the remembered chip and any stored
 * map. Deliberately does NOT touch the network: the pickers are initialised on
 * every CDD page, and fetching on each one to serve a dropdown nobody may open
 * would be wasted. The fetch is started when a picker is actually opened (see
 * form-filter-chips.js).
 */
export async function initRegistrationFormFields() {
    const vaultId = currentVaultId();
    if (!vaultId) return;

    const choice = await getFilterChoice(vaultId);
    if (choice) choices.set(vaultId, choice);

    const stored = await getFieldMap(vaultId);
    if (isUsable(stored)) memory.set(vaultId, stored);
}
