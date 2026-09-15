// content/features/ui-fixes/inventory-location-scan/dialog-dom.js
//
// Everything that knows what CDD's Edit Locations dialog looks like, so that
// when CDD renames a class there is exactly one file to fix.
//
// Three facts this file is built on, all measured rather than assumed:
//
//   - Every row carries all four action buttons and CDD hides the ones that do
//     not apply with `display: none`. So "can this node take a box?" is a style
//     question, not a guess about which icon is drawn — and it is the honest
//     one, because it also excludes the root, under which CDD allows no box.
//   - The add-box button creates an organized 9 x 9 box named "Box N" OUTRIGHT
//     and selects it. There is no type chooser in the way; the two large cards
//     are the location editor, which is a different thing.
//   - Selection is `.Mui-selected` on the row's content div. `aria-selected` is
//     not set, so it cannot be used to tell which node the right pane belongs
//     to.
//
// The panel is drawn as an overlay ON TOP of CDD's right pane rather than
// replacing it: the inputs below have to stay mounted, because writing a box's
// name means writing into them.

export const DIALOG_SELECTOR = ".edit-locations-dialog-paper";
export const NAME_INPUT_ID = "location-box-node-name";
export const PANEL_CLASS = "cdd-scan-panel";

const ADD_BOX_LABEL = "Create new organized or unorganized box";
const ADD_LOCATION_LABEL = "Create new location";
const PRINT_LABELS_TEXT = "Print Labels";

export function findDialog() {
    return document.querySelector(DIALOG_SELECTOR);
}

export function findContent(dialog) {
    return dialog?.querySelector(".MuiDialogContent-root") || null;
}

export function findLeftColumn(dialog) {
    return dialog?.querySelector(".left-column") || null;
}

export function findFooter(dialog) {
    if (!dialog) return null;
    const actions = dialog.querySelector(".MuiDialogActions-root");
    if (actions) return actions;
    // A footer is defined by the buttons in it, not by a class we happened to
    // see once. Save is always there.
    const save = [...dialog.querySelectorAll("button")]
        .find((button) => button.textContent.trim() === "Save");
    return save ? save.parentElement : null;
}

// Print Labels is not a leaf: it is a <div> wrapping an <a> that carries an
// icon of its own. Matching on the footer's own children sidesteps the whole
// question of how deep the text sits.
export function footerAnchor(footer) {
    if (!footer) return null;
    return [...footer.children]
        .find((child) => child.textContent.trim() === PRINT_LABELS_TEXT) || null;
}

function contentOf(item) {
    return item.querySelector(":scope > .MuiTreeItem-content");
}

function rowButton(item, label) {
    const content = contentOf(item);
    if (!content) return null;
    for (const button of content.querySelectorAll("button")) {
        if (button.getAttribute("aria-label") === label) return button;
    }
    return null;
}

function addBoxButton(item) {
    return rowButton(item, ADD_BOX_LABEL);
}

function isShown(element) {
    if (!element) return false;
    return getComputedStyle(element).display !== "none";
}

function labelOf(item) {
    const label = contentOf(item)?.querySelector(".MuiTreeItem-label");
    return label ? label.textContent.trim() : "";
}

export function treeItems(dialog) {
    if (!dialog) return [];
    return [...dialog.querySelectorAll('li[role="treeitem"]')];
}

// Both "can take" answers are style questions on a RENDERED row: CDD hides
// the button that does not apply. A location that holds a box shows no
// add-location button — a level is shelves or racks, not both — and the
// root shows no add-box button.
export function readTreeRows(dialog) {
    return treeItems(dialog).map((item) => ({
        id: item.dataset.nodeid,
        parentId: item.dataset.parentid,
        name: labelOf(item),
        rendered: true,
        canTakeBox: isShown(addBoxButton(item)),
        canTakeLocation: isShown(rowButton(item, ADD_LOCATION_LABEL)),
    }));
}

export function selectedNodeId(dialog) {
    const item = treeItems(dialog)
        .find((node) => contentOf(node)?.classList.contains("Mui-selected"));
    return item ? item.dataset.nodeid : null;
}

// React tracks an input's value on the DOM node itself; assigning `.value`
// hides the change from it. Go through the prototype setter so the framework
// sees a real edit — the same trick run-form-templates/form-model.js uses.
export function setNativeValue(element, value) {
    const prototype = element instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;

    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (setter) setter.call(element, value);
    else element.value = value;

    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
}

