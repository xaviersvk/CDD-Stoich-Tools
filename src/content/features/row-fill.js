// content/features/row-fill.js
//
// Writes a value into a stoichiometry-row field by replaying the user's own
// editing gestures:
//
//   click the row (the table flips to edit mode)
//   → click the field's value link ("Density: Optional", "Purity: 100 %"…)
//   → set the inline editor natively (React value-tracker aware) → Enter
//   → click the empty page margin to leave edit mode.
//
// Since CDD's 2026-10 update the editor is no longer a floating MuiPaper
// popup: the clicked value turns into a <textarea data-autotest-id=
// "inline-input-<field>"> in place, inside the field's own span. The field
// keys are CDD's own (`field-density` → `inline-input-density`).
//
// Four public fills share that machinery: density (empty fields only),
// purity (snapshots the row's Equivalent first and restores it after CDD's
// recalculation), concentration (clicks "Make solution" first when the row
// is not a solution yet, and sets the solvent on the way) and solvent (a
// dropdown, not a text field — see writeSolventViaPicker).
//
// Every step re-verifies the DOM it expects and aborts cleanly when CDD's
// markup has changed — the worst case is that nothing gets written (the one
// exception, a failed equivalent restore AFTER purity landed, is reported
// loudly in the button/status).

import { mouseClick } from "../utils/dom.js";
import { concentrationText } from "../../shared/concentration-text.js";

// Waiting is counted in POLL ATTEMPTS, not wall-clock: Chrome throttles
// timers in a background tab to roughly one tick per minute, and a
// wall-clock deadline then expires before the second poll even runs —
// steps would give up while the page is merely slow (that is how a purity
// fill once skipped its equivalent restore silently). The hard cap only
// exists so a genuinely broken step cannot hang forever.
const STEP_POLL_ATTEMPTS = 30;
const HARD_TIMEOUT_MS = 120000;
const POLL_MS = 100;

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(probe, attempts = STEP_POLL_ATTEMPTS) {
    const hardDeadline = Date.now() + HARD_TIMEOUT_MS;

    for (let i = 0; i < attempts; i += 1) {
        const result = probe();
        if (result) return result;
        if (Date.now() > hardDeadline) return null;
        await wait(POLL_MS);
    }

    return null;
}

// Same fallback chain the print buttons use to find one container per
// displayed reaction; index = display order = sample.reactionIndex.
export function getReactionContainers() {
    const byTestId = Array.from(
        document.querySelectorAll('[data-autotest-id="reaction"]')
    );
    if (byTestId.length) return byTestId;

    for (const selector of [
        '[data-feature-type="reaction"]',
        '[data-testid*="reaction"]',
        ".reaction",
        ".reaction-block",
        ".eln-reaction",
    ]) {
        const found = Array.from(document.querySelectorAll(selector));
        if (found.length) return found;
    }

    return [];
}

// Stoichiometry rows for this sample: real table rows (4+ cells) whose text
// carries the composed batch name. Both the view-mode and edit-mode variants
// of a row match; callers narrow further.
function findRowsByName(container, name) {
    return Array.from(container.querySelectorAll("table tr")).filter((tr) => {
        if (!tr.cells || tr.cells.length < 4) return false;
        return (tr.innerText || "").includes(name);
    });
}

// A row rendering the editable "Label: value" structure. NOTE (verified
// live): when a table enters edit mode, EVERY row of that table renders
// the edit labels — this marker identifies edit-mode TABLES, not the one
// clicked row, so field searches additionally need the row number.
//
// Several markers, not just "Name:", because a row whose Name is already SET
// renders the bare value with no label at all (verified on entry 2504170:
// `<span data-autotest-id="field-name">DIPEA</span>`) — and fillNameIntoTable
// below creates exactly that state. These five labels are the ones measured
// to be absent from view mode; the two ratios cover a row whose Name is set
// and which has no IUPAC name either.
const EDIT_MODE_LABELS = new Set([
    "Name:", "IUPAC:", "%w/w ratio:", "%v/v ratio:", "CAS-RN:",
]);

