// content/features/ui-fixes/registration-field-delete.js
//
// Taking fields off a registration form (Settings → Registration → a form →
// Entity / Batch / Sample / Inventory event) without pencil → Edit Field →
// Delete for each one:
//
//   - a × beside every field's pencil removes that field;
//   - Ctrl+click marks fields, Shift+click marks everything from the last
//     marked one, and a bar at the top of the editor removes them all.
//     Esc clears the marks (and, with nothing marked, still closes the editor).
//
// Every removal does exactly what the user would: it double-clicks the field
// and presses Delete in the Edit Field dialog CDD opens (hidden while it is
// up). Delete there only takes the field out of the layout being edited
// (store.deleteField) — it goes back to the sidebar list, and nothing reaches
// the server until the form's own Save. Cancel on the form throws it all
// away, so neither the × nor the bar asks first.
//
// A field whose Edit Field has no Delete keeps its dialog open, as if it had
// been double-clicked, and a bulk run stops there.
//
// CDD's pencil is the label's ::after, so anything put inside the label lands
// before it. The label is a full-width block, so anything put beside it lands
// on the next line. So the label gets our own pencil — CDD's glyph in CDD's
// font, read off the ::after — followed by the ×, and CDD's ::after is hidden.
// A click on our pencil bubbles to the label: CDD's own Edit Field.
//
// Marks are kept by layout id (the field's data-draggable), not by element:
// React re-renders the fields after every removal.

const PAGE = /\/vaults\/\d+\/vault_registration_form_definitions$/;
const FIELD = ".EditFormDialog .form-contents-container .FormField";
const PAPER = ".EditFormDialog .MuiDialog-paper";
const BUTTON_CLASS = "cdd-regfield-delete";
const TOOLS_CLASS = "cdd-regfield-tools";
const PEN_CLASS = "cdd-regfield-pen";
const BAR_CLASS = "cdd-regfield-bar";
const MARK = "data-cdd-regfield";
const PICKED = "data-cdd-regfield-picked";
// Hides CDD's Edit Field dialog for the moment it is open under our click.
const BUSY_CLASS = "cdd-regfield-deleting";

let started = false;
const picked = new Set();
let anchor = null;
let running = false;
let bar = null;
// Shown instead of the count: a run in progress, or the field one stopped at.
let note = "";

