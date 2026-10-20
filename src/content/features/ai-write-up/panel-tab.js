// content/features/ai-write-up/panel-tab.js
//
// The "Write-up" tab of the floating panel (off unless Settings → AI write-up
// is on). Polish entry sends the entry's text and stoichiometry table to the
// CERIT LLM through background.js, and shows
//
//   - the English write-up, with Copy (as rich text: the "## " headings come
//     back as headings when pasted into the entry), and
//   - the checks: where the text and the table disagree, in numbers.
//
// Polish entry writes nothing into the entry. The result belongs to the
// entry it was made for and is dropped when the panel moves to another one.
// (Dictation, next to it, does type into the entry — see dictation.js.)
//
// Where the text and the table are read from: entry.js.

import { copyRichText } from "../../utils/clipboard.js";
import { getAiWriteUpView, aiErrorMessage } from "../../../shared/ai-write-up-settings.js";
import { AI_CHAT_MESSAGE, AI_CANCEL_MESSAGE } from "../../../shared/event-types.js";
import {
    entryTextFromBody,
    tableRowsFromEntry,
    buildMessages,
    parseLlmJson,
    buildChecks,
    looksUntranslated,
} from "./model.js";
import { currentEntry, fetchEntry, textFromEditor } from "./entry.js";
import { mountDictation } from "./dictation.js";

let pane = null;
let runButton = null;
let statusEl = null;
let resultEl = null;
let running = null;     // { id } while a request is out
let result = null;      // { entryKey, text, checks, hasTable, parsed }

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

function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function writeUpHtml(text) {
    return text
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => {
            const heading = line.match(/^#{1,6}\s+(.*)$/);
            return heading ? `<h2>${escapeHtml(heading[1])}</h2>` : `<p>${escapeHtml(line)}</p>`;
        })
        .join("");
}

function checkLine(check) {
    const line = el("div", "cdd-wu-check");
    if (check.kind === "mismatch" || check.kind === "yield") {
        line.append(el("strong", null, check.label));
        line.append(document.createTextNode(
            check.text == null
                ? ` calculated ${check.table} — add it to the text`
                : ` text ${check.text} · ${check.kind === "yield" ? "calculated" : "table"} ${check.table}`
        ));
    } else {
        line.textContent = check.message;
    }
    return line;
}

function renderChecks(card, checks, hasTable) {
    card.append(el("div", "cdd-wu-card__title", "Checks"));
    if (!hasTable) {
        card.append(el("div", "cdd-wu-check", "No stoichiometry table in this entry — text polished only."));
        return;
    }
    if (checks == null) {
        card.append(el("div", "cdd-wu-check", "Checks unavailable — the answer had no readable data. Polish again."));
        return;
    }
    const numbers = checks.filter((c) => c.kind === "mismatch" || c.kind === "yield");
    const missing = checks.filter((c) => c.kind === "missing");
    const notes = checks.filter((c) => c.kind === "note");

    if (!checks.length) {
        card.append(el("div", "cdd-wu-check", "Text and table agree."));
        return;
    }
    if (numbers.length) {
        card.append(el("div", "cdd-wu-check cdd-wu-check--lead", "Correct the text or the table:"));
        for (const c of numbers) card.append(checkLine(c));
    }
    if (missing.length) {
        const line = el("div", "cdd-wu-check");
        line.append(el("strong", null, "Mention in the text: "), document.createTextNode(missing.map((c) => c.label).join(", ")));
        card.append(line);
    }
    for (const c of notes) card.append(checkLine(c));
}

function render() {
    if (!resultEl) return;
    resultEl.replaceChildren();
    const key = currentEntry()?.key;
    if (!result || result.entryKey !== key) return;

    if (result.text) {
        const card = el("div", "cdd-wu-card");
        const head = el("div", "cdd-wu-card__head");
        head.append(el("div", "cdd-wu-card__title", "English text"));
        const copy = el("button", "cdd-wu-copy", "Copy");
        copy.type = "button";
        copy.addEventListener("click", async (event) => {
            event.stopPropagation();
            const ok = await copyRichText(writeUpHtml(result.text), result.text.replace(/^#{1,6}\s+/gm, ""));
            copy.textContent = ok ? "✓ copied" : "✗ failed";
            setTimeout(() => { copy.textContent = "Copy"; }, 1200);
        });
        head.append(copy);
        card.append(head, el("div", "cdd-wu-text", result.text));
        resultEl.append(card);
    }

    const checksCard = el("div", "cdd-wu-card");
    renderChecks(checksCard, result.checks, result.hasTable);
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

        setStatus("Polishing… (CERIT, usually under a minute)");
        const answer = await chrome.runtime.sendMessage({ type: AI_CHAT_MESSAGE, id, messages: buildMessages(text, rows) });
        if (!answer?.ok) {
            setStatus(aiErrorMessage(answer));
            return;
        }

        const parsed = parseLlmJson(answer.content);
        result = {
            entryKey: entry.key,
            // An answer that is not JSON is most likely the text itself.
            text: typeof parsed?.text === "string" ? parsed.text.trim() : parsed ? "" : answer.content.trim(),
            checks: parsed ? buildChecks(parsed, rows) : null,
            hasTable: rows.length > 0,
        };
        setStatus(result.text && looksUntranslated(result.text, text)
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
        render();   // the entry may have changed since the tab was last shown
        return;
    }
    pane = target;
    pane.replaceChildren();

    pane.append(el("div", "cdd-wu-hint",
        "Dictate or type the entry, then Polish entry: English write-up plus a check against the table. Nothing is written into the entry."));

    const bar = el("div", "cdd-wu-bar");
    runButton = el("button", "cdd-wu-run", "Polish entry");
    runButton.type = "button";
    runButton.addEventListener("click", (event) => {
        event.stopPropagation();
        void polish();
    });
    bar.append(runButton);
    mountDictation(bar);

    statusEl = el("div", "cdd-wu-status");
    statusEl.hidden = true;
    resultEl = el("div", "cdd-wu-result");
    pane.append(bar, statusEl, resultEl);
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
  #${panelId} .cdd-wu-check--lead { font-weight: 700; }
`;
