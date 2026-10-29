// content/features/ai-write-up/panel-tab.js
//
// The "Write-up" tab of the floating panel (off unless Settings → AI write-up
// is on). Polish entry sends the entry's text and stoichiometry table to the
// AI service through background.js, and shows
//
//   - the English write-up, with Copy (as rich text: the "## " headings come
//     back as headings when pasted into the entry), and
//   - the checks: where the text and the table disagree, in numbers.
//
// Polish entry writes nothing into the entry. The result belongs to the
// entry it was made for and is dropped when the panel moves to another one.
// Dictation, next to it, shows its English as cards here too — see dictation.js.
//
// Where the text and the table are read from: entry.js.

import { getAiWriteUpView, aiErrorMessage } from "../../../shared/ai-write-up-settings.js";
import { AI_CHAT_MESSAGE, AI_CANCEL_MESSAGE } from "../../../shared/event-types.js";
import {
    entryTextFromBody,
    tableRowsFromEntry,
    buildMessages,
    parseLlmJson,
    buildChecks,
    looksUntranslated,
    withHouseRules,
    lostQuantities,
    answerText,
    productMassText,
    tableYieldText,
} from "./model.js";
import { currentEntry, entryUrl, fetchEntry, textFromEditor } from "./entry.js";
import { mountDictation, newestCardAt, onDictationChanged, refreshDictation } from "./dictation.js";
import {
    entityMentions,
    mentionPromptBlock,
    mentionsToDom,
    mentionsToPlain,
    prefillSlots,
    splitMentions,
} from "./mentions.js";
import { checksList } from "./checks-view.js";
import { mountAskBox, ASK_BOX_STYLES } from "./ask-box.js";
import { answerMeta, cardActions, copyParagraphOnCtrlClick } from "./copy-button.js";

let pane = null;
let runButton = null;
let statusEl = null;
let resultEl = null;
let dictationsEl = null;
let arrangeSubscribed = false;
let running = null;     // { id } while a request is out
let result = null;      // { entryKey, segments, checks, hasTable }

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function setStatus(text) {
    statusEl.textContent = text || "";
    statusEl.hidden = !text;
}

// ---------------------------------------------------------------- rendering

// ✕ on the result: the English text and its checks go together.
function closeResult() {
    result = null;
    setStatus("");
    render();
}

function renderChecks(card, result) {
    // With no English text card above, the ✕ sits here.
    if (result.segments.length) {
        card.replaceChildren(el("div", "cdd-wu-card__title", "Checks"));
    } else {
        const head = el("div", "cdd-wu-card__head");
        head.append(el("div", "cdd-wu-card__title", "Checks"), cardActions(null, closeResult));
        card.replaceChildren(head);
    }
    const list = checksList(result);
    if (list) card.append(list);
}

// Newest first, whatever made it: Polish entry's result goes above the
// dictation cards when it is newer than all of them, below otherwise. The
// pane is a flex column; `order` moves the two blocks without rebuilding them.
function arrange() {
    if (!resultEl || !dictationsEl) return;
    const resultNewer = result?.entryKey === currentEntry()?.key && (result?.at || 0) > newestCardAt();
    resultEl.style.order = resultNewer ? "4" : "5";
    dictationsEl.style.order = resultNewer ? "5" : "4";
}

function render() {
    if (!resultEl) return;
    resultEl.replaceChildren();
    arrange();
    const key = currentEntry()?.key;
    if (!result || result.entryKey !== key) return;
    const checksCard = el("div", "cdd-wu-card");

    if (result.segments.length) {
        const card = el("div", "cdd-wu-card");
        const head = el("div", "cdd-wu-card__head");
        head.append(el("div", "cdd-wu-card__title", "English text"), cardActions(result.segments, closeResult));
        const text = el("div", "cdd-wu-text");
        // Filling a placeholder redraws the checks only: the text keeps its
        // scroll position and the slot just typed into.
        text.append(mentionsToDom(result.segments, /** @type {any} */ ({ onChange: () => renderChecks(checksCard, result) })));
        copyParagraphOnCtrlClick(text, result.segments);
        card.append(head, text);
        resultEl.append(card);
    }

    renderChecks(checksCard, result);
    checksCard.append(answerMeta(result));
    resultEl.append(checksCard);
}

