// content/features/phrases/capture.js
//
// The "Save phrase" affordance: select text inside an ELN entry and a small
// button appears at the end of the selection. Clicking it opens a popover
// — name, category, subcategory, a preview — and Save files the phrase.
//
// Only on ELN entry pages, only for selections inside the Slate editor, and
// never for selections inside the plugin's own panel.
//
// While AI write-up is on, a "Polish" button sits beside it: the selection
// goes to the LLM and comes back as English on a card in the panel's
// Write-up tab (ai-write-up/dictation.js), which this opens. "＋" next to it
// asks first what to do with the text ("make it a bullet list") instead of a
// plain polish; that popover is the same dialog slot Save phrase uses.

import { isElnEntryPage } from "../../../shared/page-detection.js";
import {
    addPhrase,
    defaultPhraseName,
    loadPhrases,
    PHRASE_LIMIT,
} from "../../../shared/phrases.js";
import { COMBO_STYLES } from "../../../shared/combo-input.js";
import { makeCategoriesEditor, PLACES_STYLES } from "../../../shared/places-editor.js";
import { getPanelRoot, setPanelTab } from "../sample-panel.js";
import { isAiWriteUpEnabled } from "../../../shared/ai-write-up-settings.js";
import { dictateInto, dictationLabel, onDictationChanged, polishSelection } from "../ai-write-up/dictation.js";
import { readSelection, selectionInEditor } from "./selection-html.js";

const BUTTON_ID = "cdd-phrase-save-btn";
const POLISH_ID = "cdd-phrase-polish-btn";
const POLISH_ASK_ID = "cdd-phrase-polish-ask-btn";
const DIALOG_ID = "cdd-phrase-save-dialog";
const STYLE_ID = "cdd-phrase-capture-style";

let button = null;
let polishButton = null;
let askButton = null;
let dialog = null;
let currentRange = null;
let positionRaf = 0;

function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
  #${BUTTON_ID}, #${POLISH_ID}, #${POLISH_ASK_ID} {
    position: fixed;
    z-index: 2147483646;
    padding: 4px 10px;
    font: 600 12px Arial, sans-serif;
    color: #f9fafb;
    background: #1f2937;
    border: 1px solid #4b5563;
    border-radius: 8px;
    box-shadow: 0 6px 18px rgba(0,0,0,0.35);
    cursor: pointer;
    user-select: none;
  }
  #${BUTTON_ID}:hover, #${POLISH_ID}:hover, #${POLISH_ASK_ID}:hover { background: #374151; }

  #${DIALOG_ID} {
    position: fixed;
    z-index: 2147483647;
    width: 320px;
    max-width: calc(100vw - 24px);
    padding: 12px;
    font: 13px Arial, sans-serif;
    color: #f9fafb;
    background: #111827;
    border: 1px solid #374151;
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.35);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  #${DIALOG_ID} h4 { margin: 0; font-size: 13px; }
  #${DIALOG_ID} label { display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: #cbd5e1; }
  #${DIALOG_ID} input,
  #${DIALOG_ID} textarea {
    font: 13px Arial, sans-serif;
    color: #f9fafb;
    background: #0b1220;
    border: 1px solid #374151;
    border-radius: 6px;
    padding: 5px 7px;
  }
  #${DIALOG_ID} .cdd-phrase-row { display: flex; gap: 8px; }
  #${DIALOG_ID} .cdd-phrase-row label { flex: 1 1 0; min-width: 0; }
  #${DIALOG_ID} .cdd-phrase-preview {
    max-height: 72px;
    overflow: auto;
    padding: 6px 8px;
    font-size: 12px;
    color: #cbd5e1;
    background: #0b1220;
    border: 1px solid #1f2937;
    border-radius: 6px;
    white-space: pre-wrap;
    word-break: break-word;
  }
  #${DIALOG_ID} .cdd-phrase-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 2px; }
  #${DIALOG_ID} button {
    font: 600 12px Arial, sans-serif;
    padding: 5px 12px;
    border-radius: 6px;
    border: 1px solid #4b5563;
    background: #1f2937;
    color: #f9fafb;
    cursor: pointer;
  }
  #${DIALOG_ID} button.cdd-phrase-primary { background: #2563eb; border-color: #2563eb; }
  #${DIALOG_ID} .cdd-phrase-note { font-size: 11px; color: #94a3b8; }
