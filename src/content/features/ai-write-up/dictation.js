// content/features/ai-write-up/dictation.js
//
// Dictate in the Write-up tab: 🎤 records from the microphone, ■ stops, and
//
//   1. CERIT's whisper-large-v3 transcribes it in the chosen language
//      (Slovak, Czech, English),
//   2. the chat model turns the transcript into polished English, fixing
//      misheard compound names against the reaction's table,
//   3. the English is typed in where the cursor is in the entry (with no
//      cursor in the entry it goes to the clipboard instead).
//
// What was heard stays in the status line, so a mistranslation can be
// checked against it; Ctrl+Z in the entry takes the insert back.
//
// The buttons keep the entry's focus (mousedown is cancelled), so the cursor
// the user left in the text is still there when the text arrives.
//
// The browser asks for the microphone the first time, for the CDD site.

import { copyText } from "../../utils/clipboard.js";
import {
    AI_LANGUAGES,
    aiErrorMessage,
    getAiWriteUpView,
    saveAiSettings,
} from "../../../shared/ai-write-up-settings.js";
import { AI_CHAT_MESSAGE, AI_TRANSCRIBE_MESSAGE } from "../../../shared/event-types.js";
import { buildDictationMessages, cleanDictationAnswer, tableRowsFromEntry } from "./model.js";
import { currentEntry, fetchEntry, insertIntoEditor } from "./entry.js";

const MAX_SECONDS = 300;

let recorder = null;
let chunks = [];
let startedAt = 0;
let tick = null;
let micButton = null;
let statusEl = null;

function setStatus(text) {
    if (!statusEl) return;
    statusEl.textContent = text || "";
}

function keepFocus(button) {
    button.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
    });
}

function elapsed() {
    const s = Math.floor((Date.now() - startedAt) / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function toBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
}

async function deliver(english, heard) {
    // A space between this and whatever the cursor sits after.
    if (insertIntoEditor(`${english} `)) {
        setStatus(`Typed into the entry. Heard: “${heard}”`);
        return;
    }
    const copied = await copyText(english);
    setStatus(copied
        ? `Click into the entry and paste (Ctrl+V). Heard: “${heard}”`
        : english);
}

// The reaction's compound names, so "acetyl acetát" comes back as the
// table's "Acetyl Acetate". Dictation works without them.
async function tableRows() {
    const entry = currentEntry();
    if (!entry) return [];
    try {
        return tableRowsFromEntry(await fetchEntry(entry));
    } catch {
        return [];
    }
}

async function transcribe(blob) {
    setStatus("Transcribing…");
    micButton.disabled = true;
    try {
        const [heard, rows] = await Promise.all([
            chrome.runtime.sendMessage({
                type: AI_TRANSCRIBE_MESSAGE,
                id: crypto.randomUUID(),
                audio: toBase64(await blob.arrayBuffer()),
                mimeType: blob.type || "audio/webm",
                language: getAiWriteUpView().language,
            }),
            tableRows(),
        ]);
        if (!heard?.ok) {
            setStatus(aiErrorMessage(heard));
            return;
        }
        if (!heard.text) {
            setStatus("Heard nothing — speak closer to the microphone.");
            return;
        }

        setStatus(`Translating… Heard: “${heard.text}”`);
        const answer = await chrome.runtime.sendMessage({
            type: AI_CHAT_MESSAGE,
            id: crypto.randomUUID(),
            messages: buildDictationMessages(heard.text, rows),
        });
        if (!answer?.ok) {
            // The transcript is not lost: it is on the clipboard.
            await copyText(heard.text);
            setStatus(`${aiErrorMessage(answer)} What was heard is on the clipboard.`);
            return;
        }
        await deliver(cleanDictationAnswer(answer.content) || heard.text, heard.text);
    } catch (err) {
        console.debug("[CDD Stoich Tools] transcription failed", err);
        setStatus(aiErrorMessage({ error: "network" }));
    } finally {
        micButton.disabled = false;
    }
}

function stop() {
    if (recorder?.state === "recording") recorder.stop();
}

async function start() {
    if (!getAiWriteUpView().hasKey) {
        setStatus(aiErrorMessage({ error: "no-key" }));
        return;
    }
    let stream;
    try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
        setStatus("Allow the microphone for this site (the icon in the address bar), then try again.");
        return;
    }

    chunks = [];
    recorder = new MediaRecorder(stream);
    recorder.addEventListener("dataavailable", (event) => {
        if (event.data?.size) chunks.push(event.data);
    });
    recorder.addEventListener("stop", () => {
        clearInterval(tick);
        for (const track of stream.getTracks()) track.stop();
        micButton.textContent = "🎤 Dictate";
        const blob = new Blob(chunks, { type: recorder.mimeType });
        recorder = null;
        void transcribe(blob);
    });

    recorder.start();
    startedAt = Date.now();
    micButton.textContent = "■ Stop 0:00";
    setStatus("Recording — click Stop when done.");
    tick = setInterval(() => {
        micButton.textContent = `■ Stop ${elapsed()}`;
        if (Date.now() - startedAt >= MAX_SECONDS * 1000) stop();
    }, 500);
}

/** Adds 🎤 and the language picker to `bar`, a status line after it. */
export function mountDictation(bar) {
    if (recorder) stop();

    micButton = document.createElement("button");
    micButton.type = "button";
    micButton.className = "cdd-wu-mic";
    micButton.textContent = "🎤 Dictate";
    micButton.title = "Record, then Stop: the English text is typed where the cursor is in the entry.";
    keepFocus(micButton);
    micButton.addEventListener("click", (event) => {
        event.stopPropagation();
        if (recorder) stop();
        else void start();
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

    statusEl = document.createElement("div");
    statusEl.className = "cdd-wu-dictation-status";

    bar.append(micButton, language, statusEl);
}

export const DICTATION_STYLES = (panelId) => `
  #${panelId} .cdd-wu-lang {
    font: 12px Arial, sans-serif;
    color: #f9fafb;
    background: #0b1220;
    border: 1px solid #374151;
    border-radius: 6px;
    padding: 3px 4px;
  }
  #${panelId} .cdd-wu-dictation-status { flex-basis: 100%; font-size: 11px; color: #cbd5e1; }
  #${panelId} .cdd-wu-dictation-status:empty { display: none; }
`;
