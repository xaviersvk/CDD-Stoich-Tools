// content/features/name-watch.js
//
// Asks for a molecule's synonyms the moment its row appears — not when the
// payload that describes the row finally comes back.
//
// This is the whole difference between the feature being usable and not. A
// row you just added exists in the DOM immediately, but in no payload: CDD
// sends the entry back only with an autosave, which lands tens of seconds
// later. Anything that waits for `STATE.lastPayload` therefore waits with it,
// and by then you have moved on and typed the name yourself.
//
// So this module reads the TABLE, not the payload:
//
//   any mode but off   fetch the synonyms for every molecule in a stoichiometry
//                      row, so the Name editor opens with its list ready
//   "auto"             write the name into rows that APPEAR while you work
//
// Rows already on screen when the entry loaded are the baseline and are never
// written to automatically — the same rule auto-fill.js has always kept, read
// off the table instead of the payload.
//
// One measured awkwardness runs through all of it: a row identifies its
// molecule ONLY in view mode, where the batch is a link to `/molecules/<id>`.
// In edit mode — which is where a freshly added row sits — there are no links
// at all, just the printed batch name. So ids are LEARNED wherever a name and
// an id appear together, and remembered by batch name:
//
//   the reagent picker    while the user is still choosing a batch (earliest)
//   a view-mode row       the batch link
//   the payload           when it eventually arrives
//
// It also keeps the panel honest: a name that lands in the table is written
// straight onto the sample record, so the card's fill button goes away with
// the click rather than with the next autosave.

import { STATE } from "../state.js";
import { detectVaultId } from "../api/molecule-image.js";
import {
    getBatchField,
    getMoleculeIdByName,
    getSynonyms,
    getSynonymsByName,
    loadSynonyms,
} from "../api/molecule-synonyms.js";
import { getRememberedName } from "../../shared/name-memory.js";
import { pickRowName } from "../../shared/row-name-choice.js";
import { isElnEntryPage } from "../../shared/page-detection.js";
import {
    getRowNameMode,
    isFillRowNameEnabled,
    isRowNameAutoFillEnabled,
    onFillRowNameChanged,
} from "../../shared/row-name-flag.js";
import { fillNameIntoRow } from "./row-fill.js";
import { runExclusive } from "./write-lock.js";
import { setStatus, renderFromState } from "./sample-panel.js";

const ROW_SELECTOR = '[data-autotest-id="stoichiometry-row"]';
const MOLECULE_PICKER = '[data-autotest-id="molecule-selector"]';
const MOLECULE_HREF = /\/molecules\/(\d+)/;

// The table is drawn in pieces and re-drawn on every keystroke CDD
// recalculates; scanning per mutation would be a scan per frame.
const SCAN_DEBOUNCE_MS = 250;

// Rows on screen within this window of arriving at the entry are pre-existing.
// Generous on purpose: React draws the tables well after the document is
// ready, and a row misread as "new" would be written to without being asked.
const BASELINE_MS = 6000;

let started = false;
let scanTimer = null;

let baselineHref = null;
let baselineUntil = 0;
const baselineRows = new Set();

// row key -> attempts made. The anchor that keeps a re-rendered row (a new
// element for the same row) from being written twice.
//
// Capped rather than one-shot, because a write can land and still report
// failure — and released-on-failure alone turned that into a loop: six
// editors opening in a row over a value that was already in the cell.
const autoAttempted = new Map();
const MAX_WRITE_ATTEMPTS = 2;

// Batch name ("RGT-0000246-001") -> molecule id, learned from the rows and
// payloads that DO carry both. An edit-mode row prints the name and nothing
// else; see moleculeIdOf.
const idByBatchName = new Map();

let writing = false;
const writeQueue = [];

function rowsOnPage() {
    return Array.from(document.querySelectorAll(ROW_SELECTOR), (marker) =>
        marker.closest("tr") || marker
    );
}

// Everything the panel has ever been told, folded into the name index. A row
// the user just added is in no payload — but the same molecule under an older
// batch usually is, and one molecule page answers for all its batches.
function learnFromPayload() {
    for (const sample of STATE.lastPayload?.samples || []) {
        if (!sample?.moleculeId) continue;
        for (const label of [sample.name, sample.moleculeName]) {
            if (typeof label === "string" && label.trim()) {
                idByBatchName.set(label.trim(), String(sample.moleculeId));
            }
        }
    }
}

