// content/features/batch-field-enrichment.js
//
// Batch-only stoichiometry rows (a registered batch without an inventory
// sample) arrive from the inject parsers with identity fields but no batch
// metafields — CDD's eln_entry JSON simply doesn't carry them. This module
// fills the gap: it fetches the batch's molecule page (one GET per molecule,
// cached), reads the RegistrationFormRenderer react_props embedded in the
// HTML, joins batch_field_definitions (id → name) with the lot's data values,
// and merges the named field map (Purity [%], Density [g/mL], Vendor ID…)
// into the matching panel samples before re-rendering.
//
// The molecule page is fetched through the current vault's URL; the server
// redirects to the molecule's home vault (e.g. ELN vault 6884 → registration
// vault 6885) and fetch() follows it transparently.

import { STATE } from "../state.js";
import { renderFromState } from "./sample-panel.js";
import {
    resolveBatchFields,
    getFieldValueCaseInsensitive,
    collectCustomFields,
} from "../../inject/parsers/field-resolvers.js";

// moleculeId → Promise<Map<batchId, {fieldName: value}>>. Promise-cached so
// concurrent payloads for the same molecule share one request; failures are
// evicted so a later payload can retry.
const moleculeBatchFieldsCache = new Map();

function getVaultId() {
    return location.pathname.match(/\/vaults\/(\d+)/)?.[1] || null;
}

function parseMoleculeBatchFields(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const out = new Map();

    for (const el of doc.querySelectorAll('[component_class="RegistrationFormRenderer"]')) {
        let props;
        try {
            props = JSON.parse(el.getAttribute("react_props") || "");
        } catch {
            continue;
        }

        const batchId = Number(props?.object_id);
        const defs = Array.isArray(props?.batch_field_definitions)
            ? props.batch_field_definitions
            : [];
        const values = props?.data && typeof props.data === "object"
            ? Object.values(props.data)
            : [];

        if (!batchId || !defs.length || !values.length) continue;

        const nameById = new Map(defs.map((d) => [d?.id, d?.name]));
        const fieldMap = {};

        for (const entry of values) {
            const name = nameById.get(entry?.batch_field_definition_id);
            if (!name) continue;

            // Pick-list ids and file uploads have no readable value here.
            const value = entry?.text_value ?? entry?.float_value ?? entry?.date_value ?? null;
            if (value == null || value === "") continue;

            fieldMap[name] = value;
        }

        // The molecule-level renderer joins nothing (its data rows have no
        // batch_field_definition_id), so only real lots end up in the map.
        if (Object.keys(fieldMap).length) out.set(batchId, fieldMap);
    }

    return out;
}

function fetchMoleculeBatchFields(vaultId, moleculeId) {
    const cached = moleculeBatchFieldsCache.get(moleculeId);
    if (cached) return cached;

    const promise = (async () => {
        const response = await fetch(`/vaults/${vaultId}/molecules/${moleculeId}`, {
            credentials: "include",
            headers: { Accept: "text/html" },
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        return parseMoleculeBatchFields(await response.text());
    })();

    promise.catch(() => {
        if (moleculeBatchFieldsCache.get(moleculeId) === promise) {
            moleculeBatchFieldsCache.delete(moleculeId);
        }
    });

    moleculeBatchFieldsCache.set(moleculeId, promise);
    return promise;
}

function applyBatchFields(sample, fieldMap) {
    const resolved = resolveBatchFields({ batch_fields: fieldMap });

    if (sample.purity == null) sample.purity = resolved.purity;
    if (sample.density == null) sample.density = resolved.density;
    if (sample.internalID == null) sample.internalID = resolved.internalID;

    if (sample.vendorId == null) {
        sample.vendorId = getFieldValueCaseInsensitive(fieldMap, [
            "Vendor ID",
            "*Vendor ID",
            "Vendor Id",
            "Supplier ID",
        ]);
    }

    sample.customBatchFields = {
        ...collectCustomFields(fieldMap),
        ...(sample.customBatchFields || {}),
    };

    sample.batchFieldsEnriched = true;
}

// Called after every SAMPLE_DATA payload lands in STATE. Safe to call often:
// already-enriched samples and cached molecules cost nothing.
export function enrichBatchOnlySamples() {
    const samples = STATE.lastPayload?.samples;
    if (!Array.isArray(samples) || !samples.length) return;

    const vaultId = getVaultId();
    if (!vaultId) return;

    const targetsByMolecule = new Map();

    for (const sample of samples) {
        if (sample?.hasSample !== false) continue;
        if (sample.batchFieldsEnriched) continue;
        if (!sample.batchId || !sample.moleculeId) continue;

        const list = targetsByMolecule.get(sample.moleculeId) || [];
        list.push(sample);
        targetsByMolecule.set(sample.moleculeId, list);
    }

    if (!targetsByMolecule.size) return;

    const payloadAtStart = STATE.lastPayload;

    Promise.all(
        Array.from(targetsByMolecule, async ([moleculeId, targets]) => {
            let fieldsByBatch;
            try {
                fieldsByBatch = await fetchMoleculeBatchFields(vaultId, moleculeId);
            } catch {
                return false;
            }

            let changed = false;
            for (const sample of targets) {
                const fieldMap = fieldsByBatch.get(Number(sample.batchId));
                if (!fieldMap) continue;

                applyBatchFields(sample, fieldMap);
                changed = true;
            }
            return changed;
        })
    ).then((results) => {
        // Re-render only if the enriched payload is still the one on screen.
        if (results.some(Boolean) && STATE.lastPayload === payloadAtStart) {
            renderFromState();
        }
    });
}
