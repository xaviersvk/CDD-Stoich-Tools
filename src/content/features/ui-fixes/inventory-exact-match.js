// content/features/ui-fixes/inventory-exact-match.js
//
// Inventory → search. CDD's keyword search splits "SM000008" into "SM" and
// "000008", and "SM" is in every sample name — so it returns all 46 samples
// of the test vault, sorted by Name, 30 to a page. The sample actually
// asked for landed 15th, and for another query could sit on page 2.
//
// The same endpoint matches a phrase exactly when it is quoted:
// {"text":"\"SM000008\""} returns that one sample. So on every search the
// extension asks again with the text in quotes and shows those hits in an
// "Exact" block above CDD's results, which it labels "Similar". Read-only:
// one extra POST to the search CDD itself uses, nothing clicked or written.
//
// The quoted search matches in any field, not only the name, so each row
// also shows the matched text, taken from the server's own `highlights`.
//
// Skipped when the text already has quotes or a `*` wildcard — then the
// chemist is steering the search themselves.

import { watchDocument } from "../../utils/dom.js";

const SEARCH_INPUT = "input.search-bar__input";
const SUBMIT_BUTTON = 'button[aria-label="Submit search"]';
const SUMMARY = ".search-bar__entries_summary";
const BLOCK_ID = "cdd-stoich-exact-match";
const STYLE_ID = "cdd-stoich-exact-match-style";
const MAX_ROWS = 10;

const STYLES = `
  #${BLOCK_ID} {
    margin: 0 0 12px;
    font-size: 13px;
  }
  #${BLOCK_ID} .cdd-exact__head {
    font-weight: 700;
    margin: 0 0 6px;
  }
  #${BLOCK_ID} .cdd-exact__list {
    border: 1px solid #cfdbe8;
    border-radius: 6px;
    background: #f5f9fd;
  }
  #${BLOCK_ID} .cdd-exact__row {
    display: flex;
    gap: 16px;
    align-items: baseline;
    padding: 6px 10px;
  }
  #${BLOCK_ID} .cdd-exact__row + .cdd-exact__row {
    border-top: 1px solid #e1e8f0;
  }
  #${BLOCK_ID} .cdd-exact__name {
    font-weight: 700;
    min-width: 260px;
  }
  #${BLOCK_ID} .cdd-exact__match {
    color: #475467;
  }
  #${BLOCK_ID} .cdd-exact__match em {
    font-style: normal;
    font-weight: 700;
    color: #101828;
  }
  #${BLOCK_ID} .cdd-exact__depleted {
    font-weight: 700;
    color: #b42318;
  }
  #${BLOCK_ID} .cdd-exact__similar {
    font-weight: 700;
    margin: 14px 0 0;
  }
`;

function vaultId() {
    return /\/vaults\/(\d+)\/inventory_search/.exec(location.pathname)?.[1] || null;
}

