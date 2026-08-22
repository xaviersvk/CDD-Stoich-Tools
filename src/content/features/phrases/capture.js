// content/features/phrases/capture.js
//
// The "Save phrase" affordance: select text inside an ELN entry and a small
// button appears at the end of the selection. Clicking it opens a popover
// — name, category, subcategory, a preview — and Save files the phrase.
//
// Only on ELN entry pages, only for selections inside the Slate editor, and
// never for selections inside the plugin's own panel.

import { isElnEntryPage } from "../../../shared/page-detection.js";
import {
    addPhrase,
    defaultPhraseName,
    loadPhrases,
    PHRASE_LIMIT,
} from "../../../shared/phrases.js";
import { COMBO_STYLES } from "../../../shared/combo-input.js";
import { makeCategoriesEditor, PLACES_STYLES } from "../../../shared/places-editor.js";
import { getPanelRoot } from "../sample-panel.js";
import { readSelection, selectionInEditor } from "./selection-html.js";

const BUTTON_ID = "cdd-phrase-save-btn";
const DIALOG_ID = "cdd-phrase-save-dialog";
const STYLE_ID = "cdd-phrase-capture-style";

let button = null;
let dialog = null;
let currentRange = null;
let positionRaf = 0;

function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
  #${BUTTON_ID} {
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
  #${BUTTON_ID}:hover { background: #374151; }

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
  #${DIALOG_ID} input {
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
        openDialog();
    });
    document.documentElement.appendChild(button);
    return button;
}

function hideButton() {
    if (button) button.hidden = true;
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

    const actions = document.createElement("div");
    actions.className = "cdd-phrase-actions";
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", closeDialog);
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "cdd-phrase-primary";
    saveBtn.textContent = "Save";
    actions.append(cancelBtn, saveBtn);

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
    document.documentElement.appendChild(dialog);
    document.addEventListener("keydown", onDialogKey, true);

    // Near where the button was, kept inside the viewport.
    const w = dialog.offsetWidth;
    const h = dialog.offsetHeight;
    let left = anchorRect.left;
    let top = anchorRect.bottom + 6;
    if (left + w > window.innerWidth - 12) left = window.innerWidth - w - 12;
    if (top + h > window.innerHeight - 12) top = Math.max(12, anchorRect.top - h - 6);
    dialog.style.left = `${Math.max(12, left)}px`;
    dialog.style.top = `${top}px`;

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
