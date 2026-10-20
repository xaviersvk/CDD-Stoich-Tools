// content/features/ai-write-up/entry.js
//
// The ELN entry on screen, as the Write-up tab reads and writes it.
//
// TEXT is read from the editor, not from the saved entry: what was just
// dictated may not be saved yet (CDD's autosave can lag, or fail with a 409
// when the entry is open elsewhere). The TABLE comes from the saved entry —
// the editor shows it as a rendered widget, not as data.
//
// Writing goes through a `beforeinput` event, which CDD's editor (Slate)
// handles like typing. document.execCommand("insertText") is NOT an option:
// it changes the DOM behind Slate's back, and Slate drops the text on its
// next render.

import { entryTextFromNodes } from "./model.js";

const ENTRY_PATH = /\/vaults\/(\d+)\/eln\/entries\/(\d+)/;
const EDITOR_SELECTOR = '[data-slate-editor="true"]';
const ZERO_WIDTH = /[﻿​]/g;

export function currentEntry() {
    const m = location.pathname.match(ENTRY_PATH);
    return m ? { vaultId: m[1], entryId: m[2], key: `${m[1]}/${m[2]}` } : null;
}

export async function fetchEntry({ vaultId, entryId }) {
    const response = await fetch(`/vaults/${vaultId}/eln/v2/entries/${entryId}`, {
        credentials: "include",
        headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`entry ${response.status}`);
    return (await response.json())?.eln_entry;
}

// Each Slate element renders as <div class="slate-<type>" data-slate-node=
// "element">; embedded blocks (the reaction table) are data-slate-void.
// Read back into the node shape the model understands.
function nodeFromDom(element) {
    if (element.getAttribute("data-slate-void") === "true") return { type: "reaction", children: [] };
    const type = (String(element.className).match(/\bslate-([\w-]+)/) || [])[1] || "p";

    if (type === "table" || element.querySelector(":scope table")) {
        return {
            type: "table",
            children: [...element.querySelectorAll("tr")].map((tr) => ({
                type: "tr",
                children: [...tr.querySelectorAll("td, th")].map((td) => ({
                    type: "td",
                    children: [{ text: td.textContent.replace(ZERO_WIDTH, "") }],
                })),
            })),
        };
    }

    const blocks = element.querySelectorAll(':scope > [data-slate-node="element"]');
    const nested = [...blocks].filter((child) => /\bslate-(li|p|ul|ol|h\d)\b/.test(String(child.className)));
    if (nested.length) return { type, children: nested.map(nodeFromDom) };

    return { type, children: [{ text: element.textContent.replace(ZERO_WIDTH, "") }] };
}

/** The editor's text, or null when no editor is on the page. */
export function textFromEditor() {
    const editor = document.querySelector(EDITOR_SELECTOR);
    if (!editor) return null;
    const blocks = editor.querySelectorAll(':scope > [data-slate-node="element"]');
    return entryTextFromNodes([...blocks].map(nodeFromDom));
}

/** Types `text` at the cursor in the entry. False when the cursor is not in it. */
export function insertIntoEditor(text) {
    const active = document.activeElement;
    const editor = active?.closest?.(EDITOR_SELECTOR);
    if (!editor) return false;
    const event = new InputEvent("beforeinput", {
        inputType: "insertText",
        data: text,
        bubbles: true,
        cancelable: true,
        composed: true,
    });
    editor.dispatchEvent(event);
    // Slate cancels the events it applies itself.
    return event.defaultPrevented;
}