function isEditModeRow(tr) {
    for (const b of tr.querySelectorAll("b")) {
        if (EDIT_MODE_LABELS.has((b.textContent || "").trim())) return true;
    }
    return false;
}

// THE sample's row: by its printed number when known (the only reliable
// key when the same batch sits in the table twice), else the first
// name-matching row with edit labels.
function findTargetRow(container, name, rowNumber) {
    if (rowNumber) {
        const tr = findRowByNumber(container, rowNumber);
        if (tr) return tr;
    }
    for (const tr of findRowsByName(container, name)) {
        if (isEditModeRow(tr)) return tr;
    }
    return null;
}

// In edit mode every property renders as "<b>Label:</b> <value>".
// placeholderOnly limits the match to the blue Optional/Required link (an
// EMPTY field) — density keeps that rule; purity overwrites CDD's default
// "100 %" so it matches any value.
function findFieldValueLink(row, label, placeholderOnly) {
    for (const span of row.querySelectorAll("span")) {
        const b = span.querySelector(":scope > b");
        if (!b || (b.textContent || "").trim() !== label) continue;

        const value = b.nextElementSibling;
        if (!value) continue;

        if (placeholderOnly &&
            !/^(Optional|Required)$/.test((value.textContent || "").trim())) {
            continue;
        }
        return value;
    }
    return null;
}

// The open inline editor of `field` ("density", "purity", "concentration",
// "name", "equivalent"), or null. Only one is open at a time — CDD closes
// the previous one when another value is clicked — so the focused element is
// the first answer and a page-wide lookup the fallback.
//
// The editor is a <textarea> for every field but the solvent row's Name,
// which is an <input> with a dropdown under it.
function findInlineEditor(field) {
    const selector = `[data-autotest-id="inline-input-${field}"]`;
    const active = document.activeElement;
    if (active?.matches?.(selector)) return active;
    return document.querySelector(selector);
}

// React tracks the value on the DOM node; the setter has to be the one of the
// element's own prototype — the <input> setter throws on a <textarea>.
export function setNativeInputValue(input, value) {
    const proto =
        input instanceof HTMLTextAreaElement
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;

    if (setter) {
        setter.call(input, value);
    } else {
        input.value = value;
    }

    input.dispatchEvent(new Event("input", { bubbles: true }));
}

export function pressEnter(target) {
    const options = {
        bubbles: true,
        cancelable: true,
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
    };

    target.dispatchEvent(new KeyboardEvent("keydown", options));
    target.dispatchEvent(new KeyboardEvent("keypress", options));
    target.dispatchEvent(new KeyboardEvent("keyup", options));
}

function pressEscape() {
    const target = document.activeElement || document.body;
    const options = {
        bubbles: true,
        cancelable: true,
        key: "Escape",
        code: "Escape",
        keyCode: 27,
        which: 27,
    };

    target.dispatchEvent(new KeyboardEvent("keydown", options));
    target.dispatchEvent(new KeyboardEvent("keyup", options));
}

// Click the empty page margin left of the reaction so the table drops out of
// edit mode. Best effort — if something else sits there, staying in edit
// mode is harmless (CDD autosaves either way).
function clickOutside(container) {
    const rect = container.getBoundingClientRect();
    const x = 8;
    const y = Math.max(8, rect.top - 24);
    const target = document.elementFromPoint(x, y);

    if (target && !container.contains(target)) {
        mouseClick(target);
    }
}

// The strings that might identify the sample's row in the table text. A
// batch-only card's name ("RGT-0001620-001") appears verbatim, but a card
// for a row WITH a sample carries the SAMPLE name, which the table never
// shows — there the composed "molecule-batch" (or the bare molecule name)
// is what the row text contains.
function candidateNames(sample) {
    const out = [];
    const push = (v) => {
        const s = String(v || "").trim();
        if (s && !out.includes(s)) out.push(s);
    };

    push(sample?.name);

    const mol = String(sample?.moleculeName || "").trim();
    const batch = String(sample?.batchName || "").trim();
    if (mol && batch && !batch.startsWith(mol) && !/unspecified/i.test(batch)) {
        push(`${mol}-${batch}`);
    }
    push(mol);

    return out;
}

