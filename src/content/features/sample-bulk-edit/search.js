// content/features/sample-bulk-edit/search.js
//
// Inventory search → "Bulk edit fields", next to CDD's "Bulk Update". It
// works on the rows ticked in CDD's own table, as Bulk Update does.
//
// The table shows names, not ids. The ids come from the search response
// itself — POST /vaults/<v>/inventory_search.json → { inventory_entries:
// [{ id, name, batch: { molecule_id } }] } — which inject/main.js already
// forwards as MOLECULE_SEARCH (noteInventorySearch). A ticked row is matched
// to its entry by the sample name in one of its cells, so the column order
// does not matter.
//
// The dialog then loads each molecule's samples (the full records a write
// needs) and keeps the ticked ones.
//
// Page DOM (CDD, verified 2026-10-29):
//   button "Bulk Update"                         MUI text button, above the table
//   tr > td.selection-column input[aria-label="Select sample"]

import { el, fetchMoleculeSamples, openBulkEditDialog } from "./dialog.js";

const BUTTON_CLASS = "cdd-sbe-search";
const SEARCH_PATH = /^\/vaults\/(\d+)\/inventory_search/;
const PARALLEL = 4;

// sample name → { id, moleculeId }, from every search response this page saw.
const entries = new Map();
let listening = false;

export function noteInventorySearch(body) {
    const list = Array.isArray(body?.inventory_entries) ? body.inventory_entries : [];
    for (const entry of list) {
        const moleculeId = entry?.batch?.molecule_id ?? entry?.molecule_id;
        if (entry?.id == null || !entry.name || moleculeId == null) continue;
        entries.set(String(entry.name).trim(), { id: entry.id, moleculeId: String(moleculeId) });
    }
}

// → { picked: [{ id, moleculeId }], unknown: number }
function tickedSamples() {
    const picked = [];
    let unknown = 0;
    for (const box of document.querySelectorAll('tr input[aria-label="Select sample"]:checked')) {
        const row = box.closest("tr");
        const hit = Array.from(row?.cells || [])
            .map((cell) => entries.get((cell.textContent || "").trim()))
            .find(Boolean);
        if (hit) picked.push(hit);
        else unknown += 1;
    }
    return { picked, unknown };
}

async function loadPicked(vaultId, picked) {
    const wanted = new Set(picked.map((p) => p.id));
    const molecules = [...new Set(picked.map((p) => p.moleculeId))];
    const found = [];
    for (let i = 0; i < molecules.length; i += PARALLEL) {
        const batch = await Promise.all(molecules.slice(i, i + PARALLEL)
            .map((moleculeId) => fetchMoleculeSamples(vaultId, moleculeId)));
        for (const samples of batch) found.push(...samples.filter((s) => wanted.has(s.id)));
    }
    return found;
}

function refresh(button) {
    const { picked, unknown } = tickedSamples();
    const disabled = picked.length === 0;
    button.disabled = disabled;
    button.classList.toggle("Mui-disabled", disabled);
    button.title = unknown
        ? `${unknown} ticked sample${unknown === 1 ? "" : "s"} not recognised — run the search again`
        : "Set one sample field on the ticked samples";
}

export function addSearchButton() {
    const match = location.pathname.match(SEARCH_PATH);
    if (!match) return;
    const bulk = Array.from(document.querySelectorAll("button"))
        .find((b) => (b.textContent || "").trim() === "Bulk Update");
    if (!bulk) return;

    let button = bulk.parentElement?.querySelector(`.${BUTTON_CLASS}`);
    if (!button) {
        button = el("button", { type: "button", className: `${bulk.className} ${BUTTON_CLASS}`, text: "Bulk edit fields" });
        button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            const vaultId = location.pathname.match(SEARCH_PATH)?.[1];
            const { picked } = tickedSamples();
            if (!vaultId || !picked.length) return;
            void openBulkEditDialog({
                vaultId,
                load: () => loadPicked(vaultId, picked),
                preselect: true,
                emptyText: "None of the ticked samples could be loaded.",
                reloadOnClose: false,
            });
        });
        bulk.after(button);
    }
    if (!listening) {
        // A tick may change nothing in the DOM tree the observer watches.
        listening = true;
        document.addEventListener("change", (event) => {
            if (!event.target?.matches?.('input[type="checkbox"]')) return;
            const current = document.querySelector(`.${BUTTON_CLASS}`);
            if (current) refresh(current);
        }, true);
    }
    refresh(button);
}
