// content/features/phrases/panel-tab.js
//
// The "Phrases" tab of the floating panel: saved phrases grouped by
// category (a phrase in several categories shows under each). A click copies the phrase (HTML + text) to the
// clipboard and counts as a use, which is what keeps it from being the one
// evicted when the cap is hit.
//
// ☆ on a row pins the phrase: it is listed again in a "★ Pinned" group at the
// top, and is never the one dropped at the cap. Pinning is not a use.
//
// Management (rename, re-file, delete, export/import) lives in Settings.

import {
    groupPhrases,
    loadPhrases,
    onPhrasesChanged,
    touchPhrase,
    updatePhrase,
    PHRASE_LIMIT,
} from "../../../shared/phrases.js";
import { copyRichText } from "../../utils/clipboard.js";

const OPEN_STATE_KEY = "cdd-stoich-phrase-groups";
// The Pinned group's key in the open/closed map. The control character keeps
// it clear of any category a user could type.
const PINNED_KEY = "\u0001pinned";

let container = null;
let listEl = null;
let filterInput = null;
let phrases = [];
let subscribed = false;

function loadClosed() {
    try {
        const parsed = JSON.parse(localStorage.getItem(OPEN_STATE_KEY) || "{}");
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

function saveClosed(map) {
    try {
        localStorage.setItem(OPEN_STATE_KEY, JSON.stringify(map));
    } catch {
        /* not worth breaking the panel over */
    }
}

function matches(phrase, needle) {
    if (!needle) return true;
    const hay = (phrase.name + " " + phrase.categories.join(" ") + " " + phrase.text).toLowerCase();
    return hay.includes(needle);
}

function buildPinButton(phrase) {
    const pin = document.createElement("button");
    pin.type = "button";
    pin.className = "cdd-phrase-pin";
    pin.classList.toggle("cdd-phrase-pin--on", phrase.pinned);
    pin.textContent = phrase.pinned ? "★" : "☆";
    pin.title = phrase.pinned
        ? "Unpin"
        : "Pin to the top — a pinned phrase is never dropped at the limit";
    pin.setAttribute("aria-label", `${phrase.pinned ? "Unpin" : "Pin"} phrase ${phrase.name}`);
    pin.setAttribute("aria-pressed", String(phrase.pinned));
    pin.addEventListener("click", (event) => {
        event.stopPropagation();
        // The list redraws from the storage change.
        void updatePhrase(phrase.id, { pinned: !phrase.pinned });
    });
    return pin;
}

function buildPhraseRow(phrase) {
    const wrap = document.createElement("div");
    wrap.className = "cdd-phrase-row";

    const row = document.createElement("button");
    row.type = "button";
    row.className = "cdd-phrase-item";
    const preview = phrase.text.replace(/\s+/g, " ").trim();
    row.title = preview.length > 300 ? `${preview.slice(0, 300)}…` : preview;

    const name = document.createElement("span");
    name.className = "cdd-phrase-item__name";
    name.textContent = phrase.name;

    const hint = document.createElement("span");
    hint.className = "cdd-phrase-item__hint";
    hint.textContent = "copy";

    row.append(name, hint);
    row.addEventListener("click", async (event) => {
        event.stopPropagation();
        const ok = await copyRichText(phrase.html, phrase.text);
        hint.textContent = ok ? "✓ copied" : "✗ failed";
        row.classList.toggle("cdd-phrase-item--done", ok);
        setTimeout(() => {
            hint.textContent = "copy";
            row.classList.remove("cdd-phrase-item--done");
        }, 900);
        // Deliberately not awaited: the copy has already happened and the row
        // has already said so. This only refreshes the LRU stamp that decides
        // which phrase is dropped at the cap, and nothing on screen waits for
        // it.
        if (ok) void touchPhrase(phrase.id);
    });

    wrap.append(row, buildPinButton(phrase));
    return wrap;
}

function buildGroup(key, label, level, children, closedMap) {
    const group = document.createElement("details");
    group.className = `cdd-phrase-group cdd-phrase-group--${level}`;
    group.open = !closedMap[key];
    group.addEventListener("toggle", () => {
        const map = loadClosed();
        if (group.open) delete map[key];
        else map[key] = 1;
        saveClosed(map);
    });

    const summary = document.createElement("summary");
    summary.textContent = label;
    const count = document.createElement("span");
    count.className = "cdd-phrase-group__count";
    count.textContent = String(children.count);
    summary.appendChild(count);

    group.append(summary, ...children.nodes);
    return group;
}

function render() {
    if (!listEl) return;
    listEl.replaceChildren();

    const needle = (filterInput?.value || "").trim().toLowerCase();
    const visible = phrases.filter((p) => matches(p, needle));

    if (!phrases.length) {
        const empty = document.createElement("div");
        empty.className = "cdd-phrase-empty";
        empty.textContent = "No phrases yet. Select some text in the entry and click “Save phrase”.";
        listEl.appendChild(empty);
        return;
    }
    if (!visible.length) {
        const empty = document.createElement("div");
        empty.className = "cdd-phrase-empty";
        empty.textContent = "Nothing matches.";
        listEl.appendChild(empty);
        return;
    }

    const closedMap = needle ? {} : loadClosed();

    // Pinned first, in a group of their own. They stay under their categories
    // too — pinning is a shortcut, not a move.
    const pinned = visible
        .filter((p) => p.pinned)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    if (pinned.length) {
        const rows = pinned.map(buildPhraseRow);
        listEl.appendChild(
            buildGroup(PINNED_KEY, "★ Pinned", "cat", { nodes: rows, count: rows.length }, closedMap)
        );
    }

    for (const group of groupPhrases(visible)) {
        const rows = group.phrases.map(buildPhraseRow);
        if (!group.category) {
            // Uncategorised phrases sit at the top level, after the groups.
            listEl.append(...rows);
            continue;
        }
        listEl.appendChild(
            buildGroup(group.category, group.category, "cat", { nodes: rows, count: rows.length }, closedMap)
        );
    }
}

async function refresh() {
    phrases = await loadPhrases();
    render();
}

// Build the tab's contents into `pane` (idempotent for the same pane).
export function mountPhrasesPane(pane) {
    if (container === pane && listEl?.isConnected) return;
    container = pane;
    pane.replaceChildren();

    const toolbar = document.createElement("div");
    toolbar.className = "cdd-phrase-toolbar";

    filterInput = document.createElement("input");
    filterInput.type = "search";
    filterInput.placeholder = "Filter phrases…";
    filterInput.className = "cdd-phrase-filter";
    filterInput.addEventListener("input", render);
    filterInput.addEventListener("mousedown", (event) => event.stopPropagation());

    const hint = document.createElement("div");
    hint.className = "cdd-phrase-hint";
    hint.textContent = `Click a phrase to copy it, then paste into the entry. ☆ pins it to the top. Up to ${PHRASE_LIMIT}; manage them in Settings.`;

    toolbar.append(filterInput);
    listEl = document.createElement("div");
    listEl.className = "cdd-phrase-list";

    pane.append(toolbar, hint, listEl);

    if (!subscribed) {
        subscribed = true;
        onPhrasesChanged((next) => {
            phrases = next;
            render();
        });
    }
    void refresh();   // first paint; later ones come from onPhrasesChanged
}

export const PHRASES_PANE_STYLES = (panelId) => `
  #${panelId} .cdd-phrase-toolbar { margin-bottom: 6px; }
  #${panelId} .cdd-phrase-filter {
    width: 100%;
    box-sizing: border-box;
    font: 12px Arial, sans-serif;
    color: #f9fafb;
    background: #0b1220;
    border: 1px solid #374151;
    border-radius: 6px;
    padding: 5px 7px;
  }
  #${panelId} .cdd-phrase-hint { font-size: 11px; color: #94a3b8; margin-bottom: 8px; }
  #${panelId} .cdd-phrase-list { display: flex; flex-direction: column; gap: 4px; }
  #${panelId} .cdd-phrase-empty { font-size: 12px; color: #cbd5e1; padding: 6px 2px; }
  #${panelId} .cdd-phrase-group {
    border: 1px solid #374151;
    border-radius: 8px;
    background: #0b1220;
    padding: 0 0 4px;
  }
  #${panelId} .cdd-phrase-group--sub { margin: 2px 6px; border-color: #1f2937; }
  #${panelId} .cdd-phrase-group > summary {
    cursor: pointer;
    padding: 6px 8px;
    font-size: 12px;
    font-weight: 700;
    list-style: none;
    display: flex;
    align-items: center;
    gap: 6px;
    user-select: none;
  }
  #${panelId} .cdd-phrase-group > summary::before { content: "▸"; font-size: 10px; color: #94a3b8; }
  #${panelId} .cdd-phrase-group[open] > summary::before { content: "▾"; }
  #${panelId} .cdd-phrase-group--sub > summary { font-weight: 600; color: #cbd5e1; }
  #${panelId} .cdd-phrase-group__count {
    margin-left: auto;
    font-size: 10px;
    font-weight: 500;
    color: #94a3b8;
  }
  #${panelId} .cdd-phrase-row {
    display: flex;
    align-items: stretch;
    gap: 2px;
    width: calc(100% - 12px);
    margin: 0 6px;
  }
  #${panelId} .cdd-phrase-item {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1 1 auto;
    min-width: 0;
    padding: 5px 8px;
    text-align: left;
    font: 12px Arial, sans-serif;
    color: #f9fafb;
    background: #111827;
    border: 1px solid #1f2937;
    border-radius: 6px;
    cursor: pointer;
  }
  #${panelId} .cdd-phrase-list > .cdd-phrase-row { width: 100%; margin: 0; }
  #${panelId} .cdd-phrase-pin {
    flex: 0 0 auto;
    width: 24px;
    padding: 0;
    font: 14px Arial, sans-serif;
    line-height: 1;
    color: #64748b;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
    cursor: pointer;
  }
  #${panelId} .cdd-phrase-pin:hover { color: #fbbf24; border-color: #4b5563; }
  #${panelId} .cdd-phrase-pin--on { color: #fbbf24; }
  #${panelId} .cdd-phrase-item:hover { background: #1f2937; border-color: #4b5563; }
  #${panelId} .cdd-phrase-item--done { background: rgba(52, 211, 153, 0.25); }
  #${panelId} .cdd-phrase-item__name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  #${panelId} .cdd-phrase-item__hint { flex: 0 0 auto; font-size: 10px; color: #94a3b8; }
`;