// ---------------------------------------------------------------- running

function setRunning(next) {
    running = next;
    runButton.textContent = running ? "Cancel" : "Polish entry";
}

async function polish() {
    if (running) {
        void chrome.runtime.sendMessage({ type: AI_CANCEL_MESSAGE, id: running.id });
        return;
    }
    const entry = currentEntry();
    if (!entry) return;
    if (!getAiWriteUpView().hasKey) {
        setStatus(aiErrorMessage({ error: "no-key" }));
        return;
    }

    const id = crypto.randomUUID();
    const startedAt = Date.now();
    setRunning({ id });
    setStatus("Reading the entry…");
    try {
        let elnEntry;
        try {
            elnEntry = await fetchEntry(entry);
        } catch {
            setStatus("Could not read the entry — reload the page and try again.");
            return;
        }
        const text = textFromEditor() ?? entryTextFromBody(elnEntry?.body);
        const rows = tableRowsFromEntry(elnEntry);
        if (!text.trim()) {
            setStatus("The entry has no text yet — dictate or type it first.");
            return;
        }

        const style = getAiWriteUpView().mentionStyle;
        const mentions = entityMentions(rows, elnEntry, entryUrl(entry), { style });

        setStatus(`Polishing… (${getAiWriteUpView().provider}, usually under a minute)`);
        const answer = await chrome.runtime.sendMessage({
            type: AI_CHAT_MESSAGE,
            id,
            messages: withHouseRules(buildMessages(text, rows, mentionPromptBlock(mentions, { style })), getAiWriteUpView().rules),
        });
        if (!answer?.ok) {
            setStatus(aiErrorMessage(answer));
            return;
        }

        const parsed = parseLlmJson(answer.content);
        const english = answerText(answer.content, parsed).trim();
        const at = Date.now();
        const segments = splitMentions(english, mentions);
        // Slots the table answers (yield, the product's mass) come filled in.
        prefillSlots(segments, { yieldText: tableYieldText(rows), productMass: productMassText(rows) });
        // Numbers the rewrite dropped, whether or not the JSON came through.
        const lost = english ? lostQuantities(text, mentionsToPlain(segments)) : [];
        result = {
            entryKey: entry.key,
            at,
            tookMs: at - startedAt,
            model: answer.model,
            segments,
            checks: parsed ? [...lost, ...buildChecks(parsed, rows, { texts: [text, english] })] : lost.length ? lost : null,
            hasTable: rows.length > 0,
        };
        setStatus(english && looksUntranslated(english, text)
            ? aiErrorMessage({ error: "untranslated", model: answer.model })
            : `Polished with ${answer.model}. Check it before you paste it in.`);
        render();
    } catch (err) {
        console.debug("[CDD Stoich Tools] write-up failed", err);
        setStatus(aiErrorMessage({ error: "network" }));
    } finally {
        setRunning(null);
    }
}

// ---------------------------------------------------------------- mount

export function mountWriteUpPane(target) {
    if (pane === target && resultEl?.isConnected) {
        // The entry may have changed since the tab was last shown.
        render();
        refreshDictation();
        return;
    }
    pane = target;
    pane.replaceChildren();

    pane.append(el("div", "cdd-wu-hint",
        "🎤 turns what you say into English, ready to copy. Polish entry rewrites the whole entry in English and checks it against the table. Ask does what you ask, with the entry as background. Nothing is written into the entry."));

    const bar = el("div", "cdd-wu-bar");
    runButton = el("button", "cdd-wu-run", "Polish entry");
    runButton.type = "button";
    runButton.addEventListener("click", (event) => {
        event.stopPropagation();
        void polish();
    });
    bar.append(runButton);
    dictationsEl = el("div", "cdd-wu-dictations");
    mountDictation(bar, dictationsEl);

    // The status right under the buttons it reports on; the two result
    // blocks after it, newest first (arrange).
    statusEl = el("div", "cdd-wu-status");
    statusEl.hidden = true;
    resultEl = el("div", "cdd-wu-result");
    pane.classList.add("cdd-wu-pane");
    pane.append(bar, mountAskBox(), statusEl, dictationsEl, resultEl);
    if (!arrangeSubscribed) {
        arrangeSubscribed = true;
        onDictationChanged(arrange);
    }
    render();
}

