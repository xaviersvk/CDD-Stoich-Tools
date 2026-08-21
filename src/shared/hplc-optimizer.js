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

// What the injector can physically do. On a Waters Acquity H-Class with the
// loop this lab runs, 0.1 to 10 µL in 0.1 µL steps — 10 µL is the far edge
// but it does get used, so it is a real ceiling rather than a nominal one.
//
// The ceiling belongs to the SAMPLE LOOP, not to the instrument, so swapping
// the loop moves it. Defaults only; the range arrives as an argument.
export const DEFAULT_INJECTION_MIN_UL = 0.1;
export const DEFAULT_INJECTION_MAX_UL = 10;

// Where the injection is pleasant to work with. 0.3, not 0.5, is the bottom:
// "nejlepsi je davat zhruba mezi 0.3 a 2 uL at je prostor doladit
// koncentraci". Below 2 µL there is still room to tune the concentration
// without leaving the range.
//
// Unlike the injector's own 0.1–10 limits, this pair is a PREFERENCE — it
// depends on the method and on who is running it — so these are only the
// defaults; the band arrives as an argument. See shared/hplc-injection.js.
export const DEFAULT_COMFORT_MIN_UL = 0.3;
export const DEFAULT_COMFORT_MAX_UL = 2;

// The centre of the band, multiplicatively. An injection volume is a ratio,
// so the ends are equally far from it — which is how the band reads to a
// chemist.
function comfortCentre(min, max) {
    return Math.sqrt(min * max);
}

// You can add drops. You cannot take half a one — a sub-drop aliquot is not
// pipetted, it is a drop that has been diluted, which is the third lever.
//
// One drop is the normal case and three is the practical ceiling: "nejvice
// bezne je jedna kapka, ale dve az tri nejsou problem". A drop is ~10 µL to
// within about ±5 µL, averaged over solvents and over how it was taken
// (Pasteur pipette, capillary, syringe) — which is another reason not to
// lean on this lever.
export const MAX_DROPS = 3;

// Only 2× and 5× are really done. The printed grid also has 10× and 20×
// rows, but those are what the grid can express, not what the bench does:
// "realne se pouziva asi jen 2x a 5x".
//
// The step itself is the pour-out trick — a drop into 1.5–2 mL, half tipped
// out, topped back up. That is one 2×.
export const DILUTION_FACTORS = [2, 5];

// Two vessels, and only two: the insert at 0.25 mL and the standard vial
// filled to 1.5 mL. The vial holds 2 mL but that is "skoro nepouzitelne",
// so it is not offered. Nothing exists in between, and the dilution is done
// by eye with a syringe straight into the vial, so intermediate volumes
// would be invented precision.
export const DEFAULT_VIAL_LADDER_ML = [0.25, 1.5];

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