// The tr whose first cell prints the given 1-based row number — the same
// number the payload row had in stoichiometryTable.rows. Deterministic
// even when the same batch sits in the table twice.
function findRowByNumber(container, rowNumber) {
    if (!rowNumber) return null;
    const want = String(rowNumber);
    for (const tr of container.querySelectorAll("table tr")) {
        if (!tr.cells || tr.cells.length < 4) continue;
        if ((tr.cells[0].innerText || "").trim() === want) return tr;
    }
    return null;
}

// Click the sample's row into edit mode; returns {container, name} (the
// identifier that actually matched) or null. Prefer the container at the
// sample's display index, but fall back to whichever reaction block
// actually contains the row — the page renders fewer
// `[data-autotest-id="reaction"]` blocks than reactions for some table
// variants, so the index alone is not trustworthy.
async function openRow(sample) {
    const containers = getReactionContainers();
    const names = candidateNames(sample);

    // Preferred path: the table prints the payload row number in the
    // row's first cell — click exactly that row of the sample's reaction
    // block. This is the only reliable route when the same batch appears
    // in the table twice.
    const primary = containers[sample.reactionIndex];
    if (primary && sample.rowNumber) {
        const tr = findRowByNumber(primary, sample.rowNumber);
        if (tr) {
            const name =
                names.find((n) => (tr.innerText || "").includes(n)) || names[0] || "";
            if (name) {
                mouseClick(tr.cells[0]);
                return { container: primary, name, rowNumber: sample.rowNumber };
            }
        }
    }

    // Fallback: match by name, first in the sample's own container, then
    // anywhere — the page renders fewer reaction blocks than reactions
    // for some table variants, so the index alone is not trustworthy.
    for (const name of names) {
        let container = primary;
        let viewRows = container ? findRowsByName(container, name) : [];

        if (!viewRows.length) {
            for (const candidate of containers) {
                const rows = findRowsByName(candidate, name);
                if (rows.length) {
                    container = candidate;
                    viewRows = rows;
                    break;
                }
            }
        }

        if (viewRows.length) {
            // Either the row is view-mode, or the table is already in edit
            // mode — both tolerate the click; the field-link searches that
            // follow decide.
            mouseClick(viewRows[0].cells[0]);
            return { container, name, rowNumber: null };
        }
    }

    return null;
}

// The value text of "<b>Label:</b> <value>" in a row ("93 %", "1.23
// g/cm3", "1"), or null.
function readFieldText(tr, label) {
    const el = findFieldValueLink(tr, label, false);
    return el ? (el.textContent || "").trim() : null;
}

// Does a field's displayed value represent `expected`? Compares the
// leading number when both sides are numeric (units and decimal commas
// differ between fields), else plain text. NEVER substring-match a whole
// row's text: "Equivalent: 1" would "match" any row containing a 1.
function valuesMatch(actual, expected) {
    if (actual == null) return false;

    const norm = (v) => String(v).trim().replace(",", ".");
    const a = parseFloat(norm(actual));
    const b = parseFloat(norm(expected));
    if (Number.isFinite(a) && Number.isFinite(b)) return Math.abs(a - b) < 1e-9;

    return norm(actual) === norm(expected);
}

// Read "Equivalent: X" from the sample's own row.
function readEquivalent(container, name, rowNumber) {
    const tr = findTargetRow(container, name, rowNumber);
    return tr ? readFieldText(tr, "Equivalent:") : null;
}

