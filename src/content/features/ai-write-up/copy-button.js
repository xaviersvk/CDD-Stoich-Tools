// content/features/ai-write-up/copy-button.js
//
// Copy for a piece of the Write-up tab's English: pasted into the entry, its
// mentions are CDD @-mentions; anywhere else, ordinary links (mentions.js).
// Used by the Polish entry result and by every dictation card.

import { copyRichText } from "../../utils/clipboard.js";
import { mentionsToClipboardHtml, mentionsToPlain } from "./mentions.js";

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
