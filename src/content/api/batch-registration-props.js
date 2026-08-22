// content/api/batch-registration-props.js
//
// The RegistrationFormRenderer props a molecule page embeds, read once and
// the same way by everyone who needs them.
//
// A molecule page carries one renderer per lot plus a molecule-level one and
// some blank templates; only a renderer whose `object_id` is the batch we
// asked for is a real lot. The molecule-level renderer joins nothing (its
// data rows have no batch_field_definition_id), which is why the join below
// is safe to run over all of them.
//
// One reader, not two: the enrichment pass and the pre-write re-check must
// agree, byte for byte, on what "Internal ID is empty" means. Two copies of
// this parse would eventually disagree, and the one that drifted would be the
// one guarding a write.

import { fieldLabelsMatch } from "../../shared/eln-id-carry.js";

const RENDERER_SELECTOR = '[component_class="RegistrationFormRenderer"]';

// `doc` is a parsed DOMParser document or `document` itself.
export function readBatchProps(doc, batchId) {
    const wanted = Number(batchId);
    if (!Number.isFinite(wanted)) return null;

    for (const el of doc.querySelectorAll(RENDERER_SELECTOR)) {
        let props;
        try {
            props = JSON.parse(el.getAttribute("react_props") || "");
        } catch {
            continue;
        }

        if (Number(props?.object_id) !== wanted) continue;

        const defs = (Array.isArray(props.batch_field_definitions)
            ? props.batch_field_definitions
            : []
        )
            .filter((d) => d && d.id != null && d.name)
            .map((d) => ({ id: d.id, name: d.name }));

        const nameById = new Map(defs.map((d) => [d.id, d.name]));
        const fieldMap = {};

        for (const entry of Object.values(props.data || {})) {
            const name = nameById.get(entry?.batch_field_definition_id);
            if (!name) continue;

            // Pick-list ids and file uploads have no readable value here.
            const value =
                entry?.text_value ?? entry?.float_value ?? entry?.date_value ?? null;
            if (value == null || value === "") continue;

            fieldMap[name] = value;
        }

        return { fieldMap, defs };
    }

    return null;
}

// The definition id behind a user-configured label. `fieldLabelsMatch`
// already strips CDD's required marker, so a setting of "Internal ID" finds
// a definition named "*Internal ID".
export function findDefId(defs, label) {
    const hit = (defs || []).find((d) => fieldLabelsMatch(d.name, label));
    return hit ? hit.id : null;
}

// The value stored under a user-configured label, or null when the field is
// absent or empty. "Empty" and "absent" are deliberately the same answer:
// both mean there is nothing to overwrite.
export function readFieldByLabel(fieldMap, label) {
    for (const [name, value] of Object.entries(fieldMap || {})) {
        if (!fieldLabelsMatch(name, label)) continue;
        const text = String(value ?? "").trim();
        return text || null;
    }
    return null;
}

// The vault a fetch actually landed in. A molecule can live in a different
// vault than the ELN entry that mentions it, and the server redirects there
// transparently — so the vault must be read off the FINAL url, never off
// location.pathname.
export function vaultIdFromUrl(url) {
    return String(url || "").match(/\/vaults\/(\d+)\//)?.[1] || null;
}

/**
 * readBatchFieldsByName(doc) -> Map(batchName -> { fieldName: value })
 *
 * Every EXISTING batch on the molecule page, keyed by its Batch Name ("001").
 * readBatchProps above answers for one batch by its numeric id; this answers
 * when the id is not known — a stoichiometry row prints the batch's name and
 * nothing else until the entry is saved.
 *
 * The page also carries a blank renderer for "register a new batch"; it has no
 * name and is skipped.
 */
export function readBatchFieldsByName(doc) {
    const out = new Map();

    for (const el of doc.querySelectorAll(RENDERER_SELECTOR)) {
        let props;
        try {
            props = JSON.parse(el.getAttribute("react_props") || "");
        } catch {
            continue;
        }
        if (props?.resource_type !== "batch") continue;

        const nameById = new Map(
            (Array.isArray(props.batch_field_definitions) ? props.batch_field_definitions : [])
                .filter((d) => d && d.id != null && d.name)
                .map((d) => [d.id, d.name])
        );

        const fieldMap = {};
        for (const entry of Object.values(props.data || {})) {
            const name = nameById.get(entry?.batch_field_definition_id);
            if (!name) continue;
            const value = entry?.text_value ?? entry?.float_value ?? entry?.date_value ?? null;
            if (value == null || value === "") continue;
            fieldMap[name] = value;
        }

        const batchName = String(fieldMap["Batch Name"] || "").trim();
        if (batchName) out.set(batchName, fieldMap);
    }

    return out;
}
