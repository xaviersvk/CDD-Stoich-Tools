// content/features/sample-bulk-edit/init.js
//
// Bulk edit of sample fields, from two places:
//   - a molecule's Samples tab: a "Bulk edit" link next to CDD's "Create a
//     new sample", over that molecule's samples;
//   - Inventory search: a "Bulk edit fields" button next to CDD's "Bulk
//     Update" (which adds events, not sample fields), over the ticked rows
//     (search.js).
// Both open the same dialog (dialog.js).
//
// Page DOM (CDD, verified 2026-10-29):
//   div.editableData-editLink > a "Create a new sample"   on the Samples tab

import { watchDocument } from "../../utils/dom.js";
import { el, fetchMoleculeSamples, openBulkEditDialog } from "./dialog.js";
import { addSearchButton } from "./search.js";
import { injectBulkEditStyles } from "./styles.js";

const LINK_CLASS = "cdd-sbe-link";
const MOLECULE_PATH = /^\/vaults\/(\d+)\/molecules\/(\d+)/;

let started = false;

function addMoleculeLink() {
    if (!MOLECULE_PATH.test(location.pathname)) return;
    for (const box of document.querySelectorAll("div.editableData-editLink")) {
        const create = Array.from(box.querySelectorAll("a"))
            .find((a) => (a.textContent || "").trim() === "Create a new sample");
        if (!create || box.querySelector(`.${LINK_CLASS}`)) continue;

        const link = el("a", { href: "#", className: LINK_CLASS, title: "Set one field on many samples at once", text: "Bulk edit" });
        link.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            const now = location.pathname.match(MOLECULE_PATH);
            if (!now) return;
            const [, vaultId, moleculeId] = now;
            void openBulkEditDialog({
                vaultId,
                load: () => fetchMoleculeSamples(vaultId, moleculeId),
                emptyText: "This molecule has no samples.",
            });
        });
        create.after(link);
    }
}

export function initSampleBulkEdit() {
    if (started) return;
    started = true;
    injectBulkEditStyles();
    const schedule = watchDocument(() => {
        addMoleculeLink();
        addSearchButton();
    });
    schedule();
}
