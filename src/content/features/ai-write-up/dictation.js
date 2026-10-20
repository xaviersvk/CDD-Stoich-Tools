// content/features/ai-write-up/dictation.js
//
// Dictation: record from the microphone, then
//
//   1. CERIT's whisper-large-v3 transcribes it in the chosen language
//      (Slovak, Czech, English),
//   2. the chat model turns the transcript into polished English, with part
//      of the entry for context,
//   3. the English shows up as a card in the Write-up tab, with Copy.
//
// Nothing is typed into the entry: people copy what they want and paste it
// themselves. Cards pile up newest first, per entry, so an earlier dictation
// is still there after the next one. What was heard stays on each card, so a
// mistranslation can be checked against it.
//
// Two places start a recording, one at a time:
//
//   - 🎤 in the Write-up tab — about the whole entry: every table and the
//     entry's text go along as context;
//   - 🎤 on a reaction (reaction-buttons.js) — about that reaction: its own
//     table and the section the reaction sits in.
//
// Both buttons draw themselves from the one state below (onDictationChanged).
// The browser asks for the microphone the first time, for the CDD site.

import { copyText } from "../../utils/clipboard.js";
import {
    AI_LANGUAGES,
    aiErrorMessage,
    getAiWriteUpView,
    saveAiSettings,
} from "../../../shared/ai-write-up-settings.js";
import { AI_CHAT_MESSAGE, AI_TRANSCRIBE_MESSAGE } from "../../../shared/event-types.js";
import {
    ENTRY_CONTEXT_CHARS,
    buildDictationMessages,
    cleanDictationAnswer,
    looksUntranslated,
    sectionContext,
    tableRowsFromEntry,
} from "./model.js";
import { currentEntry, fetchEntry, sectionAroundBlock, textFromEditor } from "./entry.js";

const MAX_SECONDS = 300;
const MAX_CARDS = 10;

// ---------------------------------------------------------------- state

// phase: idle | recording | transcribing | translating. `origin` is
// { reactionIndex, reactionEl } for a reaction's button, null for the tab's.
let state = { phase: "idle", since: 0, origin: null, status: "" };
const listeners = new Set();
let recorder = null;
let chunks = [];
let tick = null;
// [{ entryKey, english, heard, label }], newest first. Module state, not
// DOM: the pane is rebuilt when the panel is.
let cards = [];

function setState(patch) {
    state = { ...state, ...patch };
    for (const cb of listeners) {
        try {
            cb(state);
        } catch {
            /* a misbehaving listener must not break the others */
        }
    }
}

export function getDictationState() {
    return state;
}

export function onDictationChanged(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
}

function clock(since) {
    const s = Math.floor((Date.now() - since) / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** What a dictate button says in the current state — "■ 0:12", "⏳ Translating… 0:04". */
export function dictationLabel(idleLabel) {
    switch (state.phase) {
        case "recording":
            return `■ Stop ${clock(state.since)}`;
        case "transcribing":
            return `⏳ Transcribing… ${clock(state.since)}`;
        case "translating":
            return `⏳ Translating… ${clock(state.since)}`;
        default:
            return idleLabel;
    }
}

function toBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
}

// ---------------------------------------------------------------- context

// Read when the recording stops — the entry as it is then.
function entryTextForContext(origin) {
    if (origin?.reactionEl) return sectionContext(sectionAroundBlock(origin.reactionEl));
    return (textFromEditor() ?? "").slice(-ENTRY_CONTEXT_CHARS);
}

async function tableRowsForContext(origin) {
    const entry = currentEntry();
    if (!entry) return [];
    try {
        const rows = tableRowsFromEntry(await fetchEntry(entry));
        // A reaction's button: that reaction only (both count in display order).
        return origin ? rows.filter((r) => r.reaction === origin.reactionIndex + 1) : rows;
    } catch {
        return [];   // dictation works without the table
    }
}

// ---------------------------------------------------------------- pipeline

function step(phase, status = state.status) {
    clearInterval(tick);
    setState({ phase, since: Date.now(), status });
    if (phase !== "idle") tick = setInterval(() => setState({}), 500);
}

async function runDictation(blob, origin, entryText, entryKey) {
    step("transcribing", "");
    try {
        const [heard, rows] = await Promise.all([
            chrome.runtime.sendMessage({
                type: AI_TRANSCRIBE_MESSAGE,
                id: crypto.randomUUID(),
                audio: toBase64(await blob.arrayBuffer()),
                mimeType: blob.type || "audio/webm",
                language: getAiWriteUpView().language,
            }),
            tableRowsForContext(origin),
        ]);
        if (!heard?.ok) return step("idle", aiErrorMessage(heard));
        if (!heard.text) return step("idle", "Heard nothing — speak closer to the microphone.");

        step("translating", `Heard: “${heard.text}”`);
        const answer = await chrome.runtime.sendMessage({
            type: AI_CHAT_MESSAGE,
            id: crypto.randomUUID(),
            messages: buildDictationMessages(heard.text, { rows, entryText }),
        });
        if (!answer?.ok) return step("idle", `${aiErrorMessage(answer)} Heard: “${heard.text}”`);

        // A model that echoes the transcript back (small models do) is
        // reported rather than shown as if it were the translation.
        const english = cleanDictationAnswer(answer.content);
        if (!english || looksUntranslated(english, heard.text)) {
            return step("idle", `${aiErrorMessage({ error: "untranslated", model: answer.model })} Heard: “${heard.text}”`);
        }
        cards = [
            { entryKey, english, heard: heard.text, label: origin ? `Reaction ${origin.reactionIndex + 1}` : "Dictation" },
            ...cards,
        ].slice(0, MAX_CARDS);
        step("idle", "");
    } catch (err) {
        console.debug("[CDD Stoich Tools] dictation failed", err);
        step("idle", aiErrorMessage({ error: "network" }));
    }
}

function stop() {
    if (recorder?.state === "recording") recorder.stop();
}

async function start(origin) {
    if (!getAiWriteUpView().hasKey) return step("idle", aiErrorMessage({ error: "no-key" }));
    let stream;
    try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
        return step("idle", "Allow the microphone for this site (the icon in the address bar), then try again.");
    }

    chunks = [];
    recorder = new MediaRecorder(stream);
    recorder.addEventListener("dataavailable", (event) => {
        if (event.data?.size) chunks.push(event.data);
    });
    recorder.addEventListener("stop", () => {
        for (const track of stream.getTracks()) track.stop();
        const blob = new Blob(chunks, { type: recorder.mimeType });
        recorder = null;
        void runDictation(blob, origin, entryTextForContext(origin), currentEntry()?.key);
    });

    recorder.start();
    clearInterval(tick);
    setState({ phase: "recording", since: Date.now(), origin, status: "Recording — click Stop when done." });
    tick = setInterval(() => {
        if (Date.now() - state.since >= MAX_SECONDS * 1000) stop();
        setState({});
    }, 500);
}

