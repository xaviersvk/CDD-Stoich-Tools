// content/features/ui-fixes/batch-link-synonyms.js
//
// A batch field that links to another batch (e.g. "Vector CDD ID") shows only
// the linked batch's name: "NUC-0000131-001". Which vector that is lives on
// the other molecule's page, often in another vault. This prints the linked
// molecule's synonyms after the link:
//
//     NUC-0000131-001 (hA3A_E72A_FL_in_pSqrl004, hA3A_E72A_BactOpt_in_pSqrl004)
//
// One page read per linked molecule (api/molecule-synonyms.js), shared with
// everything else that asks for synonyms. A molecule with none, or whose page
// will not load, gets nothing added.

import { watchDocument } from "../../utils/dom.js";
import { loadSynonyms } from "../../api/molecule-synonyms.js";

// Batch fields render as <td data-field-id="…"><a href="…">NAME</a></td>.
const LINK_SELECTOR = 'td[data-field-id] a[href*="#molecule-batches/"]';
const LINK_PATTERN = /\/vaults\/(\d+)\/molecules\/(\d+)#molecule-batches\/\d+/;
const SUFFIX_CLASS = "cdd-batch-link-synonyms";

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
        const match = LINK_PATTERN.exec(link.getAttribute("href") || "");
        if (!match) continue;
        const [, vaultId, moleculeId] = match;
        // Cached after the first answer, and a failure is asked for a bounded
        // number of times — safe to call on every scan.
        loadSynonyms(vaultId, moleculeId)
            .then((synonyms) => addSuffix(link, synonyms))
            .catch(() => {});
    }
}

export function initBatchLinkSynonyms() {
    watchDocument(check);
    check();
}
