// content/features/ui-fixes/field-clipboard/field-model.js
//
// The data side of copying field definitions between vaults: which settings
// page is which kind, what a definition looks like once the page-specific
// noise is gone, and what a paste would do against the target. No DOM, no
// storage, no imports — checkable with `node`.

export const PLAN_ADD = "add";
export const PLAN_SAME_NAME = "same-name";
export const PLAN_TYPE_MISSING = "type-missing";

// One entry per settings page — two for the Sample/Inventory page, which
// draws two tables. `tableIndex` is the table's position on the page, which
// is also what the bridge is asked for. The link texts are not here: a vault
// can rename the nouns, so page-dom.js finds them by shape.
export const KINDS = [
    { kind: "molecule", path: /\/vaults\/\d+\/vault_molecule_field_definitions$/, tableIndex: 0, label: "molecule fields" },
    { kind: "batch", path: /\/vaults\/\d+\/vault_batch_field_definitions$/, tableIndex: 0, label: "batch fields" },
    { kind: "sample", path: /\/vaults\/\d+\/inventory_field_definitions$/, tableIndex: 0, label: "sample fields" },
    { kind: "inventory", path: /\/vaults\/\d+\/inventory_field_definitions$/, tableIndex: 1, label: "inventory fields" },
    { kind: "protocol", path: /\/vaults\/\d+\/vault_protocol_field_definitions$/, tableIndex: 0, label: "protocol fields" },
    { kind: "run", path: /\/vaults\/\d+\/vault_run_field_definitions$/, tableIndex: 0, label: "run fields" },
    { kind: "eln", path: /\/vaults\/\d+\/vault_eln_field_definitions$/, tableIndex: 0, label: "ELN fields" },
];

export function kindsForPath(pathname) {
    return KINDS.filter((entry) => entry.path.test(pathname || ""));
}

export function kindConfig(kind) {
    return KINDS.find((entry) => entry.kind === kind) || null;
}

function cleanName(name) {
    return String(name ?? "").trim();
}

// `required_group_number`: null is optional; a number names a group. A group
// of one is "is required"; a group of several is "or X is required", which
// only means something once the others exist — so it is carried as a note.
export function normalizeRows(rawRows) {
    const rows = (rawRows || []).filter((row) => row && typeof row === "object" && !row.disabled);

    const groups = new Map();
    for (const row of rows) {
        const group = row.required_group_number;
        if (group == null || group === "") continue;
        const key = String(group);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(cleanName(row.name));
    }

    return rows
        .map((row) => {
            const name = cleanName(row.name);
            const group = row.required_group_number == null || row.required_group_number === ""
                ? null
                : String(row.required_group_number);
            const members = group ? groups.get(group) : [];
            let required = "optional";
            if (row.required === true) required = "required"; // ELN page: a plain checkbox
            else if (group && members.length === 1) required = "required";
            else if (group && members.length > 1) required = "group";

            const pickList = (row.pick_list_values || [])
                .filter((entry) => entry && !entry.hidden)
                .map((entry) => (typeof entry === "object" ? entry.value : entry))
                .map((value) => String(value ?? "").trim())
                .filter(Boolean);

            return {
                name,
                type: String(row.data_type_name ?? ""),
                unique: row.unique_value === true || row.unique === true,
                overwritable: row.overwritable === true,
                required,
                groupWith: required === "group" ? members.filter((other) => other !== name) : [],
                singleUse: row.is_single_use === true,
                displayIdentifier: row.is_display_identifier === true,
                pickList,
            };
        })
        .filter((field) => field.name);
}

// What a paste would do. `targetNames` are the names already on the target
// page (exact match, case-sensitive, trimmed); `targetTypes` the option
// values of the target's type select.
export function planPaste(fields, targetNames, targetTypes) {
    const names = new Set((targetNames || []).map(cleanName));
    const types = new Set(targetTypes || []);
    const seen = new Set();

    return (fields || []).map((field) => {
        if (names.has(field.name) || seen.has(field.name)) {
            return { field, status: PLAN_SAME_NAME, note: "same name here" };
        }
        seen.add(field.name);
        if (types.size && !types.has(field.type)) {
            return { field, status: PLAN_TYPE_MISSING, note: `type ${field.type} is not offered here` };
        }
        if (field.required === "group") {
            return {
                field,
                status: PLAN_ADD,
                note: `was "or ${field.groupWith.join(" / ")} is required" — pasted as optional`,
            };
        }
        return { field, status: PLAN_ADD, note: "" };
    });
}

export function countPlan(plan) {
    let add = 0;
    let skip = 0;
    for (const entry of plan || []) {
        if (entry.status === PLAN_ADD) add += 1;
        else skip += 1;
    }
    return { add, skip };
}

// The option text a pasted field needs in the target's required select.
export function requiredChoice(field) {
    return field.required === "required" ? "is required" : "is optional";
}