// The batch as the row PRINTS it ("RGT-0000246-001"), in either mode. Always
// available, which is what makes it the row's identity here.
function batchLabelOf(row) {
    const printed = row
        .querySelector('[data-autotest-id="field-moleculeName"]')
        ?.textContent?.replace(/^\s*Molecule:\s*/, "")
        .trim();
    if (printed) return printed;

    for (const link of row.querySelectorAll("a[href]")) {
        if (!MOLECULE_HREF.test(link.getAttribute("href") || "")) continue;
        const text = (link.textContent || "").trim();
        if (text) return text;
    }
    return null;
}

// The molecule id for a row.
//
// In VIEW mode the batch is a link and the id is in its href. In EDIT mode —
// which is where a row spends its first minutes, and the only mode the Name
// can be written in — there are no links at all: the row prints
// `Molecule: RGT-0000246-001` and stops. So the link is also read as a LESSON,
// and the edit-mode row is answered from what those lessons taught.
export function batchLabelForRow(row) {
    return batchLabelOf(row);
}

export function moleculeIdForRow(row) {
    for (const link of row.querySelectorAll("a[href]")) {
        const match = MOLECULE_HREF.exec(link.getAttribute("href") || "");
        if (!match) continue;
        const label = (link.textContent || "").trim();
        if (label) idByBatchName.set(label, match[1]);
        return match[1];
    }

    const printed = batchLabelOf(row);
    if (!printed) return null;

    // `RGT-0000246-001` and `RGT-0000246` are the same molecule; the batch
    // suffix is the only part that differs between them.
    return (
        idByBatchName.get(printed) ||
        idByBatchName.get(printed.replace(/-\d+$/, "")) ||
        getMoleculeIdByName(printed) ||
        null
    );
}

// The synonyms for a row, by molecule id when we have one and by the batch it
// prints when we do not.
//
// The second half is what makes the automatic name arrive with the row rather
// than with the save: adding a reagent through the row's own Name field never
// reveals the molecule id, but the search that found the molecule already
// answered with its synonyms. See features/search-learning.js.
function synonymsForRow(row, moleculeId) {
    const byId = moleculeId ? getSynonyms(moleculeId) : null;
    if (byId && byId.length) return byId;
    return getSynonymsByName(batchLabelOf(row)) || byId || [];
}

// The row's Name as the table shows it right now, or null when it has none.
//
// Three renderings to tell apart. Edit mode with an empty field is
// `<b>Name:</b>` + the blue `Optional`; with a value, both modes render the
// bare value and no label at all; and view mode with no name renders no Name
// field whatsoever — which is the one that reads as empty by absence.
//
// The Solvent field wears the same autotest id and keeps a `<b>Solvent:</b>`;
// that is what tells the two apart.
function rowName(row) {
    for (const field of row.querySelectorAll('[data-autotest-id="field-name"]')) {
        const label = field.querySelector(":scope > b")?.textContent?.trim();
        if (label === "Solvent:") continue;

        // The blue Optional is a placeholder, never a value — including on a
        // row with no molecule yet, where CDD prints it with no label at all
        // and it would otherwise read as a row named "Optional".
        if (field.querySelector('[data-autotest-id="missing-label"]')) return null;

        if (label === "Name:") {
            const written = (field.textContent || "").replace(/^\s*Name:\s*/, "").trim();
            return written || null;
        }

        if (!label) {
            const written = (field.textContent || "").trim();
            if (written) return written;
        }
    }
    return null;
}

function hasEmptyName(row) {
    return rowName(row) === null;
}

// Tell the panel what the table says, without waiting for the payload that
// would eventually say the same.
//
// A name written into a row — by the picker, by auto mode, or by hand — leaves
// the card's "Fill name … into table" button standing until the next autosave
// brings the entry back, tens of seconds later. The button is then offering
// work that is already done. The table is the authority on its own cells long
// before the server repeats it, so the sample record is corrected from here.
//
// Returns true when something changed, i.e. when a re-render is owed.
function syncPanelNames(rows, keys) {
    const samples = STATE.lastPayload?.samples;
    if (!Array.isArray(samples) || !samples.length) return false;

    let changed = false;

    for (let i = 0; i < rows.length; i += 1) {
        const identity = keys[i];
        if (!identity) continue;

        const printed = (rows[i].cells?.[0]?.innerText || "").trim();
        const name = rowName(rows[i]);

        for (const sample of samples) {
            if (!identity.moleculeId) break;
            if (String(sample?.moleculeId || "") !== identity.moleculeId) continue;
            if (sample.reactionIndex !== identity.tableIndex) continue;
            if (printed && sample.rowNumber != null && String(sample.rowNumber) !== printed) {
                continue;
            }
            if ((sample.tableName || null) === name) continue;

            sample.tableName = name;
            changed = true;
        }
    }

    return changed;
}

