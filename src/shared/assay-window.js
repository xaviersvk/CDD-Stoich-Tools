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

/* ------------------------------------------------------------------ *
 * Arithmetic
 * ------------------------------------------------------------------ */

// { n, mean, sd } of the finite numbers in `values`; sd is NaN below n = 2.
export function describe(values) {
    const xs = values.filter(Number.isFinite);
    const n = xs.length;
    if (!n) return { n: 0, mean: NaN, sd: NaN };
    const mean = xs.reduce((a, b) => a + b, 0) / n;
    const sd = n > 1
        ? Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1))
        : NaN;
    return { n, mean, sd };
}

// Metrics from the two control groups' descriptive stats. Besides the three
// above: each control's CV (%), and S/N = |mean(pos) − mean(neg)| / SD(neg).
export function plateMetrics(pos, neg) {
    const delta = Math.abs(pos.mean - neg.mean);
    const spread = pos.sd + neg.sd;
    return {
        cvPos: (100 * pos.sd) / Math.abs(pos.mean),
        cvNeg: (100 * neg.sd) / Math.abs(neg.mean),
        aw: pos.mean / neg.mean,
        sn: delta / neg.sd,
        sw: delta / spread,
        zPrime: 1 - (3 * spread) / delta,
    };
}

export const METRIC_KEYS = ["cvPos", "cvNeg", "aw", "sn", "sw", "zPrime"];

// Mean ± SD of each metric over the plates that have one.
export function runMetrics(plates) {
    return Object.fromEntries(
        METRIC_KEYS.map((key) => [key, describe(plates.map((p) => p.metrics?.[key]))])
    );
}
