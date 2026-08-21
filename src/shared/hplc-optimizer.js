// shared/hplc-optimizer.js
//
// "That injection is not one the instrument can deliver — so what should I do
// instead?"
//
// The block next door computes a volume. This works out which dilution turns
// an unusable volume into a usable one, and says so in one sentence.
//
// Everything rests on one observation: the injection volume depends only on
// the RATIO of vial to aliquot, not on either number by itself.
//
//     V_inj = n_target × (V_vial / V_aliquot) / (1000 × M)
//
// So the three levers below are the same lever. They differ only in how much
// bench work they cost and which way they push the ratio.
//
// Pure — no DOM, no chrome.*, no clock.

import { computeInjectionVolume } from "./hplc-injection-math.js";

// What the injector can physically do, and where it is happy. Instrument
// facts, not preferences, which is why they are constants and not settings.
export const INJECTION_MIN_UL = 0.1;
export const INJECTION_MAX_UL = 10;
export const COMFORT_MIN_UL = 0.5;
export const COMFORT_MAX_UL = 2;

// The centre of the comfortable band, multiplicatively: sqrt(0.5 * 2) = 1.
// An injection volume is a ratio, so 0.5 and 2 are equally far from it —
// which is how the band reads to a chemist.
const COMFORT_CENTRE_UL = Math.sqrt(COMFORT_MIN_UL * COMFORT_MAX_UL);

// You can add drops. You cannot take half a one — a sub-drop aliquot is not
// pipetted, it is a drop that has been diluted, which is the third lever.
export const MAX_DROPS = 5;

// The steps the bench's own printed grid uses.
export const DILUTION_FACTORS = [2, 5, 10, 20];

export const DEFAULT_VIAL_LADDER_ML = [0.1, 0.25, 0.5, 1, 1.5, 2];

// "0.1, 0.25, 0.5, 1, 1.5, 2" -> [0.1, 0.25, 0.5, 1, 1.5, 2]
// Anything unparseable falls back to the default rather than leaving the
// optimiser with nothing to choose from.
export function parseVialLadder(raw) {
    if (Array.isArray(raw)) return normalizeLadder(raw);

    const parts = String(raw ?? "")
        .split(/[,;\s]+/)
        .map((p) => Number(p.replace(",", ".")));

    return normalizeLadder(parts);
}

function normalizeLadder(values) {
    const clean = [...new Set(values.filter((n) => Number.isFinite(n) && n > 0))];
    clean.sort((a, b) => a - b);
    return clean.length ? clean : [...DEFAULT_VIAL_LADDER_ML];
}

export function formatVialLadder(ladder) {
    return (ladder || []).join(", ");
}

/* ------------------------------------------------------------------ *
 * The search
 * ------------------------------------------------------------------ */

// One candidate way of preparing the sample.
function candidate({ molarity, targetNmol, dropUl, drops, vialMl, dilution }) {
    // A diluted aliquot is one drop carried through `dilution` steps: the
    // material that reaches the vial is the same as if a smaller aliquot had
    // been taken, which is what the maths needs.
    const aliquotUl = (drops * dropUl) / dilution;

    const computed = computeInjectionVolume({
        molarity,
        aliquotUl,
        vialMl,
        targetNmol,
    });
    if (!computed) return null;

    return { drops, vialMl, dilution, aliquotUl, volumeUl: computed.volumeUl };
}

// Cheapest first. Each layer is a complete set of candidates; the caller
// takes the first layer that contains anything acceptable.
function layers({ molarity, targetNmol, dropUl, vialLadderMl }) {
    const make = (drops, dilution) =>
        vialLadderMl
            .map((vialMl) =>
                candidate({ molarity, targetNmol, dropUl, drops, vialMl, dilution })
            )
            .filter(Boolean);

    const out = [];

    // 1 — one drop, just a different vessel.
    out.push(make(1, 1));

    // 2 — more drops. Only ever more; below one drop is not a thing.
    const moreDrops = [];
    for (let drops = 2; drops <= MAX_DROPS; drops += 1) moreDrops.push(...make(drops, 1));
    out.push(moreDrops);

    // 3 — dilute the aliquot. The extra bench step, so it goes last.
    const diluted = [];
    for (const dilution of DILUTION_FACTORS) diluted.push(...make(1, dilution));
    out.push(diluted);

    return out;
}