// What identifies a row across CDD's re-renders, which replace the elements
// but not what is in them: the table it sits in, its molecule, and which
// occurrence of that molecule it is within the table.
//
// NOT the molecule alone. Adding DIPEA to reaction 1 of an entry that already
// uses it in reaction 2 is a new row by any reading, and a molecule-keyed
// baseline would have called it pre-existing and left it unnamed.
function rowKeysOf(rows) {
    const tables = [];
    const counters = new Map();

    return rows.map((row) => {
        // Keyed on the PRINTED batch, not the numeric id. The id is not always
        // knowable yet — an edit-mode row has no link and the payload has not
        // landed — and a key that resolves late is a key the baseline misses,
        // which would then read every pre-existing row as newly added.
        const label = batchLabelOf(row);
        if (!label) return null;

        const table = row.closest("table") || document.body;
        let tableIndex = tables.indexOf(table);
        if (tableIndex < 0) tableIndex = tables.push(table) - 1;

        const seen = `${tableIndex}:${label}`;
        const occurrence = counters.get(seen) || 0;
        counters.set(seen, occurrence + 1);

        return {
            label,
            tableIndex,
            moleculeId: moleculeIdForRow(row),
            key: `${seen}:${occurrence}`,
        };
    });
}

// The reagent picker — `+ Reagent`, then a molecule typed into its combobox —
// is the FIRST place the page knows which molecule is being added. It prints
// the molecule name in the combobox and links to `/molecules/<id>/batches`
// beside it, so both halves are there while the user is still choosing a
// batch: a whole dialog's worth of time to fetch the synonyms in.
//
// By the time the row exists, the answer is already here.
function learnFromMoleculePicker(vaultId) {
    for (const picker of document.querySelectorAll(MOLECULE_PICKER)) {
        const box = picker.closest(".MuiPaper-root") || picker.parentElement;
        if (!box) continue;

        let moleculeId = null;
        for (const link of box.querySelectorAll("a[href]")) {
            const match = MOLECULE_HREF.exec(link.getAttribute("href") || "");
            // `/molecules/new?...` is the "register a new molecule" link and
            // has no id to learn.
            if (match) {
                moleculeId = match[1];
                break;
            }
        }
        if (!moleculeId) continue;

        const chosen = box.querySelector('input[placeholder="Select..."]')?.value?.trim();
        if (chosen) idByBatchName.set(chosen, moleculeId);

        if (!getSynonyms(moleculeId)) {
            loadSynonyms(vaultId, moleculeId).then(scheduleScan).catch(() => {});
        }
    }
}

// The batch's Internal ID for this row.
//
// The molecule page first: it lists every batch of the molecule with its
// fields, and it is already fetched for the synonyms. The ELN payload carries
// no batch metafields at all, so the card only learns the Internal ID after an
// autosave — reading it off the page is what lets the automatic write use it
// on a row added seconds ago.
function internalIdForRow(row, moleculeId) {
    const fromPage = getBatchField(moleculeId, batchLabelOf(row), "Internal ID");
    if (fromPage) return fromPage;

    const printed = (row?.cells?.[0]?.innerText || "").trim();
    for (const sample of STATE.lastPayload?.samples || []) {
        if (String(sample?.moleculeId || "") !== String(moleculeId)) continue;
        if (printed && sample.rowNumber != null && String(sample.rowNumber) !== printed) {
            continue;
        }
        if (sample.internalID) return String(sample.internalID);
    }
    return null;
}

// The name to write — shared/row-name-choice.js's first pick, so the automatic
// write, the panel's button and the editor's list can never disagree.
function nameFor(moleculeId, row) {
    return pickRowName(
        {
            remembered: getRememberedName(moleculeId),
            internalId: internalIdForRow(row, moleculeId),
            synonyms: synonymsForRow(row, moleculeId),
        }
    );
}

function enqueueWrite(row, moleculeId, key) {
    writeQueue.push({ row, moleculeId, key });
    drainWrites();
}

// Sequential: every write drives CDD's real editor and triggers an autosave,
// so two at once would fight each other.
async function drainWrites() {
    if (writing) return;
    writing = true;

    try {
        while (writeQueue.length) {
            const { row, moleculeId, key } = writeQueue.shift();
            if (!row.isConnected || !isRowNameAutoFillEnabled()) {
                // A row replaced between the scan and its turn in the queue is
                // not a failure — the next scan finds its successor. But the
                // attempt has to be released, or nothing ever retries it.
                autoAttempted.delete(key);
                say("write skipped, row went away", { row: key });
                continue;
            }

            const value = nameFor(moleculeId, row);
            if (!value) {
                autoAttempted.delete(key);
                say("nothing to write yet", {
                    row: key,
                    synonyms: getSynonyms(moleculeId),
                });
                continue;
            }

            const result = await runExclusive(() => fillNameIntoRow(row, value));
            say(`write "${value}" -> ${result.ok ? "ok" : result.reason} [${key}]`);
            if (!result.ok && result.reason !== "row has no empty Name field") {
                setStatus(`Row name "${value}": ${result.reason} — type it in the row instead.`);
            }
        }
    } finally {
        writing = false;
    }
}

