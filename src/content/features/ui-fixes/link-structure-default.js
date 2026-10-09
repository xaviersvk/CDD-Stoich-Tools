// content/features/ui-fixes/link-structure-default.js
//
// CDD's link popup (toolbar → Insert link, then pick an entity) offers
// Display Options with an "Include structure" checkbox that starts ticked,
// so every inserted link drops a structure drawing into the entry unless
// it is unticked by hand. This unticks it once, as it appears; ticking it
// again is respected for the rest of that popup.
//
//   [data-autotest-id="display-options"]
//     [data-autotest-id="show-structure-checkbox"]
//       input[type="checkbox"][data-autotest-id="checkbox"]
//
// A plain .click() is enough: CDD's React state follows it (measured live,
// the box re-renders unticked).

import { watchDocument } from "../../utils/dom.js";

const STRUCTURE_BOX =
    '[data-autotest-id="show-structure-checkbox"] input[type="checkbox"]';

// One untick per checkbox element: a box CDD rebuilds is a new element and
// starts ticked again; the same element ticked by the user stays ticked.
const handled = new WeakSet();

function untickStructure() {
    const box = document.querySelector(STRUCTURE_BOX);
    if (!box || handled.has(box)) return;
    handled.add(box);
    if (box.checked) box.click();
}

export function initLinkStructureDefault() {
    watchDocument(untickStructure);
    untickStructure();
}