function shouldAsk(text) {
    return text !== "" && !/["*]/.test(text);
}

async function fetchExact(vault, text) {
    const token = document.querySelector('meta[name="csrf-token"]')?.content || "";
    const response = await fetch(`/vaults/${vault}/inventory_search.json`, {
        method: "POST",
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "X-CSRF-Token": token,
        },
        body: JSON.stringify({ text: `"${text}"`, page: 0 }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return {
        total: data.total_count ?? 0,
        entries: Array.isArray(data.inventory_entries) ? data.inventory_entries : [],
    };
}

function sampleUrl(vault, entry) {
    const molecule = entry.batch?.molecule_id;
    return molecule
        ? `/vaults/${vault}/molecules/${molecule}#molecule-inventory_samples/${entry.id}`
        : null;
}

// The first highlighted fragment from any field, as plain text with the
// matched part kept apart: [before, matched, after]. Built with textContent
// only — the server's fragment is HTML and is never inserted as such.
function matchedFragment(entry) {
    for (const group of [entry.highlights, entry.batch_highlights, entry.molecule_highlights]) {
        if (!group || typeof group !== "object") continue;
        for (const value of Object.values(group)) {
            const fragment = value?.fragments?.flat?.()[0];
            if (typeof fragment !== "string") continue;
            const match = /^(.*?)<em>(.*?)<\/em>(.*)$/s.exec(fragment);
            if (match) return match.slice(1).map((part) => part.replace(/<[^>]*>/g, ""));
        }
    }
    return null;
}

function matchCell(entry) {
    const parts = matchedFragment(entry);
    if (!parts) return null;
    const span = document.createElement("span");
    span.className = "cdd-exact__match";
    const em = document.createElement("em");
    em.textContent = parts[1];
    span.append(parts[0], em, parts[2]);
    return span;
}

function cell(className, text) {
    const span = document.createElement("span");
    span.className = className;
    span.textContent = text;
    return span;
}

function buildBlock(vault, result) {
    const block = document.createElement("div");
    block.id = BLOCK_ID;

    const head = document.createElement("p");
    head.className = "cdd-exact__head";
    head.textContent = `Exact (${result.total})`;
    block.appendChild(head);

    const list = document.createElement("div");
    list.className = "cdd-exact__list";
    for (const entry of result.entries.slice(0, MAX_ROWS)) {
        const row = document.createElement("div");
        row.className = "cdd-exact__row";

        const url = sampleUrl(vault, entry);
        const name = document.createElement(url ? "a" : "span");
        name.className = "cdd-exact__name";
        name.textContent = entry.name || entry.sample_identifier || String(entry.id);
        if (url) name.href = url;
        row.appendChild(name);

        const match = matchCell(entry);
        if (match) row.appendChild(match);
        if (entry.location?.value) row.appendChild(cell("cdd-exact__location", entry.location.value));
        if (entry.current_amount != null) {
            row.appendChild(cell("cdd-exact__amount", `${entry.current_amount} ${entry.units || ""}`.trim()));
        }
        if (entry.depleted) row.appendChild(cell("cdd-exact__depleted", "Depleted"));
        list.appendChild(row);
    }
    block.appendChild(list);

    if (result.total > MAX_ROWS) {
        block.appendChild(cell("cdd-exact__more", `…and ${result.total - MAX_ROWS} more below.`));
    }

    const similar = document.createElement("p");
    similar.className = "cdd-exact__similar";
    similar.textContent = "Similar";
    block.appendChild(similar);
    return block;
}

// The last answer, kept so a React re-render that drops the block can have
// it put back without asking the server again.
let current = { text: null, block: null };
let requestSeq = 0;

function place() {
    const summary = document.querySelector(SUMMARY);
    const existing = document.getElementById(BLOCK_ID);
    if (!current.block) {
        existing?.remove();
        return;
    }
    if (!summary) return;
    if (existing === current.block && existing.nextElementSibling === summary) return;
    summary.parentElement.insertBefore(current.block, summary);
}

async function search() {
    const vault = vaultId();
    if (vault) startWatching();
    const input = document.querySelector(SEARCH_INPUT);
    if (!vault || !input) return;
    const text = input.value.trim();
    if (text === current.text) return;

    const seq = ++requestSeq;
    current = { text, block: null };
    place();
    if (!shouldAsk(text)) return;

    let result;
    try {
        result = await fetchExact(vault, text);
    } catch {
        return;  // CDD's own results stand
    }
    if (seq !== requestSeq || !result.entries.length) return;
    current = { text, block: buildBlock(vault, result) };
    place();
}

function onKeyDown(event) {
    if (event.key === "Enter" && event.target?.matches?.(SEARCH_INPUT)) search();
}

function onClick(event) {
    if (event.target?.closest?.(SUBMIT_BUTTON)) search();
}

function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = STYLES;
    (document.head || document.documentElement).appendChild(style);
}

// Re-inserts the block after CDD re-renders the search bar, and picks up a
// query already in the box when the page renders. Started only on the
// inventory search page — possibly reached by in-app navigation.
let watching = false;

function startWatching() {
    if (watching) return;
    watching = true;
    ensureStyle();
    watchDocument(() => {
        if (!vaultId()) return;
        if (current.text === null && document.querySelector(SEARCH_INPUT)?.value.trim()) search();
        place();
    });
}

export function initInventoryExactMatch() {
    // Cheap on every page: both bail out unless the target is the search bar.
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("click", onClick, true);
    if (vaultId()) startWatching();
}
