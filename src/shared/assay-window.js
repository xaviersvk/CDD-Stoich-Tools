// shared/assay-window.js — plate QC from a run's control wells: assay window,
// signal window and Z′, per plate and averaged over the run. DOM-free: the
// switch in storage plus the arithmetic, shared by the run-page panel and the
// options page.
//
//   AW = mean(pos) / mean(neg)
//   SW = |mean(pos) − mean(neg)| / (SD(pos) + SD(neg))
//   Z′ = 1 − 3·(SD(pos) + SD(neg)) / |mean(pos) − mean(neg)|
//
// SD is the sample SD (n − 1) — with it Z′ lands on exactly the value CDD
// prints in the run's Data Summary, which is how the formulas were checked.
// Note SW = 3 / (1 − Z′); it is shown anyway because that is how the lab
// reports it.
//
// On by default; an explicit `false` in storage turns it off.

export const ASSAY_WINDOW_STORAGE_KEY = "cddAssayWindow";

export async function getAssayWindowEnabled() {
    try {
        const result = await chrome.storage.local.get(ASSAY_WINDOW_STORAGE_KEY);
        return result?.[ASSAY_WINDOW_STORAGE_KEY] !== false;
    } catch {
        return true;
    }
}

export async function saveAssayWindowEnabled(value) {
    try {
        await chrome.storage.local.set({ [ASSAY_WINDOW_STORAGE_KEY]: value === true });
    } catch {
        // Orphaned content script — nothing useful to do.
    }
}

let cached = true;
let listenerAttached = false;
const changeListeners = new Set();

function notify() {
    for (const cb of changeListeners) {
        try {
            cb(cached);
        } catch {
            /* a misbehaving listener must not break the others */
        }
    }
}

export function isAssayWindowEnabled() {
    return cached;
}

export function onAssayWindowChanged(cb) {
    changeListeners.add(cb);
    return () => changeListeners.delete(cb);
}

export async function initAssayWindow() {
    if (!listenerAttached && chrome?.storage?.onChanged) {
        listenerAttached = true;
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== "local" || !changes[ASSAY_WINDOW_STORAGE_KEY]) return;
            cached = changes[ASSAY_WINDOW_STORAGE_KEY].newValue !== false;
            notify();
        });
    }
    cached = await getAssayWindowEnabled();
    notify();
    return cached;
}

// Folded to its title line: remembered across runs, so someone who does not
// want the table sees one line and no plate is fetched until it is opened.
// Folded by default; opening it once stores an explicit `false`.
export const ASSAY_WINDOW_COLLAPSED_KEY = "cddAssayWindowCollapsed";

export async function getAssayWindowCollapsed() {
    try {
        const result = await chrome.storage.local.get(ASSAY_WINDOW_COLLAPSED_KEY);
        return result?.[ASSAY_WINDOW_COLLAPSED_KEY] !== false;
    } catch {
        return true;
    }
}

export async function saveAssayWindowCollapsed(value) {
    try {
        await chrome.storage.local.set({ [ASSAY_WINDOW_COLLAPSED_KEY]: value === true });
    } catch {
        // Orphaned content script — nothing useful to do.
    }
}

/* ------------------------------------------------------------------ *
 * Arithmetic
 * ------------------------------------------------------------------ */

// MAD × 1.4826 estimates the SD of normally distributed data, so robust Z′
// reads on the same scale as Z′ — until an outlier drags the SD away.
export const MAD_TO_SD = 1.4826;

function median(sorted) {
    const n = sorted.length;
    if (!n) return NaN;
    const mid = Math.floor(n / 2);
    return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// { n, mean, sd, median, mad } of the finite numbers in `values`; sd is NaN
// below n = 2. `mad` is the raw median absolute deviation (not scaled).
export function describe(values) {
    const xs = values.filter(Number.isFinite);
    const n = xs.length;
    if (!n) return { n: 0, mean: NaN, sd: NaN, median: NaN, mad: NaN };
    const mean = xs.reduce((a, b) => a + b, 0) / n;
    const sd = n > 1
        ? Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1))
        : NaN;
    const med = median([...xs].sort((a, b) => a - b));
    const mad = median(xs.map((x) => Math.abs(x - med)).sort((a, b) => a - b));
    return { n, mean, sd, median: med, mad };
}

// Metrics from the two control groups' descriptive stats. Besides AW, SW and
// Z′: each control's CV (%), S/N = |Δmean| / SD(neg), and robust Z′ — Z′ with
// median for mean and 1.4826·MAD for SD, which one stray well cannot move.
export function plateMetrics(pos, neg) {
    const delta = Math.abs(pos.mean - neg.mean);
    const spread = pos.sd + neg.sd;
    const robustDelta = Math.abs(pos.median - neg.median);
    const robustSpread = MAD_TO_SD * (pos.mad + neg.mad);
    return {
        cvPos: (100 * pos.sd) / Math.abs(pos.mean),
        cvNeg: (100 * neg.sd) / Math.abs(neg.mean),
        aw: pos.mean / neg.mean,
        sn: delta / neg.sd,
        sw: delta / spread,
        zPrime: 1 - (3 * spread) / delta,
        zRobust: 1 - (3 * robustSpread) / robustDelta,
    };
}

// Plate drift: how far each plate's control means sit from the run's average
// plate (the mean of the plates' means), in %. Written onto each row as
// `metrics.driftPos` / `metrics.driftNeg`; returns the two run averages.
export function addDrift(plates) {
    const scored = plates.filter((p) => p.metrics);
    const avgPos = describe(scored.map((p) => p.pos.mean)).mean;
    const avgNeg = describe(scored.map((p) => p.neg.mean)).mean;
    for (const p of scored) {
        p.metrics.driftPos = (100 * (p.pos.mean - avgPos)) / Math.abs(avgPos);
        p.metrics.driftNeg = (100 * (p.neg.mean - avgNeg)) / Math.abs(avgNeg);
    }
    return { avgPos, avgNeg };
}

export const METRIC_KEYS = [
    "cvPos", "cvNeg", "driftPos", "driftNeg", "aw", "sn", "sw", "zPrime", "zRobust",
];

// Mean ± SD of each metric over the plates that have one.
export function runMetrics(plates) {
    return Object.fromEntries(
        METRIC_KEYS.map((key) => [key, describe(plates.map((p) => p.metrics?.[key]))])
    );
}
