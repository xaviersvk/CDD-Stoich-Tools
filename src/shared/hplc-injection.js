// shared/hplc-injection.js — the three parameters behind the panel's HPLC
// injection block, all in chrome.storage.local:
//
//   aliquot  µL   drawn out of the reaction mixture
//   vial     mL   FINAL volume of the diluted sample (aliquot included)
//   target   nmol wanted on the column
//
// There is exactly one copy of each: the panel's inline inputs and the
// options page write the same keys, so editing either is the same edit.
//
// DOM-free; read by the content script (sync cache) and the options page
// (async load/save). The arithmetic these feed lives in
// hplc-injection-math.js, which the page-context inject bundle also uses.

export const HPLC_ALIQUOT_VOLUME_UL_KEY = "cddHplcAliquotVolumeUl";
export const HPLC_VIAL_VOLUME_ML_KEY = "cddHplcVialVolumeMl";
export const HPLC_TARGET_AMOUNT_NMOL_KEY = "cddHplcTargetAmountNmol";

export const DEFAULT_HPLC_ALIQUOT_VOLUME_UL = 10;
export const DEFAULT_HPLC_VIAL_VOLUME_ML = 1.5;
export const DEFAULT_HPLC_TARGET_AMOUNT_NMOL = 0.2;

// Every one of the three is a positive volume or amount; zero and negatives
// are not "small", they are unusable, and they fall back to the default.
function sanitizePositive(raw, fallback) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return n;
}

export function sanitizeAliquotVolumeUl(raw) {
    return sanitizePositive(raw, DEFAULT_HPLC_ALIQUOT_VOLUME_UL);
}

export function sanitizeVialVolumeMl(raw) {
    return sanitizePositive(raw, DEFAULT_HPLC_VIAL_VOLUME_ML);
}

export function sanitizeTargetAmountNmol(raw) {
    return sanitizePositive(raw, DEFAULT_HPLC_TARGET_AMOUNT_NMOL);
}

const DEFAULTS = {
    aliquotUl: DEFAULT_HPLC_ALIQUOT_VOLUME_UL,
    vialMl: DEFAULT_HPLC_VIAL_VOLUME_ML,
    targetNmol: DEFAULT_HPLC_TARGET_AMOUNT_NMOL,
};

export async function loadHplcSettings() {
    try {
        const result = await chrome.storage.local.get([
            HPLC_ALIQUOT_VOLUME_UL_KEY,
            HPLC_VIAL_VOLUME_ML_KEY,
            HPLC_TARGET_AMOUNT_NMOL_KEY,
        ]);
        return {
            aliquotUl: sanitizeAliquotVolumeUl(result?.[HPLC_ALIQUOT_VOLUME_UL_KEY]),
            vialMl: sanitizeVialVolumeMl(result?.[HPLC_VIAL_VOLUME_ML_KEY]),
            targetNmol: sanitizeTargetAmountNmol(result?.[HPLC_TARGET_AMOUNT_NMOL_KEY]),
        };
    } catch {
        return { ...DEFAULTS };
    }
}

async function saveKey(key, value, sanitize) {
    try {
        await chrome.storage.local.set({ [key]: sanitize(value) });
    } catch {
        // Orphaned content script — nothing useful to do.
    }
}

export function saveHplcAliquotVolumeUl(value) {
    return saveKey(HPLC_ALIQUOT_VOLUME_UL_KEY, value, sanitizeAliquotVolumeUl);
}

export function saveHplcVialVolumeMl(value) {
    return saveKey(HPLC_VIAL_VOLUME_ML_KEY, value, sanitizeVialVolumeMl);
}

export function saveHplcTargetAmountNmol(value) {
    return saveKey(HPLC_TARGET_AMOUNT_NMOL_KEY, value, sanitizeTargetAmountNmol);
}

/* Sync cache for render paths, refreshed via chrome.storage.onChanged. */

let cached = { ...DEFAULTS };
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

export function getHplcSettings() {
    return cached;
}

export function onHplcSettingsChanged(cb) {
    changeListeners.add(cb);
    return () => changeListeners.delete(cb);
}

export async function initHplcSettings() {
    if (!listenerAttached && chrome?.storage?.onChanged) {
        listenerAttached = true;
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== "local") return;

            let touched = false;
            if (changes[HPLC_ALIQUOT_VOLUME_UL_KEY]) {
                cached = {
                    ...cached,
                    aliquotUl: sanitizeAliquotVolumeUl(changes[HPLC_ALIQUOT_VOLUME_UL_KEY].newValue),
                };
                touched = true;
            }
            if (changes[HPLC_VIAL_VOLUME_ML_KEY]) {
                cached = {
                    ...cached,
                    vialMl: sanitizeVialVolumeMl(changes[HPLC_VIAL_VOLUME_ML_KEY].newValue),
                };
                touched = true;
            }
            if (changes[HPLC_TARGET_AMOUNT_NMOL_KEY]) {
                cached = {
                    ...cached,
                    targetNmol: sanitizeTargetAmountNmol(changes[HPLC_TARGET_AMOUNT_NMOL_KEY].newValue),
                };
                touched = true;
            }
            if (touched) notify();
        });
    }

    cached = await loadHplcSettings();
    notify();
    return cached;
}
