// content/features/name-picker.js
//
// Puts the molecule's synonyms INSIDE CDD's own Name editor.
//
// Clicking `Name: Optional` on a stoichiometry row opens a one-field popup
// with a free-text input. That input stays exactly as it is — type anything
// and it is saved, and name-capture.js remembers it. Underneath it we add the
// names this molecule already answers to: the one remembered for it first,
// then every synonym CDD carries, shortest first. One click puts a name in
// the input and commits it the same way Enter would.
//
// Why here and not another button in the panel: the panel is a place you go
// to; the Name editor is where you already are when you decide what the row
// should be called.
//
// Active in the "Suggest in the Name editor" mode only. The popup is CDD's,
// so everything here re-verifies the markup it expects and simply does
// nothing when it does not find it.

import { STATE } from "../state.js";
import { detectVaultId } from "../api/molecule-image.js";
import { getSynonyms, loadSynonyms } from "../api/molecule-synonyms.js";
import { getRememberedName } from "../../shared/name-memory.js";
import { rowNameCandidates } from "../../shared/row-name-choice.js";
import {
    isRowNamePickerEnabled,
} from "../../shared/row-name-flag.js";
import { internalIdForRow, moleculeIdForRow } from "./name-watch.js";
import {
    getReactionContainers,
    setNativeInputValue,
    pressEnter,
} from "./row-fill.js";

const STYLE_ID = "cdd-name-picker-style";
const LIST_CLASS = "cdd-name-picker";
const NAME_INPUT = 'input[placeholder="Name"]';

// How long to keep looking for the popup after the click. CDD opens it in the
// next frame or two; anything slower than this was not this click's popup.
const POPUP_POLL_ATTEMPTS = 20;
const POPUP_POLL_MS = 50;

const STYLE = `
.${LIST_CLASS} {
    margin: 6px 0 2px;
    max-height: 190px;
    overflow-y: auto;
    font: inherit;
}
.${LIST_CLASS}__hint {
    padding: 2px 4px 4px;
    font-size: 11px;
    opacity: 0.65;
}
.${LIST_CLASS}__item {
    display: block;
    width: 100%;
    box-sizing: border-box;
    padding: 4px 6px;
    border: 0;
    border-radius: 3px;
    background: transparent;
    text-align: left;
    font: inherit;
    font-size: 12px;
    line-height: 1.35;
    color: inherit;
    cursor: pointer;
    word-break: break-word;
}
.${LIST_CLASS}__item:hover,
.${LIST_CLASS}__item:focus {
    background: rgba(25, 118, 210, 0.12);
    outline: none;
}
.${LIST_CLASS}__mark {
    margin-left: 6px;
    font-size: 10px;
    opacity: 0.6;
}
`;

function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = STYLE;
    document.head.appendChild(style);
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// The clicked element's Name field, or null. Two things wear
// `data-autotest-id="field-name"`: the row's Name, and the Solvent row's own
// name — which keeps a `<b>Solvent:</b>` label and must be left alone.
function nameFieldFrom(target) {
    const field = target?.closest?.('[data-autotest-id="field-name"]');
    if (!field) return null;

    const label = field.querySelector(":scope > b")?.textContent?.trim();
    if (label && label !== "Name:") return null;

    return field;
}

// Which molecule this row is about.
//
// The ROW is asked first, not the payload: a row added a moment ago is in no
// payload at all — that only comes back with the next autosave, half a minute
// later — and the list has to be in the editor when the editor opens.
//
// The payload is the fallback, matched by printed row number, for a row whose
// molecule name nothing has taught us the id for yet.
function resolveMoleculeId(field) {
    const row = field.closest("tr");
    if (!row) return null;

    // name-watch.js already keeps the link-to-id index this needs, and reads
    // the same two renderings of a row; asking it is one lookup, not a second
    // copy of the rule.
    const fromRow = moleculeIdForRow(row);
    if (fromRow) return fromRow;

    if (!row.cells || !row.cells.length) return null;
    const rowNumber = (row.cells[0].innerText || "").trim();
    const samples = STATE.lastPayload?.samples || [];
    const matches = samples.filter(
        (sample) =>
            sample?.moleculeId &&
            sample.rowNumber != null &&
            String(sample.rowNumber) === rowNumber
    );
    if (!matches.length) return null;
    if (matches.length === 1) return String(matches[0].moleculeId);

    // Same row number in more than one reaction: settle it by which reaction
    // block the row is actually in.
    const containers = getReactionContainers();
    const index = containers.findIndex((container) => container.contains(row));
    const byReaction = matches.find((sample) => sample.reactionIndex === index);
    return byReaction ? String(byReaction.moleculeId) : null;
}


