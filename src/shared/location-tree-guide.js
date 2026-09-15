// shared/location-tree-guide.js
//
// The short manual for the Edit Locations additions — the Scan racks panel,
// the filter above the tree, the orange names. One copy, read by the panel's
// ⓘ and by the Scan racks card on the settings page, so the two can never
// drift apart. The long version is README.md, "Location tree (Edit
// Locations)", which is where the link points.

export const LOCATION_TREE_GUIDE_URL =
    "https://github.com/xaviersvk/CDD-Stoich-Tools#location-tree-edit-locations";

// [term, sentence] — a term is two or three words, a sentence is what a
// colleague would say at the bench.
export const LOCATION_TREE_GUIDE = [
    ["Scan", "Scan a barcode, or type a name and press Enter. Each becomes one row."],
    ["Paste", "One rack per line. After the name, TAB-separated: two numbers are columns × rows, one number is the capacity of an unorganized box."],
    ["Paths", "Shelf A > Bay 2 > R-1 makes the missing locations, then the box. End a line with > to make locations only. Start it with Locations > to build from the top of the vault."],
    ["Where a shelf can go", "Under a location that holds no racks yet — CDD's rule. A row that cannot be built is struck out with the reason; move Into to an empty location and it comes back."],
    ["Duplicates", "A name already in the vault, or twice in the list, is struck out and not counted. In the tree, boxes that share a name are orange."],
    ["Size", "Pick a preset or type columns × rows; every row can differ. With Organized off, rows take a capacity instead."],
    ["Create", "Makes the boxes as pending changes and leaves the dialog open. Nothing is saved until you press CDD's Save; Cancel discards everything."],
    ["Filter", "The box above the tree shows only the names that match. Esc clears it."],
];

// Builds the guide as DOM: one row per term, then the link. `el` is the
// caller's tiny element helper so this file stays free of any page's
// class names beyond the ones passed in.
export function renderLocationTreeGuide(doc, classes) {
    const box = doc.createElement("div");
    box.className = classes.box;
    for (const [term, text] of LOCATION_TREE_GUIDE) {
        const item = doc.createElement("div");
        item.className = classes.item;
        const b = doc.createElement("b");
        b.textContent = term;
        const span = doc.createElement("span");
        span.textContent = text;
        item.append(b, span);
        box.append(item);
    }
    const link = doc.createElement("a");
    link.className = classes.link;
    link.href = LOCATION_TREE_GUIDE_URL;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "Full guide";
    box.append(link);
    return box;
}
