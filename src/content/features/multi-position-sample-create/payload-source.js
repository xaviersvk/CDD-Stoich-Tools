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

// Find any <form> on the page whose FormData carries inventory_sample[...] keys.
function findInventorySampleForm() {
    for (const form of document.querySelectorAll("form")) {
        try {
            if (hasInventorySampleKeys(new FormData(form))) return form;
        } catch {
            /* ignore unreadable form */
        }
    }
    return null;
}

// `root` is optional (e.g. the Create Sample dialog) to scope the form search;
// falls back to a document-wide search, then to the captured request.
export function resolvePayloadSource(root) {
    // 1) FormData(form): a form in/around `root`, else anywhere on the page.
    const form =
        root?.closest?.("form") ||
        root?.querySelector?.("form") ||
        findInventorySampleForm();
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
