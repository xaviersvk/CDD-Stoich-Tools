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
// Polish on a selection in the entry (polishSelection) takes the same last
// two steps for text that is already written, and makes a "Selection" card.
//
// The buttons draw themselves from the one state below (onDictationChanged).
// The browser asks for the microphone the first time, for the CDD site.

import {
    AI_LANGUAGES,
    aiErrorMessage,
    getAiWriteUpView,
    saveAiSettings,
} from "../../../shared/ai-write-up-settings.js";
import { AI_CANCEL_MESSAGE, AI_CHAT_MESSAGE, AI_TRANSCRIBE_MESSAGE } from "../../../shared/event-types.js";
import {
    ENTRY_CONTEXT_CHARS,
    buildAskMessages,
    buildChecks,
    buildReviseMessages,
    buildDictationMessages,
    cleanDictationAnswer,
    lostQuantities,
    answerText,
    productMassText,
    tableYieldText,
    parseLlmJson,
    withHouseRules,
    looksUntranslated,
    sectionContext,
    tableRowsFromEntry,
} from "./model.js";
import { currentEntry, entryUrl, fetchEntry, sectionAroundBlock, textFromEditor } from "./entry.js";
import {
    entityMentions,
    mentionPromptBlock,
    mentionsToDom,
    mentionsToPlain,
    mentionsToTokens,
    prefillSlots,
    splitMentions,
    unfilledPlaceholders,
} from "./mentions.js";
import { answerMeta, cardActions, copyParagraphOnCtrlClick } from "./copy-button.js";
import { checksList } from "./checks-view.js";

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
// [{ entryKey, segments, source, sourceLabel, label }], newest first. Module state, not
// DOM: the pane is rebuilt when the panel is.
let cards = [];
// The request out at CERIT right now — a click on the busy button cancels it.
let requestId = null;

function newRequestId() {
    requestId = crypto.randomUUID();
    return requestId;
}

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
            return `⏳ Transcribing… ${clock(state.since)} ✕`;
        case "translating":
            return `⏳ Translating… ${clock(state.since)} ✕`;
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

// The table rows to send and the entities the English may mention. A
// reaction's button: that reaction's rows only (both count in display
// order) — and its mentions, plus the records the entry links to.
async function tableForContext(origin) {
    const entry = currentEntry();
    if (!entry) return { rows: [], mentions: [] };
    try {
        const elnEntry = await fetchEntry(entry);
        const all = tableRowsFromEntry(elnEntry);
        // A reaction's own rows carry the numbers its table shows (1, 2, 3…),
        // so "reactant 1" over the second reaction is its first row.
        const rows = origin?.reactionIndex != null
            ? all.filter((r) => r.reaction === origin.reactionIndex + 1).map((r) => ({ ...r, row: r.component }))
            : all;
        const style = getAiWriteUpView().mentionStyle;
        return { rows, mentions: entityMentions(rows, elnEntry, entryUrl(entry), { style }) };
    } catch {
        return { rows: [], mentions: [] };   // dictation works without the table
    }
}

// ---------------------------------------------------------------- pipeline

function step(phase, status = state.status) {
    clearInterval(tick);
    setState({ phase, since: Date.now(), status });
    if (phase !== "idle") tick = setInterval(() => setState({}), 500);
}

