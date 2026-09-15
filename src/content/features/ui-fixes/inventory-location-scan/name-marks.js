// content/features/ui-fixes/inventory-location-scan/name-marks.js
//
// Paints "this box's name is not unique" onto the rows CDD has rendered.
//
// Two attributes, both ones React never sets on these elements, so its
// re-renders leave them alone: `data-cdd-dup` on the <li> (the CSS hook) and
// `title` on the label (the tooltip naming the twins). A class on the label
// would not survive — React owns className there.

import { treeItems } from "./dialog-dom.js";

export const DUP_ATTR = "data-cdd-dup";

function labelOf(item) {
    return item.querySelector(":scope > .MuiTreeItem-content .MuiTreeItem-label");
}

export function markDuplicateNames(dialog, twinsById) {
    for (const item of treeItems(dialog)) {
        const paths = twinsById.get(String(item.dataset.nodeid));
        const label = labelOf(item);
        if (paths && paths.length) {
            item.setAttribute(DUP_ATTR, "");
            if (label) label.title = `Same name: ${paths.join("; ")}`;
        } else if (item.hasAttribute(DUP_ATTR)) {
            item.removeAttribute(DUP_ATTR);
            if (label) label.removeAttribute("title");
        }
    }
}