const MARKS = {
    remembered: "remembered",
    internalId: "internal ID",
    synonym: "synonym",
};

// The order is shared/row-name-choice.js's, not this module's: the top of this
// list has to be the same name the automatic fill writes and the panel offers,
// or the suggestion contradicts the button.
function buildCandidates(moleculeId, row) {
    return rowNameCandidates(
        {
            remembered: getRememberedName(moleculeId),
            internalId: internalIdForRow(row, moleculeId),
            synonyms: getSynonyms(moleculeId) || [],
        }
    ).map((candidate, index) => ({
        name: candidate.name,
        // The first entry is what you would get without opening this list at
        // all; saying so is more use than repeating where it came from.
        mark: index === 0 ? `${MARKS[candidate.source]} · first choice` : MARKS[candidate.source],
    }));
}

// The popup this click opened: a MuiPaper holding a Name input. Returns the
// input, because that is what a pick has to write into.
async function waitForNameInput() {
    for (let attempt = 0; attempt < POPUP_POLL_ATTEMPTS; attempt += 1) {
        const input = document.querySelector(`.MuiPaper-root ${NAME_INPUT}`);
        if (input) return input;
        await wait(POPUP_POLL_MS);
    }
    return null;
}

function paperOf(input) {
    let box = input.parentElement;
    for (let i = 0; i < 8 && box; i += 1) {
        if (/MuiPaper/.test(box.className || "")) return box;
        box = box.parentElement;
    }
    return null;
}

function renderList(paper, candidates, hint) {
    paper.querySelector(`.${LIST_CLASS}`)?.remove();

    const list = document.createElement("div");
    list.className = LIST_CLASS;
    // Marks this as ours, so row-fill.js can read the popup's own label past
    // it — the list is inside CDD's popup and would otherwise be read as part
    // of the popup's text, which is the marker a fill identifies it by.
    list.dataset.cddAdded = "name-picker";

    if (hint) {
        const note = document.createElement("div");
        note.className = `${LIST_CLASS}__hint`;
        note.textContent = hint;
        list.appendChild(note);
    }

    for (const candidate of candidates) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = `${LIST_CLASS}__item`;
        item.textContent = candidate.name;

        const mark = document.createElement("span");
        mark.className = `${LIST_CLASS}__mark`;
        mark.textContent = candidate.mark;
        item.appendChild(mark);

        // mousedown, not click: the input loses focus first otherwise, and
        // CDD closes the popup on blur before the click would ever land.
        item.addEventListener("mousedown", (event) => {
            event.preventDefault();
            event.stopPropagation();
            const input = paper.querySelector(NAME_INPUT);
            if (!input) return;
            setNativeInputValue(input, candidate.name);
            pressEnter(input);
        });

        list.appendChild(item);
    }

    paper.appendChild(list);
}

async function offerFor(moleculeId, row) {
    const input = await waitForNameInput();
    if (!input) return;

    const paper = paperOf(input);
    if (!paper || paper.dataset.cddNamePicker === "1") return;
    paper.dataset.cddNamePicker = "1";

    ensureStyle();

    // A molecule nobody has asked about yet has no list — show what is known
    // (a remembered name, usually nothing) and fill the rest in when the page
    // answers.
    const asked = getSynonyms(moleculeId) != null;
    const candidates = buildCandidates(moleculeId, row);

    if (candidates.length) renderList(paper, candidates);
    else if (asked) return;                      // asked, nothing to offer
    else renderList(paper, [], "Looking up synonyms…");

    if (asked) return;

    const vaultId = detectVaultId();
    if (!vaultId) return;

    try {
        await loadSynonyms(vaultId, moleculeId);
    } catch {
        // The molecule page did not load; the free-text input is untouched
        // and still the whole feature.
    }

    if (!paper.isConnected) return;
    const settled = buildCandidates(moleculeId, row);
    if (settled.length) renderList(paper, settled);
    else paper.querySelector(`.${LIST_CLASS}`)?.remove();
}

export function initNamePicker() {
    document.addEventListener(
        "click",
        (event) => {
            if (!isRowNamePickerEnabled()) return;

            const field = nameFieldFrom(event.target);
            if (!field) return;

            const moleculeId = resolveMoleculeId(field);
            if (!moleculeId) return;

            offerFor(moleculeId, field.closest("tr"));
        },
        true
    );
}
