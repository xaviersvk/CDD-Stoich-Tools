// content/features/multi-position-sample-create/init.js
//
// Production batch sample creation — the first consumer of the Box Selection
// Framework. ONE dialog, ONE click, N samples.
//
// Two INDEPENDENT lifecycles bridged by the persistent selection-store:
//
//   A) Pick Location dialog (transient): the box grid lives here. We attach a
//      SelectionContext for multi-select and mirror the selected positions into
//      the store. No buttons here — this dialog comes and goes.
//
//   B) Create a New Sample dialog (persistent across the picker opening/closing):
//      we insert an action bar (counter + "Create N Samples" + Clear) into its
//      footer. It reads the store, so the selection SURVIVES the picker closing.
//
// The production flow when "Create N Samples" is clicked (no preliminary save,
// no manual capture, no confirm dialog — the explicit click IS the consent):
//
//   1. Arm the response waiter, then click CDD's native Save EXACTLY once.
//   2. CDD creates the first sample natively; the inject hook captures its
//      request (the replay template) and taps its response.
//   3. HARD GATE: replay nothing unless that native first save succeeded.
//   4. Derive the native position from the captured payload; replay the
//      remaining selected positions sequentially (location swapped, box kept).
//   5. Show per-position results in a floating panel (the native Save closed the
//      dialog, so results can't live in the action bar). Retry only failures.
//
// Boundaries: CDD's native Save is untouched outside batch mode; the only
// payload mutation is via shared/cdd-form-data.js (position only, box id kept).

import { observeBoxGrids } from "../box-selection/init.js";
import { attachBoxSelection } from "../box-selection/overlay.js";
import { isBoxGrid } from "../box-selection/box-grid.js";
import { injectMultiPositionStyles } from "./styles.js";
import * as store from "./selection-store.js";
import { getCapturedCreate } from "./capture-store.js";
import { armResponseWaiter, waitForNextResponse } from "./response-store.js";
import {
    findLocationField,
    withReplacedPosition,
    formDataFromEntries,
} from "../../../shared/cdd-form-data.js";
import { createInventorySample } from "../../api/inventory-samples.js";
import { createResultsPanel } from "./results-panel.js";

const LOG = "[CDD multi-position]";
const DEBUG = true; // verbose tracing ON for testing; flip off for production
const DIALOG_FLAG = "cddMpBar";
const SELECTION_CONTEXT_PROP = "__cddSelectionContext"; // set by overlay.js
const RESPONSE_TIMEOUT_MS = 30000;

let batchRunning = false; // single-flight guard for the whole batch

function dbg(...args) {
    if (DEBUG) console.log(LOG, ...args);
}

/* --------------------------- dialog detectors --------------------------- */

function headings() {
    return [...document.querySelectorAll("h1,h2,h3,.MuiDialogTitle-root")]
        .map((h) => (h.textContent || "").trim())
        .filter(Boolean);
}

function isCreateSampleDialogOpen() {
    return headings().some((t) => /create a new sample/i.test(t));
}

function isPickLocationDialogOpen() {
    return headings().some((t) => /pick location|location/i.test(t));
}

function findCreateDialogRoot() {
    const h = [...document.querySelectorAll("h1,h2,h3,.MuiDialogTitle-root")].find((e) =>
        /create a new sample/i.test(e.textContent || "")
    );
    if (!h) return null;
    return (
        h.closest('[role="dialog"], .MuiDialog-paper, .MuiPaper-root, .MuiDialog-root') ||
        h.parentElement
    );
}

// Find CDD's own primary submit ("Save") button in the dialog actions, never our
// own buttons and never Cancel/Close. Prefer an exact "Save", then other commit
// verbs as a fallback in case CDD relabels it.
function findNativeSaveButton(dialog) {
    const scope = dialog.querySelector(".MuiDialogActions-root") || dialog;
    const text = (b) => (b.textContent || "").trim();
    const buttons = [...scope.querySelectorAll("button")].filter(
        (b) => !b.className.includes("cdd-mp-") && !b.disabled
    );
    const candidates = buttons.filter((b) => !/\b(cancel|close|back|discard)\b/i.test(text(b)));
    return (
        candidates.find((b) => /^save$/i.test(text(b))) ||
        candidates.find((b) => /\bsave\b/i.test(text(b))) ||
        candidates.find((b) => /\b(create|add|submit|ok|done|apply)\b/i.test(text(b))) ||
        null
    );
}

/* ------------------------------- entry ------------------------------- */

export function initMultiPositionSampleCreate() {
    injectMultiPositionStyles();
    installDebugHelpers();
    watchPickerGrids();
    watchCreateDialog();
}

