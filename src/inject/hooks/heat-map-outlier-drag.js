// inject/hooks/heat-map-outlier-drag.js
//
// Box-select outliers on a run heat map (/vaults/<v>/runs/<r>/heat_maps/...).
// Shift-drag flags every well the box touches as an outlier for the readout
// the viewer shows, Ctrl-drag unflags them. A Shift/Ctrl click with no drag
// acts on the well under the cursor. Unlike the dose-response drag this SAVES
// at once — exactly as CDD's own flag link in the well popup does.
//
// What CDD gives us (measured on the heat map viewer):
//   - Every well is `td.heat-map-well#plate_<plateId>_well_<row>_<col>`, and
//     `CDD.HeatMap.wellDetails[plateId][row][col].popupData` holds the popup
//     rows. The row of the shown readout carries
//     `span.flaggable[.flagged] > a.flag-readout-heatmap-link`, whose href is
//     `PUT /vaults/<v>/readouts/<id>/flag_as_outlier?outlier_type=1` (flag) or
//     `=0` (unflag). The response is an empty text/javascript body.
//   - On `ajax:success` CDD reloads the plate with
//     `CDD.ConnectionPool.enqueue({url, method: "GET"})`, `url` being
//     `data-run-heat-map-path` of `#heatMap-wrapper_plate_<plateId>`. That
//     replaces the table and re-assigns wellDetails, so the X marks, popups
//     and Z′ all follow. We send the PUTs ourselves and reload each plate once.
//   - A plain click on a well opens CDD's popup; the click that ends a drag is
//     swallowed so it does not.

import { EVENTS, EVENT_SOURCE } from "../../shared/event-types.js";
import { post } from "../bus.js";

const WELL_SELECTOR = "td.heat-map-well";
const WELL_ID_RE = /^plate_(\d+)_well_(\d+)_(\d+)$/;
const FLAG_HREF_RE = /^(\/vaults\/\d+\/readouts\/\d+\/flag_as_outlier)(?:\?|$)/;
// Below this many pixels in both directions a drag counts as a click.
const CLICK_SLOP = 3;
// PUTs in flight at once.
const CONCURRENCY = 4;
const STATUS_MS = 2500;

let enabled = true;
let drag = null;
let busy = false;

function heatMapTableOf(element) {
    const well = element?.closest?.(WELL_SELECTOR);
    return well ? well.closest("table") : null;
}

// { plateId, readoutPath, flagged } for one well, or null when the well has
// no flaggable readout (empty well, or CDD changed its popup).
function wellReadout(td) {
    const m = WELL_ID_RE.exec(td.id);
    if (!m) return null;
    const entry = window.CDD?.HeatMap?.wellDetails?.[m[1]]?.[m[2]]?.[m[3]];
    for (const row of entry?.popupData || []) {
        if (typeof row?.[1] !== "string" || !row[1].includes("flag_as_outlier")) continue;
        const doc = new DOMParser().parseFromString(row[1], "text/html");
        const link = doc.querySelector("a.flag-readout-heatmap-link");
        const path = FLAG_HREF_RE.exec(link?.getAttribute("href") || "")?.[1];
        if (!path) continue;
        return {
            plateId: m[1],
            readoutPath: path,
            flagged: !!link.closest(".flaggable")?.classList.contains("flagged"),
        };
    }
    return null;
}

function makeBox(flag) {
    const box = document.createElement("div");
    box.setAttribute("data-cdd-heat-map-drag", "1");
    const colour = flag ? "#c62828" : "#455a64";
    Object.assign(box.style, {
        position: "fixed",
        zIndex: "2147483647",
        pointerEvents: "none",
        border: `1.5px dashed ${colour}`,
        background: flag ? "rgba(198, 40, 40, 0.06)" : "rgba(69, 90, 100, 0.06)",
        boxSizing: "border-box",
    });

    const label = document.createElement("span");
    label.textContent = flag ? "Flag outliers" : "Unflag outliers";
    Object.assign(label.style, {
        position: "absolute",
        left: "0",
        top: "-18px",
        font: "600 11px/16px system-ui, sans-serif",
        color: colour,
        whiteSpace: "nowrap",
    });
    box.appendChild(label);
    document.body.appendChild(box);
    return box;
}