// Why a row was passed over, printed once per row per verdict.
//
// Automatic writing has no visible failure: nothing happens, and nothing
// happening is also what "correctly left alone" looks like. This is the only
// way to tell the two apart from the outside, so it stays in — plain
// console.log so it needs no Verbose setting to find, and silent while the
// verdict does not change, so a table being redrawn per keystroke does not
// print per keystroke.
const LOG = "[CDD row-name]";

// console.debug, not log: this is a diagnostic for when nothing visibly
// happens, and nothing visibly happening is also the correct outcome most of
// the time. Set the console to Verbose to see it.
// console.debug, not log. An automatic write that quietly does nothing looks
// exactly like one that correctly left the row alone, so the verdicts are
// worth keeping — but they belong behind the console.s Verbose switch, not in
// everybody.s log. Throttled to one line per row per change of verdict.
const say = (...args) => console.debug(LOG, ...args);
const lastVerdict = new Map();

function trace(key, verdict, extra) {
    if (lastVerdict.get(key) === verdict) return;
    lastVerdict.set(key, verdict);
    say(verdict, { row: key, ...extra });
}

function scan() {
    if (!isFillRowNameEnabled() || !isElnEntryPage()) return;

    const vaultId = detectVaultId();
    if (!vaultId) return;

    if (baselineHref !== location.href) {
        baselineHref = location.href;
        baselineUntil = Date.now() + BASELINE_MS;
        baselineRows.clear();
        autoAttempted.clear();
    }

    learnFromPayload();
    learnFromMoleculePicker(vaultId);

    const rows = rowsOnPage();
    const keys = rowKeysOf(rows);
    const inBaseline = Date.now() < baselineUntil;

    if (syncPanelNames(rows, keys)) renderFromState();

    for (let i = 0; i < rows.length; i += 1) {
        const identity = keys[i];
        if (!identity) {
            // No molecule: a solvent row, a blank row — or a batch whose id
            // nothing has taught us yet, which is the one worth seeing.
            const printed = rows[i]
                .querySelector('[data-autotest-id="field-moleculeName"]')
                ?.textContent?.trim();
            if (printed) trace(printed, "no molecule id known for this batch yet");
            continue;
        }

        const { moleculeId, key } = identity;

        // The fetch is worth making whatever the row's state: the Name editor
        // may be opened on a row that already has one, to change it. But only
        // once the id is known — a row is keyed by its printed batch, which
        // exists before anything has taught us the id behind it.
        if (moleculeId && !getSynonyms(moleculeId)) {
            loadSynonyms(vaultId, moleculeId)
                // The answer is what auto mode was waiting for, and it arrives
                // without a DOM change to notice it by.
                .then(scheduleScan)
                .catch(() => {
                    // Retried by the next scan — molecule-page.js drops
                    // failures from its cache for exactly this.
                });
        }

        if (inBaseline) {
            baselineRows.add(key);
            trace(key, "already here when the entry opened");
            continue;
        }

        if (!isRowNameAutoFillEnabled()) {
            trace(key, "auto fill is off", { mode: getRowNameMode() });
            continue;
        }
        if (baselineRows.has(key)) continue;     // traced above
        if ((autoAttempted.get(key) || 0) >= MAX_WRITE_ATTEMPTS) continue;

        if (!hasEmptyName(rows[i])) {
            trace(key, "row already has a name", { name: rowName(rows[i]) });
            continue;
        }

        // No id needed if the search already answered for this batch by name:
        // writing a name wants the NAME, and requiring an id here is what made
        // the fill wait for the entry to be saved.
        const value = nameFor(moleculeId, rows[i]);
        if (!value) {
            trace(key, "nothing to write yet", {
                moleculeId,
                synonyms: synonymsForRow(rows[i], moleculeId),
            });
            continue;
        }

        trace(key, "writing", { moleculeId, value });
        autoAttempted.set(key, (autoAttempted.get(key) || 0) + 1);
        enqueueWrite(rows[i], moleculeId, key);
    }
}

function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, SCAN_DEBOUNCE_MS);
}

export function initNameWatch() {
    if (started) return;
    started = true;

    new MutationObserver(scheduleScan).observe(document.documentElement, {
        childList: true,
        subtree: true,
    });

    // Turning the setting on should act on the entry already open.
    onFillRowNameChanged(scheduleScan);

    scheduleScan();
}
