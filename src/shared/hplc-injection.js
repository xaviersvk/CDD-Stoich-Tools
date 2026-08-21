// shared/hplc-injection.js — the DEFAULTS behind the panel's HPLC injection
// block, all in chrome.storage.local:
//
//   aliquot  µL   drawn out of the reaction mixture
//   vial     mL   FINAL volume of the diluted sample (aliquot included)
//   target   nmol wanted on the column
//
// Defaults, not values. One assay takes a single 10 µL drop and the next
// takes two, and that is a property of the reaction in front of you, not a
// setting to flip back and forth — so the panel block edits its OWN copy
// per reaction and never writes back here. These three are only what a
// block starts from. See content/features/hplc-injection-block.js.
//
// DOM-free; read by the content script (sync cache) and the options page
// (async load/save). The arithmetic these feed lives in
// hplc-injection-math.js, which the page-context inject bundle also uses.

import {
    DEFAULT_COMFORT_MAX_UL,
    DEFAULT_COMFORT_MIN_UL,
    DEFAULT_VIAL_LADDER_ML,
    parseVialLadder,
} from "./hplc-optimizer.js";

export const HPLC_ALIQUOT_VOLUME_UL_KEY = "cddHplcAliquotVolumeUl";
export const HPLC_VIAL_VOLUME_ML_KEY = "cddHplcVialVolumeMl";
export const HPLC_TARGET_AMOUNT_NMOL_KEY = "cddHplcTargetAmountNmol";
export const HPLC_BLOCK_ENABLED_KEY = "cddHplcBlockEnabled";

// The vessel sizes this bench actually stocks. Stored as the user typed
// it, parsed on the way out — a half-edited list must never reach the
// optimiser as an empty ladder with nothing to choose from.
export const HPLC_VIAL_LADDER_KEY = "cddHplcVialLadder";

// The injection range that is comfortable to work in. The injector's own
// 0.1–10 µL limits are facts and stay constants; this pair is a preference
// that depends on the method, so it is a setting.
export const HPLC_COMFORT_MIN_KEY = "cddHplcComfortMinUl";
export const HPLC_COMFORT_MAX_KEY = "cddHplcComfortMaxUl";

export const DEFAULT_HPLC_ALIQUOT_VOLUME_UL = 10;
export const DEFAULT_HPLC_VIAL_VOLUME_ML = 1.5;
export const DEFAULT_HPLC_TARGET_AMOUNT_NMOL = 0.2;

// OFF by default. The block answers a question only some workflows ask, and
// a panel that grows a new box for everyone on upgrade is a worse default
// than one the people who want it switch on.
export const DEFAULT_HPLC_BLOCK_ENABLED = false;

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

// Anything that was never written reads as the default; only an explicit
// `false` turns the block off.
export function sanitizeBlockEnabled(raw) {
    return typeof raw === "boolean" ? raw : DEFAULT_HPLC_BLOCK_ENABLED;
}

// A band is only a band if the bottom is below the top. Either value on its
// own can be sanitised in isolation; the PAIR cannot, so a crossed-over range
// falls back to both defaults rather than to a silently reordered one.
export function sanitizeComfortBand(rawMin, rawMax) {
    const min = Number(rawMin);
    const max = Number(rawMax);

    const usable =
        Number.isFinite(min) && Number.isFinite(max) && min > 0 && max > min;

    return usable
        ? { comfortMinUl: min, comfortMaxUl: max }
        : { comfortMinUl: DEFAULT_COMFORT_MIN_UL, comfortMaxUl: DEFAULT_COMFORT_MAX_UL };
}

const DEFAULTS = {
    aliquotUl: DEFAULT_HPLC_ALIQUOT_VOLUME_UL,
    vialMl: DEFAULT_HPLC_VIAL_VOLUME_ML,
    targetNmol: DEFAULT_HPLC_TARGET_AMOUNT_NMOL,
    enabled: DEFAULT_HPLC_BLOCK_ENABLED,
    vialLadderMl: [...DEFAULT_VIAL_LADDER_ML],
    comfortMinUl: DEFAULT_COMFORT_MIN_UL,
    comfortMaxUl: DEFAULT_COMFORT_MAX_UL,
};