/**
 * The one entry point for both buttons: starts a recording from `origin`
 * (null = the Write-up tab), stops the running one, or does nothing while a
 * recording is being processed.
 */
export function toggleDictation(origin = null) {
    if (state.phase === "recording") stop();
    else if (state.phase === "idle") void start(origin);
}

// ---------------------------------------------------------------- tab UI

function cardNode(card) {
    const box = document.createElement("div");
    box.className = "cdd-wu-card";

    const head = document.createElement("div");
    head.className = "cdd-wu-card__head";
    const title = document.createElement("div");
    title.className = "cdd-wu-card__title";
    title.textContent = card.label;
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "cdd-wu-copy";
    copy.textContent = "Copy";
    copy.addEventListener("click", async (event) => {
        event.stopPropagation();
        const ok = await copyText(card.english);
        copy.textContent = ok ? "✓ copied" : "✗ failed";
        setTimeout(() => { copy.textContent = "Copy"; }, 1200);
    });
    head.append(title, copy);

    const text = document.createElement("div");
    text.className = "cdd-wu-text";
    text.textContent = card.english;

    const heard = document.createElement("div");
    heard.className = "cdd-wu-heard";
    heard.textContent = `Heard: “${card.heard}”`;

    box.append(head, text, heard);
    return box;
}

let unsubscribeTab = null;

/**
 * Adds 🎤, the language picker and a status line to `bar`, and the
 * dictation cards to `list`. Called again whenever the pane is rebuilt.
 */
export function mountDictation(bar, list) {
    const mic = document.createElement("button");
    mic.type = "button";
    mic.className = "cdd-wu-mic";
    mic.title = "Dictate about the whole entry. Stop when done: the English appears below, ready to copy.";
    mic.addEventListener("mousedown", (event) => event.stopPropagation());
    mic.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleDictation(null);
    });

    const language = document.createElement("select");
    language.className = "cdd-wu-lang";
    language.title = "Language you dictate in";
    for (const [code, label] of AI_LANGUAGES) {
        const option = document.createElement("option");
        option.value = code;
        option.textContent = label;
        language.appendChild(option);
    }
    language.value = getAiWriteUpView().language;
    language.addEventListener("mousedown", (event) => event.stopPropagation());
    language.addEventListener("change", () => void saveAiSettings({ language: language.value }));

    const status = document.createElement("div");
    status.className = "cdd-wu-dictation-status";
    bar.append(mic, language, status);

    let shown = null;
    const paint = () => {
        const busy = state.phase === "transcribing" || state.phase === "translating";
        // The tab's button shows a reaction's recording too: one microphone.
        mic.textContent = dictationLabel("🎤 Dictate");
        mic.disabled = busy;
        status.textContent = state.status || "";
        const key = currentEntry()?.key;
        if (shown?.cards !== cards || shown?.key !== key) {
            shown = { cards, key };
            list.replaceChildren(...cards.filter((c) => c.entryKey === key).map(cardNode));
        }
    };
    unsubscribeTab?.();
    unsubscribeTab = onDictationChanged(paint);
    paint();
}

/** Repaints the dictation UI — after the panel moved to another entry. */
export function refreshDictation() {
    setState({});
}

export const DICTATION_STYLES = (panelId) => `
  /* Light, not the panel's dark: CDD styles every <select> on the page with
     "background: #fff url(<arrow>) … !important", so a dark select ends up
     with light text on CDD's white. Dark text on that white, and CDD's arrow. */
  #${panelId} .cdd-wu-lang {
    font: 12px Arial, sans-serif;
    color: #111827;
    border: 1px solid #374151;
    border-radius: 6px;
    padding: 3px 22px 3px 6px;
  }
  #${panelId} .cdd-wu-lang option {
    color: #111827;
    background: #ffffff;
  }
  #${panelId} .cdd-wu-dictation-status { flex-basis: 100%; font-size: 11px; color: #cbd5e1; }
  #${panelId} .cdd-wu-dictation-status:empty { display: none; }
  #${panelId} .cdd-wu-dictations { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; }
  #${panelId} .cdd-wu-dictations:empty { display: none; }
  #${panelId} .cdd-wu-heard { font-size: 11px; color: #cbd5e1; margin-top: 6px; font-style: italic; }
`;