// How many levers this candidate moves away from what is set now. Ranking on
// this FIRST is what stops the optimiser proposing "dilute 5x AND switch
// vial" when "dilute 5x, keep your vial" is equally injectable.
//
// Compared on the EFFECTIVE aliquot, not on the drops-and-dilution pair that
// produced it. Once a suggestion has been applied, its dilution is baked into
// the aliquot and is no longer a change — counting `dilution !== 1` as one
// regardless made the optimiser re-suggest what the user had just done, so
// clicking it moved the numbers and left the identical sentence on screen.
function changeCount(cand, { currentAliquotUl, currentVialMl }) {
    let changes = 0;
    if (Math.abs(cand.aliquotUl - currentAliquotUl) > 1e-9) changes += 1;
    if (Math.abs(cand.vialMl - currentVialMl) > 1e-9) changes += 1;
    return changes;
}

function distanceFromCentre(cand) {
    return Math.abs(Math.log(cand.volumeUl / COMFORT_CENTRE_UL));
}

function pickBest(candidates, current) {
    let best = null;
    let bestKey = null;

    for (const cand of candidates) {
        const key = [changeCount(cand, current), distanceFromCentre(cand)];
        if (
            !best ||
            key[0] < bestKey[0] ||
            (key[0] === bestKey[0] && key[1] < bestKey[1])
        ) {
            best = cand;
            bestKey = key;
        }
    }

    return best;
}

function searchWithin(allLayers, min, max, current) {
    for (const layer of allLayers) {
        const usable = layer.filter((c) => c.volumeUl >= min && c.volumeUl <= max);
        if (usable.length) return pickBest(usable, current);
    }
    return null;
}

/**
 * Is the current preparation comfortable, and if not, what should change?
 *
 * Returns { ok, reason, suggestion }:
 *   ok true               nothing to say — the block shows no sentence
 *   reason                "too-dilute" | "too-concentrated" | "impossible"
 *   suggestion            { drops, vialMl, dilution, aliquotUl, volumeUl }
 */
export function optimizeInjection({
    molarity,
    targetNmol,
    dropUl,
    currentAliquotUl,
    currentVialMl,
    vialLadderMl,
}) {
    const ladder = normalizeLadder(vialLadderMl || DEFAULT_VIAL_LADDER_ML);

    const now = computeInjectionVolume({
        molarity,
        aliquotUl: currentAliquotUl,
        vialMl: currentVialMl,
        targetNmol,
    });
    if (!now) return { ok: true, reason: null, suggestion: null };

    if (now.volumeUl >= COMFORT_MIN_UL && now.volumeUl <= COMFORT_MAX_UL) {
        return { ok: true, reason: null, suggestion: null };
    }

    // Which way is it wrong? Too big an injection means the vial is too weak
    // — a dilute reaction. Too small means too strong.
    const reason = now.volumeUl > COMFORT_MAX_UL ? "too-dilute" : "too-concentrated";

    const current = { currentAliquotUl, currentVialMl, dropUl };
    const allLayers = layers({ molarity, targetNmol, dropUl, vialLadderMl: ladder });

    // Comfortable first; failing that, anything the injector can actually
    // deliver — an awkward injection beats an impossible one.
    const suggestion =
        searchWithin(allLayers, COMFORT_MIN_UL, COMFORT_MAX_UL, current) ||
        searchWithin(allLayers, INJECTION_MIN_UL, INJECTION_MAX_UL, current);

    if (!suggestion) return { ok: false, reason: "impossible", suggestion: null };

    // The search can hand back what is already set — e.g. the current volume
    // is outside the comfortable band but nothing else does better. Nothing
    // to suggest then.
    if (!changeCount(suggestion, current)) {
        return { ok: false, reason, suggestion: null };
    }

    return { ok: false, reason, suggestion };
}
