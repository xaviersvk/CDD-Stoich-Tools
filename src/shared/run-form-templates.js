// shared/run-form-templates.js — named snapshots of a run's "Run Definition"
// form, stored in chrome.storage.local so the same values can be replayed into
// the next run instead of being typed again.
//
// DOM-free on purpose: the content feature imports it for load/save, and the
// options page could later render the same list without pulling in any page
// code (same split as control-layout-presets.js / heat-map-fields.js).
//
// Stored shape
// ------------
//   cddRunFormTemplates = [
//     {
//       name: "MTAP FP DR standard",
//       protocolId: "133696",
//       protocolName: "MTAP FP DR Assay",
//       formName: "FP assay",
//       savedAt: 1765432100000,
//       fields: [
//         { defId: 107177, name: "Lab",   kind: "Text",     value: "PharmTheon" },
//         { defId: 152342, name: "Plate format", kind: "PickList", value: "1536" },
//         { defId: 173305, name: "Probe", kind: "BatchLink", value: "PHA-0334477-001" },
//       ],
//     },
//   ]
//
// A field carries BOTH keys on purpose:
//   - `defId` is CDD's run_field_definition_id — exact, and all a run of the
//     same protocol ever needs;
//   - `name` is what makes a template portable to a DIFFERENT protocol that
//     renders the same form, where the definition ids need not agree.
// The fill tries the id first and falls back to the name, so neither case has
// to be known in advance.
//
// `value` is always the string that would be typed back into the form — the
// pick-list's own option text, the batch identifier for a BatchLink, the plain
// number for a Number. Nothing here stores a CDD row id, so a template cannot
// carry a stale reference into a run it does not belong to.

export const RUN_FORM_TEMPLATES_KEY = "cddRunFormTemplates";

export const MAX_TEMPLATES = 50;
export const MAX_TEMPLATE_NAME_LENGTH = 60;

// The field kinds CDD's run form uses. Everything except FILE can be written
// back; a file lives on CDD's server and cannot be re-uploaded from a
// remembered string, so it is captured for display and never replayed.
export const KIND_TEXT = "Text";
export const KIND_LONG_TEXT = "LongText";
export const KIND_NUMBER = "Number";
export const KIND_PICK_LIST = "PickList";
export const KIND_BATCH_LINK = "BatchLink";
export const KIND_FILE = "File";
export const KIND_DATE = "Date";          // the run's own Run Date

export const WRITABLE_KINDS = [
    KIND_TEXT, KIND_LONG_TEXT, KIND_NUMBER, KIND_PICK_LIST, KIND_BATCH_LINK, KIND_DATE,
];

export function isWritableKind(kind) {
    return WRITABLE_KINDS.includes(kind);
}

/* ------------------------------------------------------------------ *
 * Sanitising — every read AND write goes through this, so a
 * hand-edited or half-written storage value can never reach the form.
 * ------------------------------------------------------------------ */

export function sanitizeTemplateName(raw) {
    return String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TEMPLATE_NAME_LENGTH);
}

function sanitizeField(raw) {
    if (!raw || typeof raw !== "object") return null;

    const name = String(raw.name ?? "").trim();
    if (!name) return null;

    const kind = String(raw.kind ?? "").trim();
    if (!kind) return null;

    // An empty value is not worth replaying — and writing one would mean
    // clearing a field the target run may legitimately have filled.
    const value = String(raw.value ?? "").trim();
    if (!value) return null;

    // The run date has no field definition of its own; everything else must
    // carry a numeric one.
    const defId = Number.isFinite(Number(raw.defId)) && String(raw.defId).trim() !== ""
        ? Number(raw.defId)
        : null;

    return { defId, name, kind, value };
}

function sanitizeTemplate(raw) {
    if (!raw || typeof raw !== "object") return null;

    const name = sanitizeTemplateName(raw.name);
    if (!name) return null;

    const fields = Array.isArray(raw.fields)
        ? raw.fields.map(sanitizeField).filter(Boolean)
        : [];
    if (!fields.length) return null;

    return {
        name,
        protocolId: String(raw.protocolId ?? "").trim(),
        protocolName: String(raw.protocolName ?? "").trim(),
        formName: String(raw.formName ?? "").trim(),
        savedAt: Number.isFinite(raw.savedAt) ? raw.savedAt : 0,
        fields,
    };
}

export function sanitizeTemplateList(raw) {
    if (!Array.isArray(raw)) return [];

    const out = [];
    const seen = new Set();
    for (const entry of raw) {
        const template = sanitizeTemplate(entry);
        if (!template) continue;

        const key = template.name.toLowerCase();
        if (seen.has(key)) continue;

        seen.add(key);
        out.push(template);
        if (out.length >= MAX_TEMPLATES) break;
    }
    return out;
}