// Click `label`'s value link in the sample's own row (ctx from openRow),
// type `value` into the field's inline editor, Enter, and wait until the
// row shows the value. `shows(text)` decides whether the displayed value is
// the one written; by default it is `value` itself, but a concentration typed
// as "15 mmol/l" comes back as "0.015 mol/L".
async function writeFieldInline(ctx, label, field, value, placeholderOnly, shows) {
    const { container, name, rowNumber } = ctx;
    const link = await waitFor(() => {
        const tr = findTargetRow(container, name, rowNumber);
        return tr ? findFieldValueLink(tr, label, placeholderOnly) : null;
    });
    if (!link) return { ok: false, reason: `row has no ${label.replace(":", "")} field` };

    mouseClick(link);

    const input = await waitFor(() => findInlineEditor(field));
    if (!input) return { ok: false, reason: `${label.replace(":", "")} editor did not open` };

    setNativeInputValue(input, value);
    pressEnter(input);

    // The editor closes and the field itself carries the new value.
    const matches = shows || ((text) => valuesMatch(text, value));
    const confirmed = await waitFor(() => {
        const tr = findTargetRow(container, name, rowNumber);
        if (!tr) return null;
        const text = readFieldText(tr, label);
        return text != null && matches(text) ? tr : null;
    });
    return confirmed ? { ok: true } : { ok: false, reason: "value did not stick" };
}

// Does the displayed concentration ("0.015 mol/L") equal `molPerL`? Relative,
// because the field rounds what it prints.
function showsMolarity(text, molPerL) {
    const shown = parseFloat(String(text).replace(",", "."));
    if (!Number.isFinite(shown)) return false;
    return Math.abs(shown - molPerL) <= Math.abs(molPerL) * 1e-3;
}

/* ------------------------------------------------------------------ *
 * Solvent — the one field that is a dropdown, not a text box.
 *
 * CDD renders the solvent of a solution row as a <tr> OF ITS OWN directly
 * under it: no row number, marked `data-autotest-id
 * ="stoichiometry-table-solutionSolvent"`. "Make solution" creates that row
 * and "Remove solvent" takes it away. Since 2026-10 the row is a full
 * row of its own ("Role: Solvent", FW, Density, Boiling point…) whose
 * solvent is its "Name: Required"; before, the field was "Solvent:".
 * Clicking it opens an inline text box (`inline-input-name`) with a list
 * under it that filters CDD's 38 built-in solvents; an EMPTY box lists them
 * all. The list is a convenience, not a constraint — CDD accepts any string
 * through the `Create "…"` entry, so a remembered "EtOAc/Hexane 1:1" is
 * fillable too.
 * ------------------------------------------------------------------ */
const SOLVENT_ROW_MARKER = "stoichiometry-table-solutionSolvent";
const SOLVENT_PICKER_POPUP = '[data-autotest-id="inline-input-name-options"]';
const SOLVENT_CREATE_ENTRY = '[data-autotest-id="inline-solvent-create"]';
const SOLVENT_LABELS = ["Name:", "Solvent:"];

function solventLabelIn(tr) {
    return SOLVENT_LABELS.find((label) => findFieldValueLink(tr, label, false)) || null;
}

// The solvent row's solvent as it shows now. Picking one can drop the table
// back to view mode, which prints it as `<b>Solvent:</b>` + a
// `stoichiometry-role-name` span instead of the edit-mode field.
function readSolventName(tr) {
    const label = solventLabelIn(tr);
    if (label) return readFieldText(tr, label);
    return (
        tr.querySelector('[data-autotest-id="stoichiometry-role-name"]')?.textContent?.trim() ||
        null
    );
}

function findSolventRow(container, name, rowNumber) {
    const tr = findTargetRow(container, name, rowNumber);
    const next = tr?.nextElementSibling;
    if (!next || !next.cells || next.cells.length < 4) return null;
    return next.getAttribute("data-autotest-id") === SOLVENT_ROW_MARKER ? next : null;
}