// Cheapest first — and which lever is cheapest DEPENDS ON WHICH WAY the
// injection is wrong. Pavel Kraina, asked directly:
//
//   too dilute      "pridal bych vice kapek a az potom, kdyz by to jinak
//                    neslo, menil objem vialky na insert"
//   too concentrated "nejjednodussi je dat kapku, doplnit do 1.5-2 mL,
//                    vylit a doplnit znovu"
//
// So drops come before the vessel when the sample is too weak, and the
// dilution trick is the first thing reached for when it is too strong. The
// levers that push the wrong way are left out entirely rather than ranked
// last: more drops can only make a concentrated sample worse, and diluting
// can only make a dilute one worse.
//
// Diluting is also not free in the way a second drop is — "nechci resit
// 5 minut redeni vzorku, kdyz se denne meri stovky vzorku" — which is why
// it stays last even where it is the only lever that works.
function layers({ molarity, targetNmol, dropUl, vialLadderMl }, reason) {
    const make = (drops, dilution) =>
        vialLadderMl
            .map((vialMl) =>
                candidate({ molarity, targetNmol, dropUl, drops, vialMl, dilution })
            )
            .filter(Boolean);

    const oneDropAnyVessel = () => make(1, 1);

    const moreDrops = () => {
        const out = [];
        for (let drops = 2; drops <= MAX_DROPS; drops += 1) out.push(...make(drops, 1));
        return out;
    };

    const diluted = () => {
        const out = [];
        for (const dilution of DILUTION_FACTORS) out.push(...make(1, dilution));
        return out;
    };

    // Too dilute means the injection comes out too BIG: fewer µL are wanted,
    // which means more material per vial (more drops) or less vial.
    if (reason === "too-dilute") return [moreDrops(), oneDropAnyVessel()];

    // Too concentrated: a bigger vessel first — free, if you are on the
    // insert — then the pour-out dilution.
    return [oneDropAnyVessel(), diluted()];
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

function distanceFromCentre(cand, centre) {
    return Math.abs(Math.log(cand.volumeUl / centre));
}

function pickBest(candidates, current, centre) {
    let best = null;
    let bestKey = null;

    for (const cand of candidates) {
        const key = [changeCount(cand, current), distanceFromCentre(cand, centre)];
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

function searchWithin(allLayers, min, max, current, centre) {
    for (const layer of allLayers) {
        const usable = layer.filter((c) => c.volumeUl >= min && c.volumeUl <= max);
        if (usable.length) return pickBest(usable, current, centre);
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
    comfortMinUl = DEFAULT_COMFORT_MIN_UL,
    comfortMaxUl = DEFAULT_COMFORT_MAX_UL,
    injectionMinUl = DEFAULT_INJECTION_MIN_UL,
    injectionMaxUl = DEFAULT_INJECTION_MAX_UL,
}) {
    const ladder = normalizeLadder(vialLadderMl || DEFAULT_VIAL_LADDER_ML);

    // Both ranges are settings now, so they can disagree — a comfortable band
    // that reaches past what the loop can inject asks for volumes that do not
    // exist. Neither stored value is touched; the search just happens in the
    // overlap. If they do not overlap at all, the loop wins, because a volume
    // the injector cannot deliver is not a preference, it is a mistake.
    const lo = Math.max(comfortMinUl, injectionMinUl);
    const hi = Math.min(comfortMaxUl, injectionMaxUl);
    const comfortLo = lo < hi ? lo : injectionMinUl;
    const comfortHi = lo < hi ? hi : injectionMaxUl;

    const centre = comfortCentre(comfortLo, comfortHi);

    const now = computeInjectionVolume({
        molarity,
        aliquotUl: currentAliquotUl,
        vialMl: currentVialMl,
        targetNmol,
    });
    if (!now) return { ok: true, reason: null, suggestion: null };

    if (now.volumeUl >= comfortLo && now.volumeUl <= comfortHi) {
        return { ok: true, reason: null, suggestion: null };
    }

    // Which way is it wrong? Too big an injection means the vial is too weak
    // — a dilute reaction. Too small means too strong.
    const reason = now.volumeUl > comfortHi ? "too-dilute" : "too-concentrated";

    const current = { currentAliquotUl, currentVialMl, dropUl };
    const allLayers = layers({ molarity, targetNmol, dropUl, vialLadderMl: ladder }, reason);

    // Comfortable first; failing that, anything the injector can actually
    // deliver — an awkward injection beats an impossible one.
    const suggestion =
        searchWithin(allLayers, comfortLo, comfortHi, current, centre) ||
        searchWithin(allLayers, injectionMinUl, injectionMaxUl, current, centre);

    if (!suggestion) return { ok: false, reason: "impossible", suggestion: null };

    // The search can hand back what is already set — e.g. the current volume
    // is outside the comfortable band but nothing else does better. Nothing
    // to suggest then.
    if (!changeCount(suggestion, current)) {
        return { ok: false, reason, suggestion: null };
    }

    return { ok: false, reason, suggestion };
}