// Templates sort by name so the dropdown reads the same on every run.
function byName(a, b) {
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

/* ------------------------------------------------------------------ *
 * Storage
 * ------------------------------------------------------------------ */

// False once the extension has been reloaded/updated under a page that is
// still open: every chrome.* call then throws "Extension context
// invalidated". Callers use it to say "reload the page" instead of "could
// not save", which is what the failure actually means.
export function isExtensionContextAlive() {
    try {
        return !!chrome?.runtime?.id;
    } catch {
        return false;
    }
}

export async function getRunFormTemplates() {
    try {
        const result = await chrome.storage.local.get(RUN_FORM_TEMPLATES_KEY);
        return sanitizeTemplateList(result?.[RUN_FORM_TEMPLATES_KEY]).sort(byName);
    } catch {
        return [];
    }
}

async function putRunFormTemplates(list) {
    try {
        await chrome.storage.local.set({
            [RUN_FORM_TEMPLATES_KEY]: sanitizeTemplateList(list),
        });
        return true;
    } catch {
        return false;
    }
}

// Create or overwrite by name (case-insensitive).
// Returns { ok, reason } — `reason` is "name" for an empty name, "fields"
// when nothing was selected, "limit" when the list is full.
export async function saveRunFormTemplate(template) {
    const clean = sanitizeTemplate(template);
    if (!clean) {
        return {
            ok: false,
            reason: sanitizeTemplateName(template?.name) ? "fields" : "name",
        };
    }

    const list = await getRunFormTemplates();
    const index = list.findIndex((t) => t.name.toLowerCase() === clean.name.toLowerCase());

    if (index >= 0) list[index] = clean;
    else if (list.length >= MAX_TEMPLATES) return { ok: false, reason: "limit" };
    else list.push(clean);

    return { ok: await putRunFormTemplates(list), reason: "storage" };
}

export async function deleteRunFormTemplate(name) {
    const list = await getRunFormTemplates();
    const next = list.filter((t) => t.name.toLowerCase() !== String(name).toLowerCase());
    if (next.length === list.length) return false;

    return putRunFormTemplates(next);
}

/* ------------------------------------------------------------------ *
 * The copy stash — what "Copy" put down, so "Paste" is one click.
 *
 * Reading the SYSTEM clipboard would need the `clipboardRead` permission,
 * which shows up as "read data you copy and paste" and would make every
 * installed copy ask for consent again on update. Copy therefore writes the
 * same text twice: to the clipboard (so it still pastes into a spreadsheet
 * or another app) and here (so our own Paste button needs no permission at
 * all). Text edited outside CDD comes back through the panel's own box.
 * ------------------------------------------------------------------ */

export const RUN_FORM_STASH_KEY = "cddRunFormStash";

export async function setRunFormStash(text, meta = {}) {
    try {
        await chrome.storage.local.set({
            [RUN_FORM_STASH_KEY]: {
                text: String(text ?? ""),
                protocolName: String(meta.protocolName ?? "").trim(),
                fieldCount: Number.isFinite(meta.fieldCount) ? meta.fieldCount : 0,
                savedAt: Date.now(),
            },
        });
        return true;
    } catch {
        return false;
    }
}

export async function getRunFormStash() {
    try {
        const result = await chrome.storage.local.get(RUN_FORM_STASH_KEY);
        const stash = result?.[RUN_FORM_STASH_KEY];
        if (!stash || typeof stash !== "object") return null;

        const text = String(stash.text ?? "");
        if (!text.trim()) return null;

        return {
            text,
            protocolName: String(stash.protocolName ?? "").trim(),
            fieldCount: Number.isFinite(stash.fieldCount) ? stash.fieldCount : 0,
            savedAt: Number.isFinite(stash.savedAt) ? stash.savedAt : 0,
        };
    } catch {
        return null;
    }
}

// Fires whenever the template list changes anywhere (another tab, the
// options page). Returns an unsubscribe function.
export function onRunFormTemplatesChanged(cb) {
    if (!chrome?.storage?.onChanged) return () => {};

    const listener = (changes, areaName) => {
        if (areaName !== "local" || !changes[RUN_FORM_TEMPLATES_KEY]) return;
        try {
            cb(sanitizeTemplateList(changes[RUN_FORM_TEMPLATES_KEY].newValue).sort(byName));
        } catch {
            /* a misbehaving listener must not break storage handling */
        }
    };

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
}
