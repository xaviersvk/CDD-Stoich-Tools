// content/features/ui-fixes/readout-clipboard/model.js
//
// Pure translation between what CDD returns for a protocol's readout
// definitions and what it accepts when creating them in another protocol.
// No DOM, no fetch. The shapes were measured; see
// docs/superpowers/specs/2026-10-13-readout-clipboard-design.md.

// CDD answers with precision_type / precision_number but ignores both on
// create; it reads the editor's display_format string instead.
export function displayFormat(type, number) {
    const n = Number(number);
    if (type === "significant figure" && n >= 1) {
        return `${n} significant figure${n === 1 ? "" : "s"}`;
    }
    if (type === "decimal place" && n >= 0) {
        if (n === 0) return "0 (integer)";
        return `${n} decimal place${n === 1 ? "" : "s"}`;
    }
    return "None";
}

// The part of a readout that travels: names and settings, never ids.
function readoutBody(def) {
    const body = {
        name: def.name,
        data_type_name: def.data_type_name,
        display_format: displayFormat(def.precision_type, def.precision_number),
        required: !!def.required,
        protocol_condition: !!def.protocol_condition,
    };
    if (def.description) body.description = def.description;
    if (def.unit_label) body.unit_label = def.unit_label;

    const values = (Array.isArray(def.pick_list_values) ? def.pick_list_values : [])
        .filter((v) => v && typeof v.value === "string")
        .map((v, index) => ({ value: v.value, hidden: !!v.hidden, display_order: index }));
    if (def.data_type_name === "PickList") body.pick_list_values = values;

    // Normalisations ride on their input readout: CDD creates the output
    // ("Polarization % bound fraction") together with it.
    const normalizations = (Array.isArray(def.normalized_calculations_attributes) ? def.normalized_calculations_attributes : [])
        .filter((n) => n?.type)
        .map((n) => {
            const out = { type: n.type, name: n.name || n.output_readout_definition?.name, selected: true };
            for (const key of ["scope", "invert_normalized_value", "control_type", "mean_type", "description"]) {
                if (n[key] != null) out[key] = n[key];
            }
            return out;
        });
    if (normalizations.length) body.normalized_calculations_attributes = normalizations;

    return body;
}

// The fields of a dose-response calculation that travel. Readouts are named,
// not numbered; paste looks the ids up in the target.
const DOSE_RESPONSE_KEYS = [
    "normalized",
    "equation_type",
    "constraints",
    "graph_log_scale_x",
    "graph_log_scale_y",
    "inactivity_lower_bound",
    "inactivity_upper_bound",
    "minimum_inactivity_modifier",
];

function doseResponseStep(calc, nameById) {
    const doseName = nameById.get(String(calc.dose_readout_definition_id));
    const responseName = nameById.get(String(calc.response_readout_definition_id));
    const intercepts = (calc.intercept_readout_definitions_attributes || []).map((i) => {
        const out = {
            name: i.name,
            intercept: i.intercept,
            display_format: displayFormat(i.precision_type, i.precision_number),
            intercept_absolute: !!i.intercept_absolute,
        };
        if (i.unit_label) out.unit_label = i.unit_label;
        if (i.description) out.description = i.description;
        return out;
    });
    if (!doseName || !responseName || !intercepts.length) return null;

    const body = {};
    for (const key of DOSE_RESPONSE_KEYS) if (calc[key] != null) body[key] = calc[key];
    body.intercept_readout_definitions_attributes = intercepts;

    return {
        kind: "dose-response",
        name: intercepts.map((i) => i.name).join(", "),
        doseName,
        responseName,
        body,
    };
}

// True for readouts CDD makes by itself as part of a calculation.
export function isGenerated(def) {
    if (def.parent_readout_definition_id != null) return true;
    return def.calculation_id != null && !def.calculation_type;
}

// The calculation types copy knows how to rebuild, and how to fetch them.
export const COPIED_CALCULATIONS = ["CustomCalculation", "DoseResponseCalculation"];

// readouts: CDD's list, any order. calculationsById: Map(id -> calculation
// JSON) for every CustomCalculation / DoseResponseCalculation in the list.
//
// calculations[] holds both kinds, in source order:
//   { kind: "custom", name, body: { formatted_formula, … } }
//   { kind: "dose-response", name, doseName, responseName, body: { … } }
export function toClipboard({ vaultId, vaultName, protocolName, readouts, calculationsById }) {
    const sorted = [...readouts].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    const nameById = new Map(readouts.map((d) => [String(d.id), d.name]));
    const entry = {
        vaultId,
        vaultName,
        protocolName,
        copiedAt: Date.now(),
        readouts: [],
        calculations: [],
        skipped: [],
    };

    for (const def of sorted) {
        // A calculation's own outputs (a dose-response fit's CI, fold change,
        // R squared, plateau, …) carry its calculation_id but no
        // calculation_type, or hang off a parent readout. CDD creates them
        // with the calculation and does not list them on Protocol Details;
        // copying them would create dozens of stray readouts.
        if (isGenerated(def)) continue;

        if (!def.calculation_type) {
            entry.readouts.push(readoutBody(def));
            continue;
        }

        const calc = calculationsById.get(String(def.calculation_id));

        if (def.calculation_type === "CustomCalculation" && calc?.formatted_formula) {
            entry.calculations.push({
                kind: "custom",
                name: def.name,
                body: {
                    formatted_formula: calc.formatted_formula,
                    aggregate_readouts_by: calc.aggregate_readouts_by || "batch and run",
                    output_readout_definition_attributes: readoutBody(def),
                },
            });
            continue;
        }

        // A dose-response fit shows up in the list as one placeholder readout
        // (oddly named after one of its outputs, e.g. "Hill slope").
        const step = def.calculation_type === "DoseResponseCalculation" && calc && doseResponseStep(calc, nameById);
        if (step) {
            entry.calculations.push(step);
            continue;
        }

        entry.skipped.push({
            name: calc?.sentenced_intercept_names || def.name,
            type: def.calculation_type,
        });
    }

    return entry;
}

// What the Protocol Details table will show once pasted: readouts, their
// normalisations, and one row per calculation.
export function readoutCount(entry) {
    if (!entry) return 0;
    const normalizations = (entry.readouts || []).reduce(
        (sum, r) => sum + (r.normalized_calculations_attributes?.length || 0),
        0
    );
    return (entry.readouts?.length || 0) + normalizations + (entry.calculations?.length || 0);
}

// "[Kinetic Solubility -> Kinetic_Solubility (uM)]" names its protocol; in
// the target the same readout lives under the target's name. References to
// any other protocol are left alone.
export function retargetFormula(formula, fromName, toName) {
    if (!fromName || !toName || fromName === toName) return formula;
    return String(formula).split(`[${fromName} -> `).join(`[${toName} -> `);
}