function injectStyles() {
    const style = document.createElement("style");
    style.id = "cdd-regfield-delete-style";
    style.textContent = `
    .editable-label[${MARK}]::after { content: none !important; }
    .${TOOLS_CLASS} { white-space: nowrap; }
    .${PEN_CLASS} {
        margin-left: 0.285714rem;
        font-size: 0.857143rem;
        font-weight: 900;
        opacity: 0.25;
    }
    .editable-label:hover .${PEN_CLASS} { opacity: 1; }
    .${BUTTON_CLASS} {
        margin-left: 0.4rem;
        padding: 0 3px;
        border: 0;
        border-radius: 3px;
        background: none;
        font: 700 1rem/1 sans-serif;
        color: inherit;
        opacity: 0.25;
        cursor: pointer;
    }
    .FormField:hover .${BUTTON_CLASS} { opacity: 1; }
    .${BUTTON_CLASS}:hover { background: #c62828; color: #fff; }
    .FormField[${PICKED}] {
        background-color: rgb(227, 239, 252) !important;
        box-shadow: inset 0 0 0 2px #1262b3 !important;
    }
    .${BAR_CLASS} {
        position: absolute;
        top: 14px;
        right: 24px;
        z-index: 2;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 4px 6px 4px 12px;
        border: 1px solid #1262b3;
        border-radius: 4px;
        background: #fff;
        font-size: 13px;
    }
    .${BAR_CLASS}[hidden] { display: none; }
    .${BAR_CLASS} button {
        appearance: none;
        border: 0;
        border-radius: 3px;
        padding: 4px 10px;
        font: inherit;
        cursor: pointer;
    }
    .${BAR_CLASS} .cdd-regfield-remove { background: #c62828; color: #fff; font-weight: 600; }
    .${BAR_CLASS} .cdd-regfield-clear { background: none; color: #1262b3; }
    html.${BUSY_CLASS} .MuiDialog-root:not(.EditFormDialog) { visibility: hidden; }
    `;
    document.head.append(style);
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function newestFieldDialog() {
    const dialogs = [...document.querySelectorAll(".MuiDialog-root:not(.EditFormDialog)")];
    const dialog = dialogs[dialogs.length - 1];
    return dialog?.querySelector("h2")?.textContent.trim() === "Edit Field" ? dialog : null;
}

// Resolves true once CDD has taken the field out, false if it could not be.
async function removeField(field) {
    const id = field.dataset.draggable;
    document.documentElement.classList.add(BUSY_CLASS);
    try {
        field.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
        // React opens the dialog on its next commit; give it a moment.
        let dialog = null;
        for (let tries = 0; !dialog && tries < 40; tries++) {
            await pause(16);
            dialog = newestFieldDialog();
        }
        const del = dialog && [...dialog.querySelectorAll("button")].find((button) => button.textContent.trim() === "Delete");
        if (!del) return false;
        del.click();
        for (let tries = 0; tries < 40; tries++) {
            if (!fieldById(id) && !newestFieldDialog()) return true;
            await pause(16);
        }
        return !fieldById(id);
    } finally {
        document.documentElement.classList.remove(BUSY_CLASS);
    }
}

/* ------------------------------------------------------------------ *
 * Marks
 * ------------------------------------------------------------------ */

function fields() {
    return [...document.querySelectorAll(FIELD)];
}

function fieldById(id) {
    return fields().find((field) => field.dataset.draggable === id) || null;
}

function toggle(field, range) {
    const id = field.dataset.draggable;
    if (!id) return;
    if (range && anchor && fieldById(anchor)) {
        const all = fields();
        const from = all.findIndex((other) => other.dataset.draggable === anchor);
        const to = all.indexOf(field);
        const [low, high] = from < to ? [from, to] : [to, from];
        for (const other of all.slice(low, high + 1)) picked.add(other.dataset.draggable);
    } else if (picked.has(id)) {
        picked.delete(id);
    } else {
        picked.add(id);
    }
    anchor = id;
    note = "";
    paint();
}

function clearMarks() {
    picked.clear();
    anchor = null;
    note = "";
    paint();
}

async function removePicked() {
    if (running) return;
    running = true;
    let removed = 0;
    let stuck = null;
    try {
        // Top to bottom, as they stand in the form.
        const queue = fields().map((field) => field.dataset.draggable).filter((id) => picked.has(id));
        note = `Removing ${queue.length}…`;
        paint();
        for (const id of queue) {
            const field = fieldById(id);
            if (!field) {
                picked.delete(id);
                continue;
            }
            if (!(await removeField(field))) {
                stuck = field.dataset.fieldName || "a field";
                break;
            }
            picked.delete(id);
            removed++;
            note = `Removing ${queue.length - removed}…`;
            paint();
        }
    } finally {
        running = false;
    }
    note = stuck ? `${stuck} cannot be removed here — ${removed} removed.` : "";
    paint();
}

function buildBar() {
    const node = document.createElement("div");
    node.className = BAR_CLASS;
    node.hidden = true;
    const text = document.createElement("span");
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "cdd-regfield-remove";
    remove.addEventListener("click", removePicked);
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "cdd-regfield-clear";
    clear.textContent = "Clear";
    clear.addEventListener("click", clearMarks);
    node.append(text, remove, clear);
    return node;
}

// The bar and the marks, from `picked` and `note`.
function paint() {
    const present = new Set(fields().map((field) => field.dataset.draggable));
    // Marks on another tab, or on a form that was closed, are dropped.
    for (const id of picked) if (!present.has(id)) picked.delete(id);
    if (present.size === 0) note = "";
    for (const field of fields()) {
        if (picked.has(field.dataset.draggable)) field.setAttribute(PICKED, "");
        else field.removeAttribute(PICKED);
    }

    const paper = document.querySelector(PAPER);
    if (!paper) return;
    if (!bar) bar = buildBar();
    if (bar.parentElement !== paper) paper.append(bar);
    const [text, remove] = bar.children;
    const n = picked.size;
    bar.hidden = !note && n === 0;
    text.textContent = note || "";
    remove.hidden = running || n === 0;
    remove.textContent = `Remove ${n} field${n === 1 ? "" : "s"}`;
}

/* ------------------------------------------------------------------ *
 * The × beside the pencil
 * ------------------------------------------------------------------ */

function buildTools(field, label) {
    // Read with MARK off (a re-render keeps it, but drops our span): whatever
    // CDD's pencil is today.
    label.removeAttribute(MARK);
    const after = getComputedStyle(label, "::after");
    const pen = document.createElement("span");
    pen.className = PEN_CLASS;
    pen.textContent = after.content.replace(/^"|"$/g, "");
    pen.style.fontFamily = after.fontFamily;

    const button = document.createElement("button");
    button.type = "button";
    button.className = BUTTON_CLASS;
    button.textContent = "×";
    button.title = `Remove ${field.dataset.fieldName || "this field"} from the form (Save to keep). Ctrl+click fields to remove several.`;
    // The field is draggable and the label opens Edit Field: the press is ours.
    for (const type of ["pointerdown", "mousedown", "dblclick"]) {
        button.addEventListener(type, (event) => event.stopPropagation());
    }
    button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (running) return;
        await removeField(field);
        paint();
    });

    const tools = document.createElement("span");
    tools.className = TOOLS_CLASS;
    tools.append(pen, button);
    return tools;
}

