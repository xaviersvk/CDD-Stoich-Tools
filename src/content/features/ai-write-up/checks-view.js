// content/features/ai-write-up/checks-view.js
//
// The Checks list — Polish entry's Checks card and the Checks under every
// dictation / selection card draw it the same way.
//
// One bullet per finding, most important first. The dot's colour says how
// much it matters — the text stays one colour:
//   fix   (red)   text and table disagree in the numbers
//   add   (amber) something to fill in or mention
//   note  (blue)  advice, a calculated value nobody stated

import { unfilledPlaceholders } from "./mentions.js";

const SEVERITY_ORDER = { fix: 0, add: 1, note: 2 };

/**
 * [severity, ...parts]; a part is a string, or [string] for bold.
 * `quiet` (a card): no "no table" / "checks unavailable" lines — a card
 * that has nothing to report says nothing.
 */
function checkItems({ checks, hasTable, segments }, { quiet }) {
    const items = unfilledPlaceholders(segments).map((what) => ["add", "Fill in the ", [what]]);
    if (!hasTable) {
        if (!quiet) items.push(["note", "No stoichiometry table in this entry — text polished only."]);
    } else if (checks == null) {
        if (!quiet) items.push(["note", "Checks unavailable — the answer had no readable data. Polish again."]);
    } else {
        for (const c of checks) {
            if (c.kind === "mismatch") items.push(["fix", [c.label], ` text ${c.text} · table ${c.table}`]);
            else if (c.kind === "yield" && c.text != null) items.push(["fix", [c.label], ` text ${c.text} · calculated ${c.table}`]);
            else if (c.kind === "yield") items.push(["note", [c.label], ` calculated ${c.table} — add it to the text`]);
            else if (c.kind === "missing") items.push(["add", "Mention ", [c.label], " in the text"]);
            else if (c.kind === "note") items.push(["note", c.message]);
        }
    }
    if (!quiet && !items.length && hasTable && checks != null) items.push(["note", "Text and table agree."]);
    // Stable: within a severity the order stays as found.
    return items.sort((a, b) => SEVERITY_ORDER[a[0]] - SEVERITY_ORDER[b[0]]);
}

/** The list for `result` ({ checks, hasTable, segments }), or null when it is empty. */
export function checksList(result, { quiet = false } = {}) {
    const items = checkItems(result, { quiet });
    if (!items.length) return null;
    const list = document.createElement("ul");
    list.className = "cdd-wu-checks";
    for (const [severity, ...parts] of items) {
        const item = document.createElement("li");
        item.className = `cdd-wu-checks__item cdd-wu-checks__item--${severity}`;
        for (const part of parts) {
            if (Array.isArray(part)) {
                const strong = document.createElement("strong");
                strong.textContent = part[0];
                item.append(strong);
            } else {
                item.append(document.createTextNode(part));
            }
        }
        list.append(item);
    }
    return list;
}
