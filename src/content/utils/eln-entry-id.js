// content/utils/eln-entry-id.js
//
// The human-facing ID of the ELN entry on screen -- "IDEMO-MDX-0014", the one
// printed next to the entry title, NOT the numeric id in the URL.
//
// Read by the tab-title feature (eln-title.js) and by the ELN -> registration
// carry-over (ui-fixes/eln-id-to-registration.js); one reader so the two can
// never disagree about what "the entry ID" means.

import { cleanElnEntryId } from "../../shared/eln-id-carry.js";

// CDD's own test hook, and by far the cheapest way in:
//   <span data-autotest-id="entry-identifier">ID: IDEMO-MDX-0014</span>
const IDENTIFIER_SELECTOR = '[data-autotest-id="entry-identifier"]';

export function readElnEntryId() {
    const tagged = document.querySelector(IDENTIFIER_SELECTOR);
    if (tagged) {
        const id = cleanElnEntryId(tagged.textContent);
        if (id) return id;
    }

    // Fallback for a build that drops the autotest hook: the first leaf-ish
    // element whose whole text is "ID: <something>". Deliberately last -- it
    // walks the document, the selector above does not.
    const scanned = [...document.querySelectorAll("div, span")].find(
        (el) => el.children.length === 0 && /^\s*ID\s*:\s*\S/i.test(el.textContent || "")
    );

    if (!scanned) return null;

    return cleanElnEntryId(scanned.textContent) || null;
}
