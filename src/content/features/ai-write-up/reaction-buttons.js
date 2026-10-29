// @ts-nocheck — not yet type-clean; remove this line once `npm run typecheck` passes without it.
// content/features/ai-write-up/reaction-buttons.js
//
// 🎤 on each reaction, beside Print and ⤳ (only while AI write-up is on):
// dictate about THIS reaction. The model gets the reaction's own table and
// the section the reaction sits in; the English lands as a card in the
// panel's Write-up tab, which this switches to so the progress is in view.
//
// The recording itself is dictation.js's — one microphone, one state. The
// button that started it shows ■ Stop and the clock; the others wait.

import { isAiWriteUpEnabled } from "../../../shared/ai-write-up-settings.js";
import { setPanelTab } from "../sample-panel.js";
import { dictationLabel, dictationUnavailable, getDictationState, onDictationChanged, toggleDictation } from "./dictation.js";
import { SELECTORS } from "../../selectors.js";

const BTN_CLASS = "cdd-stoich-dictate-button";
const STYLE_ID = "cdd-stoich-dictate-button-styles";
const TITLE = "Dictate about this reaction — the English appears in the panel's Write-up tab";

let subscribed = false;

function paint(btn) {
    const state = getDictationState();
    const mine = state.origin?.reactionIndex === Number(btn.dataset.reactionIndex);
    btn.textContent = mine ? dictationLabel("🎤") : "🎤";
    btn.classList.toggle(`${BTN_CLASS}--active`, mine && state.phase !== "idle");
    // No dictation key: grey, saying why. Busy, the button that started it
    // cancels; the others wait.
    const unavailable = dictationUnavailable();
    btn.classList.toggle(`${BTN_CLASS}--unavailable`, !!unavailable);
    btn.disabled = !!unavailable || (state.phase !== "idle" && !mine);
    btn.title = unavailable || TITLE;
    btn.setAttribute("aria-label", btn.title);
}

function paintAll() {
    for (const btn of document.querySelectorAll(`.${BTN_CLASS}`)) paint(btn);
}

function buildButton(index, reactionEl) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = BTN_CLASS;
    btn.dataset.reactionIndex = String(index);
    btn.title = TITLE;
    btn.setAttribute("aria-label", TITLE);

    // Capture phase and stopped: the reaction is a Slate void node that
    // opens its editor and starts drags on pointer events.
    btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        if (btn.disabled) return;
        setPanelTab("writeup");
        toggleDictation({ reactionIndex: index, reactionEl });
    }, true);
    for (const type of ["pointerdown", "mousedown", "dragstart"]) {
        btn.addEventListener(type, (event) => event.stopPropagation(), true);
    }
    paint(btn);
    return btn;
}

function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        .${BTN_CLASS} {
            position: absolute; top: 8px; right: 138px; z-index: 20;
            min-width: 28px; height: 25px; padding: 0 6px; margin: 0;
            display: inline-flex; align-items: center; justify-content: center;
            border: 1px solid #d1d5db; border-radius: 8px;
            background: #fff; color: #374151; font: 600 13px/1 system-ui, sans-serif;
            box-shadow: 0 1px 2px rgba(0,0,0,0.08); cursor: pointer; white-space: nowrap;
            opacity: 0; pointer-events: none; transition: opacity 0.15s ease;
        }
        ${SELECTORS.reaction}:hover .${BTN_CLASS},
        ${SELECTORS.reaction}:focus-within .${BTN_CLASS},
        .${BTN_CLASS}--active {
            opacity: 1; pointer-events: auto;
        }
        .${BTN_CLASS}:hover { background: #f9fafb; border-color: #bfc6cf; }
        .${BTN_CLASS}--active { border-color: #dc2626; color: #dc2626; }
        .${BTN_CLASS}:disabled { cursor: progress; }
        .${BTN_CLASS}--unavailable { color: #9ca3af; }
        .${BTN_CLASS}--unavailable:disabled { cursor: not-allowed; }
    `;
    document.head.appendChild(style);
}

export function ensureDictateButtons() {
    const reactions = [...document.querySelectorAll(SELECTORS.reaction)];
    if (!isAiWriteUpEnabled()) {
        for (const btn of document.querySelectorAll(`.${BTN_CLASS}`)) btn.remove();
        return;
    }
    if (!reactions.length) return;
    ensureStyles();
    if (!subscribed) {
        subscribed = true;
        onDictationChanged(paintAll);
    }

    reactions.forEach((reactionEl, index) => {
        const existing = reactionEl.querySelector(`.${BTN_CLASS}`);
        if (existing?.dataset.reactionIndex === String(index)) return;
        existing?.remove();

        if (getComputedStyle(reactionEl).position === "static") {
            reactionEl.style.position = "relative";
        }
        reactionEl.appendChild(buildButton(index, reactionEl));
    });
}
