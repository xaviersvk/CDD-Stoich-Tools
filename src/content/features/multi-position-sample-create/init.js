// content/features/multi-position-sample-create/init.js
//
// First consumer of the Box Selection Framework. Two INDEPENDENT lifecycles:
//
//   A) Pick Location dialog (transient): the box grid lives here. We attach the
//      SelectionContext for multi-select only, and mirror the selected positions
//      into a persistent store. NO buttons here — this dialog comes and goes.
//
//   B) Create a New Sample dialog (persistent across the picker opening/closing):
//      we insert the action bar (counter + Dry-run + Live-test + Clear) into its
//      footer. It reads the store, so the selection SURVIVES the picker closing.
//
// The store (selection-store.js) is the bridge.
//
// This revision is heavily INSTRUMENTED (DEBUG): every node of the chain
//   well click -> SelectionContext -> store -> action bar
// logs under the single prefix "[CDD multi-position]" with a numbered event, and
// window.__CDD_MULTI_POSITION_DEBUG__ exposes live inspectors. Diagnostics only —
// no behavior / POST / dry-run / live changes.
//
// Boundaries: never touches CDD's native Save/submit; capture/replay is private
// to this feature; the only payload mutation is via cdd-form-data.js.

import { observeBoxGrids } from "../box-selection/init.js";
import { attachBoxSelection } from "../box-selection/overlay.js";
import {
    CELL_SELECTOR,
    EMPTY_CLASS,
    isBoxGrid,
    isFilledCell,
    readCellPosition,
    getSelectedBoxId,
} from "../box-selection/box-grid.js";
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
const SELECTION_CONTEXT_PROP = "__cddSelectionContext"; // set by overlay.js

// Module-level debug state — written by picker events (which live outside the
// action bar closure) and read by the in-page debug panel.
const _dbg = {
    lastGridDetect: "—",
    lastWellClick: "—",
    lastCtxOnChange: "—",
    lastBarRefresh: "—",
};
let _dbgSpans = null; // set once insertActionBar runs

function _refreshDbgPanel() {
    if (!_dbgSpans) return;
    const st = store.getState();
    _dbgSpans.store.textContent =
        `count=${st.count}  boxId=${st.boxId ?? "null"}  positions=[${st.positions.join(", ")}]`;
    _dbgSpans.listeners.textContent = String(store.getListenerCount());
    _dbgSpans.gridDetect.textContent = _dbg.lastGridDetect;
    _dbgSpans.wellClick.textContent = _dbg.lastWellClick;
    _dbgSpans.ctxOnChange.textContent = _dbg.lastCtxOnChange;
    _dbgSpans.barRefresh.textContent = _dbg.lastBarRefresh;
}

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

/* ------------------------------- entry ------------------------------- */

export function initMultiPositionSampleCreate() {
    dbg("(1) initMultiPositionSampleCreate started");
    injectMultiPositionStyles();
    installDebugHelpers();
    watchPickerGrids();
    watchCreateDialog();
}

/* ---------------- lifecycle A: picker grid -> store ---------------- */

function watchPickerGrids() {
    observeBoxGrids((grid) => {
        console.log("[CDD mp] GRID FOUND", grid);
        // MUI portals render picker content as a direct child of <body>, so
        // grid.closest('[role="dialog"]') returns null even when the picker is
        // visually open. Gate on observable facts instead:
        //   1. Create Sample dialog is open (confirmed by heading text), OR
        //   2. A LocationBoxPicker ancestor or peer dialog exists in the document.
        const createOpen = isCreateSampleDialogOpen();
        const pickerLike =
            !!grid.closest('.LocationBoxPicker, [class*="LocationBoxPicker"], [class*="LocationPicker"]') ||
            !!document.querySelector('[class*="LocationPickerDialog"], [class*="LocationBoxPicker"], [class*="LocationPicker"]');

        dbg("(4/5) grid detected | isBoxGrid:", isBoxGrid(grid),
            "| createOpen:", createOpen, "| pickerLike:", pickerLike,
            "| headings:", headings(), grid);

        attachClickLogger(grid);
        watchPickerClose(grid);

        if (!createOpen && !pickerLike) {
            _dbg.lastGridDetect = "skipped (Create not open, no picker ancestor)";
            _refreshDbgPanel();
            dbg("(5a) grid IGNORED by gate (Create dialog not open and no picker-like ancestor)");
            return;
        }
        _dbg.lastGridDetect = `attaching | createOpen=${createOpen} pickerLike=${pickerLike} [${headings().join(" | ")}]`;
        _refreshDbgPanel();

        console.log("[CDD mp] GATE PASSED — calling attachBoxSelection on", grid);
        dbg("(6) attachBoxSelection called");
        const ctx = attachBoxSelection(grid, { showCounter: false });
        console.log("[CDD mp] CTX result:", ctx);
        dbg("(6a) attachBoxSelection result:", ctx ? "SelectionContext ok" : "NULL");
        if (!ctx) {
            console.error("[CDD mp] CTX IS NULL — attachBoxSelection returned null", grid);
            return;
        }
        console.log("[CDD mp] CTX OK");

        // Restore any previous selection so reopening the picker shows it.
        const prev = store.getPositions();
        if (prev.length) {
            try {
                ctx._model.replaceSelection(prev);
                dbg("(6b) restored previous selection into picker:", prev.join(", "));
            } catch {
                /* escape hatch; ignore if unavailable */
            }
        }
        store.setBoxId(ctx.boxId);

        // Mirror picker selection into the persistent store.
        ctx.onChange((c) => {
            const selectedPositions = c.selectedPositions;
            const boxId = c.boxId;
            _dbg.lastCtxOnChange = `positions=[${selectedPositions.join(",")}] boxId=${boxId}`;
            _refreshDbgPanel();
            dbg("(8) SelectionContext onChange fired", {
                selectedPositions,
                count: selectedPositions.length,
                boxId,
            });
            store.setBoxId(boxId);
            store.setPositions(selectedPositions);
        });
        ctx.onChange(() => console.log("[CDD mp] CTX CHANGED (raw onChange)"));
        dbg("(6c) ctx.onChange wired -> store; store listener count now:", store.getListenerCount());

        // Best-effort "OK clicked" log: the picker dialog's confirm button.
        const pickerRoot = grid.closest('[role="dialog"], .MuiDialog-root, .MuiPaper-root');
        if (pickerRoot && pickerRoot.dataset.cddMpOkLog !== "1") {
            pickerRoot.dataset.cddMpOkLog = "1";
            pickerRoot.addEventListener(
                "click",
                (e) => {
                    const btn = e.target.closest("button");
                    if (btn && /\b(ok|done|apply|select|save)\b/i.test(btn.textContent || "")) {
                        dbg("(12) Pick Location OK clicked:", (btn.textContent || "").trim(), "| store:", store.getState());
                    }
                },
                true
            );
        }
    });
}

