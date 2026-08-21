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
// PRODUCTS are covered too, and used not to be ("display-only in v1"). The
// ELN-id-to-batch button on a product card has to know whether that batch's
// Internal ID is already set, and this pass is what knows. The visible side
// effect is that product cards now show the batch fields they never showed.
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
import { readBatchProps, vaultIdFromUrl } from "../api/batch-registration-props.js";

// moleculeId → Promise<{ doc, vaultId }>. Promise-cached so concurrent
// payloads for the same molecule share one request; failures are evicted so
// a later payload can retry.
const moleculePageCache = new Map();

function getVaultId() {
    return location.pathname.match(/\/vaults\/(\d+)/)?.[1] || null;
}

function fetchMoleculePage(vaultId, moleculeId) {
    const cached = moleculePageCache.get(moleculeId);
    if (cached) return cached;

    const promise = (async () => {
        const response = await fetch(`/vaults/${vaultId}/molecules/${moleculeId}`, {
            credentials: "include",
            headers: { Accept: "text/html" },
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const html = await response.text();

        return {
            doc: new DOMParser().parseFromString(html, "text/html"),
            // The molecule's HOME vault, which is not always the one we asked
            // in: the server redirects (ELN vault 6884 -> registration vault
            // 6885) and fetch follows it. Anything that later builds a URL for
            // this batch must use this, not location.pathname.
            vaultId: vaultIdFromUrl(response.url) || vaultId,
        };
    })();

    promise.catch(() => {
        if (moleculePageCache.get(moleculeId) === promise) {
            moleculePageCache.delete(moleculeId);
        }
    });

    moleculePageCache.set(moleculeId, promise);
    return promise;
}

function applyBatchFields(sample, fieldMap, vaultId) {
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

    // The RAW map, kept beside the resolved fields. resolveBatchFields knows a
    // fixed set of names; the ELN-id-to-batch button has to look up a label the
    // USER configured, which may be none of them.
    sample.batchFieldMap = { ...fieldMap };
    sample.batchVaultId = vaultId;

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
            let page;
            try {
                page = await fetchMoleculePage(vaultId, moleculeId);
            } catch {
                return false;
            }

            let changed = false;
            for (const sample of targets) {
                const props = readBatchProps(page.doc, sample.batchId);

                if (props) {
                    applyBatchFields(sample, props.fieldMap, page.vaultId);
                } else {
                    // The molecule page loaded but carries no renderer for
                    // this batch — enrichment is still COMPLETE: we now know
                    // the batch has no density, which density-memory's capture
                    // gate needs to trust user-typed values.
                    sample.batchFieldMap = {};
                    sample.batchVaultId = page.vaultId;
                    sample.batchFieldsEnriched = true;
                }
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