// A small label where the drag ended: progress, then the result.
function makeStatus(x, y) {
    const el = document.createElement("div");
    el.setAttribute("data-cdd-heat-map-drag", "1");
    Object.assign(el.style, {
        position: "fixed",
        left: `${x + 12}px`,
        top: `${y + 12}px`,
        zIndex: "2147483647",
        pointerEvents: "none",
        padding: "3px 8px",
        borderRadius: "4px",
        background: "#263238",
        color: "#fff",
        font: "600 12px/18px system-ui, sans-serif",
        whiteSpace: "nowrap",
        boxShadow: "0 1px 4px rgba(0, 0, 0, 0.3)",
    });
    document.body.appendChild(el);
    return {
        set(text) {
            el.textContent = text;
        },
        done(text) {
            el.textContent = text;
            setTimeout(() => el.remove(), STATUS_MS);
        },
    };
}

function selection(d) {
    return {
        left: Math.min(d.x0, d.x1),
        right: Math.max(d.x0, d.x1),
        top: Math.min(d.y0, d.y1),
        bottom: Math.max(d.y0, d.y1),
    };
}

function drawBox(d) {
    const s = selection(d);
    Object.assign(d.box.style, {
        left: `${s.left}px`,
        top: `${s.top}px`,
        width: `${s.right - s.left}px`,
        height: `${s.bottom - s.top}px`,
    });
}

// Wells of `table` the area touches whose readout is not yet in the wanted
// state.
function wellsToChange(table, area, flag) {
    const out = [];
    for (const td of table.querySelectorAll(WELL_SELECTOR)) {
        const r = td.getBoundingClientRect();
        if (r.right < area.left || r.left > area.right || r.bottom < area.top || r.top > area.bottom) continue;
        const readout = wellReadout(td);
        if (readout && readout.flagged !== flag) out.push(readout);
    }
    return out;
}

async function putFlag(readoutPath, flag) {
    const token = document.querySelector('meta[name="csrf-token"]')?.content || "";
    const res = await fetch(`${readoutPath}?outlier_type=${flag ? 1 : 0}`, {
        method: "PUT",
        credentials: "include",
        headers: {
            Accept: "text/javascript, application/javascript",
            "X-CSRF-Token": token,
            "X-Requested-With": "XMLHttpRequest",
        },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

function reloadPlate(plateId) {
    const url = document.getElementById(`heatMap-wrapper_plate_${plateId}`)?.dataset.runHeatMapPath;
    const pool = window.CDD?.ConnectionPool;
    if (!url || typeof pool?.enqueue !== "function") return false;
    pool.enqueue({
        url,
        method: "GET",
        error: (_xhr, err) => console.warn("[CDD Stoich Tools] heat map reload failed:", err),
    });
    return true;
}

async function apply(wells, flag, status) {
    const verb = flag ? "Flagging" : "Unflagging";
    let done = 0;
    let failed = 0;
    const queue = [...wells];
    status.set(`${verb} ${wells.length} well(s)…`);

    async function worker() {
        while (queue.length) {
            const well = queue.shift();
            try {
                await putFlag(well.readoutPath, flag);
                done++;
            } catch (err) {
                failed++;
                console.warn("[CDD Stoich Tools] heat map outlier flag failed:", well.readoutPath, err);
            }
            status.set(`${verb} ${done + failed}/${wells.length}…`);
        }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, wells.length) }, worker));

    let reloaded = true;
    for (const plateId of new Set(wells.map((w) => w.plateId))) {
        reloaded = reloadPlate(plateId) && reloaded;
    }

    const result = `${flag ? "Flagged" : "Unflagged"} ${done} well(s)`;
    if (failed) status.done(`${result}, ${failed} failed — refresh the page`);
    else if (!reloaded) status.done(`${result} — refresh the page to see them`);
    else status.done(result);
}