async function runDictation(blob, origin, entryText, entryKey) {
    const startedAt = Date.now();
    step("transcribing", "");
    try {
        // 🎤 at the Ask field only fills the field: no table, no chat.
        const fillsField = typeof origin?.onText === "function";
        const [heard, { rows, mentions }] = await Promise.all([
            chrome.runtime.sendMessage({
                type: AI_TRANSCRIBE_MESSAGE,
                id: newRequestId(),
                audio: toBase64(await blob.arrayBuffer()),
                mimeType: blob.type || "audio/webm",
                language: getAiWriteUpView().language,
            }),
            fillsField ? { rows: [], mentions: [] } : tableForContext(origin),
        ]);
        if (!heard?.ok) return step("idle", aiErrorMessage(heard));
        if (!heard.text) return step("idle", "Heard nothing — speak closer to the microphone.");
        if (fillsField) {
            step("idle", "");
            origin.onText(heard.text);
            return;
        }

        await toEnglishCard({
            source: heard.text,
            sourceLabel: "Heard",
            label: origin?.reactionIndex != null ? `Reaction ${origin.reactionIndex + 1}` : "Dictation",
            rows,
            mentions,
            entryText,
            entryKey,
            startedAt,
            // A reaction's dictation is meant to cover the reaction: say
            // what it leaves out. One sentence about the entry would not.
            askMissing: origin?.reactionIndex != null,
        });
    } catch (err) {
        console.debug("[CDD Stoich Tools] dictation failed", err);
        step("idle", aiErrorMessage({ error: "network" }));
    }
}

// The step dictation, Polish on a selection and Ask share: `source` →
// English → a card. `sourceLabel` names the original on the card ("Heard",
// "Selected", "Asked"). A selection or a request may already be English, so
// for them an answer unlike the source is fine; only one still in
// Slovak/Czech is refused. `ask`: the source is a request about the entry
// (buildAskMessages), not text to translate. True when a card came of it.
// The numbers the English dropped, put back by the model in one more round —
// the same revision a Reply makes, with the missing values as the reply.
// → { english, parsed } or null when the round failed.
async function repairLostNumbers(english, lost, { rows, entryText, mentionBlock, askMissing }) {
    const values = lost.map((l) => l.text).join(", ");
    step("translating", `Putting back what the English dropped: ${values}`);
    const messages = buildReviseMessages(
        english,
        `The DRAFT dropped these values; put each one back where it belongs, in digits: ${values}.`,
        { rows, entryText, mentionBlock, askMissing }
    );
    const answer = await chrome.runtime.sendMessage({
        type: AI_CHAT_MESSAGE,
        id: newRequestId(),
        messages: withHouseRules(messages, getAiWriteUpView().rules),
    });
    if (!answer?.ok) return null;
    const parsed = parseLlmJson(answer.content);
    const text = cleanDictationAnswer(answerText(answer.content, parsed));
    return text ? { english: text, parsed } : null;
}

