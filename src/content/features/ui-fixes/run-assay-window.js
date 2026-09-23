// content/features/ui-fixes/run-assay-window.js
//
// A small table above a run's Data Summary (/vaults/<v>/runs/<r>): per plate
// the control means ± SD, assay window, signal window and Z′, plus the run's
// mean ± SD of each. CDD's Data Summary gives Z′ and the negative control
// mean but no positive control mean, so the assay window cannot be had from
// it; the numbers come from the control wells of CDD's heat maps instead
// (api/run-heat-maps.js), outliers flagged in CDD left out as CDD does.
//
// Formulas and the switch: shared/assay-window.js. The readout defaults to
// the heat map viewer's own default; the choice lasts for the page. Also
// shown: each control's CV % and S/N (see shared/assay-window.js).

import { fetchPlateControls, fetchRunHeatMapIndex } from "../../api/run-heat-maps.js";
import { mapLimit } from "../../utils/concurrency.js";
import {
    describe,
    initAssayWindow,
    isAssayWindowEnabled,
    METRIC_KEYS,
    onAssayWindowChanged,
    plateMetrics,
    runMetrics,
} from "../../../shared/assay-window.js";

const LOG_PREFIX = "[CDD plate plugin]";

const STYLE_ID = "cdd-assay-window-style";
const ROOT_CLASS = "cdd-assay-window";
const RUN_PATH_RE = /^\/vaults\/(\d+)\/runs\/(\d+)\/?$/;
const ANCHOR_SELECTOR = "#run-summary > #run-summary-links";
const FETCH_CONCURRENCY = 3;

const METRIC_LABELS = {
    cvPos: "CV pos %",
    cvNeg: "CV neg %",
    aw: "AW",
    sn: "S/N",
    sw: "SW",
    zPrime: "Z′",
};

let started = false;

// Per panel: plate + readout → controls promise, so switching the readout
// back and forth costs nothing the second time. Emptied when a panel is
// built, so an outlier flagged in the meantime counts on the next visit.
const controlsCache = new Map();

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

const numberFormat = new Intl.NumberFormat(undefined, { maximumSignificantDigits: 4 });
const ratioFormat = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

// Copied cells: the reader's decimal separator, no grouping, so a spreadsheet
// in that locale reads them as numbers.
const copyFormat = new Intl.NumberFormat(undefined, {
    maximumSignificantDigits: 6,
    useGrouping: false,
});

const fmtNum = (x) => (Number.isFinite(x) ? numberFormat.format(x) : "–");
const fmtRatio = (x) => (Number.isFinite(x) ? ratioFormat.format(x) : "–");
const fmtStat = (s, fmt) => (s.n ? `${fmt(s.mean)} ± ${fmt(s.sd)}` : "–");