// Our own panel lives inside the dialog, so a bare querySelectorAll for
// `input[type=number]` would find the panel's grid boxes as well as CDD's.
function cddElements(dialog, selector) {
    return [...dialog.querySelectorAll(selector)]
        .filter((element) => !element.closest(`.${PANEL_CLASS}`));
}

// requestAnimationFrame does NOT fire while the tab is hidden, and this dialog
// can be left open in a background tab — measured: a run started there stopped
// dead after the first box. So the frame is raced against a timer, and a run
// that cannot see the screen still finishes.
// Exported: the panel needs it too — CDD paints a tree selection on the next
// frame, so a click has to be read after one, not during it.
export function nextFrame() {
    return new Promise((resolve) => {
        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            resolve();
        };
        requestAnimationFrame(() => requestAnimationFrame(finish));
        setTimeout(finish, 32);
    });
}

async function waitFor(predicate, tries = 40) {
    for (let attempt = 0; attempt < tries; attempt += 1) {
        const value = predicate();
        if (value) return value;
        await nextFrame();
    }
    return null;
}

// The part a box and a location share: press the row's button, wait for the
// node, make sure it is the one the right pane is editing, name it, and read
// the name back off the tree. The Name field carries the same id for both
// kinds — measured — which is exactly why the selection check matters.
async function createNamedNode(dialog, { parentId, buttonLabel, name, cannot, kind }) {
    const parent = treeItems(dialog)
        .find((item) => item.dataset.nodeid === String(parentId));
    if (!parent) throw new Error("that location is no longer in the tree");

    const button = rowButton(parent, buttonLabel);
    if (!isShown(button)) throw new Error(cannot);

    const before = new Set(treeItems(dialog).map((item) => item.dataset.nodeid));
    button.click();

    const created = await waitFor(() =>
        treeItems(dialog).find((item) => !before.has(item.dataset.nodeid)) || null);
    if (!created) throw new Error(`CDD did not add a ${kind}`);

    // The right pane belongs to whatever is selected. If the new node is not
    // it, writing the name would rename something else.
    if (!contentOf(created)?.classList.contains("Mui-selected")) {
        throw new Error(`CDD is not editing the ${kind} it just added`);
    }

    const nameInput = document.getElementById(NAME_INPUT_ID);
    if (!nameInput) throw new Error("the name field did not appear");
    setNativeValue(nameInput, name);
    await nextFrame();

    return created;
}

function confirmLabel(created, name) {
    const painted = labelOf(created);
    if (painted !== name) {
        throw new Error(`the row reads "${painted}" instead of "${name}"`);
    }
    return created.dataset.nodeid;
}

// A location under a location. CDD hides the button once the parent holds a
// box — a level is shelves or racks, not both — and that is the one refusal
// worth a sentence of its own.
export async function createLocationUnder(dialog, { parentId, name }) {
    const parentName = labelOf(treeItems(dialog)
        .find((item) => item.dataset.nodeid === String(parentId)) || document.createElement("li"));
    const created = await createNamedNode(dialog, {
        parentId,
        buttonLabel: ADD_LOCATION_LABEL,
        name,
        kind: "location",
        cannot: `"${parentName}" already holds boxes and cannot hold a location`,
    });
    await nextFrame();
    return confirmLabel(created, name);
}

export async function createBoxUnder(dialog, { parentId, name, columns, rows, organized }) {
    const created = await createNamedNode(dialog, {
        parentId,
        buttonLabel: ADD_BOX_LABEL,
        name,
        kind: "box",
        cannot: "that location cannot take a box",
    });

    if (organized) {
        const [columnsInput, rowsInput] = cddElements(dialog, 'input[type="number"]');
        if (!columnsInput || !rowsInput) throw new Error("the grid size fields did not appear");
        setNativeValue(columnsInput, String(columns));
        await nextFrame();
        setNativeValue(rowsInput, String(rows));
    } else {
        const organizedBox = cddElements(dialog, 'input[type="checkbox"]')[0];
        if (organizedBox?.checked) organizedBox.click();
    }

    await nextFrame();

    return confirmLabel(created, name);
}