async function toEnglishCard(args) {
    const {
        source, sourceLabel, label, rows, mentions, entryText, entryKey, startedAt,
        instruction = "", mayBeEnglish = false, askMissing = false, ask = false, revise = null,
    } = args;
    step("translating", `${sourceLabel}: “${source}”`);
    const mentionBlock = mentionPromptBlock(mentions, { style: getAiWriteUpView().mentionStyle });
    let messages;
    if (revise) {
        messages = buildReviseMessages(revise.draft, source, {
            openPoints: revise.openPoints, rows, entryText, mentionBlock, askMissing,
        });
    } else if (ask) {
        messages = buildAskMessages(source, { rows, entryText, mentionBlock });
    } else {
        messages = buildDictationMessages(source, { rows, entryText, mentionBlock, instruction, askMissing });
    }
    const answer = await chrome.runtime.sendMessage({
        type: AI_CHAT_MESSAGE,
        id: newRequestId(),
        messages: withHouseRules(messages, getAiWriteUpView().rules),
    });
    if (!answer?.ok) {
        // What was heard or selected is not lost: a card keeps it, with Retry
        // — nobody should have to dictate it again.
        // A reply that failed leaves its card as it was (and the reply in its box).
        if (answer?.error !== "cancelled" && !revise) {
            cards = [
                {
                    entryKey,
                    segments: [{ text: source }],
                    checks: null,
                    hasTable: false,
                    source,
                    sourceLabel,
                    label: `${label} — not translated`,
                    instruction: instruction.trim(),
                    failed: aiErrorMessage(answer),
                    retry: () => toEnglishCard({ ...args, startedAt: Date.now() }),
                    at: Date.now(),
                    tookMs: Date.now() - startedAt,
                    model: answer?.model || "",
                },
                ...cards,
            ].slice(0, MAX_CARDS);
        }
        step("idle", aiErrorMessage(answer));
        return false;
    }

    // JSON like Polish entry's: the English and what it says about the
    // table. An answer that is not JSON is most likely the English itself —
    // shown, with no Checks.
    let parsed = parseLlmJson(answer.content);
    let english = cleanDictationAnswer(answerText(answer.content, parsed));
    // A model that echoes the source back (small models do) is reported
    // rather than shown as if it were the translation.
    if (!english || looksUntranslated(english, mayBeEnglish ? "" : source)) {
        step("idle", `${aiErrorMessage({ error: "untranslated", model: answer.model })} ${sourceLabel}: “${source}”`);
        return false;
    }
    // Numbers the English dropped. Not for Ask: its answer is new text, not
    // the request rewritten.
    // A revision must keep what the draft said and add what the reply said.
    const lostFrom = revise ? `${revise.draftPlain}
${source}` : source;
    const toSegments = (text) => {
        const segs = splitMentions(text, mentions);
        // Slots the table answers (yield, the product's mass) come filled in.
        prefillSlots(segs, { yieldText: tableYieldText(rows), productMass: productMassText(rows) });
        return segs;
    };
    let segments = toSegments(english);
    let lost = ask ? [] : lostQuantities(lostFrom, mentionsToPlain(segments));

    // One repair round before anything is shown: the English goes back with
    // the numbers it dropped, as a Reply would send it. Kept only when it
    // loses fewer numbers and is still English; otherwise the first answer
    // stands and the Checks list what is missing, as before.
    if (lost.length) {
        const repaired = await repairLostNumbers(english, lost, { rows, entryText, mentionBlock, askMissing });
        if (repaired && !looksUntranslated(repaired.english, mayBeEnglish ? "" : source)) {
            const repairedSegments = toSegments(repaired.english);
            const stillLost = lostQuantities(lostFrom, mentionsToPlain(repairedSegments));
            if (stillLost.length < lost.length) {
                ({ english, parsed } = repaired);
                segments = repairedSegments;
                lost = stillLost;
            }
        }
    }
    const at = Date.now();
    const card = {
        entryKey,
        segments,
        // notMentioned only where it was asked for: the model may add it anyway.
        checks: parsed
            ? [...lost, ...buildChecks(
                { ...parsed, notMentioned: askMissing ? parsed.notMentioned : [] },
                rows,
                { texts: [source, entryText, english, revise?.draftPlain || ""] }
            )]
            : lost.length ? lost : null,
        hasTable: rows.length > 0,
        source,
        sourceLabel,
        label,
        instruction: instruction.trim(),
        // The whole wait, from the click: recording stopped or Polish.
        at,
        tookMs: at - startedAt,
        model: answer.model,
        // What the card was made with — a Reply revises it with the same.
        context: { rows, mentions, entryText, askMissing, baseLabel: revise?.baseLabel || label },
    };
    // A revision takes the place of the card it revises; anything else goes on top.
    cards = revise?.replaces && cards.includes(revise.replaces)
        ? cards.map((c) => (c === revise.replaces ? card : c))
        : [card, ...cards].slice(0, MAX_CARDS);
    step("idle", "");
    return true;
}

/**
 * Reply on a card: `reply` (typed or dictated) answers its open points or
 * adds facts; the draft comes back revised in the card's place, with Checks
 * against the same table. True when it did; on failure the card stays.
 */
