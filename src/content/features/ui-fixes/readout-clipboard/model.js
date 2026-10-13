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

    return body;
}

// True for readouts CDD makes by itself as part of a calculation.
export function isGenerated(def) {
    if (def.parent_readout_definition_id != null) return true;
    return def.calculation_id != null && !def.calculation_type;
}

// readouts: CDD's list, any order. calculationsById: Map(id -> custom
// calculation JSON) for every CustomCalculation output in the list.
export function toClipboard({ vaultId, vaultName, protocolName, readouts, calculationsById }) {
    const sorted = [...readouts].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
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

        const calc = def.calculation_type === "CustomCalculation" && calculationsById.get(String(def.calculation_id));
        if (!calc?.formatted_formula) {
            entry.skipped.push({ name: def.name, type: def.calculation_type });
            continue;
        }

        entry.calculations.push({
            formatted_formula: calc.formatted_formula,
            aggregate_readouts_by: calc.aggregate_readouts_by || "batch and run",
            output_readout_definition_attributes: readoutBody(def),
        });
    }

    return entry;
}

export function readoutCount(entry) {
    return (entry?.readouts?.length || 0) + (entry?.calculations?.length || 0);
}

// "[Kinetic Solubility -> Kinetic_Solubility (uM)]" names its protocol; in
// the target the same readout lives under the target's name. References to
// any other protocol are left alone.
export function retargetFormula(formula, fromName, toName) {
    if (!fromName || !toName || fromName === toName) return formula;
    return String(formula).split(`[${fromName} -> `).join(`[${toName} -> `);
}
