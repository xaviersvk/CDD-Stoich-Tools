// content/features/multi-position-sample-create/init.js
//
// First consumer of the Box Selection Framework. It consumes a SelectionContext
// (never reads grid DOM) and adds two explicit buttons to the create-sample
// dialog:
//
//   "Dry-run Create N Samples"      (enabled with >=2 selected)
//     -> builds N cloned payloads with only the location position swapped and
//        logs them. Sends NOTHING.
//
//   "Live test: create 1 extra sample"  (enabled with >=1 selected)
//     -> guarded single POST: dry-run preview first, confirm() with full detail,
//        then ONE create at the FIRST selected position. No batch, no parallel,
//        no retry, native CDD Save untouched.
//
// Boundaries this file respects:
//   - It NEVER touches CDD's native Save button or submit flow.
//   - Capture/replay mechanics are private to this feature (payload-source.js +
//     capture-store.js); the framework and other features don't know about them.
//   - The only payload mutation is via shared/cdd-form-data.js (swap location).
//
// Assumptions about CDD: the create dialog shows a heading "Create a New Sample";
// the location field is the composite "<boxId>,<position>" value (contract §3).
// If CDD changes the dialog title, the gate in isCreateSampleDialogOpen() must be
// updated; if it changes the location encoding, only cdd-form-data.js changes.

import { observeBoxGrids } from "../box-selection/init.js";
import { attachBoxSelection } from "../box-selection/overlay.js";
import { injectMultiPositionStyles } from "./styles.js";
import { resolvePayloadSource } from "./payload-source.js";
import {
    findLocationField,
    withReplacedPosition,
    previewFormData,
} from "../../../shared/cdd-form-data.js";
import { createInventorySample } from "../../api/inventory-samples.js";

const LOG = "[CDD multi-position]";
const PANEL_FLAG = "cddMpPanel";

// Only act inside the create-sample dialog (not the inventory Pick-Location view,
// which also renders a box grid).
function isCreateSampleDialogOpen() {
    return [...document.querySelectorAll("h1,h2,h3,.MuiDialogTitle-root")].some(
        (h) => /create a new sample/i.test(h.textContent || "")
    );
}

export function initMultiPositionSampleCreate() {
    injectMultiPositionStyles();

    observeBoxGrids((grid) => {
        // Gate: the framework discovers every box grid; we attach our buttons
        // only when the create-sample dialog is the one on screen.
        if (!isCreateSampleDialogOpen()) return;

        const ctx = attachBoxSelection(grid, { showCounter: true });
        if (!ctx) return;

        buildPanel(grid, ctx);
    });
}

function buildPanel(grid, ctx) {
    if (grid.dataset[PANEL_FLAG] === "1") return;
    grid.dataset[PANEL_FLAG] = "1";

    const panel = document.createElement("div");
    panel.className = "cdd-mp-panel";

    const dryBtn = makeButton("Dry-run Create N Samples", "cdd-mp-btn");
    const liveBtn = makeButton("Live test: create 1 extra sample", "cdd-mp-btn cdd-mp-live");
    const result = document.createElement("div");
    result.className = "cdd-mp-result";

    panel.append(dryBtn, liveBtn, result);

    // Place after the framework's counter bar if present, else after the grid.
    const after =
        grid.nextElementSibling &&
        grid.nextElementSibling.classList?.contains("cdd-box-selection-bar")
            ? grid.nextElementSibling
            : grid;
    after.insertAdjacentElement("afterend", panel);

    function refresh() {
        const n = ctx.count();
        dryBtn.disabled = n < 2;
        // Live test stays disabled while a request is in flight.
        if (liveBtn.dataset.busy !== "1") liveBtn.disabled = n < 1;
    }
    ctx.onChange(refresh);
    refresh();

    dryBtn.addEventListener("click", () => runDryRun(grid, ctx, result));
    liveBtn.addEventListener("click", () => runLiveTest(grid, ctx, result, liveBtn));
}

/* ----------------------------- M2: dry-run ----------------------------- */

function runDryRun(grid, ctx, result) {
    const positions = ctx.selectedPositions;
    const src = resolvePayloadSource(grid);

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
        loc ? `${loc.raw}  (boxId=${loc.boxId}, position=${loc.position}${loc.viaFallback ? ", via fallback match" : ""})` : "(not found)"
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
            console.groupCollapsed(
                `#${i + 1} position ${pos}:  ${built.before}  ->  ${built.after}`
            );
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
 * Creates exactly ONE extra sample at the FIRST selected position. Always shows
 * the dry-run preview first, then a confirm() with full before/after, then a
 * single sequential POST. No batch, no parallel, no retry, native Save left
 * alone.                                                                       */

async function runLiveTest(grid, ctx, result, liveBtn) {
    if (liveBtn.dataset.busy === "1") return; // double-click guard

    const positions = ctx.selectedPositions;
    if (positions.length < 1) return;
    const target = positions[0]; // ONLY the first selected position

    const src = resolvePayloadSource(grid);
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

    // Always log the dry-run preview of exactly what we will send.
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
        liveBtn.disabled = ctx.count() < 1;
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
