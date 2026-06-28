// content/features/multi-position-sample-create/init.js
//
// First consumer of the Box Selection Framework. Two INDEPENDENT lifecycles:
//
//   A) Pick Location dialog (transient): the box grid lives here. We attach the
//      SelectionContext for multi-select only, and mirror the selected positions
//      into a persistent store. NO buttons here — this dialog comes and goes.
//
//   B) Create a New Sample dialog (persistent across the picker opening/closing):
//      we insert the action bar (counter + Dry-run + Live-test) into its footer,
//      next to Cancel/Save. It reads the store, so the selection SURVIVES the
//      picker closing.
//
// The store (selection-store.js) is the bridge: the grid/SelectionContext is
// destroyed when the picker closes, but the chosen positions persist there.
//
// Boundaries: never touches CDD's native Save/submit; capture/replay is private
// to this feature; the only payload mutation is via cdd-form-data.js.
//
// CDD assumptions: the create dialog has a heading "Create a New Sample"; the
// picker has a heading "Pick Location"; the location is the composite
// "<boxId>,<position>" value (contract §3). If a heading changes, update the
// detectors below; if the location encoding changes, only cdd-form-data.js.

import { observeBoxGrids } from "../box-selection/init.js";
import { attachBoxSelection } from "../box-selection/overlay.js";
import { injectMultiPositionStyles } from "./styles.js";
import { resolvePayloadSource } from "./payload-source.js";
import * as store from "./selection-store.js";
import {
    findLocationField,
    withReplacedPosition,
    previewFormData,
} from "../../../shared/cdd-form-data.js";
import { createInventorySample } from "../../api/inventory-samples.js";

const LOG = "[CDD multi-position]";
const DEBUG = true; // temporary wiring diagnostics; flip off once verified
const DIALOG_FLAG = "cddMpBar";

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
    return headings().some((t) => /pick location/i.test(t));
}

// The Create Sample dialog's root element (for footer placement + form scope).
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

/* ------------------------------- entry ------------------------------- */

export function initMultiPositionSampleCreate() {
    dbg("initMultiPositionSampleCreate() running");
    injectMultiPositionStyles();
    watchPickerGrids();
    watchCreateDialog();
}

/* ---------------- lifecycle A: picker grid -> store ---------------- */