export const WRITE_UP_PANE_STYLES = (panelId) => `
  #${panelId} .cdd-wu-hint { font-size: 11px; color: #94a3b8; margin-bottom: 8px; }
  #${panelId} .cdd-wu-bar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 8px; }
  #${panelId} .cdd-wu-run { font-weight: 700; }
  #${panelId} .cdd-wu-status { font-size: 12px; color: #cbd5e1; margin-bottom: 8px; }
  #${panelId} .cdd-wu-result { display: flex; flex-direction: column; gap: 8px; }
  #${panelId} .cdd-wu-card {
    border: 1px solid #374151;
    border-radius: 10px;
    padding: 8px 10px;
    background: #0f172a;
  }
  #${panelId} .cdd-wu-card__head { display: flex; justify-content: space-between; align-items: center; }
  #${panelId} .cdd-wu-pane { display: flex; flex-direction: column; }
  #${panelId} .cdd-wu-pane > .cdd-wu-hint { order: 0; }
  #${panelId} .cdd-wu-pane > .cdd-wu-bar { order: 1; }
  #${panelId} .cdd-wu-pane > .cdd-wu-ask { order: 2; }
  #${panelId} .cdd-wu-pane > .cdd-wu-status { order: 3; }
${ASK_BOX_STYLES(panelId)}
  #${panelId} .cdd-wu-line { position: relative; border-radius: 4px; }
  #${panelId} .cdd-wu-line--blank { min-height: 0.7em; }
  /* Ctrl+click copied this paragraph. */
  #${panelId} .cdd-wu-line--copied { outline: 1px solid #22c55e; outline-offset: 1px; }
  #${panelId} .cdd-wu-line--copied::after {
    content: attr(data-copied); position: absolute; right: 0; top: -1px;
    padding: 0 4px; font-size: 10px; color: #f9fafb; background: #166534; border-radius: 3px;
  }
  #${panelId} .cdd-wu-meta { margin-top: 6px; font-size: 11px; color: #cbd5e1; text-align: right; }
  #${panelId} .cdd-wu-card__actions { display: inline-flex; gap: 4px; align-items: center; }
  #${panelId} .cdd-wu-close { padding: 2px 7px; }
  #${panelId} .cdd-wu-clear { display: block; margin: 0 0 6px auto; font-size: 11px; }
  #${panelId} .cdd-wu-card__title { font-size: 12px; font-weight: 700; margin-bottom: 6px; }
  #${panelId} .cdd-wu-text {
    font-size: 12px;
    line-height: 1.45;
    white-space: pre-wrap;
    max-height: 320px;
    overflow: auto;
    user-select: text;
  }
  #${panelId} .cdd-wu-check { font-size: 12px; line-height: 1.45; padding: 2px 0; }
  #${panelId} .cdd-wu-checks { list-style: none; margin: 0; padding: 0; }
  #${panelId} .cdd-wu-checks__item {
    position: relative; margin: 0; padding: 2px 0 2px 14px;
    font-size: 12px; line-height: 1.45; list-style: none;
  }
  #${panelId} .cdd-wu-checks__item::before {
    content: ""; position: absolute; left: 2px; top: 7px;
    width: 7px; height: 7px; border-radius: 50%;
  }
  #${panelId} .cdd-wu-checks__item--fix::before { background: #ef4444; }
  #${panelId} .cdd-wu-checks__item--add::before { background: #f59e0b; }
  #${panelId} .cdd-wu-checks__item--note::before { background: #60a5fa; }
  #${panelId} .cdd-wu-mention { color: #93c5fd; text-decoration: underline; }
  /* A placeholder: dashed amber while empty, solid green once filled. */
  #${panelId} .cdd-wu-slot {
    display: inline; padding: 0 4px; margin: 0 1px;
    font: 600 12px Arial, sans-serif; line-height: 1.3;
    color: #fcd34d; background: transparent;
    border: 1px dashed #f59e0b; border-radius: 4px; cursor: text;
  }
  #${panelId} .cdd-wu-slot--filled { color: #f9fafb; border: 1px solid #22c55e; font-weight: 400; }
  #${panelId} .cdd-wu-slot-input {
    font: 12px Arial, sans-serif; color: #111827; background: #fff;
    border: 1px solid #f59e0b; border-radius: 4px; padding: 0 4px;
  }
`;
