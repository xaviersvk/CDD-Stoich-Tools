// content/features/row-fill.js
//
// Writes a value into a stoichiometry-row field by replaying the user's own
// editing gestures:
//
//   click the row (the table flips to edit mode)
//   → click the field's value link ("Density: Optional", "Purity: 100 %"…)
//   → set the popup input natively (React value-tracker aware) → Enter
//   → click the empty page margin to leave edit mode.
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
function getReactionContainers() {
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
function isEditModeRow(tr) {
    for (const b of tr.querySelectorAll("b")) {
        if ((b.textContent || "").trim() === "Name:") return true;
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

// The editable text input inside the floating one-field popup whose
// MuiPaper box text matches labelRe (e.g. /Density\s*\[/i). The input only
// sometimes carries a placeholder, so the popup label is the reliable
// marker.
function findEditorInput(labelRe) {
    const candidates = [];

    const active = document.activeElement;
    if (active && active.tagName === "INPUT") candidates.push(active);
    candidates.push(...document.querySelectorAll(".MuiPaper-root input"));

    for (const input of candidates) {
        if (input.readOnly || input.type !== "text") continue;

        let box = input.parentElement;
        for (let i = 0; i < 8 && box; i++) {
            if (/MuiPaper/.test(box.className || "")) break;
            box = box.parentElement;
        }

        if (box && labelRe.test(box.innerText || "")) return input;
    }

    return null;
}

// A <select> inside the same popup (concentration units). Null when the
// popup has none — callers treat units as best-effort.
function findEditorSelect(labelRe) {
    for (const select of document.querySelectorAll(".MuiPaper-root select")) {
        let box = select.parentElement;
        for (let i = 0; i < 8 && box; i++) {
            if (/MuiPaper/.test(box.className || "")) break;
            box = box.parentElement;
        }
        if (box && labelRe.test(box.innerText || "")) return select;
    }
    return null;
}

function setNativeSelectValue(select, value) {
    // Accept a match on option value OR visible text.
    const option = Array.from(select.options).find(
        (o) => o.value === value || (o.textContent || "").trim() === value
    );
    if (!option) return false;

    const setter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype, "value")?.set;
    if (setter) setter.call(select, option.value);
    else select.value = option.value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
}

function setNativeInputValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
    )?.set;

    if (setter) {
        setter.call(input, value);
    } else {
        input.value = value;
    }

    input.dispatchEvent(new Event("input", { bubbles: true }));
}

function pressEnter(target) {
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
// type `value` into the popup, Enter, and wait until the row text shows
// the value. `units` (optional) is set on the popup's <select> when one
// exists.
async function writeFieldViaPopup(ctx, label, popupLabelRe, value, placeholderOnly, units) {
    const { container, name, rowNumber } = ctx;
    const link = await waitFor(() => {
        const tr = findTargetRow(container, name, rowNumber);
        return tr ? findFieldValueLink(tr, label, placeholderOnly) : null;
    });
    if (!link) return { ok: false, reason: `row has no ${label.replace(":", "")} field` };

    mouseClick(link);

    const input = await waitFor(() => findEditorInput(popupLabelRe));
    if (!input) return { ok: false, reason: `${label.replace(":", "")} editor did not open` };

    setNativeInputValue(input, value);
    if (units) {
        const select = findEditorSelect(popupLabelRe);
        if (select) setNativeSelectValue(select, units);   // best-effort
    }
    pressEnter(input);

    // The popup closes and the field itself carries the new value.
    const confirmed = await waitFor(() => {
        const tr = findTargetRow(container, name, rowNumber);
        if (!tr) return null;
        return valuesMatch(readFieldText(tr, label), value) ? tr : null;
    });
    return confirmed ? { ok: true } : { ok: false, reason: "value did not stick" };
}

/* ------------------------------------------------------------------ *
 * Solvent — the one field that is a dropdown, not a text box.
 *
 * CDD renders the solvent of a solution row as a <tr> OF ITS OWN directly
 * under it: no row number, marked `data-autotest-id
 * ="stoichiometry-table-solutionSolvent"`. "Make solution" creates that row
 * (labelled "Solvent: Required") and "Remove solvent" takes it away.
 * Clicking its Solvent link opens a picker whose text box filters CDD's 38
 * built-in solvents; an EMPTY box lists them all. The list is a
 * convenience, not a constraint — CDD accepts any string through the
 * `Create "…"` entry, so a remembered "EtOAc/Hexane 1:1" is fillable too.
 * ------------------------------------------------------------------ */
const SOLVENT_ROW_MARKER = "stoichiometry-table-solutionSolvent";
const SOLVENT_PICKER_POPUP = '[data-autotest-id="solvent-row-name-selector-popup"]';

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
// It carries no autotest id, so it is found by its own label — and only
// when the quoted text is exactly what we typed, so a list still showing
// the previous query can never be clicked.
function findCreateEntry(value) {
    const popup = document.querySelector(SOLVENT_PICKER_POPUP);
    if (!popup) return null;

    for (const el of popup.querySelectorAll("*")) {
        if (el.children.length) continue;
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
    const link = await waitFor(() => {
        const tr = findSolventRow(container, name, rowNumber);
        return tr ? findFieldValueLink(tr, "Solvent:", false) : null;
    });
    if (!link) return { ok: false, reason: "row has no Solvent field" };

    mouseClick(link);

    const input = await waitFor(() => findEditorInput(/^\s*Solvent\s*$/i));
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
        const text = tr ? readFieldText(tr, "Solvent:") : null;
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

    const result = await writeFieldViaPopup(ctx, "Density:", /Density\s*\[/i, value, true);
    if (!result.ok) {
        pressEscape();
        return result;
    }

    clickOutside(ctx.container);
    return { ok: true };
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

    const result = await writeFieldViaPopup(ctx, "Purity:", /Purity/i, value, false);
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
            const restore = await writeFieldViaPopup(
                ctx, "Equivalent:", /Equivalent/i, equivalentBefore, false);
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

    const result = await writeFieldViaPopup(
        ctx, "Concentration:", /Concentration/i, value, false, units || null);
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
