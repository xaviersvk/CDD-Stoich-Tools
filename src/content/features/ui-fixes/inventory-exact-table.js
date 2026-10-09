// content/features/ui-fixes/inventory-exact-table.js
//
// Inventory → search, the second half of inject/hooks/inventory-exact-first.js.
// That hook answers CDD's search with the exact hits first and names them in
// `data-cdd-exact` on <html>. Here those rows are also shown apart: an
// "Exact" table above CDD's results — same header, same columns, same
// widths — and CDD's own table below, labelled "Similar". The exact rows
// stay in CDD's table too (first, by the hook): the Exact table is there to
// see them first, everything else is done below.
//
// The Exact table is a copy of what CDD rendered (header and rows,
// structure drawing included), so it looks exactly the same — but it is
// view-only: no checkbox, expand arrow or action works in it, and Export
// covers CDD's table below. The sample name links to the sample.

import { watchDocument } from "../../utils/dom.js";

const EXACT_ATTR = "data-cdd-exact";
const TABLE = ".InventorySearchTable table";
const SUMMARY = ".search-bar__entries_summary";
const BLOCK_ID = "cdd-stoich-exact-table";
const STYLE_ID = "cdd-stoich-exact-table-style";

const STYLES = `
  #${BLOCK_ID} { margin: 0 0 12px; }
  #${BLOCK_ID} .cdd-exact__head,
  #${BLOCK_ID} .cdd-exact__similar {
    font-size: 13px;
    font-weight: 700;
  }
  #${BLOCK_ID} .cdd-exact__head { margin: 0 0 6px; }
  #${BLOCK_ID} .cdd-exact__similar { margin: 14px 0 0; }
  #${BLOCK_ID} .cdd-exact__note {
    font-weight: 400;
    color: #667085;
    margin-left: 8px;
  }
  /* View-only: nothing in the copy reacts, except the sample link. */
  #${BLOCK_ID} table { pointer-events: none; }
  #${BLOCK_ID} a.cdd-exact__link { pointer-events: auto; }
  #${BLOCK_ID} .selection-column > *,
  #${BLOCK_ID} td:nth-child(2) > button { visibility: hidden; }
`;

function exactHits() {
    const raw = document.documentElement.getAttribute(EXACT_ATTR);
    if (!raw) return [];
    try {
        const hits = JSON.parse(raw);
        return Array.isArray(hits) ? hits.filter((h) => h?.name) : [];
    } catch {
        return [];
    }
}

// A sample's main row holds its name as the whole text of one element; the
// rows after it with class "child-row" are its collapsed event history.
function hitOf(row, wanted) {
    for (const el of row.querySelectorAll("a, button, span")) {
        if (el.children.length) continue;
        const hit = wanted.get(el.textContent.trim());
        if (hit) return hit;
    }
    return null;
}

function rowsOf(table, hits) {
    const wanted = new Map(hits.map((h) => [h.name, h]));
    const found = [];
    for (const row of table.querySelectorAll(":scope > tbody > tr")) {
        if (row.classList.contains("child-row")) continue;
        const hit = hitOf(row, wanted);
        if (hit) found.push({ row, hit });
    }
    return found;
}

function stripIds(node) {
    node.removeAttribute?.("id");
    for (const el of node.querySelectorAll?.("[id]") || []) el.removeAttribute("id");
    return node;
}

function linkName(clone, hit) {
    if (!hit.url) return;
    for (const el of clone.querySelectorAll("a, button, span")) {
        if (el.children.length || el.textContent.trim() !== hit.name) continue;
        const link = document.createElement("a");
        link.className = `${el.className || ""} cdd-exact__link`.trim();
        link.href = hit.url;
        link.textContent = hit.name;
        el.replaceWith(link);
        return;
    }
}

function buildBlock(table, found) {
    const block = document.createElement("div");
    block.id = BLOCK_ID;

    const head = document.createElement("p");
    head.className = "cdd-exact__head";
    head.textContent = "Exact";
    const note = document.createElement("span");
    note.className = "cdd-exact__note";
    note.textContent = "view only — also in the table below, where Export works";
    head.appendChild(note);
    block.appendChild(head);

    const copy = stripIds(table.cloneNode(false));
    if (table.tHead) copy.appendChild(stripIds(table.tHead.cloneNode(true)));
    const body = document.createElement("tbody");
    for (const { row, hit } of found) {
        const clone = stripIds(row.cloneNode(true));
        linkName(clone, hit);
        body.appendChild(clone);
    }
    copy.appendChild(body);

    // Same widths as CDD's table: its layout is auto, so a lone row would
    // size the columns differently.
    copy.style.width = `${table.getBoundingClientRect().width}px`;
    const widths = [...(table.tHead?.rows[0]?.cells || [])].map((c) => c.getBoundingClientRect().width);
    [...(copy.tHead?.rows[0]?.cells || [])].forEach((cell, i) => {
        if (widths[i]) cell.style.width = cell.style.minWidth = `${widths[i]}px`;
    });
    block.appendChild(copy);

    const similar = document.createElement("p");
    similar.className = "cdd-exact__similar";
    similar.textContent = "Similar";
    block.appendChild(similar);
    return block;
}

let lastSignature = "";

function sync() {
    if (!/\/inventory_search/.test(location.pathname)) return;
    const table = document.querySelector(TABLE);
    const summary = document.querySelector(SUMMARY);
    const hits = exactHits();
    const found = table && hits.length ? rowsOf(table, hits) : [];

    if (!found.length || !summary) {
        document.getElementById(BLOCK_ID)?.remove();
        lastSignature = "";
        return;
    }

    // Rebuilt only when the rows CDD rendered change (a structure drawing
    // arriving, a new search) — not on every unrelated mutation.
    const signature = found.map(({ row }) => row.outerHTML).join("\n");
    const existing = document.getElementById(BLOCK_ID);
    if (signature !== lastSignature || !existing) {
        const block = buildBlock(table, found);
        if (existing) existing.replaceWith(block);
        else summary.parentElement.insertBefore(block, summary);
        lastSignature = signature;
    } else if (existing.nextElementSibling !== summary) {
        summary.parentElement.insertBefore(existing, summary);
    }
}

function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = STYLES;
    (document.head || document.documentElement).appendChild(style);
}

export function initInventoryExactTable() {
    ensureStyle();
    // The hook's attribute changes on <html> itself; the table renders below.
    watchDocument(sync, { attributes: true, attributeFilter: [EXACT_ATTR] });
    sync();
}