/* ------------------------------------------------------------------ *
 * DOM
 * ------------------------------------------------------------------ */

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        .${ROOT_CLASS} {
            margin: 12px 0 4px;
            padding: 10px 14px;
            border: 1px solid #dde3ea;
            border-radius: 3px;
            background: #fafbfc;
            font-size: 12px;
            color: #333;
        }
        .${ROOT_CLASS}-bar {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 8px;
            margin-bottom: 8px;
        }
        .${ROOT_CLASS}-title { font-weight: bold; }
        .${ROOT_CLASS}-status { color: #777; }
        .${ROOT_CLASS}-status.is-error { color: #b0302a; }
        .${ROOT_CLASS}-bar button {
            padding: 2px 9px;
            border: 1px solid #c3c3c3;
            border-radius: 3px;
            background: #fff;
            font-size: 12px;
            cursor: pointer;
        }
        .${ROOT_CLASS}-bar button:hover { background: #f0f4f8; }
        .${ROOT_CLASS}-bar button:disabled { opacity: .5; cursor: default; }
        .${ROOT_CLASS} table { border-collapse: collapse; }
        .${ROOT_CLASS} th,
        .${ROOT_CLASS} td {
            padding: 3px 12px 3px 0;
            text-align: right;
            white-space: nowrap;
        }
        .${ROOT_CLASS} th { color: #666; font-weight: normal; }
        .${ROOT_CLASS} th:first-child,
        .${ROOT_CLASS} td:first-child { text-align: left; }
        .${ROOT_CLASS} tfoot td {
            border-top: 1px solid #dde3ea;
            font-weight: bold;
        }
        .${ROOT_CLASS} .is-low { color: #b0302a; }
    `;
    (document.head || document.documentElement).appendChild(style);
}

function el(tag, props = {}, children = []) {
    const node = Object.assign(document.createElement(tag), props);
    for (const child of children) node.append(child);
    return node;
}

/* ------------------------------------------------------------------ *
 * Panel
 * ------------------------------------------------------------------ */

function buildPanel(vaultId, runId) {
    controlsCache.clear();
    const root = el("div", { className: ROOT_CLASS });
    root.dataset.cddRun = runId;

    const select = el("select", { title: "Readout the windows are calculated from" });
    const copy = el("button", { type: "button", textContent: "Copy", disabled: true });
    copy.title = "Copy the table (tab-separated) for Excel or PowerPoint";
    const status = el("span", { className: `${ROOT_CLASS}-status` });
    const body = el("div");

    root.append(
        el("div", { className: `${ROOT_CLASS}-bar` }, [
            el("span", { className: `${ROOT_CLASS}-title`, textContent: "Assay window" }),
            select,
            copy,
            status,
        ]),
        body
    );

    let rows = [];
    let generation = 0;

    const setStatus = (text, isError = false) => {
        status.textContent = text;
        status.classList.toggle("is-error", isError);
    };

    async function calculate(plates) {
        const gen = ++generation;
        const readoutId = select.value;
        copy.disabled = true;
        body.replaceChildren();
        setStatus(`Reading control wells of ${plates.length} plate(s)…`);

        rows = await mapLimit(plates, FETCH_CONCURRENCY, async (plate) => {
            const key = `${plate.id}:${readoutId}`;
            if (!controlsCache.has(key)) {
                controlsCache.set(key, fetchPlateControls(vaultId, runId, plate.id, readoutId));
            }
            try {
                const controls = await controlsCache.get(key);
                const pos = describe(controls.pos);
                const neg = describe(controls.neg);
                const metrics = pos.n > 1 && neg.n > 1 ? plateMetrics(pos, neg) : null;
                return { plate, pos, neg, flagged: controls.flagged, metrics };
            } catch (error) {
                controlsCache.delete(key);
                console.warn(LOG_PREFIX, "assay window: plate", plate.name, error);
                return { plate, error };
            }
        }, () => gen !== generation);
        if (gen !== generation) return;

        render();
        const failed = rows.filter((r) => r.error).length;
        const flagged = rows.reduce((a, r) => a + (r.flagged || 0), 0);
        const notes = [];
        if (flagged) notes.push(`${flagged} flagged outlier(s) left out`);
        if (failed) notes.push(`${failed} plate(s) could not be read`);
        setStatus(notes.join(" · "), failed > 0);
        copy.disabled = !rows.some((r) => r.metrics);
    }

    function render() {
        const tbody = el("tbody");
        for (const r of rows) {
            const m = r.metrics;
            const cells = [
                r.plate.name,
                r.error ? "error" : `${r.pos.n} / ${r.neg.n}`,
                r.error ? "" : fmtStat(r.pos, fmtNum),
                r.error ? "" : fmtStat(r.neg, fmtNum),
                ...METRIC_KEYS.map((key) => fmtRatio(m?.[key])),
            ].map((text) => el("td", { textContent: text }));
            if (m && m.zPrime < 0.5) cells[cells.length - 1].className = "is-low";
            tbody.append(el("tr", {}, cells));
        }

        const run = runMetrics(rows);
        const tfoot = el("tfoot", {}, [el("tr", {}, [
            el("td", { textContent: `Run mean ± SD (n = ${run.zPrime.n})`, colSpan: 4 }),
            ...METRIC_KEYS.map((key) => el("td", { textContent: fmtStat(run[key], fmtRatio) })),
        ])]);

        const head = [
            "Plate", "n pos / neg", "Pos mean ± SD", "Neg mean ± SD",
            ...METRIC_KEYS.map((key) => METRIC_LABELS[key]),
        ];
        body.replaceChildren(el("table", {}, [
            el("thead", {}, [el("tr", {}, head.map((h) => el("th", { textContent: h })))]),
            tbody,
            tfoot,
        ]));
    }

    function toTsv() {
        const plain = (x) => (Number.isFinite(x) ? ratioFormat.format(x) : "");
        const raw = (x) => (Number.isFinite(x) ? copyFormat.format(x) : "");
        const lines = [[
            "Plate", "n pos", "n neg", "Pos mean", "Pos SD", "Neg mean", "Neg SD",
            ...METRIC_KEYS.map((key) => METRIC_LABELS[key]),
        ]];
        for (const r of rows) {
            if (r.error) continue;
            lines.push([
                r.plate.name, r.pos.n, r.neg.n,
                raw(r.pos.mean), raw(r.pos.sd), raw(r.neg.mean), raw(r.neg.sd),
                ...METRIC_KEYS.map((key) => plain(r.metrics?.[key])),
            ]);
        }
        const run = runMetrics(rows);
        const blank = Array(6).fill("");
        lines.push(["Run mean", ...blank, ...METRIC_KEYS.map((key) => plain(run[key].mean))]);
        lines.push(["Run SD", ...blank, ...METRIC_KEYS.map((key) => plain(run[key].sd))]);
        return lines.map((l) => l.join("\t")).join("\n");
    }

    copy.addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(toTsv());
            setStatus("Copied.");
        } catch (error) {
            setStatus("Copy failed.", true);
            console.warn(LOG_PREFIX, "assay window: copy", error);
        }
    });

    (async () => {
        setStatus("Reading the run's plates…");
        let index;
        try {
            index = await fetchRunHeatMapIndex(vaultId, runId);
        } catch (error) {
            console.warn(LOG_PREFIX, "assay window: heat map index", error);
            setStatus("Could not read the run's heat maps.", true);
            return;
        }
        if (!index.plates.length || !index.readouts.length) {
            root.remove(); // a run without plates or readouts: nothing to say
            return;
        }
        for (const r of index.readouts) {
            select.append(el("option", { value: r.id, textContent: r.name, selected: r.selected }));
        }
        select.addEventListener("change", () => calculate(index.plates));
        calculate(index.plates);
    })();

    return root;
}

/* ------------------------------------------------------------------ *
 * Lifecycle
 * ------------------------------------------------------------------ */

function runFromPath() {
    const match = location.pathname.match(RUN_PATH_RE);
    return match ? { vaultId: match[1], runId: match[2] } : null;
}

function sync() {
    const existing = document.querySelector(`.${ROOT_CLASS}`);
    const run = isAssayWindowEnabled() ? runFromPath() : null;

    if (!run) {
        existing?.remove();
        return;
    }
    if (existing?.dataset.cddRun === run.runId) return;
    existing?.remove();

    const anchor = document.querySelector(ANCHOR_SELECTOR);
    if (!anchor) return;

    injectStyles();
    anchor.after(buildPanel(run.vaultId, run.runId));
}

export function initRunAssayWindow() {
    if (started) return;
    started = true;

    let scheduled = false;
    const schedule = () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            try {
                sync();
            } catch (error) {
                console.warn(LOG_PREFIX, "assay window", error);
            }
        });
    };

    initAssayWindow().then(schedule);
    onAssayWindowChanged(schedule);
    new MutationObserver(schedule).observe(document.documentElement, {
        childList: true,
        subtree: true,
    });
}
