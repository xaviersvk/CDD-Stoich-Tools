// content/features/multi-position-sample-create/payload-source.js
//
// Resolves the create-sample payload TEMPLATE + target URL, internal to the
// Batch Create feature. Order (per the contract):
//   1. `new FormData(form)` if a real form around the grid serialises
//      inventory_sample[...] keys  -> simplest, no interception, available
//      immediately (before any submit).
//   2. else the last CAPTURED create request (page-world snapshot) -> faithful
//      template for the React-built dialog; only available after one native
//      create has fired.
//
// Returns { source, formData, url, capturedAt?, hadNonString? } or null.
//
// No mutation here — callers clone + rewrite via shared/cdd-form-data.js. No
// network. This module is the only place that knows there are two sources; the
// rest of the feature just consumes a { formData, url }.

import {
    hasInventorySampleKeys,
    formDataFromEntries,
} from "../../../shared/cdd-form-data.js";
import { getCapturedCreate } from "./capture-store.js";

// Derive the create endpoint from a molecule page URL, as a last resort when a
// form has no usable action and no capture exists.
function deriveCreateUrl() {
    const m = location.pathname.match(/\/vaults\/\d+\/molecules\/\d+/);
    return m ? `${location.origin}${m[0]}/inventory_samples` : null;
}

export function resolvePayloadSource(grid) {
    // 1) FormData(form)
    const form = grid.closest("form");
    if (form) {
        try {
            const fd = new FormData(form);
            if (hasInventorySampleKeys(fd)) {
                const action =
                    form.getAttribute("action") || form.action || deriveCreateUrl();
                return { source: "FormData(form)", formData: fd, url: action };
            }
        } catch {
            /* fall through to capture */
        }
    }

    // 2) Captured request
    const cap = getCapturedCreate();
    if (cap?.body?.kind === "formdata") {
        return {
            source: "captured request (fetch/XHR)",
            formData: formDataFromEntries(cap.body.entries),
            url: cap.url,
            capturedAt: cap.capturedAt,
            hadNonString: !!cap.body.hadNonString,
        };
    }
    if (cap?.body?.kind === "urlencoded") {
        const fd = new FormData();
        for (const [k, v] of new URLSearchParams(cap.body.text)) fd.append(k, v);
        if (hasInventorySampleKeys(fd)) {
            return {
                source: "captured request (urlencoded)",
                formData: fd,
                url: cap.url,
                capturedAt: cap.capturedAt,
            };
        }
    }

    return null;
}
