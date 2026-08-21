// shared/hplc-injection-math.js
//
// "How much do I inject?" — the whole sum, in one dependency-free file.
//
// The chemist pulls a small aliquot out of the reaction mixture, dilutes it
// into an HPLC vial, and injects however much of THAT carries the target
// amount onto the column. Every number needed is already on the ELN page:
// the stoichiometry table prints a reaction molarity for each solvent row.
//
// Kept free of chrome.* and of DOM access on purpose — the INJECT bundle
// runs in page context, where chrome.storage does not exist, and it needs
// collectReactionSolvents. The settings that feed the sum live next door in
// hplc-injection.js, which only the content script and the options page
// import.

// Injections are dialled in tenth-microlitre steps, so the exact number off
// the sum is not quite the number anyone types into the sequence. It is also
// the FLOOR: 0.1 µL is the low end of the injector, and rounding 0.04 µL to
// the nearest tenth would give zero, which is not an injection.
//
// The bench's own printed UPLC-MS Injection Volume Guide is given to one
// decimal and turns red below this value, so the two now agree.
export const HPLC_INJECTION_STEP_UL = 0.1;

// Every solvent row's reaction molarity, straight off the payload rows.
//
// Deliberately NOT filtered the way the card rows are: the guard in
// extractRowsFromReactionFeature drops a row with neither a sample nor a
// registered batch, and that is the normal shape of a solvent row. The
// hexane row of entry 2504170 is exactly that, and it is the row that
// carries `molarity`.
export function collectReactionSolvents(rows) {
    const out = [];

    for (const row of Array.isArray(rows) ? rows : []) {
        const molarity = Number(row?.molarity);
        if (!Number.isFinite(molarity) || molarity <= 0) continue;

        const rawName = row?.moleculeName ?? row?.name ?? null;
        const name =
            typeof rawName === "string" && rawName.trim() ? rawName.trim() : null;

        out.push({ name, molarity });
    }

    return out;
}

// The concentration of the mixture the aliquot is actually drawn from.
//
// CDD's per-row reaction molarity is n_limiting / V_thatSolvent. Across
// several solvents the mixture is n_limiting / ΣV, and since V_i =
// n_limiting / M_i that collapses to 1 / Σ(1/M_i) — no extra input needed.
// With one solvent it is that solvent's molarity, unchanged.
export function effectiveMolarity(solvents) {
    let reciprocalSum = 0;
    let count = 0;

    for (const solvent of Array.isArray(solvents) ? solvents : []) {
        const m = Number(solvent?.molarity);
        if (!Number.isFinite(m) || m <= 0) continue;
        reciprocalSum += 1 / m;
        count += 1;
    }

    if (!count) return null;
    return 1 / reciprocalSum;
}

// V_inj[µL] = n_target[nmol] × V_vial[µL] / (1000 × M[mol/L] × V_aliquot[µL])
//
// The 1000 is the unit bridge: 1 mol/L is 1000 nmol/µL, so M × V_aliquot
// × 1000 is how many nmol the aliquot carries.
//
// The vial volume is the FINAL volume of the diluted sample — the aliquot is
// part of it, not added on top.
export function computeInjectionVolume({ molarity, aliquotUl, vialMl, targetNmol }) {
    const m = Number(molarity);
    const aliquot = Number(aliquotUl);
    const vialUl = Number(vialMl) * 1000;
    const target = Number(targetNmol);

    const usable = [m, aliquot, vialUl, target].every(
        (n) => Number.isFinite(n) && n > 0
    );
    if (!usable) return null;

    const volumeUl = (target * vialUl) / (1000 * m * aliquot);
    const roundedUl = roundToInjectionStep(volumeUl);

    // What the rounded injection actually puts on the column. The exact
    // volume delivers the target by definition, so the rounded one delivers
    // it in the same ratio.
    const deliveredNmol = (target * roundedUl) / volumeUl;

    let warning = null;
    if (roundedUl > vialUl) warning = "exceeds-vial";
    // Rounding to the nearest 0.5 would have given zero, so the floor pushed
    // it back up — the vial is far too concentrated for this target.
    else if (volumeUl < HPLC_INJECTION_STEP_UL / 2) warning = "floored";

    return { volumeUl, roundedUl, deliveredNmol, warning };
}

// The nearest step, never below one — see HPLC_INJECTION_STEP_UL.
//
// The toFixed is not cosmetic: Math.round(0.3 / 0.1) * 0.1 is
// 0.30000000000000004, which would print with a tail and, worse, compare
// unequal to the exact volume it came from — putting the "rounding moved
// it" line on screen for a rounding that moved nothing.
export function roundToInjectionStep(volumeUl) {
    if (!Number.isFinite(volumeUl) || volumeUl <= 0) return null;

    const steps = Math.round(volumeUl / HPLC_INJECTION_STEP_UL);
    const stepped = Number((steps * HPLC_INJECTION_STEP_UL).toFixed(4));

    return Math.max(HPLC_INJECTION_STEP_UL, stepped);
}

// Two decimals down to 0.1 µL, three below it — "0.08 µL" loses the digit
// that tells 0.08 from 0.084.
export function formatInjectionVolume(volumeUl) {
    if (!Number.isFinite(volumeUl)) return null;
    return volumeUl >= 0.1 ? volumeUl.toFixed(2) : volumeUl.toFixed(3);
}

// An amount in nmol, three significant figures, trailing zeros trimmed
// ("0.333", "2", "1.25").
export function formatNmol(nmol) {
    if (!Number.isFinite(nmol) || nmol <= 0) return null;
    return String(Number(nmol.toPrecision(3)));
}

// The molarity echo, printed the way CDD prints it: a plain number in
// mol/L, with trailing zeros trimmed ("0.1", not "0.100").
export function formatMolarity(molarity) {
    if (!Number.isFinite(molarity) || molarity <= 0) return null;
    return String(Number(molarity.toPrecision(6)));
}
