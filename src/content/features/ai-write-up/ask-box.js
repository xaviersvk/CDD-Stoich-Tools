// content/features/ai-write-up/ask-box.js
//
// "Ask about this entry" in the Write-up tab: type — or 🎤 dictate — a
// request ("add a workup paragraph: 3× EtOAc, dried over Na2SO4", "what is
// missing before the purification?") and the whole entry goes with it as
// background. The answer is an "Ask" card like the others (dictation.js).
//
// 🎤 here only puts the words into the field — read them, fix them, then Ask.
// Enter asks, Shift+Enter is a new line. The field empties once the request
// is on its way; the card shows what was asked.

import {
    askAboutEntry,
    dictateInto,
    dictationLabel,
    getDictationState,
    onDictationChanged,
    toggleDictation,
} from "./dictation.js";

let unsubscribe = null;

export function mountAskBox() {
    const box = document.createElement("div");
    box.className = "cdd-wu-ask";

    const field = document.createElement("textarea");
    field.className = "cdd-wu-ask__field";
    field.rows = 2;
    field.placeholder = "Ask about this entry — e.g. add a workup paragraph: 3× EtOAc, dried over Na2SO4";
    field.addEventListener("mousedown", (event) => event.stopPropagation());

    const actions = document.createElement("div");
    actions.className = "cdd-wu-ask__actions";
    const mic = document.createElement("button");
    mic.type = "button";
    mic.title = "Dictate the request into the field";
    const askButton = document.createElement("button");
    askButton.type = "button";
    askButton.className = "cdd-wu-run";
    askButton.textContent = "Ask";
    askButton.title = "Send the request with the whole entry as background";
    actions.append(mic, askButton);
    box.append(field, actions);

    const send = async () => {
        const request = field.value;
        if (!request.trim()) {
            field.focus();
            return;
        }
        if (await askAboutEntry(request)) field.value = "";
    };
    askButton.addEventListener("click", (event) => {
        event.stopPropagation();
        // Busy with this request, Ask cancels it rather than sending it twice.
        const state = getDictationState();
        if (state.origin?.asking && state.phase !== "idle") {
            toggleDictation();
            return;
        }
        void send();
    });
    field.addEventListener("keydown", (event) => {
        event.stopPropagation();
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void send();
        }
    });
    mic.addEventListener("click", (event) => {
        event.stopPropagation();
        dictateInto((text) => {
            field.value = field.value.trim() ? `${field.value.trim()} ${text}` : text;
            field.focus();
        });
    });

    // One microphone and one request at a time, shared with dictation.
    const paint = () => {
        const state = getDictationState();
        const mine = state.origin?.field === "ask";
        mic.textContent = mine ? dictationLabel("🎤") : "🎤";
        mic.disabled = state.phase !== "idle" && !mine;
        const asking = state.origin?.asking && state.phase !== "idle";
        askButton.textContent = asking ? dictationLabel("Ask") : "Ask";
        askButton.title = asking ? "Cancel" : "Send the request with the whole entry as background";
        askButton.disabled = state.phase !== "idle" && !asking;
    };
    unsubscribe?.();
    unsubscribe = onDictationChanged(paint);
    paint();
    return box;
}

export const ASK_BOX_STYLES = (panelId) => `
  #${panelId} .cdd-wu-ask { margin-bottom: 8px; }
  #${panelId} .cdd-wu-ask__field {
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    font: 12px Arial, sans-serif;
    color: #f9fafb;
    background: #0b1220;
    border: 1px solid #374151;
    border-radius: 6px;
    padding: 5px 7px;
  }
  #${panelId} .cdd-wu-ask__actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 4px; }
`;
