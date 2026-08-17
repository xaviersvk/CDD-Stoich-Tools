// content/features/run-form-templates/fill-plan.js
//
// Deciding WHAT a template would do to the open form, before it does any of
// it. Every field lands in exactly one of three buckets:
//
//   empty     — the form has nothing there; written straight away
//   conflict  — the form already holds something ELSE; left alone, offered
//               one by one with both values on screen
//   skipped   — nothing sensible to do (field absent from this form, value
//               already identical, a file that cannot be replayed)
//
// The conflict bucket is the whole point on production data: a run being
// filled from a template is usually a run somebody already started, and the
// values it carries are real. Overwriting them silently would be a data loss
// that nobody asked for and nobody would see — the Save button is pressed by
// a human, but only after reading a form they believe they understand.

import { isWritableKind, KIND_FILE } from "../../../shared/run-form-templates.js";
import {
    RUN_DATE_FIELD_NAME,
    readControlValue,
    readProps,
    sameValue,
    writeField,
} from "./form-model.js";

export const OUTCOME_EMPTY = "empty";
export const OUTCOME_CONFLICT = "conflict";
export const OUTCOME_SKIPPED = "skipped";

// Field name -> definition id, for a template written against a DIFFERENT
// protocol that renders the same form. Names are compared case-insensitively
// because that is the only thing two vault admins reliably agree on.
function nameIndex(props) {
    const index = new Map();
    for (const field of props?.protocolFields || []) {
        const name = field?.definition?.name;
        const id = field?.definition?.id;
        if (name && id != null) index.set(String(name).trim().toLowerCase(), String(id));
    }
    return index;
}

// The live control for a template field: by definition id first (exact, and
// all a run of the same protocol needs), then by name.
function resolveEntry(field, controls, byName) {
    if (field.defId != null) {
        const direct = controls.get(String(field.defId));
        if (direct) return { entry: direct, matchedBy: "id" };
    }

    if (field.name === RUN_DATE_FIELD_NAME) {
        const runDate = controls.get(RUN_DATE_FIELD_NAME);
        if (runDate) return { entry: runDate, matchedBy: "name" };
    }

    const mappedId = byName.get(field.name.toLowerCase());
    const viaName = mappedId ? controls.get(mappedId) : null;
    return viaName ? { entry: viaName, matchedBy: "name" } : { entry: null, matchedBy: null };
}

/**
 * Work out what `template` would do to the currently open edit form.
 * Reads only — nothing is written here.
 *
 * Returns [{ field, entry, outcome, current, matchedBy, reason }] in the
 * template's own order.
 */
export function planFill(annotator, template, controls) {
    const props = readProps(annotator);
    const byName = nameIndex(props);
    const plan = [];

    for (const field of template.fields || []) {
        if (!isWritableKind(field.kind)) {
            plan.push({
                field,
                entry: null,
                outcome: OUTCOME_SKIPPED,
                reason: field.kind === KIND_FILE
                    ? "a file cannot be filled from a template"
                    : `${field.kind} fields cannot be filled`,
            });
            continue;
        }

        const { entry, matchedBy } = resolveEntry(field, controls, byName);
        if (!entry) {
            plan.push({
                field, entry: null, outcome: OUTCOME_SKIPPED,
                reason: "this form has no such field",
            });
            continue;
        }

        const current = readControlValue(entry);
        if (!current) {
            plan.push({ field, entry, matchedBy, outcome: OUTCOME_EMPTY, current: "" });
        } else if (sameValue(current, field.value)) {
            plan.push({
                field, entry, matchedBy, outcome: OUTCOME_SKIPPED, current,
                reason: "already this value",
            });
        } else {
            plan.push({ field, entry, matchedBy, outcome: OUTCOME_CONFLICT, current });
        }
    }

    return plan;
}

/**
 * Write the entries the plan marked as empty. Conflicts are NOT touched —
 * they come back for the caller to offer one at a time.
 *
 * Returns { written, failed } where `failed` carries the reason per field.
 */
export async function applyEmpty(plan) {
    const written = [];
    const failed = [];

    for (const step of plan) {
        if (step.outcome !== OUTCOME_EMPTY) continue;

        const result = await writeField(step.entry, step.field);
        if (result.ok) written.push(step);
        else failed.push({ ...step, reason: result.reason });
    }

    return { written, failed };
}
