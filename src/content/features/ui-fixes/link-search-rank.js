// content/features/ui-fixes/link-search-rank.js
//
// CDD's link search (`@` in the text, Insert link, Bulk link) lists its hits
// in identifier order, not by how well they match: searching
// "IXX-DEMO-0000011-001-SM000008" put that very sample 16th of 30, below
// every sample of IXX-DEMO-0000006…0000010. This lifts the exact match to the
// top, then the hits that start with what was typed; the rest keep CDD's
// order.
//
// The dropdown is one flex column, so the lift is CSS `order` on its
// children — no node is moved, and React's list stays intact. The exact
// match is also made the highlighted item (a mouseover, which is how CDD
// itself moves the highlight), so Enter picks it rather than CDD's first
// row. Arrow keys still walk CDD's own order.

import { watchDocument } from "../../utils/dom.js";

const DROPDOWN = '[data-autotest-id="link-suggestion__dropdown"]';
const ITEM = '[data-autotest-id^="suggestion-item"]';
const ITEM_INNER = '[data-autotest-id^="link-suggestion"]';
const SEARCH_INPUT = '[data-autotest-id="link-url-input-field"]';

const EXACT = -2;
const PREFIX = -1;

// The term being searched: the popup's search box when it has focus (its
// last word — Bulk link takes several IDs), otherwise the `@…` word just
// before the caret in the entry text.
function currentQuery() {
    const active = document.activeElement;
    if (active?.matches?.(SEARCH_INPUT)) {
        const words = active.value.trim().split(/\s+/);
        return words[words.length - 1] || "";
    }
    // The whole paragraph up to the caret, not just the caret's text node:
    // Slate can split "@" and the query into separate leaves.
    const selection = window.getSelection();
    const node = selection?.anchorNode;
    if (!node) return "";
    const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    const block = element?.closest('[data-slate-node="element"]');
    if (!block) return "";
    const range = document.createRange();
    range.setStart(block, 0);
    try {
        range.setEnd(node, selection.anchorOffset);
    } catch {
        return "";
    }
    // Zero-width spaces are Slate's placeholders inside empty leaves.
    const before = range.toString().replace(/​/g, "");
    const match = /@([^\s@]*)$/.exec(before);
    return match ? match[1] : "";
}

// The hit's own name: the first line of its item (a molecule or batch row
// adds its synonyms on a second line).
function itemName(child) {
    const item = child.matches(ITEM) ? child : child.querySelector(ITEM);
    if (!item) return "";
    return item.innerText.trim().split("\n")[0].trim();
}

// Highlight only once per dropdown and query, so it never fights the mouse.
const highlighted = new WeakMap();  // dropdown -> query it was done for

function rankDropdown(dropdown) {
    const query = currentQuery().toLowerCase();
    let exact = null;

    for (const child of dropdown.children) {
        const name = itemName(child).toLowerCase();
        let order = "";
        if (query && name) {
            if (name === query) {
                order = String(EXACT);
                exact = exact || child;
            } else if (name.startsWith(query)) {
                order = String(PREFIX);
            }
        }
        if (child.style.order !== order) child.style.order = order;
    }

    if (!exact || highlighted.get(dropdown) === query) return;
    highlighted.set(dropdown, query);
    dropdown.scrollTop = 0;
    const inner = exact.querySelector(ITEM_INNER);
    if (inner) inner.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, view: window }));
}

function rankAll() {
    for (const dropdown of document.querySelectorAll(DROPDOWN)) {
        if (dropdown.getBoundingClientRect().width > 0) rankDropdown(dropdown);
    }
}

export function initLinkSearchRank() {
    watchDocument(rankAll);
}
