// content/features/ui-fixes/inventory-location-scan/tree-copy-button.js
//
// "Copy tree" in the Edit Locations footer: the whole tree — collapsed
// branches included, plates left out — onto the clipboard as the lines Scan
// racks reads (tree-text.js). It only reads, so it is always there, with or
// without the Scan racks switch. Pasted into Scan racks in another vault, the
// text builds the same tree.

import { copyText } from "../../../utils/clipboard.js";
import { footerAnchor } from "./dialog-dom.js";
import { treeToLines } from "./tree-text.js";
import { readRawTree } from "./tree-source.js";

const BUTTON_CLASS = "cdd-tree-copy";
const LABEL = "Copy tree";
const FLASH_MS = 2500;

function plural(count, noun) {
    return `${count} ${noun}${count === 1 ? "" : (noun === "box" ? "es" : "s")}`;
}

async function copyTree(button) {
    button.disabled = true;
    let said;
    try {
        const nodes = await readRawTree();
        if (!nodes) said = "Could not read the tree";
        else {
            const { text, locations, boxes } = treeToLines(nodes);
            if (!text) said = "Nothing to copy";
            else if (await copyText(text)) said = `Copied ${plural(locations, "location")}, ${plural(boxes, "box")}`;
            else said = "Could not copy";
        }
    } catch (error) {
        console.warn("[CDD scan-racks] copy tree failed", error);
        said = "Could not copy";
    }
    button.textContent = said;
    setTimeout(() => {
        button.textContent = LABEL;
        button.disabled = false;
    }, FLASH_MS);
}

export function ensureTreeCopyButton(dialog, footer) {
    if (!footer || footer.querySelector(`.${BUTTON_CLASS}`)) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = BUTTON_CLASS;
    button.textContent = LABEL;
    button.addEventListener("click", () => copyTree(button));
    const anchor = footerAnchor(footer);
    if (anchor) footer.insertBefore(button, anchor);
    else footer.prepend(button);
}