function watchPickerGrids() {
    observeBoxGrids((grid) => {
        // The framework discovers every box grid; only treat it as our picker
        // when the create-sample flow is active (the create dialog is mounted).
        const inCreateFlow = isCreateSampleDialogOpen();
        dbg(
            "box grid detected | pickLocationDialog:",
            isPickLocationDialogOpen(),
            "| createSampleDialog:",
            inCreateFlow
        );
        if (!inCreateFlow) {
            dbg("grid not part of create-sample flow -> ignoring for store");
            return;
        }

        // Multi-select only; no counter bar inside the (clipped, transient) card.
        const ctx = attachBoxSelection(grid, { showCounter: false });
        if (!ctx) {
            dbg("attachBoxSelection returned null");
            return;
        }
        dbg("SelectionContext created for Pick Location grid");

        // Restore any previous selection so reopening the picker shows it.
        const prev = store.getPositions();
        if (prev.length) {
            try {
                ctx._model.replaceSelection(prev);
                dbg("restored previous selection into picker:", prev.join(", "));
            } catch {
                /* escape hatch; ignore if unavailable */
            }
        }
        store.setBoxId(ctx.getBoxId());

        // Mirror picker selection into the persistent store.
        ctx.onChange((c) => {
            store.setBoxId(c.getBoxId());
            store.setPositions(c.getSelectedPositions());
            dbg(
                "picker selection changed ->",
                c.getSelectedPositions().join(", ") || "(none)",
                "| boxId:",
                c.getBoxId()
            );
        });

        // Best-effort "OK clicked" log: the picker dialog's confirm button.
        const pickerRoot = grid.closest('[role="dialog"], .MuiDialog-root, .MuiPaper-root');
        if (pickerRoot && pickerRoot.dataset.cddMpOkLog !== "1") {
            pickerRoot.dataset.cddMpOkLog = "1";
            pickerRoot.addEventListener(
                "click",
                (e) => {
                    const btn = e.target.closest("button");
                    if (btn && /\b(ok|done|apply|select)\b/i.test(btn.textContent || "")) {
                        dbg("Pick Location confirm clicked:", (btn.textContent || "").trim());
                    }
                },
                true
            );
        }
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

        // Per-node guard: a brand-new dialog node = a fresh create session. We
        // flag the node and clear the store exactly once, when the node first
        // appears (before the user can open the picker), so a later heading
        // flicker while the picker is layered on top can never wipe a live
        // selection. The same node never clears again.
        if (dialog.dataset[DIALOG_FLAG] === "1") return;
        dialog.dataset[DIALOG_FLAG] = "1";
        store.clear();

        dbg("Create Sample dialog detected (fresh session) -> inserting action bar");
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

    const counter = document.createElement("span");
    counter.className = "cdd-mp-count";

    const dryBtn = makeButton("Dry-run Create N Samples", "cdd-mp-btn");
    const liveBtn = makeButton("Live test: create 1 extra sample", "cdd-mp-btn cdd-mp-live");
    const result = document.createElement("div");
    result.className = "cdd-mp-result";

    panel.append(counter, dryBtn, liveBtn, result);

    // Place above the dialog's action buttons (Cancel/Save) if present.
    const actions = dialog.querySelector(".MuiDialogActions-root");
    let where;
    if (actions) {
        actions.insertAdjacentElement("beforebegin", panel);
        where = "above .MuiDialogActions-root";
    } else {
        dialog.appendChild(panel);
        where = "appended to dialog";
    }
    dbg("action bar inserted:", where);

    function refresh() {
        const { count, positions } = store.getState();
        counter.textContent = `Selected positions: ${count}`;
        dryBtn.disabled = count < 2;
        if (liveBtn.dataset.busy !== "1") liveBtn.disabled = count < 1;
        dbg("action bar refresh -> count:", count, "| positions:", positions.join(", ") || "(none)");
    }

    const unsubscribe = store.onChange(refresh);
    refresh();

    // If the dialog node is removed, stop listening (avoid a leaked subscriber).
    const cleanupObserver = new MutationObserver(() => {
        if (!dialog.isConnected) {
            unsubscribe();
            cleanupObserver.disconnect();
            dbg("action bar dialog removed -> unsubscribed");
        }
    });
    cleanupObserver.observe(document.documentElement, { childList: true, subtree: true });

    dryBtn.addEventListener("click", () => runDryRun(dialog, result));
    liveBtn.addEventListener("click", () => runLiveTest(dialog, result, liveBtn));
}

/* ----------------------------- M2: dry-run ----------------------------- */

function runDryRun(dialog, result) {
    const positions = store.getPositions();
    if (positions.length < 2) {
        setResult(result, "Select 2+ positions in Pick Location first.", true);
        return;
    }

    const src = resolvePayloadSource(dialog);
    if (!src) {
        setResult(
            result,
            "No payload source. FormData(form) had no inventory_sample keys and no create request was captured yet — create one sample natively first, then retry.",
            true
        );
        console.warn(`${LOG} dry-run: no payload source`);
        return;
    }

    const loc = findLocationField(src.formData);

    console.group(`${LOG} DRY-RUN — nothing will be sent`);
    console.log("payload source:", src.source);
    console.log("target URL:", src.url);
    if (src.capturedAt) console.log("captured at:", new Date(src.capturedAt).toISOString());
    console.log(
        "original location value:",
        loc
            ? `${loc.raw}  (boxId=${loc.boxId}, position=${loc.position}${loc.viaFallback ? ", via fallback match" : ""})`
            : "(not found)"
    );
    console.log("selected positions:", positions.join(", "));

    if (!loc) {
        console.warn("  Location field not found — cannot generate payloads.");
        console.groupEnd();
        setResult(result, "Location field not found in payload (see console).", true);
        return;
    }

    let okCount = 0;
    positions.forEach((pos, i) => {
        try {
            const built = withReplacedPosition(src.formData, pos);
            okCount++;
            console.groupCollapsed(`#${i + 1} position ${pos}:  ${built.before}  ->  ${built.after}`);
            console.log(previewFormData(built.formData));
            console.groupEnd();
        } catch (err) {
            console.warn(`  position ${pos} failed:`, err.message);
        }
    });
    console.groupEnd();

    setResult(result, `Dry-run generated ${okCount} payloads. Nothing was sent.`, false);
}

/* --------------------- M3 (minimal): guarded live test --------------------- *
 * Creates exactly ONE extra sample at the FIRST selected position. Dry-run
 * preview first, then confirm(), then a single sequential POST. No batch, no
 * parallel, no retry, native Save left alone.                                  */

async function runLiveTest(dialog, result, liveBtn) {
    if (liveBtn.dataset.busy === "1") return; // double-click guard

    const positions = store.getPositions();
    if (positions.length < 1) return;
    const target = positions[0]; // ONLY the first selected position

    const src = resolvePayloadSource(dialog);
    if (!src) {
        setResult(result, "No payload source (see dry-run message).", true);
        return;
    }
    if (src.hadNonString) {
        setResult(
            result,
            "Captured payload contains file/blob fields that can't be faithfully replayed — aborting live test.",
            true
        );
        return;
    }
    if (!src.url) {
        setResult(result, "No target URL resolved — aborting live test.", true);
        return;
    }

    let built;
    try {
        built = withReplacedPosition(src.formData, target);
    } catch (err) {
        setResult(result, `Location field not found: ${err.message}`, true);
        return;
    }

    console.group(`${LOG} LIVE TEST — single POST (1 record)`);
    console.log("payload source:", src.source);
    console.log("POST", src.url);
    console.log("box id:", built.boxId, "| target position:", target);
    console.log("location:", built.before, "->", built.after);
    console.log(previewFormData(built.formData));

    const proceed = window.confirm(
        "LIVE TEST — create ONE extra sample?\n\n" +
            `Source:        ${src.source}\n` +
            `URL:           ${src.url}\n` +
            `Box id:        ${built.boxId}\n` +
            `Target pos:    ${target}\n` +
            `Original loc:  ${built.before}\n` +
            `New loc:       ${built.after}\n\n` +
            "This creates 1 REAL record (test vault). Proceed?"
    );
    if (!proceed) {
        console.log("cancelled by user");
        console.groupEnd();
        setResult(result, "Live test cancelled.", false);
        return;
    }

    liveBtn.dataset.busy = "1";
    liveBtn.disabled = true;
    setResult(result, `Live test: creating 1 sample at position ${target}…`, false);

    try {
        const res = await createInventorySample(src.url, built.formData);
        console.log("response:", res);
        if (res.ok) {
            const locValue =
                res.location?.value ||
                (res.location ? `${res.location.id},${res.location.position}` : built.after);
            setResult(
                result,
                `✓ Created ${res.sampleIdentifier ?? "(id " + res.sampleId + ")"} at ${locValue}. 1 record created.`,
                false
            );
        } else {
            setResult(result, `✗ Failed (HTTP ${res.status}): ${res.errorText}`, true);
        }
    } catch (err) {
        console.error(`${LOG} live test error`, err);
        setResult(result, `✗ Error: ${err.message}`, true);
    } finally {
        console.groupEnd();
        liveBtn.dataset.busy = "0";
        liveBtn.disabled = store.getPositions().length < 1;
    }
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
    el.textContent = text;
    el.classList.toggle("cdd-mp-error", !!isError);
}