/* ---------------- lifecycle A: picker grid -> store ---------------- */

function watchPickerGrids() {
    observeBoxGrids((grid) => {
        // MUI portals render the picker grid at <body> level, so it has no
        // [role="dialog"] ancestor. Gate on observable facts instead: the Create
        // dialog is open, or a LocationPicker ancestor/peer exists.
        const createOpen = isCreateSampleDialogOpen();
        const pickerLike =
            !!grid.closest('.LocationBoxPicker, [class*="LocationBoxPicker"], [class*="LocationPicker"]') ||
            !!document.querySelector('[class*="LocationPickerDialog"], [class*="LocationBoxPicker"], [class*="LocationPicker"]');
        if (!createOpen && !pickerLike) return;

        const ctx = attachBoxSelection(grid, { showCounter: false });
        if (!ctx) return;

        // Restore any previous selection so reopening the picker shows it.
        const prev = store.getPositions();
        if (prev.length) {
            try {
                ctx._model.replaceSelection(prev);
            } catch {
                /* escape hatch; ignore if unavailable */
            }
        }
        store.setBoxId(ctx.boxId);

        // Mirror picker selection into the persistent store on every change.
        ctx.onChange((c) => {
            store.setBoxId(c.boxId);
            store.setPositions(c.selectedPositions);
        });
        dbg("picker grid attached; selection mirrored to store");
    });
}

/* ---------------- lifecycle B: create dialog -> action bar ---------------- */

function watchCreateDialog() {
    let scheduled = false;

    function scan() {
        scheduled = false;
        if (!isCreateSampleDialogOpen()) return;

        const dialog = findCreateDialogRoot();
        if (!dialog) return;
        if (dialog.dataset[DIALOG_FLAG] === "1") return;
        dialog.dataset[DIALOG_FLAG] = "1";

        insertActionBar(dialog);
    }

    function schedule() {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(scan);
    }

    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    schedule();
}

function insertActionBar(dialog) {
    const panel = document.createElement("div");
    panel.className = "cdd-mp-panel";

    // Row 1: selection counter (label)
    const counter = document.createElement("span");
    counter.className = "cdd-mp-count";

    // Row 2: [Clear] ··· [Create N Samples]
    const actionsRow = document.createElement("div");
    actionsRow.className = "cdd-mp-actions";

    const clearBtn = makeButton("Clear", "cdd-mp-clear");
    clearBtn.addEventListener("click", () => store.clear());

    const createBtn = makeButton("Create Samples", "cdd-mp-btn");
    actionsRow.append(clearBtn, createBtn);

    // Error/status line — hidden unless needed (e.g. native Save not found)
    const result = document.createElement("div");
    result.className = "cdd-mp-result";

    panel.append(counter, actionsRow, result);

    const actions = dialog.querySelector(".MuiDialogActions-root");
    if (actions) actions.insertAdjacentElement("beforebegin", panel);
    else dialog.appendChild(panel);

    const bar = { panel, createBtn, clearBtn, result };

    function refresh() {
        const { count } = store.getState();
        counter.textContent =
            count === 1 ? "1 position selected" : `${count} positions selected`;
        createBtn.textContent = count === 1 ? "Create 1 Sample" : `Create ${count} Samples`;
        if (createBtn.dataset.busy !== "1") createBtn.disabled = count < 1 || batchRunning;
    }

    store.onChange(refresh);
    refresh();

    createBtn.addEventListener("click", () => runCreateN(dialog, bar));
}

/* --------------------------- the batch orchestrator --------------------------- */

