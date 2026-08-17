// content/features/run-form-templates/clipboard-io.js
//
// The no-name path: copy a run definition to the clipboard, paste it into
// another one. Same values a template carries, but nothing is stored — for
// the "just move these across once" case that does not deserve a name.
//
// Wire format: one field per line, NAME <TAB> VALUE.
//
// Tab-separated because that is what a spreadsheet splits into columns: the
// copied block pastes straight into Excel, gets edited there, and comes back
// through the paste box unchanged. A JSON blob would be exact but dead on
// arrival in the tool these values are actually kept in. Nothing is encoded
// beyond the name and the value — the field's TYPE is resolved against the
// form being pasted into, which is the only place that can be authoritative
// anyway, and is what lets a copy from one protocol land in another.
//
// Paste HARD-OVERWRITES, by request: a value already in the target field is
// replaced without asking. That is the difference from a template fill, which
// leaves occupied fields alone — pasting is a deliberate, one-off act aimed
// at a form the chemist is already looking at, and CDD's Save is still theirs
// to press.

import { isWritableKind } from "../../../shared/run-form-templates.js";
import { normalizeValue, readControlValue, writeField } from "./form-model.js";

// A value can hold anything a text field can, so tabs and newlines inside it
// would break the line format. They are the only characters collapsed.
function flatten(value) {
    return String(value ?? "").replace(/[\t\r\n]+/g, " ").trim();
}

/** [{name, value}] -> "name<TAB>value" lines. */
export function formatFields(fields) {
    return fields.map((f) => `${flatten(f.name)}\t${flatten(f.value)}`).join("\n");
}

/**
 * "name<TAB>value" lines -> { pairs, unparsed }.
 *
 * A line with no tab cannot be told apart from a value containing spaces, so
 * it is reported rather than guessed at — silently dropping half a paste is
 * how a form ends up quietly incomplete.
 */
export function parseFields(text) {
    const pairs = [];
    const unparsed = [];

    for (const rawLine of String(text ?? "").split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) continue;

        const tab = line.indexOf("\t");
        if (tab < 0) {
            unparsed.push(line);
            continue;
        }

        const name = line.slice(0, tab).trim();
        const value = line.slice(tab + 1).trim();
        if (!name || !value) {
            unparsed.push(line);
            continue;
        }

        pairs.push({ name, value });
    }

    return { pairs, unparsed };
}

// Field name -> { defId, kind }, from the target form's own definitions.
function definitionsByName(props) {
    const index = new Map();
    for (const field of props?.protocolFields || []) {
        const definition = field?.definition;
        if (!definition?.name || definition.id == null) continue;
        index.set(normalizeValue(definition.name).toLowerCase(), {
            defId: String(definition.id),
            kind: definition.data_type_name,
        });
    }
    return index;
}

/**
 * Match pasted pairs against the open form. Reads only.
 *
 * Returns [{ name, value, kind, entry, current, writable, reason }] — an
 * entry of null means the form has no such field.
 */
export function planPaste(props, pairs, controls) {
    const byName = definitionsByName(props);

    return pairs.map(({ name, value }) => {
        // The run's own date is keyed by its label, not by a definition.
        const runDate = controls.get(name);
        if (runDate && !byName.has(name.toLowerCase())) {
            return {
                name, value, kind: "Date", entry: runDate,
                current: readControlValue(runDate), writable: true,
            };
        }

        const definition = byName.get(normalizeValue(name).toLowerCase());
        if (!definition) {
            return { name, value, entry: null, writable: false, reason: "this form has no such field" };
        }

        const entry = controls.get(definition.defId);
        if (!entry) {
            return { name, value, entry: null, writable: false, reason: "not editable on this form" };
        }

        if (!isWritableKind(definition.kind)) {
            return {
                name, value, entry: null, writable: false,
                reason: `${definition.kind} fields cannot be pasted`,
            };
        }

        return {
            name, value, kind: definition.kind, entry,
            current: readControlValue(entry), writable: true,
        };
    });
}

/**
 * Write every writable step, in sequence — a BatchLink drives CDD's shared
 * search picker, so two at once would type into each other's dropdown.
 *
 * Returns { changed, unchanged, failed }.
 */
export async function applyPaste(plan) {
    const changed = [];
    const unchanged = [];
    const failed = [];

    for (const step of plan) {
        if (!step.writable) continue;

        if (normalizeValue(step.current).toLowerCase() === normalizeValue(step.value).toLowerCase()) {
            unchanged.push(step);
            continue;
        }

        const result = await writeField(step.entry, { kind: step.kind, value: step.value });
        if (result.ok) changed.push(step);
        else failed.push({ ...step, reason: result.reason });
    }

    return { changed, unchanged, failed };
}