function decorate() {
    if (!PAGE.test(location.pathname)) return;
    for (const field of fields()) {
        const label = field.querySelector(".editable-label");
        // React rewrites the label's text on a rename, and our span goes with it.
        if (!label || label.querySelector(`.${TOOLS_CLASS}`)) continue;
        const tools = buildTools(field, label);
        label.setAttribute(MARK, "");
        label.append(tools);
    }
    if (!running) paint();
}

/* ------------------------------------------------------------------ *
 * Wiring
 * ------------------------------------------------------------------ */

function markingClick(event) {
    return (event.ctrlKey || event.metaKey || event.shiftKey) && event.button === 0 && PAGE.test(location.pathname);
}

export function initRegistrationFieldDelete() {
    if (started) return;
    started = true;
    injectStyles();

    // Capture on window: ahead of React's listeners on its root, so a marking
    // click on the label does not also open Edit Field, and a Shift/Ctrl press
    // does not start a drag or a text selection.
    for (const type of ["pointerdown", "mousedown"]) {
        window.addEventListener(type, (event) => {
            if (!markingClick(event) || !event.target.closest?.(FIELD)) return;
            if (event.target.closest(`.${BUTTON_CLASS}`)) return;
            event.preventDefault();
            event.stopPropagation();
        }, true);
    }
    window.addEventListener("click", (event) => {
        if (!markingClick(event) || running) return;
        const field = event.target.closest?.(FIELD);
        if (!field || event.target.closest(`.${BUTTON_CLASS}`)) return;
        event.preventDefault();
        event.stopPropagation();
        toggle(field, event.shiftKey);
    }, true);
    // Esc with marks clears them; without, it is CDD's (closes the editor).
    window.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || picked.size === 0 || running) return;
        event.preventDefault();
        event.stopPropagation();
        clearMarks();
    }, true);

    let scheduled = false;
    const schedule = () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            try {
                decorate();
            } catch (error) {
                console.warn("[CDD registration-field-delete] decorate failed", error);
            }
        });
    };

    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
    schedule();
}