async function runCreateN(dialog, bar) {
    if (batchRunning) return;

    const positions = store.getPositions();
    if (positions.length < 1) return;

    const saveBtn = findNativeSaveButton(dialog);
    if (!saveBtn) {
        setResult(bar.result, "Couldn't find CDD's native Save button — aborting.", true);
        return;
    }

    // Lock the bar (the dialog itself unmounts the moment Save succeeds).
    batchRunning = true;
    bar.createBtn.dataset.busy = "1";
    bar.createBtn.disabled = true;
    bar.clearBtn.disabled = true;
    setResult(bar.result, "Creating…", false);

    const panel = createResultsPanel(positions.length);
    panel.setBusy(true);
    panel.setStatus("Creating the first sample via CDD…");

    dbg("runCreateN: start", { positions, boxId: store.getBoxId(), saveBtn: (saveBtn.textContent || "").trim() });

    // Arm BEFORE clicking so the native response can't be missed.
    armResponseWaiter();
    const respPromise = waitForNextResponse(RESPONSE_TIMEOUT_MS);

    // Trigger exactly one native save.
    dbg("clicking native Save once");
    try {
        saveBtn.click();
    } catch (err) {
        panel.setStatus("Couldn't trigger CDD's Save button — nothing was created.");
        panel.setError(String(err?.message || err));
        panel.setBusy(false);
        finishBatch(bar);
        return;
    }

    const resp = await respPromise;
    dbg("native response", { ok: resp?.ok, status: resp?.status, timedOut: resp?.timedOut, correlationId: resp?.correlationId });

    // HARD SAFETY GATE: never replay unless the native first save succeeded.
    if (!resp || !resp.ok) {
        const detail = resp?.timedOut
            ? resp.errorText
            : resp?.networkError
                ? `Network error: ${resp.bodyText || "request failed"}.`
                : `CDD returned HTTP ${resp?.status || 0}.`;
        panel.setStatus("First sample was NOT created — nothing else was sent.");
        panel.setError(`${detail} Fix the form and try again.`);
        panel.setBusy(false);
        finishBatch(bar);
        return;
    }

    // Native first save succeeded — pull the captured request as the template.
    const cap = getCapturedCreate();
    if (resp.correlationId != null && cap?.correlationId != null && resp.correlationId !== cap.correlationId) {
        dbg("warning: response/capture correlationId mismatch", resp.correlationId, cap?.correlationId);
    }

    const template = buildTemplateFormData(cap);
    if (!template) {
        panel.setStatus("First sample created, but its request wasn't captured — cannot replay.");
        panel.setError("No usable payload template. The remaining positions were not created.");
        panel.setBusy(false);
        store.clear();
        finishBatch(bar);
        return;
    }

    const loc = findLocationField(template);
    const nativePosition = loc?.position ?? null;

    // Record the native first sample as the first result row.
    panel.addRow({ position: nativePosition ?? "?", ok: true, label: parseCreatedLabel(resp) });

    // If we can't read the native location from the captured payload, we can't
    // tell which selected position CDD just created — replaying would risk an
    // extra record (and every replay would fail to find the field anyway). Stop.
    if (nativePosition == null) {
        panel.setStatus("First sample created. Remaining positions skipped.");
        panel.setError("Couldn't read the location field from CDD's captured request, so the rest were not created.");
        panel.setBusy(false);
        store.clear();
        finishBatch(bar);
        return;
    }

    // File/Blob fields can't be faithfully replayed — stop after the native one.
    if (cap?.body?.kind === "formdata" && cap.body.hadNonString) {
        panel.setStatus("First sample created. Remaining positions skipped.");
        panel.setError("The request carries file/blob fields that can't be replayed safely.");
        panel.setBusy(false);
        store.clear();
        finishBatch(bar);
        return;
    }

    // Replay every selected position EXCEPT the one CDD just created natively.
    // (If the native position somehow wasn't in the selection, nothing is
    // dropped — we still create exactly the selected set.)
    const replayPositions = positions.filter((p) => String(p) !== String(nativePosition));
    panel.setTotal(1 + replayPositions.length);
    dbg("native created", { nativePosition, replayPositions, url: cap.url });

    const url = cap.url;
    const failed = await replaySequential(replayPositions, template, url, panel);

    const okCount = 1 + replayPositions.length - failed.length;
    panel.setBusy(false);
    if (failed.length === 0) {
        panel.setStatus(`Done. ${okCount} sample${okCount === 1 ? "" : "s"} created. Refreshing page…`);
        schedulePageRefresh(1500);
    } else {
        panel.setStatus(`Done. ${okCount} created, ${failed.length} failed.`);
        wireRetry(panel, failed, template, url);
    }

    // Selection is consumed — clear so a reopened dialog can't re-create it.
    store.clear();
    finishBatch(bar);
}

// Replay a list of positions sequentially. Returns the positions that failed.
async function replaySequential(positions, template, url, panel) {
    const failed = [];
    for (const pos of positions) {
        panel.setStatus(`Creating sample at position ${pos}…`);

        let built;
        try {
            built = withReplacedPosition(template, pos);
        } catch (err) {
            panel.addRow({ position: pos, ok: false, label: `payload error: ${err.message}` });
            failed.push(pos);
            continue;
        }

        let res;
        try {
            res = await createInventorySample(url, built.formData);
        } catch (err) {
            panel.addRow({ position: pos, ok: false, label: `error: ${err.message}` });
            failed.push(pos);
            continue;
        }

        if (res.ok) {
            const label =
                res.sampleIdentifier || (res.sampleId != null ? `id ${res.sampleId}` : "created");
            panel.addRow({ position: pos, ok: true, label });
        } else {
            panel.addRow({
                position: pos,
                ok: false,
                label: `HTTP ${res.status}: ${truncate(res.errorText, 120)}`,
            });
            failed.push(pos);
        }
    }
    return failed;
}