function normalizeSolvent(value) {
    return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// The names one picker entry answers to. The list LABELS a solvent
// "Ethanol (EtOH)", but the payload — and therefore what we remember —
// calls the same thing "ethanol", so the label alone never matches. Accept
// the whole label, the label without its trailing parenthesis, and each
// comma-separated abbreviation inside that parenthesis ("Dichloromethane
// (methylene chloride,DCM,CH2Cl2)" → dichloromethane / methylene chloride /
// DCM / CH2Cl2).
function solventAliases(label) {
    const names = [label];
    const parenthesised = String(label).match(/^(.*?)\s*\(([^()]*)\)\s*$/);
    if (parenthesised) {
        names.push(parenthesised[1]);
        names.push(...parenthesised[2].split(","));
    }
    return names.map(normalizeSolvent).filter(Boolean);
}

// The LIST entry for `value`, or null. Only elements carrying a
// `solvent-…` autotest id count, which keeps the list's `Create "…"` entry
// out of this search — the two are picked deliberately, never by accident.
function findSolventOption(value) {
    const popup = document.querySelector(SOLVENT_PICKER_POPUP);
    if (!popup) return null;

    const wanted = normalizeSolvent(value);
    for (const el of popup.querySelectorAll('[data-autotest-id^="solvent-"]')) {
        const label = el.getAttribute("data-autotest-id").slice("solvent-".length);
        if (solventAliases(label).includes(wanted)) return { el, label };
    }
    return null;
}

// The `Create "…"` entry, which names the solvent on THIS row as free text.
// CDD offers it for any string that is not on the list (and alongside the
// matches, which is why a list match has to be tried first — otherwise
// "ethanol" would be created as text next to the real Ethanol entry).
// Nothing is added to the vault's solvent list.
//
// Taken only when the quoted text is exactly what we typed, so a list still
// showing the previous query can never be clicked.
function findCreateEntry(value) {
    for (const el of document.querySelectorAll(SOLVENT_CREATE_ENTRY)) {
        const quoted = (el.textContent || "").trim().match(/^Create\s+"(.*)"$/);
        if (quoted && quoted[1] === value) return el;
    }
    return null;
}

// Pick `value` in the solvent row's dropdown. Expects the row to BE a
// solution already (the caller either found the field or clicked "Make
// solution" first).
async function writeSolventViaPicker(ctx, value) {
    const { container, name, rowNumber } = ctx;
    let label = null;
    const link = await waitFor(() => {
        const tr = findSolventRow(container, name, rowNumber);
        label = tr ? solventLabelIn(tr) : null;
        return label ? findFieldValueLink(tr, label, false) : null;
    });
    if (!link) return { ok: false, reason: "row has no Solvent field" };

    mouseClick(link);

    const input = await waitFor(() => findInlineEditor("name"));
    if (!input) return { ok: false, reason: "solvent picker did not open" };

    // CDD's own list comes FIRST: a list entry brings CAS-RN, FW, density
    // and boiling point with it, free text brings nothing. Typed text
    // filters the list (case-insensitive, anywhere in the label); clearing
    // the box shows all 38, which catches an alias the filter would hide.
    // The box has to be typed into BEFORE it is cleared — React ignores an
    // input event that does not change the value, and it starts empty.
    setNativeInputValue(input, value);
    let option = await waitFor(() => findSolventOption(value));
    if (!option) {
        setNativeInputValue(input, "");
        option = await waitFor(() => findSolventOption(value));
    }

    if (option) {
        mouseClick(option.el);
    } else {
        // Not on the list — which is allowed: a solvent may be any string
        // ("EtOAc/Hexane 1:1"), and that is what the chemist typed here
        // before. Retype it, because the box may still be holding the full
        // list from the step above, then take the `Create "…"` entry.
        setNativeInputValue(input, value);
        const create = await waitFor(() => findCreateEntry(value));
        if (!create) return { ok: false, reason: `could not set solvent "${value}"` };
        mouseClick(create);
    }

    // A list pick prints the picker's own label ("Ethanol (EtOH)"), free
    // text prints itself. Never compare numerically —
    // "2,2,2-Trifluoroethanol" parses as a number.
    const expected = option ? option.label : value;
    const confirmed = await waitFor(() => {
        const tr = findSolventRow(container, name, rowNumber);
        const text = tr ? readSolventName(tr) : null;
        return text && normalizeSolvent(text) === normalizeSolvent(expected) ? tr : null;
    });
    return confirmed ? { ok: true } : { ok: false, reason: "solvent did not stick" };
}

// Fill `value` into the sample's row Density field (empty fields only).
// Returns { ok: true } or { ok: false, reason }.
export async function fillDensityIntoTable(sample, value) {
    value = value != null ? String(value).trim() : "";
    if (!value) return { ok: false, reason: "no density value on this card" };

    const ctx = await openRow(sample);
    if (!ctx) return { ok: false, reason: "table row not found" };

    const result = await writeFieldInline(ctx, "Density:", "density", value, true);
    if (!result.ok) {
        pressEscape();
        return result;
    }

    clickOutside(ctx.container);
    return { ok: true };
}

// The row's CURRENT name, or null when it has none.
//
// Two renderings of a set name: the bare value
// (`<span data-autotest-id="field-name">DIPEA</span>`, CDD before 2026-10)
// and `<b>Name:</b> DIPEA` (since). The blue Optional is a placeholder, never
// a name, and the old solvent field wore the same autotest id with a
// `<b>Solvent:</b>` label. A table that has dropped back to view mode prints
// the name in a `stoichiometry-role-name` span instead.
function readRowName(tr) {
    const viewName = tr
        .querySelector('[data-autotest-id="stoichiometry-role-name"]')
        ?.textContent?.trim();
    if (viewName) return viewName;

    for (const span of tr.querySelectorAll('[data-autotest-id="field-name"]')) {
        if (span.querySelector('[data-autotest-id="missing-label"]')) continue;
        const label = span.querySelector(":scope > b")?.textContent?.trim();
        if (label && label !== "Name:") continue;
        const text = (span.textContent || "").replace(/^\s*Name:\s*/, "").trim();
        if (text) return text;
    }
    return null;
}

// Fill `value` into the row's Name field — the free-text label CDD prints
// above the molecule-batch id. EMPTY fields only: the link search is
// placeholderOnly, so a name that is already there is never overwritten.
//
// Not routed through writeFieldInline because the name is confirmed by
// readRowName, which knows both ways CDD has rendered a set name.
export async function fillNameIntoTable(sample, value) {
    value = value != null ? String(value).trim() : "";
    if (!value) return { ok: false, reason: "no name value on this card" };

    const ctx = await openRow(sample);
    if (!ctx) return { ok: false, reason: "table row not found" };

    const { container, name, rowNumber } = ctx;

    return writeNameThroughEditor(
        () => findTargetRow(container, name, rowNumber),
        value,
        container
    );
}

// Click the row's empty Name, set the value, press Enter, confirm.
//
// `locate` returns the row AS IT STANDS NOW, because every step re-renders the
// table and the element from the step before is gone. The two callers differ
// only in how they find it again — by the sample's printed number, or by the
// batch the row prints — so that is the only thing passed in.
async function writeNameThroughEditor(locate, value, container) {
    const link = await waitFor(() => {
        const tr = locate();
        return tr ? findFieldValueLink(tr, "Name:", true) : null;
    });
    if (!link) {
        pressEscape();
        return { ok: false, reason: "row has no empty Name field" };
    }

    mouseClick(link);

    const input = await waitFor(() => findInlineEditor("name"));
    if (!input) {
        pressEscape();
        return { ok: false, reason: "Name editor did not open" };
    }

    setNativeInputValue(input, value);
    pressEnter(input);

    const confirmed = await waitFor(() => {
        const tr = locate();
        return tr && valuesMatch(readRowName(tr), value) ? tr : null;
    });

    if (!confirmed) {
        pressEscape();
        return { ok: false, reason: "value did not stick" };
    }

    clickOutside(container);
    return { ok: true };
}

// The batch a row prints ("RGT-0000246-001"), which survives the re-renders
// its element and its number do not.
function readMoleculeLabel(tr) {
    const printed = tr
        .querySelector?.('[data-autotest-id="field-moleculeName"]')
        // "Molecule:" or "Entity:", whichever the vault calls it.
        ?.textContent?.replace(/^\s*[^\s:]+:\s*/, "")
        .trim();
    return printed || null;
}

/**
 * fillNameIntoRow(tr, value) — the same write as fillNameIntoTable, but aimed
 * at a row ELEMENT rather than a panel record.
 *
 * A row the user has just added does not exist in any payload yet: that only
 * comes back with the next autosave, tens of seconds later. name-watch.js sees
 * the row itself, so it has the one thing this needs and none of the rest.
 *
 * The row may not be in edit mode — a click puts it there, exactly as the
 * user's would.
 */
export async function fillNameIntoRow(tr, value) {
    value = value != null ? String(value).trim() : "";
    if (!value) return { ok: false, reason: "no name to write" };
    if (!tr?.isConnected) return { ok: false, reason: "row is gone" };

    // The click that opens edit mode re-renders the table, and the <tr> handed
    // in is thrown away with it. Look the row up again after every step.
    //
    // By the BATCH it prints, not by its number: numbering shifts as CDD
    // regroups the table (reactants, then agents, then products), so a row
    // looked up by number after the write can be a different row — which is
    // how a landed value came back as "did not stick", six times over.
    const container =
        tr.closest('[data-autotest-id="reaction"]') || tr.closest("table") || document.body;
    const rowNumber = (tr.cells?.[0]?.innerText || "").trim();
    const batch = readMoleculeLabel(tr);

    const row = () => {
        if (tr.isConnected) return tr;
        if (batch) {
            for (const candidate of container.querySelectorAll("table tr")) {
                if (readMoleculeLabel(candidate) === batch) return candidate;
            }
        }
        return rowNumber ? findRowByNumber(container, rowNumber) : null;
    };

    // A row in view mode has no Name link at all; the click puts the table into
    // edit rendering, exactly as the user's would.
    if (!findFieldValueLink(tr, "Name:", true)) mouseClick(tr);

    return writeNameThroughEditor(row, value, container);
}

// Fill `value` into the row's Purity field. CDD recalculates this row's
// Equivalent when purity changes — snapshot it first and put it back
// afterwards, so the fill only changes purity.
export async function fillPurityIntoTable(sample, value) {
    value = value != null ? String(value).trim() : "";
    if (!value) return { ok: false, reason: "no purity value on this card" };

    const ctx = await openRow(sample);
    if (!ctx) return { ok: false, reason: "table row not found" };

    await waitFor(() => (readEquivalent(ctx.container, ctx.name, ctx.rowNumber) != null) || null);
    const equivalentBefore = readEquivalent(ctx.container, ctx.name, ctx.rowNumber);

    const result = await writeFieldInline(ctx, "Purity:", "purity", value, false);
    if (!result.ok) {
        pressEscape();
        return result;
    }

    if (equivalentBefore != null) {
        // Give CDD a moment to recalculate, then decide on the CURRENT
        // value — never on whether the wait happened to observe the
        // change. (A wait that times out must not mean "nothing changed".)
        await waitFor(() => {
            const now = readEquivalent(ctx.container, ctx.name, ctx.rowNumber);
            return now != null && !valuesMatch(now, equivalentBefore) ? now : null;
        });

        const equivalentAfter = readEquivalent(ctx.container, ctx.name, ctx.rowNumber);
        if (equivalentAfter != null && !valuesMatch(equivalentAfter, equivalentBefore)) {
            const restore = await writeFieldInline(
                ctx, "Equivalent:", "equivalent", equivalentBefore, false);
            if (!restore.ok) {
                pressEscape();
                // Purity IS written; the failure is visible, never silent.
                return {
                    ok: false,
                    reason: `purity written but equivalent restore failed (was ${equivalentBefore})`,
                };
            }

            const finalEquivalent = readEquivalent(ctx.container, ctx.name, ctx.rowNumber);
            if (finalEquivalent != null && !valuesMatch(finalEquivalent, equivalentBefore)) {
                pressEscape();
                return {
                    ok: false,
                    reason: `purity written but equivalent is ${finalEquivalent}, not ${equivalentBefore}`,
                };
            }
        }
    }

    clickOutside(ctx.container);
    return { ok: true };
}

// Fill `value` (+ optional `units`) into the row's Concentration field.
// The field only exists on solution rows — "Make solution" converts the
// row first when needed. `solvent` (optional) is picked afterwards, in the
// solvent row the conversion created.
export async function fillConcentrationIntoTable(sample, value, units, solvent) {
    value = value != null ? String(value).trim() : "";
    if (!value) return { ok: false, reason: "no concentration value on this card" };

    // Before anything is clicked: a unit CDD cannot take must not leave a
    // half-made solution row behind.
    const typed = concentrationText(value, units);
    if (!typed) return { ok: false, reason: `concentration unit "${units}" is not one CDD accepts` };

    const ctx = await openRow(sample);
    if (!ctx) return { ok: false, reason: "table row not found" };

    const hasField = await waitFor(() => {
        const tr = findTargetRow(ctx.container, ctx.name, ctx.rowNumber);
        return tr && findFieldValueLink(tr, "Concentration:", false) ? true : null;
    });

    if (!hasField) {
        const make = (() => {
            const tr = findTargetRow(ctx.container, ctx.name, ctx.rowNumber);
            if (!tr) return null;
            for (const el of tr.querySelectorAll("a, span, button")) {
                if (/^Make solution$/i.test((el.textContent || "").trim())) return el;
            }
            return null;
        })();
        if (!make) {
            pressEscape();
            return { ok: false, reason: "no Concentration field and no Make solution link" };
        }

        mouseClick(make);

        const appeared = await waitFor(() => {
            const tr = findTargetRow(ctx.container, ctx.name, ctx.rowNumber);
            return tr && findFieldValueLink(tr, "Concentration:", false) ? true : null;
        });
        if (!appeared) {
            pressEscape();
            return { ok: false, reason: "Concentration field did not appear after Make solution" };
        }
    }

    const result = await writeFieldInline(
        ctx, "Concentration:", "concentration", typed.text, false,
        typed.molPerL != null ? (text) => showsMolarity(text, typed.molPerL) : null);
    if (!result.ok) {
        pressEscape();
        return result;
    }

    // Best effort from here on: the concentration IS written, so a solvent
    // that cannot be picked must not turn the whole fill into a failure —
    // it comes back as a note the caller can show.
    let note = null;
    if (solvent) {
        const picked = await writeSolventViaPicker(ctx, String(solvent).trim());
        if (!picked.ok) {
            pressEscape();
            note = picked.reason;
        }
    }

    clickOutside(ctx.container);
    return note ? { ok: true, note } : { ok: true };
}

// Fill `value` into the Solvent field of a row that is ALREADY a solution.
// Deliberately no "Make solution" here: turning a plain row into a solution
// is the concentration fill's job, and a solution with a solvent but no
// concentration would be a half-made row nobody asked for.
export async function fillSolventIntoTable(sample, value) {
    value = value != null ? String(value).trim() : "";
    if (!value) return { ok: false, reason: "no solvent on this card" };

    const ctx = await openRow(sample);
    if (!ctx) return { ok: false, reason: "table row not found" };

    const result = await writeSolventViaPicker(ctx, value);
    if (!result.ok) {
        pressEscape();
        return result;
    }

    clickOutside(ctx.container);
    return { ok: true };
}
