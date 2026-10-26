// content/features/ui-fixes/sample-single-batch.js
//
// "Create a New Sample" with only one batch to choose from: choose it. The
// dialog opens with Batch empty even when the molecule has a single batch,
// and that pick is always the same click.
//
// Page DOM (CDD, verified 2026-10-26 on a molecule's Samples tab):
//   [id="sample.batch_id"]          MUI Select (div[role=combobox])
//   input[name="sample.batch_id"]   its hidden native input; "" while empty
//   menu, once opened               [role=listbox] in a portal: a blank
//                                   placeholder option (data-value " ") plus
//                                   one option per batch (data-value = id)
//
// The options exist only while the menu is open, so the menu is opened once
// with its popover hidden, read, and either the single batch is clicked or
// the menu is closed again. Each select is tried once; a batch the user has
// already picked, or a dialog "Duplicate sample" is filling, is left alone.

import { mouseClick, watchDocument } from "../../utils/dom.js";

const SELECT_SELECTOR = '[id="sample.batch_id"][role="combobox"]';
const PROBE_CLASS = "cdd-single-batch-probe";
const STYLE_ID = "cdd-single-batch-style";
// Let the dialog settle, and let sample-duplicate.js claim it first.
const SETTLE_MS = 400;
const POLL_MS = 50;
const POLL_ATTEMPTS = 20;

const tried = new WeakSet();
let probing = false;

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(probe) {
    for (let i = 0; i < POLL_ATTEMPTS; i += 1) {
        const result = probe();
        if (result) return result;
        await wait(POLL_MS);
    }
    return null;
}

function isEmpty(select) {
    const input = select.parentElement?.querySelector('input[name="sample.batch_id"]');
    return !!input && input.value.trim() === "";
}

function openListbox() {
    return Array.from(document.querySelectorAll('[role="listbox"]')).pop() || null;
}

function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    // The menu is opened only to be read; nobody needs to see it flash.
    style.textContent = `body.${PROBE_CLASS} .MuiMenu-root { visibility: hidden !important; }`;
    document.head.appendChild(style);
}

async function pickSingleBatch(select) {
    await wait(SETTLE_MS);
    if (probing || !select.isConnected || !isEmpty(select)) return;
    if (select.closest("[data-cdd-sample-duplicate]") || openListbox()) return;
    if (select.getAttribute("aria-disabled") === "true") return;

    probing = true;
    document.body.classList.add(PROBE_CLASS);
    try {
        select.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
        const listbox = await waitFor(openListbox);
        if (!listbox) return;

        const batches = Array.from(listbox.querySelectorAll('[role="option"]')).filter(
            (o) => (o.getAttribute("data-value") || "").trim() !== "" && o.getAttribute("aria-disabled") !== "true"
        );
        if (batches.length === 1) {
            mouseClick(batches[0]);
        } else {
            listbox.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        }
        await waitFor(() => !openListbox());
    } catch (err) {
        console.debug("[CDD Stoich Tools] single batch pick failed", err);
    } finally {
        document.body.classList.remove(PROBE_CLASS);
        probing = false;
    }
}

function check() {
    for (const select of document.querySelectorAll(SELECT_SELECTOR)) {
        if (tried.has(select) || !isEmpty(select)) continue;
        tried.add(select);
        void pickSingleBatch(select);
    }
}

export function initSampleSingleBatch() {
    ensureStyle();
    watchDocument(check);
    check();
}
