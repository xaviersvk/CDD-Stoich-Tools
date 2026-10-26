// shared/concentration-text.js
//
// A concentration as CDD's stoichiometry editor takes it. Since CDD's 2026-10
// update the unit goes INTO the text, and only these are accepted (CDD's own
// validation message, verified 2026-10-26 on entry 1000000814): mmol/ml,
// mmol/l, mol/ml, mol/l, m, %w/v. A bare number is mol/L, and the field
// always displays mol/L ("15 mmol/l" comes back as "0.015 mol/L").
//
// Samples speak "mM", "µM"…, so those are translated; the ones CDD has no
// unit for are scaled into mmol/l. Pure — no DOM.

// unit -> [unit CDD is given, mol/L per 1 of the sample's unit]
const MOLAR_UNITS = {
    "": ["", 1],
    "M": ["mol/l", 1],
    "mol/l": ["mol/l", 1],
    "mM": ["mmol/l", 1e-3],
    "mmol/l": ["mmol/l", 1e-3],
    "uM": ["mmol/l", 1e-6],
    "umol/l": ["mmol/l", 1e-6],
    "nM": ["mmol/l", 1e-9],
    "nmol/l": ["mmol/l", 1e-9],
    "mol/ml": ["mol/ml", 1e3],
    "mmol/ml": ["mmol/ml", 1],
};

// mol/L per 1 of each unit CDD is given.
const PER_TARGET = { "mol/l": 1, "mmol/l": 1e-3, "mol/ml": 1e3, "mmol/ml": 1 };

// Float noise off: 15 * 1e-3 is 0.015000000000000001.
const clean = (n) => Number(n.toPrecision(12));

/**
 * concentrationText(value, units) -> { text, molPerL } | null
 *
 * `text` is what to type into the editor; `molPerL` what the field will show
 * afterwards (null for %w/v, which is not a molarity). Null when the value is
 * not a number or the unit is not one CDD can take.
 */
export function concentrationText(value, units) {
    const n = parseFloat(String(value ?? "").replace(",", "."));
    if (!Number.isFinite(n)) return null;

    // "M" and "mM" differ only in case, so case is kept for them and dropped
    // for the spelled-out units ("mmol/L" = "mmol/l").
    const unit = String(units ?? "").replace(/\s+/g, "").replace(/[µμ]/g, "u");
    if (/^%(w\/v)?$/i.test(unit)) return { text: `${n} %w/v`, molPerL: null };

    const known = MOLAR_UNITS[unit] || MOLAR_UNITS[unit.toLowerCase()];
    if (!known) return null;

    const [target, factor] = known;
    const molPerL = clean(n * factor);
    if (!target) return { text: String(n), molPerL };

    return { text: `${clean(molPerL / PER_TARGET[target])} ${target}`, molPerL };
}