// Wire (and re-wire after each retry) the "Retry failed (N)" button.
function wireRetry(panel, failed, template, url) {
    if (!failed.length) return;
    panel.showRetry(failed.length, async () => {
        panel.hideRetry();
        panel.setBusy(true);
        panel.setStatus(`Retrying ${failed.length} failed position${failed.length === 1 ? "" : "s"}…`);
        const stillFailed = await replaySequential(failed, template, url, panel);
        const recovered = failed.length - stillFailed.length;
        panel.setBusy(false);
        panel.setStatus(
            stillFailed.length === 0
                ? `Retry complete — ${recovered} created. All positions done.`
                : `Retry — ${recovered} created, ${stillFailed.length} still failing.`
        );
        wireRetry(panel, stillFailed, template, url);
    });
}

function finishBatch(bar) {
    batchRunning = false;
    // The dialog (and this bar) is usually gone after a successful Save; these
    // writes are harmless no-ops in that case, and restore the bar otherwise.
    if (bar?.createBtn) {
        bar.createBtn.dataset.busy = "0";
        bar.createBtn.disabled = store.getPositions().length < 1;
    }
    if (bar?.clearBtn) bar.clearBtn.disabled = false;
    setResult(bar?.result, "", false);
}

/* ------------------------------ payload helpers ------------------------------ */

// Rebuild a replayable FormData from the captured request record, or null if the
// body kind can't be faithfully mutated/replayed.
function buildTemplateFormData(cap) {
    const kind = cap?.body?.kind;
    if (kind === "formdata") return formDataFromEntries(cap.body.entries);
    if (kind === "urlencoded") {
        const fd = new FormData();
        for (const [k, v] of new URLSearchParams(cap.body.text)) fd.append(k, v);
        return fd;
    }
    return null; // raw string / unknown — cannot reliably swap the location field
}

// Best-effort human label for the natively-created sample from its response body.
function parseCreatedLabel(resp) {
    try {
        const j = JSON.parse(resp.bodyText || "");
        const id = j?.sample_identifier || (j?.id != null ? `id ${j.id}` : null);
        const locPos = j?.location?.position;
        return id ? `${id}${locPos != null ? ` @ ${locPos}` : ""} (native)` : "created (native)";
    } catch {
        return "created (native)";
    }
}

/* --------------------------- window debug helpers --------------------------- */

function installDebugHelpers() {
    if (typeof window === "undefined") return;
    window.__CDD_MULTI_POSITION_DEBUG__ = {
        getStore: () => store.getState(),
        getListenersCount: () => store.getListenerCount(),
        isBatchRunning: () => batchRunning,
        dumpDialogs: () => ({
            headings: headings(),
            createOpen: isCreateSampleDialogOpen(),
            pickLocationOpen: isPickLocationDialogOpen(),
            dialogs: [...document.querySelectorAll('[role="dialog"], .MuiDialog-root')].map((d) => ({
                title:
                    d.querySelector("h1,h2,h3,.MuiDialogTitle-root")?.textContent?.trim() ||
                    "(no title)",
                connected: d.isConnected,
                hasActionBar: !!d.querySelector(".cdd-mp-panel"),
            })),
        }),
        dumpSelectionContexts: () =>
            [...document.querySelectorAll(".positions")]
                .filter(isBoxGrid)
                .map((g, i) => {
                    const ctx = g[SELECTION_CONTEXT_PROP];
                    return {
                        index: i,
                        connected: g.isConnected,
                        hasContext: !!ctx,
                        selected: ctx ? ctx.selectedPositions : null,
                        boxId: ctx ? ctx.boxId : null,
                    };
                }),
    };
}

/* ------------------------------- helpers ------------------------------- */

function makeButton(label, className) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = className;
    btn.textContent = label;
    return btn;
}

function setResult(el, text, isError) {
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("cdd-mp-error", !!isError);
}

function truncate(s, max) {
    const str = String(s ?? "");
    return str.length > max ? `${str.slice(0, max)}…` : str;
}

// Navigate to the current URL using CDD's own Turbo router when available
// (avoids a full browser reload and keeps the Turbo session alive), or fall
// back to a hard reload. Called only on a fully successful batch so the user
// sees the new samples without a manual refresh.
function schedulePageRefresh(delayMs) {
    setTimeout(() => {
        try {
            if (typeof window.Turbo?.visit === "function") {
                window.Turbo.visit(location.href, { action: "replace" });
            } else {
                location.reload();
            }
        } catch {
            location.reload();
        }
    }, delayMs);
}