export async function loadHplcSettings() {
    try {
        const result = await chrome.storage.local.get([
            HPLC_ALIQUOT_VOLUME_UL_KEY,
            HPLC_VIAL_VOLUME_ML_KEY,
            HPLC_TARGET_AMOUNT_NMOL_KEY,
            HPLC_BLOCK_ENABLED_KEY,
            HPLC_VIAL_LADDER_KEY,
            HPLC_COMFORT_MIN_KEY,
            HPLC_COMFORT_MAX_KEY,
        ]);
        return {
            aliquotUl: sanitizeAliquotVolumeUl(result?.[HPLC_ALIQUOT_VOLUME_UL_KEY]),
            vialMl: sanitizeVialVolumeMl(result?.[HPLC_VIAL_VOLUME_ML_KEY]),
            targetNmol: sanitizeTargetAmountNmol(result?.[HPLC_TARGET_AMOUNT_NMOL_KEY]),
            enabled: sanitizeBlockEnabled(result?.[HPLC_BLOCK_ENABLED_KEY]),
            vialLadderMl: parseVialLadder(result?.[HPLC_VIAL_LADDER_KEY]),
            ...sanitizeComfortBand(
                result?.[HPLC_COMFORT_MIN_KEY],
                result?.[HPLC_COMFORT_MAX_KEY]
            ),
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

// Written as a pair, because that is the only level at which they make
// sense — see sanitizeComfortBand.
export async function saveHplcComfortBand(rawMin, rawMax) {
    const band = sanitizeComfortBand(rawMin, rawMax);
    try {
        await chrome.storage.local.set({
            [HPLC_COMFORT_MIN_KEY]: band.comfortMinUl,
            [HPLC_COMFORT_MAX_KEY]: band.comfortMaxUl,
        });
    } catch {
        // Orphaned content script — nothing useful to do.
    }
}

export function saveHplcVialLadder(value) {
    return saveKey(HPLC_VIAL_LADDER_KEY, value, (raw) => String(raw ?? ""));
}

export function saveHplcBlockEnabled(value) {
    return saveKey(HPLC_BLOCK_ENABLED_KEY, value, sanitizeBlockEnabled);
}

/* Sync cache for render paths, refreshed via chrome.storage.onChanged. */

let cached = { ...DEFAULTS };
let listenerAttached = false;

// TWO listener sets, and the split matters.
//
// A value change (aliquot, vial, target) only ever changes a NUMBER the
// block already shows, so the block repaints itself in place — no panel
// re-render, which is what keeps the caret in the input being typed in.
//
// The on/off flag adds or removes whole blocks, so it needs the panel to
// re-render. Firing that on every value change would tear the input out
// from under the user mid-edit.
const changeListeners = new Set();
const enabledListeners = new Set();

function notifyEach(listeners) {
    for (const cb of listeners) {
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

export function isHplcBlockEnabled() {
    return cached.enabled;
}

export function onHplcSettingsChanged(cb) {
    changeListeners.add(cb);
    return () => changeListeners.delete(cb);
}

export function onHplcBlockEnabledChanged(cb) {
    enabledListeners.add(cb);
    return () => enabledListeners.delete(cb);
}

export async function initHplcSettings() {
    if (!listenerAttached && chrome?.storage?.onChanged) {
        listenerAttached = true;
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== "local") return;

            let touched = false;
            let enabledTouched = false;
            if (changes[HPLC_BLOCK_ENABLED_KEY]) {
                cached = {
                    ...cached,
                    enabled: sanitizeBlockEnabled(changes[HPLC_BLOCK_ENABLED_KEY].newValue),
                };
                enabledTouched = true;
            }
            if (changes[HPLC_COMFORT_MIN_KEY] || changes[HPLC_COMFORT_MAX_KEY]) {
                const min = changes[HPLC_COMFORT_MIN_KEY]
                    ? changes[HPLC_COMFORT_MIN_KEY].newValue
                    : cached.comfortMinUl;
                const max = changes[HPLC_COMFORT_MAX_KEY]
                    ? changes[HPLC_COMFORT_MAX_KEY].newValue
                    : cached.comfortMaxUl;
                cached = { ...cached, ...sanitizeComfortBand(min, max) };
                touched = true;
            }
            if (changes[HPLC_VIAL_LADDER_KEY]) {
                cached = {
                    ...cached,
                    vialLadderMl: parseVialLadder(changes[HPLC_VIAL_LADDER_KEY].newValue),
                };
                touched = true;
            }
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
            if (touched) notifyEach(changeListeners);
            if (enabledTouched) notifyEach(enabledListeners);
        });
    }

    cached = await loadHplcSettings();
    notifyEach(changeListeners);
    notifyEach(enabledListeners);
    return cached;
}
