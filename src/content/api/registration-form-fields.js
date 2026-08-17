// content/api/registration-form-fields.js
//
// Harvests "which fields does each registration form use?" out of CDD and keeps
// it cached, so the field pickers can filter by form without a round trip.
//
// WHERE THE DATA IS
// -----------------
// CDD embeds the whole thing in the Create Entity page's DOM:
//
//   div[component_class="RegistrationFormRenderer"][react_props]
//
// `react_props` is a ~154 kB JSON string carrying
//   registration_form_definitions        11 forms, each with a nested layout
//                                        tree whose leaves hold a `fieldID`
//   molecule_field_definitions           id -> name, per object kind
//   batch_field_definitions
//   inventory_sample_field_definitions
//
// Walking each form's layout tree for `fieldID`s and joining against the
// definitions gives the map. There is no JSON API for this — the public
// /api/v1/vaults/{id}/fields wants an API token and 401s on a session cookie.
// Same scrape-the-props approach as batch-field-enrichment.js.
//
// TWO WAYS IN, BECAUSE THE PAGE IS EXPENSIVE
// ------------------------------------------
// /vaults/{id}/molecules/new is ~1 MB and takes the server ~10 s to render, so
// it must never sit on the critical path of opening a picker:
//
//   1. FREE — when the user is ON the Create Entity page anyway, harvest the
//      props straight out of the live DOM. No fetch, no wait. In practice this
//      is where the map comes from, because registering anything goes through
//      that page.
//   2. FETCH — only when nothing is cached. Runs in the background at page load
//      so the picker is already warm by the time it's opened.
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

// The element CDD renders the form definitions into. Matching on
// component_class (not the css class) is what batch-field-enrichment.js does —
// the css class is styling, the attribute is the contract.
const RENDERER_SELECTOR = '[component_class="RegistrationFormRenderer"]';

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

// Reduce one RegistrationFormRenderer's props to the few kB worth keeping.
// Returns null when the props aren't the ones we want (the molecule SHOW page
// renders this component per batch, without the form definitions).
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

// Pull the map out of a document (live or parsed). Several renderers can be
// present; take the first that carries the definitions.
export function harvestFromDocument(doc) {
    for (const el of doc.querySelectorAll(RENDERER_SELECTOR)) {
        const raw = el.getAttribute("react_props");
        if (!raw || !raw.includes("registration_form_definitions")) continue;

        let props;
        try {
            props = JSON.parse(raw);
        } catch {
            continue;
        }

        const reduced = reduceProps(props);
        if (reduced) return reduced;
    }
    return null;
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
    const response = await fetch(`/vaults/${vaultId}/molecules/new`, {
        credentials: "same-origin",
    });
    if (!response.ok) return null;

    const html = await response.text();
    return harvestFromDocument(new DOMParser().parseFromString(html, "text/html"));
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
 * Harvest from the page the user is already on. Called on the Create Entity
 * page, where the props are in the DOM for free — this is the cheap path that
 * keeps the cache warm without ever paying for the 10 s render.
 */
export function harvestFromLiveDom() {
    const vaultId = currentVaultId();
    if (!vaultId) return null;

    const vaultMap = harvestFromDocument(document);
    if (vaultMap) remember(vaultId, vaultMap);
    return vaultMap;
}

/**
 * Warm memory from what we already have — the remembered chip and any stored
 * map. Deliberately does NOT touch the network: the pickers are initialised on
 * every CDD page, and firing a 1 MB / ~10 s request on each one to serve a
 * dropdown nobody may open would be indefensible. The fetch is started when a
 * picker is actually opened (see form-filter-chips.js).
 */
export async function initRegistrationFormFields() {
    const vaultId = currentVaultId();
    if (!vaultId) return;

    const choice = await getFilterChoice(vaultId);
    if (choice) choices.set(vaultId, choice);

    // Free path first: on the Create Entity page the props are already in the
    // DOM, so the cache refreshes without fetching the page we're looking at.
    if (harvestFromLiveDom()) return;

    const stored = await getFieldMap(vaultId);
    if (isUsable(stored)) memory.set(vaultId, stored);
}
