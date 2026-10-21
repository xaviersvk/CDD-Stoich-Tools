// content/features/ui-fixes/batch-link-synonyms.js
//
// A field that links to a batch (e.g. "Vector CDD ID", or a run's "Probe")
// shows only the linked batch's name: "NUC-0000131-001". Which vector that is
// lives on the other molecule's page, often in another vault. This prints the
// linked molecule's synonyms after the link:
//
//     NUC-0000131-001 (hA3A_E72A_FL_in_pSqrl004, hA3A_E72A_BactOpt_in_pSqrl004)
//
// Three places, two shapes:
//   - molecule page, batch fields, and protocol page, Runs table: the <a>
//     carries the molecule's URL;
//   - run page, Details: the <a> has no href at all, only the batch id, which
//     the page-world bridge (inject/hooks/batch-link-id-bridge.js) stamps on
//     it. `/vaults/<vault>/batches/<id>` redirects to the molecule's page —
//     in whatever vault it lives — so a HEAD request yields the molecule.
//
// One page read per linked molecule (api/molecule-synonyms.js), shared with
// everything else that asks for synonyms. A molecule with none, or whose page
// will not load, gets nothing added.

import { watchDocument } from "../../utils/dom.js";
import { loadSynonyms } from "../../api/molecule-synonyms.js";

const LINK_SELECTOR = [
    'td[data-field-id] a[href*="#molecule-batches/"]',
    'td[data-column-id^="run_fields."] a[href*="#molecule-batches/"]',
    "a[data-cdd-batch-link-id]",
].join(", ");
const MOLECULE_PATTERN = /\/vaults\/(\d+)\/molecules\/(\d+)/;
const SUFFIX_CLASS = "cdd-batch-link-synonyms";

// batch id -> Promise<{ vaultId, moleculeId } | null>
const moleculeByBatch = new Map();

function currentVaultId() {
    return /\/vaults\/(\d+)/.exec(location.pathname)?.[1] ?? null;
}

function moleculeOfBatch(batchId) {
    let pending = moleculeByBatch.get(batchId);
    if (!pending) {
        const vaultId = currentVaultId();
        pending = vaultId
            ? fetch(`/vaults/${vaultId}/batches/${batchId}`, { method: "HEAD", credentials: "include" })
                .then((res) => {
                    const match = res.ok ? MOLECULE_PATTERN.exec(res.url) : null;
                    return match ? { vaultId: match[1], moleculeId: match[2] } : null;
                })
                .catch(() => null)
            : Promise.resolve(null);
        moleculeByBatch.set(batchId, pending);
    }
    return pending;
}

async function moleculeOfLink(link) {
    const match = MOLECULE_PATTERN.exec(link.getAttribute("href") || "");
    if (match) return { vaultId: match[1], moleculeId: match[2] };
    const batchId = link.getAttribute("data-cdd-batch-link-id");
    return batchId ? moleculeOfBatch(batchId) : null;
}

function hasSuffix(link) {
    return link.nextElementSibling?.classList.contains(SUFFIX_CLASS) ?? false;
}

function addSuffix(link, synonyms) {
    if (!synonyms.length || !link.isConnected || hasSuffix(link)) return;
    const span = document.createElement("span");
    span.className = SUFFIX_CLASS;
    span.textContent = ` (${synonyms.join(", ")})`;
    link.after(span);
}

function check() {
    for (const link of document.querySelectorAll(LINK_SELECTOR)) {
        if (hasSuffix(link)) continue;
        // Both lookups are cached after the first answer, and a failing
        // molecule page is asked for a bounded number of times — safe to call
        // on every scan.
        moleculeOfLink(link)
            .then((molecule) => molecule && loadSynonyms(molecule.vaultId, molecule.moleculeId))
            .then((synonyms) => synonyms && addSuffix(link, synonyms))
            .catch(() => {});
    }
}

export function initBatchLinkSynonyms() {
    watchDocument(check, { attributes: true, attributeFilter: ["data-cdd-batch-link-id"] });
    check();
}