export async function replyToCard(card, reply) {
    if (state.phase !== "idle" || !reply.trim() || !card?.context) return false;
    if (!getAiWriteUpView().hasKey) {
        step("idle", aiErrorMessage({ error: "no-key" }));
        return false;
    }
    // What the reply answers: the checks still open, the empty slots.
    const openPoints = [
        ...unfilledPlaceholders(card.segments).map((what) => `Fill in the ${what}`),
        ...(card.checks || []).map((c) => {
            if (c.kind === "note") return c.message;
            if (c.kind === "missing") return `Mention ${c.label}`;
            if (c.kind === "lost") return `Put back ${c.text}`;
            if (c.kind === "yield") return `Yield: calculated ${c.table}${c.text ? `, text says ${c.text}` : ""}`;
            if (c.kind === "mismatch") return `${c.label}: text ${c.text}, table ${c.table}`;
            return "";
        }),
    ].filter(Boolean);
    const { rows, mentions, entryText, askMissing, baseLabel } = card.context;
    // The card's Send shows the clock (and cancels) while this runs.
    setState({ origin: { replyTo: card } });
    try {
        return await toEnglishCard({
            source: reply.trim(),
            sourceLabel: "Replied",
            label: `${baseLabel} · revised`,
            rows,
            mentions,
            entryText,
            entryKey: card.entryKey,
            startedAt: Date.now(),
            askMissing,
            mayBeEnglish: true,
            revise: {
                draft: mentionsToTokens(card.segments),
                draftPlain: mentionsToPlain(card.segments),
                openPoints,
                replaces: card,
                baseLabel,
            },
        });
    } catch (err) {
        console.debug("[CDD Stoich Tools] reply failed", err);
        step("idle", aiErrorMessage({ error: "network" }));
        return false;
    }
}

/**
 * Ask about this entry (the Write-up tab's field): `request` with the whole
 * entry — every table, the text — as background → an "Ask" card holding only
 * what was asked for. Ignored while a recording or another request is running.
 */
export async function askAboutEntry(request) {
    if (state.phase !== "idle" || !request.trim()) return false;
    if (!getAiWriteUpView().hasKey) {
        step("idle", aiErrorMessage({ error: "no-key" }));
        return false;
    }
    const entryKey = currentEntry()?.key;
    const startedAt = Date.now();
    try {
        // Not a recording: no button's own progress to show.
        setState({ origin: { asking: true } });   // Ask's own button shows the clock
        step("translating", "");
        const { rows, mentions } = await tableForContext(null);
        // Only a request that became a card empties the field.
        return await toEnglishCard({
            source: request.trim(),
            sourceLabel: "Asked",
            label: "Ask",
            rows,
            mentions,
            entryText: (textFromEditor() ?? "").slice(-ENTRY_CONTEXT_CHARS),
            entryKey,
            startedAt,
            mayBeEnglish: true,
            ask: true,
        });
    } catch (err) {
        console.debug("[CDD Stoich Tools] ask failed", err);
        step("idle", aiErrorMessage({ error: "network" }));
        return false;
    }
}

/**
 * 🎤 at a field (Ask, a card's Reply): record, transcribe, hand the words to
 * `onText`. `field` tells the buttons apart, so only that one shows ■ Stop.
 */
export function dictateInto(onText, field = "ask") {
    toggleDictation({ onText, field });
}

/**
 * Polish on a selection (phrases/capture.js): the selected text → a
 * "Selection" card, with every table of the entry and the section the
 * selection starts in (`blockEl`) as context, and `instruction` — Polish +,
 * what to do with it instead of a plain polish. Ignored while a recording or
 * another polish is running.
 */
