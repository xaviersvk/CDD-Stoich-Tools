// content/features/eln-id-to-batch-write.js
//
// Writing one batch field from the ELN page, without opening a tab and
// without the user pressing Save.
//
// WHY AN IFRAME
//
// The endpoint is PUT /vaults/<vault>/specified_batches/<batchId>, and it
// takes the batch's WHOLE field set: a body we assemble decides the fate of
// all thirty fields, not just the one we want. Pick lists, dates, batch links
// and file fields are exactly where such a reconstruction goes wrong, and the
// damage would be to a record, silently.
//
// The molecule page's react_props do carry every current value — but their
// `field_name_prefix` says `molecule[batch][...]`, which is the ADD A BATCH
// form's prefix, not the edit form's `specified_batch[...]`. Anyone building
// the body from the props builds the wrong body.
//
// So the body is never built. `X-Frame-Options: SAMEORIGIN` and
// `frame-ancestors app.collaborativedrug.com` let the ELN page frame the
// molecule page; CDD renders its own form with its own values and its own
// CSRF token, we change one input, and post that form's own FormData to that
// form's own action. Every byte except the ELN ID is CDD's.
//
// Note that `/specified_batches/<id>/edit` is NOT a way in: it server-side
// redirects to the molecule page and returns no editable form at all. The
// form is built by React on the `#molecule-batches` tab.

import {
    readBatchProps,
    findDefId,
    readFieldByLabel,
} from "../api/batch-registration-props.js";
import { batchFieldControlId, moleculeBatchesUrl } from "../../shared/eln-id-to-batch.js";

// The batches tab renders client-side; a cold frame needs a moment, and a
// slow vault needs more. Ten seconds, then give up and say so — a hung
// iframe is a second CDD session running inside the page.
const RENDER_TIMEOUT_MS = 10000;
const POLL_MS = 150;

function makeFrame(src) {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    // Off-screen rather than display:none — a zero-sized or undisplayed frame
    // can leave a layout-dependent React tree unrendered, and we need it to
    // render.
    frame.style.cssText =
        "position:fixed;left:-9999px;top:0;width:1024px;height:768px;border:0;visibility:hidden;";
    frame.src = src;
    document.body.appendChild(frame);
    return frame;
}

function waitFor(check, timeoutMs) {
    return new Promise((resolve) => {
        const started = Date.now();

        const tick = () => {
            let value = null;
            try {
                value = check();
            } catch {
                // Access throws while the frame is between documents. Keep
                // polling; the deadline is the real limit.
                value = null;
            }

            if (value) return resolve(value);
            if (Date.now() - started >= timeoutMs) return resolve(null);
            window.setTimeout(tick, POLL_MS);
        };

        tick();
    });
}

// The batches tab sometimes lands read-only. Its Edit control is an ordinary
// anchor, so a click inside OUR OWN frame is enough to open the form.
function nudgeIntoEditMode(doc, batchId) {
    const link = doc.querySelector(`a[href$="/specified_batches/${batchId}/edit"]`);
    if (link) link.click();
}

export async function writeElnIdToBatch({
    vaultId,
    moleculeId,
    batchId,
    fieldLabel,
    value,
}) {
    if (!vaultId || !moleculeId || !batchId) {
        return { ok: false, reason: "missing batch identifiers" };
    }

    const wanted = String(value ?? "").trim();
    if (!wanted) return { ok: false, reason: "no ELN ID to write" };

    const frame = makeFrame(moleculeBatchesUrl(vaultId, moleculeId));

    try {
        const doc = await waitFor(
            () =>
                frame.contentDocument?.readyState === "complete"
                    ? frame.contentDocument
                    : null,
            RENDER_TIMEOUT_MS
        );
        if (!doc) return { ok: false, reason: "the batch page did not load" };

        // The definition id comes from the page we are about to write to, not
        // from the panel's cache: the label is per-vault configuration and the
        // id behind it differs between vaults.
        const props = readBatchProps(doc, batchId);
        if (!props) return { ok: false, reason: "no batch record on that page" };

        const defId = findDefId(props.defs, fieldLabel);
        if (!defId) {
            return { ok: false, reason: `this vault has no “${fieldLabel}” field` };
        }

        // Last read before the write. The panel's copy may be minutes old.
        if (readFieldByLabel(props.fieldMap, fieldLabel)) {
            return { ok: false, reason: `${fieldLabel} is already set` };
        }

        const controlId = batchFieldControlId(batchId, defId);

        let input = await waitFor(() => doc.getElementById(controlId), 2000);
        if (!input) {
            nudgeIntoEditMode(doc, batchId);
            input = await waitFor(() => doc.getElementById(controlId), RENDER_TIMEOUT_MS);
        }
        if (!input) return { ok: false, reason: "the edit form never appeared" };

        // Never by label, never by name: on this page both also match the
        // "Add a batch" form, and filling THAT one creates a batch.
        const form = input.closest("form");
        if (!form) return { ok: false, reason: "the field is not inside a form" };

        // A third look at the same question, against the live control this
        // time. The first read can be stale, the second closes the window,
        // this one catches a re-render between them.
        if (String(input.value ?? "").trim()) {
            return { ok: false, reason: `${fieldLabel} is already set` };
        }

        input.value = wanted;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));

        // form.action, not a URL of ours; new FormData(form), not a body of
        // ours. `_method=put` and `authenticity_token` are the form's own
        // fields and ride along for free.
        const response = await fetch(form.action, {
            method: "POST",
            credentials: "include",
            body: new FormData(form),
        });

        if (!response.ok) {
            return { ok: false, reason: `CDD refused it (HTTP ${response.status})` };
        }

        return { ok: true };
    } catch (err) {
        return { ok: false, reason: err?.message || "the write failed" };
    } finally {
        frame.remove();
    }
}