// Passive, capture-phase logger for EVERY well click (incl. blocked occupied).
function attachClickLogger(grid) {
    if (grid.dataset.cddMpClickLog === "1") return;
    grid.dataset.cddMpClickLog = "1";
    grid.addEventListener(
        "click",
        (e) => {
            const cell = e.target.closest(CELL_SELECTOR);
            if (!cell || !grid.contains(cell)) return;
            const isFilled = isFilledCell(cell);
            const _pos = readCellPosition(cell);
            const _isEmpty = cell.classList.contains(EMPTY_CLASS) || !isFilled;
            const _bId = getSelectedBoxId();
            _dbg.lastWellClick = `pos=${_pos} isEmpty=${_isEmpty} boxId=${_bId}`;
            _refreshDbgPanel();
            dbg("(7) well click detected", {
                position: _pos,
                isEmpty: _isEmpty,
                isFilled,
                boxId: _bId,
            });
        },
        true
    );
}

// Log when a picker grid is removed from the DOM (picker closed).
function watchPickerClose(grid) {
    const obs = new MutationObserver(() => {
        if (!grid.isConnected) {
            dbg("(13) Pick Location closed (grid removed) | store still holds:", store.getState());
            obs.disconnect();
        }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
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

        dbg("(2) Create Sample dialog detected | headings:", headings());
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
    const clearBtn = makeButton("Clear", "cdd-mp-clear");
    clearBtn.addEventListener("click", () => {
        store.clear();
        dbg("selection cleared via action bar");
    });
    const result = document.createElement("div");
    result.className = "cdd-mp-result";

    // In-page debug panel — visible without DevTools console access.
    const dbgPanel = document.createElement("div");
    dbgPanel.className = "cdd-mp-debug";

    function makeDbgRow(label) {
        const row = document.createElement("div");
        const lbl = document.createElement("b");
        lbl.textContent = label + ": ";
        const val = document.createElement("span");
        row.append(lbl, val);
        dbgPanel.appendChild(row);
        return val;
    }

    _dbgSpans = {
        store:       makeDbgRow("Store"),
        listeners:   makeDbgRow("Listeners"),
        gridDetect:  makeDbgRow("Last grid detect"),
        wellClick:   makeDbgRow("Last well click"),
        ctxOnChange: makeDbgRow("Last ctx.onChange"),
        barRefresh:  makeDbgRow("Last bar refresh"),
    };

    const refreshDbgBtn = makeButton("Refresh debug", "cdd-mp-clear");
    refreshDbgBtn.addEventListener("click", _refreshDbgPanel);
    dbgPanel.appendChild(refreshDbgBtn);

    panel.append(counter, dryBtn, liveBtn, clearBtn, result, dbgPanel);

    const actions = dialog.querySelector(".MuiDialogActions-root");
    let where;
    if (actions) {
        actions.insertAdjacentElement("beforebegin", panel);
        where = "above .MuiDialogActions-root";
    } else {
        dialog.appendChild(panel);
        where = "appended to dialog";
    }
    dbg("(3) action bar inserted:", where);

    function refresh() {
        const { count, positions, boxId } = store.getState();
        counter.textContent = `Selected positions: ${count}`;
        dryBtn.disabled = count < 2;
        if (liveBtn.dataset.busy !== "1") liveBtn.disabled = count < 1;
        _dbg.lastBarRefresh = `count=${count} positions=[${positions.join(",")}]`;
        _refreshDbgPanel();
        dbg("(11/14) action bar subscription fired / refreshed", {
            displayedCount: count,
            storeCount: store.getState().count,
            positions,
            boxId,
        });
    }

    store.onChange(refresh);
    refresh();
    dbg("(3a) action bar subscribed to store; store listener count now:", store.getListenerCount());

    dryBtn.addEventListener("click", () => runDryRun(dialog, result));
    liveBtn.addEventListener("click", () => runLiveTest(dialog, result, liveBtn));
}

/* --------------------------- window debug helpers --------------------------- */

function installDebugHelpers() {
    if (typeof window === "undefined") return;
    window.__CDD_MULTI_POSITION_DEBUG__ = {
        getStore: () => store.getState(),
        getListenersCount: () => store.getListenerCount(),
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
                        clickLoggerAttached: g.dataset.cddMpClickLog === "1",
                    };
                }),
    };
    dbg("debug helpers installed: window.__CDD_MULTI_POSITION_DEBUG__");
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

/* --------------------- M3 (minimal): guarded live test --------------------- */

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