export async function polishSelection(text, blockEl, instruction = "") {
    if (state.phase !== "idle" || !text.trim()) return;
    if (!getAiWriteUpView().hasKey) return step("idle", aiErrorMessage({ error: "no-key" }));
    const entryKey = currentEntry()?.key;
    const startedAt = Date.now();
    try {
        // Not a recording: no button's own progress to show.
        setState({ origin: null });
        step("translating", "");
        const { rows, mentions } = await tableForContext(null);
        await toEnglishCard({
            source: text.trim(),
            sourceLabel: "Selected",
            label: "Selection",
            rows,
            mentions,
            entryText: blockEl ? sectionContext(sectionAroundBlock(blockEl)) : "",
            entryKey,
            startedAt,
            instruction,
            mayBeEnglish: true,
        });
    } catch (err) {
        console.debug("[CDD Stoich Tools] polish selection failed", err);
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
    else if (requestId) void chrome.runtime.sendMessage({ type: AI_CANCEL_MESSAGE, id: requestId });
}

// ---------------------------------------------------------------- tab UI

// The Reply box under a card: a field (typed, or 🎤 dictated into it) and
// Send. What is typed survives a redraw of the cards (card.replyDraft).
function replyBoxNode(card) {
    const box = document.createElement("div");
    box.className = "cdd-wu-reply";
    box.hidden = !card.replyOpen;

    const field = document.createElement("textarea");
    field.className = "cdd-wu-ask__field";
    field.rows = 2;
    field.placeholder = "e.g. 90 °C; worked up with 3× EtOAc; isolated 1.2 g";
    field.value = card.replyDraft || "";
    field.addEventListener("mousedown", (event) => event.stopPropagation());
    field.addEventListener("input", () => { card.replyDraft = field.value; });

    const actions = document.createElement("div");
    actions.className = "cdd-wu-ask__actions";
    const mic = document.createElement("button");
    mic.type = "button";
    mic.textContent = "🎤";
    mic.title = "Dictate the reply into the field";
    const send = document.createElement("button");
    send.type = "button";
    send.className = "cdd-wu-run";
    send.textContent = "Send";
    actions.append(mic, send);
    box.append(field, actions);

    const go = async () => {
        if (!field.value.trim()) return field.focus();
        if (await replyToCard(card, field.value)) card.replyDraft = "";
    };
    send.addEventListener("click", (event) => {
        event.stopPropagation();
        // Busy with this reply, Send cancels it — a second click must not send it twice.
        if (getDictationState().origin?.replyTo === card && getDictationState().phase !== "idle") {
            toggleDictation();
            return;
        }
        void go();
    });
    field.addEventListener("keydown", (event) => {
        event.stopPropagation();
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void go();
        }
    });
    mic.addEventListener("click", (event) => {
        event.stopPropagation();
        dictateInto((text) => {
            card.replyDraft = field.value.trim() ? `${field.value.trim()} ${text}` : text;
            field.value = card.replyDraft;
            field.focus();
        }, card);
    });
    // Its own progress on its own button; gone with the box.
    const unsubscribe = onDictationChanged((state) => {
        if (!box.isConnected) return unsubscribe();
        const mine = state.origin?.field === card;
        mic.textContent = mine ? dictationLabel("🎤") : "🎤";
        const sending = state.origin?.replyTo === card && state.phase !== "idle";
        send.textContent = sending ? dictationLabel("Send") : "Send";
        send.title = sending ? "Cancel" : "Send the reply";
        send.disabled = state.phase !== "idle" && !sending;
    });
    return box;
}