${COMBO_STYLES}
${PLACES_STYLES}
  #${DIALOG_ID} .cdd-phrase-places-label { font-size: 11px; color: #cbd5e1; margin-bottom: -4px; }
  #${DIALOG_ID} .cdd-place-chip { background: #1f2937; border: 1px solid #374151; color: #f9fafb; }
  #${DIALOG_ID} .cdd-place-chip__x { color: #cbd5e1; }
  #${DIALOG_ID} .cdd-place-chip__x:hover { background: #374151; color: #fff; }
  #${DIALOG_ID} .cdd-places__add-btn { padding: 5px 8px; }
  #${DIALOG_ID} .cdd-combo__toggle { background: #1f2937; border: 1px solid #374151; color: #cbd5e1; }
  #${DIALOG_ID} .cdd-combo__menu { background: #0b1220; border: 1px solid #374151; }
  #${DIALOG_ID} .cdd-combo__option { background: transparent; color: #f9fafb; }
  #${DIALOG_ID} .cdd-combo__option:hover { background: #1f2937; }
  #${DIALOG_ID} .cdd-combo__option--current { color: #93c5fd; }
`;
    document.documentElement.appendChild(style);
}

function ensureButton() {
    if (button) return button;
    button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.textContent = "Save phrase";
    button.title = "Keep the selected text as a phrase you can paste into other entries.";
    button.hidden = true;
    // mousedown would collapse the selection before click fires.
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void openDialog();   // a click handler cannot await the dialog
    });
    document.documentElement.appendChild(button);
    return button;
}

function ensurePolishButton() {
    if (polishButton) return polishButton;
    polishButton = document.createElement("button");
    polishButton.id = POLISH_ID;
    polishButton.type = "button";
    polishButton.textContent = "Polish";
    polishButton.title = "Polish the selected text into English — it appears in the panel's Write-up tab, ready to copy.";
    polishButton.hidden = true;
    polishButton.addEventListener("mousedown", (event) => event.preventDefault());
    polishButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!currentRange) return;
        const { text } = readSelection(currentRange);
        const block = selectionBlock(currentRange);
        setPanelTab("writeup");
        void polishSelection(text, block);
        hideButton();
    });
    document.documentElement.appendChild(polishButton);
    return polishButton;
}

function selectionBlock(range) {
    const start = range.startContainer;
    return (start.nodeType === 1 ? start : start.parentElement)?.closest('[data-slate-node="element"]') || null;
}

function ensureAskButton() {
    if (askButton) return askButton;
    askButton = document.createElement("button");
    askButton.id = POLISH_ASK_ID;
    askButton.type = "button";
    askButton.textContent = "＋";
    askButton.title = "Polish with your own instruction — say what to do with the selected text.";
    askButton.hidden = true;
    askButton.addEventListener("mousedown", (event) => event.preventDefault());
    askButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openAskDialog();
    });
    document.documentElement.appendChild(askButton);
    return askButton;
}

// Polish +: what to do with the selection, then the same polish with it.
function openAskDialog() {
    if (!currentRange) return;
    const { text } = readSelection(currentRange);
    const block = selectionBlock(currentRange);
    const anchorRect = askButton.getBoundingClientRect();
    closeDialog();

    dialog = document.createElement("div");
    dialog.id = DIALOG_ID;
    dialog.addEventListener("mousedown", (event) => event.stopPropagation());

    const title = document.createElement("h4");
    title.textContent = "Polish with an instruction";
    const preview = document.createElement("div");
    preview.className = "cdd-phrase-preview";
    preview.textContent = text;

    const label = document.createElement("label");
    label.textContent = "What should it do with the text?";
    const input = document.createElement("textarea");
    input.rows = 3;
    input.placeholder = "e.g. make it shorter · turn it into a bullet list · write it as the workup paragraph";
    label.append(input);

    const { actions, primary: goBtn } = dialogActions("Polish");
    const submit = () => {
        setPanelTab("writeup");
        void polishSelection(text, block, input.value);
        closeDialog();
        hideButton();
    };
    goBtn.addEventListener("click", submit);
    // Enter sends, Shift+Enter is a new line.
    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
        }
    });

    // 🎤: dictate the instruction into the field, read it, then Polish.
    const mic = document.createElement("button");
    mic.type = "button";
    mic.textContent = "🎤";
    mic.title = "Dictate the instruction into the field";
    mic.addEventListener("click", () => {
        dictateInto((words) => {
            input.value = input.value.trim() ? `${input.value.trim()} ${words}` : words;
            input.focus();
        }, "polish-plus");
    });
    actions.prepend(mic);
    const unsubscribe = onDictationChanged((state) => {
        if (!mic.isConnected) return unsubscribe();
        mic.textContent = state.origin?.field === "polish-plus" ? dictationLabel("🎤") : "🎤";
        mic.disabled = state.phase !== "idle" && state.origin?.field !== "polish-plus";
    });

    dialog.append(title, preview, label, actions);
    showDialog(anchorRect);
    input.focus();
}

function hideButton() {
    if (button) button.hidden = true;
    if (polishButton) polishButton.hidden = true;
    if (askButton) askButton.hidden = true;
    currentRange = null;
}

function placeButton(range) {
    const rects = range.getClientRects();
    const rect = rects.length ? rects[rects.length - 1] : range.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) {
        hideButton();
        return;
    }
    const btn = ensureButton();
    btn.hidden = false;
    const width = btn.offsetWidth || 90;
    const height = btn.offsetHeight || 24;
    let left = rect.right + 6;
    let top = rect.bottom + 6;
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
    if (top + height > window.innerHeight - 8) top = rect.top - height - 6;
    btn.style.left = `${Math.max(8, left)}px`;
    btn.style.top = `${Math.max(8, top)}px`;

    // Polish to the right of Save phrase, or to its left when that runs
    // off the window.
    if (!isAiWriteUpEnabled()) {
        if (polishButton) polishButton.hidden = true;
        if (askButton) askButton.hidden = true;
        return;
    }
    const polish = ensurePolishButton();
    polish.hidden = false;
    const saveLeft = Math.max(8, left);
    const polishWidth = polish.offsetWidth || 60;
    let polishLeft = saveLeft + width + 6;
    if (polishLeft + polishWidth > window.innerWidth - 8) polishLeft = saveLeft - polishWidth - 6;
    polish.style.left = `${Math.max(8, polishLeft)}px`;
    polish.style.top = btn.style.top;

    // ＋ right after Polish (or before it, at the window's edge).
    const ask = ensureAskButton();
    ask.hidden = false;
    const placedLeft = Math.max(8, polishLeft);
    const askWidth = ask.offsetWidth || 28;
    let askLeft = placedLeft + polishWidth + 4;
    if (askLeft + askWidth > window.innerWidth - 8) askLeft = Math.min(saveLeft, placedLeft) - askWidth - 4;
    ask.style.left = `${Math.max(8, askLeft)}px`;
    ask.style.top = btn.style.top;
}

function onSelectionChanged() {
    if (dialog) return;
    if (!isElnEntryPage()) {
        hideButton();
        return;
    }
    const range = selectionInEditor(window.getSelection(), getPanelRoot());
    if (!range) {
        hideButton();
        return;
    }
    currentRange = range;
    placeButton(range);
}

function schedulePosition() {
    if (!currentRange || !button || button.hidden) return;
    cancelAnimationFrame(positionRaf);
    positionRaf = requestAnimationFrame(() => {
        if (currentRange) placeButton(currentRange);
    });
}

// The Cancel + primary button row both dialogs end with.
function dialogActions(primaryLabel) {
    const actions = document.createElement("div");
    actions.className = "cdd-phrase-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", closeDialog);
    const primary = document.createElement("button");
    primary.type = "button";
    primary.className = "cdd-phrase-primary";
    primary.textContent = primaryLabel;
    actions.append(cancel, primary);
    return { actions, primary };
}

// `dialog` into the page near where its button was, kept inside the
// viewport; Escape closes it.
function showDialog(anchorRect) {
    document.documentElement.appendChild(dialog);
    document.addEventListener("keydown", onDialogKey, true);
    const w = dialog.offsetWidth;
    const h = dialog.offsetHeight;
    let left = anchorRect.left;
    let top = anchorRect.bottom + 6;
    if (left + w > window.innerWidth - 12) left = window.innerWidth - w - 12;
    if (top + h > window.innerHeight - 12) top = Math.max(12, anchorRect.top - h - 6);
    dialog.style.left = `${Math.max(12, left)}px`;
    dialog.style.top = `${top}px`;
}

function closeDialog() {
    if (!dialog) return;
    dialog.remove();
    dialog = null;
    document.removeEventListener("keydown", onDialogKey, true);
}

function onDialogKey(event) {
    if (event.key === "Escape") {
        event.stopPropagation();
        closeDialog();
    }
}

async function openDialog() {
    if (!currentRange) return;
    const { text, html } = readSelection(currentRange);
    if (!text.trim()) return;

    const anchorRect = button.getBoundingClientRect();
    hideButton();
    closeDialog();

    const phrases = await loadPhrases();

    dialog = document.createElement("div");
    dialog.id = DIALOG_ID;
    dialog.addEventListener("mousedown", (event) => event.stopPropagation());

    const heading = document.createElement("h4");
    heading.textContent = "Save phrase";

    const nameLabel = document.createElement("label");
    nameLabel.textContent = "Name";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = defaultPhraseName(text);
    nameInput.maxLength = 80;
    nameLabel.appendChild(nameInput);

    const placesLabel = document.createElement("div");
    placesLabel.className = "cdd-phrase-places-label";
    placesLabel.textContent = "Categories (one or more)";
    const placesEditor = makeCategoriesEditor({ phrases });
    const row = placesEditor.element;

    const preview = document.createElement("div");
    preview.className = "cdd-phrase-preview";
    preview.textContent = text.length > 400 ? `${text.slice(0, 400)}…` : text;

    const note = document.createElement("div");
    note.className = "cdd-phrase-note";
    note.textContent = phrases.length >= PHRASE_LIMIT
        ? `${PHRASE_LIMIT} phrases is the limit — the one used longest ago will be dropped.`
        : `${phrases.length} of ${PHRASE_LIMIT} phrases saved.`;

    const { actions, primary: saveBtn } = dialogActions("Save");

    const submit = async () => {
        saveBtn.disabled = true;

        // A category half-typed when Save is clicked still counts; commit it
        // before reading the list. Its own statement, not a comma expression
        // riding inside the argument — the side effect is the point and has to
        // be visible.
        placesEditor.commitPending();

        const saved = await addPhrase({
            name: nameInput.value,
            categories: placesEditor.getCategories(),
            text,
            html,
        });
        closeDialog();
        if (!saved) console.warn("[CDD Stoich Tools] Phrase not saved: empty body.");
    };
    saveBtn.addEventListener("click", submit);
    dialog.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && event.target.tagName === "INPUT") {
            event.preventDefault();
            submit();
        }
    });

    dialog.append(heading, nameLabel, placesLabel, row, preview, note, actions);
    showDialog(anchorRect);

    nameInput.focus();
    nameInput.select();
}

export function initPhraseCapture() {
    ensureStyle();

    document.addEventListener("selectionchange", () => {
        // Let the browser settle the selection first.
        setTimeout(onSelectionChanged, 0);
    });
    // A keyboard-extended selection fires selectionchange; a mouse drag does
    // too but the rect is only final on mouseup.
    document.addEventListener("mouseup", () => setTimeout(onSelectionChanged, 0));
    document.addEventListener("scroll", schedulePosition, true);
    window.addEventListener("resize", schedulePosition);

    // Clicking anywhere outside the dialog closes it.
    document.addEventListener("mousedown", (event) => {
        if (!dialog) return;
        if (dialog.contains(event.target)) return;
        closeDialog();
    });
}
