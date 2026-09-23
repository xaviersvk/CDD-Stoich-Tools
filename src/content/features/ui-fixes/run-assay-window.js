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
// shown: each control's CV %, plate drift, S/N and robust Z′. Every header
// says what the column is and every cell how its value was calculated, as a
// tooltip (METRICS below).

import { fetchPlateControls, fetchRunHeatMapIndex } from "../../api/run-heat-maps.js";
import { mapLimit } from "../../utils/concurrency.js";
import {
    addDrift,
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

// Values past these are shown in red.
const Z_LOW = 0.5;
const DRIFT_HIGH = 20; // % from the run's average plate

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

const driftFormat = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: "exceptZero",
});
const fmtDrift = (x) => (Number.isFinite(x) ? driftFormat.format(x) : "–");

/* ------------------------------------------------------------------ *
 * Columns — what each one is (header tooltip) and how this plate's value
 * came out (cell tooltip, the formula with the plate's own numbers).
 * `ctx` carries the run averages the drift columns compare against.
 * ------------------------------------------------------------------ */

const MAD = "1.4826·MAD";

const METRICS = {
    cvPos: {
        label: "CV pos %",
        help: "Coefficient of variation of the positive control wells — how noisy that control is.\nCV = SD / mean × 100",
        explain: (r) => `${fmtNum(r.pos.sd)} / ${fmtNum(r.pos.mean)} × 100`,
    },
    cvNeg: {
        label: "CV neg %",
        help: "Coefficient of variation of the negative control wells — how noisy that control is.\nCV = SD / mean × 100",
        explain: (r) => `${fmtNum(r.neg.sd)} / ${fmtNum(r.neg.mean)} × 100`,
    },
    driftPos: {
        label: "Drift pos %",
        help: `Plate drift of the positive control: how far this plate's mean sits from the run's average plate (mean of all plates' positive means).\nDrift = (mean − run average) / run average × 100\nRed beyond ±${DRIFT_HIGH} %.`,
        explain: (r, ctx) => `(${fmtNum(r.pos.mean)} − ${fmtNum(ctx.avgPos)}) / ${fmtNum(ctx.avgPos)} × 100`,
        format: fmtDrift,
        warn: (x) => Math.abs(x) > DRIFT_HIGH,
        noRunStat: true,
    },
    driftNeg: {
        label: "Drift neg %",
        help: `Plate drift of the negative control: how far this plate's mean sits from the run's average plate (mean of all plates' negative means).\nDrift = (mean − run average) / run average × 100\nRed beyond ±${DRIFT_HIGH} %.`,
        explain: (r, ctx) => `(${fmtNum(r.neg.mean)} − ${fmtNum(ctx.avgNeg)}) / ${fmtNum(ctx.avgNeg)} × 100`,
        format: fmtDrift,
        warn: (x) => Math.abs(x) > DRIFT_HIGH,
        noRunStat: true,
    },
    aw: {
        label: "AW",
        help: "Assay window: how many times the positive control signal exceeds the negative.\nAW = mean(pos) / mean(neg)",
        explain: (r) => `${fmtNum(r.pos.mean)} / ${fmtNum(r.neg.mean)}`,
    },
    sn: {
        label: "S/N",
        help: "Signal to noise: the control separation in units of the negative control's SD.\nS/N = |mean(pos) − mean(neg)| / SD(neg)",
        explain: (r) => `|${fmtNum(r.pos.mean)} − ${fmtNum(r.neg.mean)}| / ${fmtNum(r.neg.sd)}`,
    },
    sw: {
        label: "SW",
        help: "Signal window: the control separation in units of the two controls' summed SD.\nSW = |mean(pos) − mean(neg)| / (SD(pos) + SD(neg))\n(= 3 / (1 − Z′))",
        explain: (r) => `|${fmtNum(r.pos.mean)} − ${fmtNum(r.neg.mean)}| / (${fmtNum(r.pos.sd)} + ${fmtNum(r.neg.sd)})`,
    },
    zPrime: {
        label: "Z′",
        help: `Z′-factor: plate quality from the controls alone, as CDD calculates it (sample SD, flagged outliers left out). ≥ 0.5 is an excellent assay; red below ${Z_LOW}.\nZ′ = 1 − 3·(SD(pos) + SD(neg)) / |mean(pos) − mean(neg)|`,
        explain: (r) => `1 − 3·(${fmtNum(r.pos.sd)} + ${fmtNum(r.neg.sd)}) / |${fmtNum(r.pos.mean)} − ${fmtNum(r.neg.mean)}|`,
        warn: (x) => x < Z_LOW,
    },
    zRobust: {
        label: "Robust Z′",
        help: `Z′ with median in place of mean and ${MAD} (median absolute deviation, scaled to match SD) in place of SD. A single stray well barely moves it — well below Z′ means the controls are broadly noisy; well above means a few outlier wells are pulling Z′ down. Red below ${Z_LOW}.\nRobust Z′ = 1 − 3·(${MAD}(pos) + ${MAD}(neg)) / |median(pos) − median(neg)|`,
        explain: (r) => `1 − 3·1.4826·(${fmtNum(r.pos.mad)} + ${fmtNum(r.neg.mad)}) / |${fmtNum(r.pos.median)} − ${fmtNum(r.neg.median)}|`,
        warn: (x) => x < Z_LOW,
    },
};