function cardNode(card) {
    const box = document.createElement("div");
    box.className = "cdd-wu-card";

    const head = document.createElement("div");
    head.className = "cdd-wu-card__head";
    const title = document.createElement("div");
    title.className = "cdd-wu-card__title";
    title.textContent = card.label;
    const actions = cardActions(card.segments, () => {
        cards = cards.filter((c) => c !== card);
        setState({});
    });
    // A request that failed: Retry sends the same again, this card goes.
    if (card.retry) {
        const retry = document.createElement("button");
        retry.type = "button";
        retry.textContent = "Retry";
        retry.title = "Send it to CERIT again";
        retry.addEventListener("click", (event) => {
            event.stopPropagation();
            if (state.phase !== "idle") return;
            cards = cards.filter((c) => c !== card);
            setState({});
            void card.retry().catch(() => step("idle", aiErrorMessage({ error: "network" })));
        });
        actions.prepend(retry);
    }
    // Reply: answer the open points or add facts, typed or dictated.
    let replyBox = null;
    if (card.context) {
        const replyButton = document.createElement("button");
        replyButton.type = "button";
        replyButton.textContent = "Reply";
        replyButton.title = "Answer the points below or add what is missing — the text comes back revised";
        replyButton.addEventListener("click", (event) => {
            event.stopPropagation();
            card.replyOpen = !card.replyOpen;
            replyBox.hidden = !card.replyOpen;
            if (card.replyOpen) replyBox.querySelector("textarea").focus();
        });
        actions.prepend(replyButton);
        replyBox = replyBoxNode(card);
    }
    head.append(title, actions);

    // Checks under the text, only when there is something to say; filling a
    // placeholder redraws them.
    const checks = document.createElement("div");
    checks.className = "cdd-wu-card-checks";
    const drawChecks = () => {
        const list = checksList(card, { quiet: true });
        checks.replaceChildren(...(list ? [list] : []));
    };
    drawChecks();

    const text = document.createElement("div");
    text.className = "cdd-wu-text";
    text.append(mentionsToDom(card.segments, { onChange: drawChecks }));
    copyParagraphOnCtrlClick(text, card.segments);

    const heard = document.createElement("div");
    heard.className = "cdd-wu-heard";
    heard.textContent = `${card.sourceLabel}: “${card.source}”`;

    box.append(head, text, checks, heard);
    if (card.failed) {
        const failed = document.createElement("div");
        failed.className = "cdd-wu-heard";
        failed.textContent = card.failed;
        box.append(failed);
    }
    if (card.instruction) {
        const asked = document.createElement("div");
        asked.className = "cdd-wu-heard";
        asked.textContent = `Asked: ${card.instruction}`;
        box.append(asked);
    }
    box.append(answerMeta(card));
    if (replyBox) box.append(replyBox);
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
    language.title = "Language you dictate in — Auto lets the speech recognition tell; pick one if it guesses wrong";
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
        mic.disabled = false;
        // The tab's button shows a reaction's recording too: one microphone.
        mic.textContent = dictationLabel("🎤 Dictate");
        // Busy, the button cancels (✕ on its label).
        mic.title = busy ? "Cancel" : "Dictate about the whole entry. Stop when done: the English appears below, ready to copy.";
        status.textContent = state.status || "";
        const key = currentEntry()?.key;
        if (shown?.cards !== cards || shown?.key !== key) {
            shown = { cards, key };
            const mine = cards.filter((c) => c.entryKey === key);
            /** @type {HTMLElement[]} */
            const nodes = mine.map(cardNode);
            // They pile up: one click empties this entry's.
            if (mine.length > 1) {
                const clear = document.createElement("button");
                clear.type = "button";
                clear.className = "cdd-wu-clear";
                clear.textContent = `Clear all ${mine.length}`;
                clear.addEventListener("click", (event) => {
                    event.stopPropagation();
                    cards = cards.filter((c) => c.entryKey !== key);
                    setState({});
                });
                nodes.unshift(clear);
            }
            list.replaceChildren(...nodes);
        }
    };
    unsubscribeTab?.();
    unsubscribeTab = onDictationChanged(paint);
    paint();
}

/** When this entry's newest card came, 0 for none — the tab puts the newer of these and Polish entry's result first. */
export function newestCardAt() {
    const key = currentEntry()?.key;
    return cards.find((c) => c.entryKey === key)?.at || 0;
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
  #${panelId} .cdd-wu-card-checks:not(:empty) { margin-top: 6px; padding-top: 6px; border-top: 1px solid #1f2937; }
  #${panelId} .cdd-wu-reply { margin-top: 8px; padding-top: 6px; border-top: 1px solid #1f2937; }
  #${panelId} .cdd-wu-heard { font-size: 11px; color: #cbd5e1; margin-top: 6px; font-style: italic; }
`;