function swallow(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
}

// The click that ends a drag would open CDD's well popup. Eat exactly that one.
function swallowNextClick() {
    const onClick = (event) => {
        swallow(event);
        window.removeEventListener("click", onClick, true);
    };
    window.addEventListener("click", onClick, true);
    setTimeout(() => window.removeEventListener("click", onClick, true), 400);
}

function endDrag() {
    if (!drag) return;
    drag.box.remove();
    drag = null;
}

function onPointerDown(event) {
    if (!enabled || drag || busy) return;
    if (event.button !== 0 || event.pointerType === "touch") return;

    const unflag = event.ctrlKey || event.metaKey;
    if (!unflag && !event.shiftKey) return;

    const table = heatMapTableOf(event.target);
    if (!table || !window.CDD?.HeatMap?.wellDetails) return;

    swallow(event);
    try {
        event.target.setPointerCapture?.(event.pointerId);
    } catch {
        /* the box still works while the pointer stays in the window */
    }
    window.balloon?.hideTooltip?.();
    const flag = !unflag;
    drag = {
        table,
        flag,
        x0: event.clientX,
        y0: event.clientY,
        x1: event.clientX,
        y1: event.clientY,
        box: makeBox(flag),
    };
    drawBox(drag);
}

function onPointerMove(event) {
    if (!drag) return;
    swallow(event);
    drag.x1 = event.clientX;
    drag.y1 = event.clientY;
    drawBox(drag);
}

function onPointerUp(event) {
    if (!drag) return;
    swallow(event);
    swallowNextClick();

    const d = drag;
    endDrag();
    d.x1 = event.clientX;
    d.y1 = event.clientY;

    let area = selection(d);
    if (area.right - area.left < CLICK_SLOP && area.bottom - area.top < CLICK_SLOP) {
        area = { left: d.x1, right: d.x1, top: d.y1, bottom: d.y1 };
    }

    const status = makeStatus(d.x1, d.y1);
    let wells;
    try {
        wells = wellsToChange(d.table, area, d.flag);
    } catch (err) {
        console.warn("[CDD Stoich Tools] heat map outlier drag failed:", err);
        status.done("Could not read the wells — refresh the page");
        return;
    }
    if (!wells.length) {
        status.done(d.flag ? "Nothing to flag" : "Nothing to unflag");
        return;
    }

    busy = true;
    apply(wells, d.flag, status)
        .catch((err) => {
            console.warn("[CDD Stoich Tools] heat map outlier drag failed:", err);
            status.done("Failed — refresh the page");
        })
        .finally(() => {
            busy = false;
        });
}

function onCancel(event) {
    if (!drag) return;
    if (event.type === "keydown" && event.key !== "Escape") return;
    if (event.type === "keydown") swallow(event);
    endDrag();
}

// Installed on every page: CDD reaches the heat map viewer by Turbo
// navigation too, and pointerdown does nothing off a heat map well.
export function installHeatMapOutlierDrag() {
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("pointercancel", onCancel, true);
    window.addEventListener("keydown", onCancel, true);
    window.addEventListener("blur", onCancel);

    window.addEventListener("message", (event) => {
        if (event.source !== window) return;
        const data = event.data;
        if (!data || data.source !== EVENT_SOURCE) return;
        if (data.type !== EVENTS.HEAT_MAP_OUTLIER_DRAG_ENABLED) return;
        enabled = data.payload?.enabled !== false;
        if (!enabled) endDrag();
    });

    post(EVENTS.HEAT_MAP_OUTLIER_DRAG_HELLO, {});
}