const RUN_HELP = "Mean ± SD of each metric over the run's plates.";

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
        .${ROOT_CLASS}[hidden] { display: none; }
        .${ROOT_CLASS}.is-collapsed { padding-top: 5px; padding-bottom: 5px; }
        .${ROOT_CLASS}.is-collapsed .${ROOT_CLASS}-bar { margin-bottom: 0; }
        .${ROOT_CLASS}.is-collapsed .${ROOT_CLASS}-bar > :not(.${ROOT_CLASS}-toggle),
        .${ROOT_CLASS}.is-collapsed .${ROOT_CLASS}-body { display: none; }
        .${ROOT_CLASS} .${ROOT_CLASS}-bar .${ROOT_CLASS}-toggle {
            padding: 0;
            border: 0;
            background: none;
            font-weight: bold;
            color: #333;
        }
        .${ROOT_CLASS} .${ROOT_CLASS}-bar .${ROOT_CLASS}-toggle:hover {
            background: none;
            color: #1a6fc9;
        }
        .${ROOT_CLASS}-toggle::before {
            content: "▾";
            display: inline-block;
            width: 1em;
            color: #888;
        }
        .${ROOT_CLASS}.is-collapsed .${ROOT_CLASS}-toggle::before { content: "▸"; }
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
        .${ROOT_CLASS}-body { overflow-x: auto; }
        .${ROOT_CLASS} table { border-collapse: collapse; }
        .${ROOT_CLASS} th[title] {
            cursor: help;
            text-decoration: underline dotted #aaa;
            text-underline-offset: 3px;
        }
        .${ROOT_CLASS} td[title] { cursor: help; }
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
    const body = el("div", { className: `${ROOT_CLASS}-body` });
    const toggle = el("button", {
        type: "button",
        className: `${ROOT_CLASS}-toggle`,
        textContent: "Plate QC",
    });

    root.append(
        el("div", { className: `${ROOT_CLASS}-bar` }, [toggle, select, copy, status]),
        body
    );

    let rows = [];
    let driftCtx = null;
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

        driftCtx = addDrift(rows);
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
                el("td", { textContent: r.plate.name }),
                el("td", { textContent: r.error ? "error" : `${r.pos.n} / ${r.neg.n}` }),
                el("td", { textContent: r.error ? "" : fmtStat(r.pos, fmtNum) }),
                el("td", { textContent: r.error ? "" : fmtStat(r.neg, fmtNum) }),
            ];
            for (const key of METRIC_KEYS) {
                const spec = METRICS[key];
                const value = m?.[key];
                const td = el("td", { textContent: (spec.format || fmtRatio)(value) });
                if (Number.isFinite(value)) {
                    td.title = `${spec.label} = ${spec.explain(r, driftCtx)} = ${(spec.format || fmtRatio)(value)}`;
                    if (spec.warn?.(value)) td.className = "is-low";
                }
                cells.push(td);
            }
            tbody.append(el("tr", {}, cells));
        }

        const run = runMetrics(rows);
        const tfoot = el("tfoot", {}, [el("tr", {}, [
            el("td", { textContent: `Run mean ± SD (n = ${run.zPrime.n})`, colSpan: 4, title: RUN_HELP }),
            ...METRIC_KEYS.map((key) => el("td", {
                textContent: METRICS[key].noRunStat ? "" : fmtStat(run[key], fmtRatio),
                title: RUN_HELP,
            })),
        ])]);

        const head = [
            ["Plate", "Plate name in CDD."],
            ["n pos / neg", "Positive / negative control wells counted (outliers flagged in CDD are left out)."],
            ["Pos mean ± SD", "Mean ± sample SD (n − 1) of the positive control wells."],
            ["Neg mean ± SD", "Mean ± sample SD (n − 1) of the negative control wells."],
            ...METRIC_KEYS.map((key) => [METRICS[key].label, METRICS[key].help]),
        ];
        body.replaceChildren(el("table", {}, [
            el("thead", {}, [el("tr", {}, head.map(([text, title]) => el("th", { textContent: text, title })))]),
            tbody,
            tfoot,
        ]));
    }

    function toTsv() {
        const plain = (x) => (Number.isFinite(x) ? ratioFormat.format(x) : "");
        const raw = (x) => (Number.isFinite(x) ? copyFormat.format(x) : "");
        const lines = [[
            "Plate", "n pos", "n neg", "Pos mean", "Pos SD", "Neg mean", "Neg SD",
            ...METRIC_KEYS.map((key) => METRICS[key].label.replace("′", "'")),
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
        const runCell = (key, stat) => (METRICS[key].noRunStat ? "" : plain(run[key][stat]));
        lines.push(["Run mean", ...blank, ...METRIC_KEYS.map((key) => runCell(key, "mean"))]);
        lines.push(["Run SD", ...blank, ...METRIC_KEYS.map((key) => runCell(key, "sd"))]);
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

    // Nothing is fetched until the panel is first shown open.
    let loading = null;
    const load = () => (loading ||= (async () => {
        setStatus("Reading the run's plates…");
        let index;
        try {
            index = await fetchRunHeatMapIndex(vaultId, runId);
        } catch (error) {
            console.warn(LOG_PREFIX, "assay window: heat map index", error);
            setStatus("Could not read the run's heat maps.", true);
            loading = null; // opening it again retries
            return;
        }
        if (!index.plates.length || !index.readouts.length) {
            // A run without plates or readouts: nothing to say. Hidden, not
            // removed — a removed panel would be rebuilt by the observer.
            root.hidden = true;
            return;
        }
        for (const r of index.readouts) {
            select.append(el("option", { value: r.id, textContent: r.name, selected: r.selected }));
        }
        select.addEventListener("change", () => calculate(index.plates));
        calculate(index.plates);
    })());

    const setCollapsed = (collapsed) => {
        root.classList.toggle("is-collapsed", collapsed);
        toggle.setAttribute("aria-expanded", String(!collapsed));
        toggle.title = collapsed ? "Show plate QC" : "Fold to one line";
        if (!collapsed) load();
    };

    toggle.addEventListener("click", () => {
        setCollapsed(!root.classList.contains("is-collapsed"));
    });

    // Every run starts folded: the table is there for whoever opens it, and
    // nobody else pays for the heat map fetches.
    setCollapsed(true);

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
