// content/features/ai-write-up/entry.js
//
// The ELN entry on screen, as the Write-up tab reads it. Nothing here writes
// to it: results are copied out of the panel by hand.
//
// TEXT is read from the editor, not from the saved entry: what was just
// dictated may not be saved yet (CDD's autosave can lag, or fail with a 409
// when the entry is open elsewhere). The TABLE comes from the saved entry —
// the editor shows it as a rendered widget, not as data.

import { entryTextFromNodes } from "./model.js";

const ENTRY_PATH = /\/vaults\/(\d+)\/eln\/entries\/(\d+)/;
const EDITOR_SELECTOR = '[data-slate-editor="true"]';
// Slate's zero-width placeholders (BOM, zero-width space) in empty leaves.
const ZERO_WIDTH = new RegExp(`[${String.fromCharCode(0xfeff, 0x200b)}]`, "g");

export function currentEntry() {
    const m = location.pathname.match(ENTRY_PATH);
    return m ? { vaultId: m[1], entryId: m[2], key: `${m[1]}/${m[2]}` } : null;
}

/** The entry's absolute URL — where a mention of one of its table rows points. */
export function entryUrl({ vaultId, entryId }) {
    return `${location.origin}/vaults/${vaultId}/eln/entries/${entryId}`;
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

/**
 * The text of the section a block sits in — from the heading before it to
 * the next heading — without the block itself. For a dictation started on a
 * reaction: the procedure written around that reaction.
 */
export function sectionAroundBlock(blockEl) {
    const editor = blockEl?.closest?.(EDITOR_SELECTOR);
    if (!editor) return "";
    const blocks = [...editor.querySelectorAll(':scope > [data-slate-node="element"]')];
    const index = blocks.findIndex((block) => block === blockEl || block.contains(blockEl));
    if (index < 0) return "";
    const isHeading = (block) => /\bslate-h\d\b/.test(String(block.className));

    let start = index;
    while (start > 0 && !isHeading(blocks[start])) start--;
    let end = index + 1;
    while (end < blocks.length && !isHeading(blocks[end])) end++;

    return entryTextFromNodes(
        blocks.slice(start, end).filter((block) => block !== blocks[index]).map(nodeFromDom)
    );
}
