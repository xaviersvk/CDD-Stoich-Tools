// content/features/ai-write-up/copy-button.js
//
// Copy for a piece of the Write-up tab's English: pasted into the entry, its
// mentions are CDD @-mentions; anywhere else, ordinary links (mentions.js).
// Used by the Polish entry result and by every dictation card.

import { copyRichText } from "../../utils/clipboard.js";
import { mentionsToClipboardHtml, mentionsToPlain, segmentLines } from "./mentions.js";

export function copyButton(segments) {
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "cdd-wu-copy";
    copy.textContent = "Copy";
    copy.title = "Paste into the entry with Ctrl+V — compounds and records stay linked.";
    copy.addEventListener("click", async (event) => {
        event.stopPropagation();
        const ok = await copyRichText(mentionsToClipboardHtml(segments), mentionsToPlain(segments));
        copy.textContent = ok ? "✓ copied" : "✗ failed";
        setTimeout(() => { copy.textContent = "Copy"; }, 1200);
    });
    return copy;
}

/** ✕ that closes a result card — the card's own `onClose` drops it. */
export function closeButton(onClose) {
    const close = document.createElement("button");
    close.type = "button";
    close.className = "cdd-wu-close";
    close.textContent = "✕";
    close.title = "Close";
    close.setAttribute("aria-label", "Close");
    close.addEventListener("click", (event) => {
        event.stopPropagation();
        onClose();
    });
    return close;
}

/** The right-hand end of a card's head: Copy (when there is text) and ✕. */
export function cardActions(segments, onClose) {
    const actions = document.createElement("span");
    actions.className = "cdd-wu-card__actions";
    if (segments) actions.append(copyButton(segments));
    actions.append(closeButton(onClose));
    return actions;
}

/** A card's foot: when the answer came, how long it took, which model — "14:32 · 18 s · mini". */
export function answerMeta({ at, tookMs, model }) {
    const meta = document.createElement("div");
    meta.className = "cdd-wu-meta";
    const time = new Date(at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    const s = Math.max(1, Math.round(tookMs / 1000));
    const took = s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
    meta.textContent = [time, took, model].filter(Boolean).join(" · ");
    meta.title = "Answered at · time from your click to the answer · model";
    return meta;
}

/**
 * Ctrl+click (Cmd on a Mac) on a paragraph of `container` — the English
 * drawn by mentionsToDom — copies just that paragraph, mentions and filled
 * placeholders included, the same way Copy copies the whole text.
 */
export function copyParagraphOnCtrlClick(container, segments) {
    container.title = "Ctrl+click a paragraph to copy just that one";
    container.addEventListener("click", async (event) => {
        if (!event.ctrlKey && !event.metaKey) return;
        const block = event.target.closest?.(".cdd-wu-line");
        if (!block || !container.contains(block)) return;
        // Not the link's new tab, not the slot's input: the paragraph.
        event.preventDefault();
        event.stopPropagation();
        const line = segmentLines(segments)[Number(block.dataset.line)];
        if (!line?.length) return;
        const ok = await copyRichText(mentionsToClipboardHtml(line), mentionsToPlain(line));
        block.dataset.copied = ok ? "✓ copied" : "✗ failed";
        block.classList.add("cdd-wu-line--copied");
        setTimeout(() => block.classList.remove("cdd-wu-line--copied"), 900);
    }, true);
}
