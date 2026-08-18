// content/features/ui-fixes/stoich-table-copy.js
//
// Getting text OUT of a stoichiometry table used to be impossible. Two
// things stood in the way, both CDD's, both liftable from here:
//
//   1. The table lives inside a Slate "void" node — a <figure> that turns
//      text selection OFF for everything under it. Every one of the 398
//      elements in a two-reaction table computed `user-select: none`.
//   2. That same <figure> is `draggable`, so pressing the mouse down on a
//      molecule name started an HTML5 drag of the whole reaction block.
//      The browser never got as far as firing `selectstart`.
//
// Lift both and the table reads like text: drag across it, it goes blue,
// Ctrl+C copies. CDD's click-to-edit popup is untouched — it opens from a
// click, and a click is not a drag.
//
// On top of that, Ctrl/Cmd+click on a field copies that one field's value
// (add Shift for "Label: value"). That is the one-gesture way to lift a
// compound name out of a row. Inside this table the modifier means COPY,
// links included: Ctrl+clicking a batch id copies the id instead of
// opening it in a new tab, which is the whole point of the gesture.

import { copyText } from "../../utils/clipboard.js";

const TABLE_CLASS = "cdd-stoich-selectable";
const ARMED_CLASS = "cdd-stoich-copy-armed";
const OK_CLASS = "cdd-stoich-copy-ok";
const ERROR_CLASS = "cdd-stoich-copy-error";

// Every stoichiometry row carries this; the table is its nearest ancestor.
// Matching the row rather than the table itself keeps us off CDD's emotion
// class hashes (`table.eln-1lvyr32`), which change on every deploy.
const ROW_SELECTOR = '[data-autotest-id="stoichiometry-row"]';

// One label/value pair — "FW: 231.05 g/mol", "IUPAC: N-methyl(...)". The
// suffix varies with what CDD lets you do to the field ("row-item editable",
// "row-item noneditable", "row-item undefined"), so match the prefix.
const FIELD_SELECTOR = '[data-autotest-id^="row-item"]';

// The greyed stand-in CDD prints where a value isn't set ("Optional",
// "Required"). Never worth copying — a field showing one copies as nothing.
const PLACEHOLDER_SELECTOR = '[data-autotest-id="missing-label"]';

// Both halves of the Ctrl+click gesture have to be kept away from CDD: the
// edit popup only opens on the full pointer+mouse+click sequence, and the
// batch id is a real link whose default action is a new tab.
const GESTURE_EVENTS = [
    "pointerdown", "pointerup",
    "mousedown", "mouseup",
    "click", "dblclick",
];

/* ------------------------------------------------------------------ *
 * Styles
 * ------------------------------------------------------------------ */

let stylesInjected = false;

function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;

    const style = document.createElement("style");
    style.id = "cdd-stoich-table-copy-style";
    style.textContent = `
        .${TABLE_CLASS}, .${TABLE_CLASS} * {
            -webkit-user-select: text !important;
            user-select: text !important;
        }

        .${ARMED_CLASS} .${TABLE_CLASS} ${FIELD_SELECTOR} {
            cursor: copy;
        }

        .${ARMED_CLASS} .${TABLE_CLASS} ${FIELD_SELECTOR}:hover {
            background-color: rgba(0, 119, 204, 0.08);
            border-radius: 4px;
        }

        .${TABLE_CLASS} ${FIELD_SELECTOR}.${OK_CLASS} {
            background-color: rgba(34, 197, 94, 0.18);
            border-radius: 4px;
        }

        .${TABLE_CLASS} ${FIELD_SELECTOR}.${ERROR_CLASS} {
            background-color: rgba(239, 68, 68, 0.18);
            border-radius: 4px;
        }
    `;

    document.head.appendChild(style);
}

function markTables() {
    document.querySelectorAll(ROW_SELECTOR).forEach((row) => {
        row.closest("table")?.classList.add(TABLE_CLASS);
    });
}

/* ------------------------------------------------------------------ *
 * Part A — let the mouse select instead of drag
 *
 * `draggable` is switched off for the length of ONE mouse gesture and put
 * straight back, so Slate can still drag the reaction block by its own
 * chrome and CDD's links stay draggable everywhere else.
 * ------------------------------------------------------------------ */

// A drag that ends inside the field it started in still fires a click, and
// CDD would open the edit popup right on top of the text that was just
// highlighted. Past this much movement the gesture was a selection, not a
// click, and the click is dropped.
const DRAG_SLOP_PX = 4;

// [element, attribute value it had before, or null for "no attribute"].
let suppressedDraggables = [];

// Where the current gesture started, or null when it began outside a table.
let gestureStart = null;

function restoreDraggables() {
    suppressedDraggables.forEach(([element, original]) => {
        if (original === null) element.removeAttribute("draggable");
        else element.setAttribute("draggable", original);
    });

    suppressedDraggables = [];
}

// Every draggable ancestor, not just the nearest: pressing down on a batch
// id sits inside a draggable <a> AND the draggable <figure>, and either one
// left alone would swallow the gesture.
function suppressDraggables(target) {
    let element = target;

    while (element && element !== document.documentElement) {
        if (element.draggable) {
            suppressedDraggables.push([element, element.getAttribute("draggable")]);
            element.setAttribute("draggable", "false");
        }

        element = element.parentElement;
    }
}

function onMouseDown(event) {
    // A gesture that never got its mouseup (released outside the window,
    // drag cancelled) would otherwise leave `draggable` off for good.
    restoreDraggables();
    gestureStart = null;

    if (event.button !== 0) return;
    if (!event.target?.closest?.(`.${TABLE_CLASS}`)) return;

    gestureStart = { x: event.clientX, y: event.clientY };
    suppressDraggables(event.target);
}

// True when this gesture dragged far enough to be a selection AND actually
// left one behind. A plain click travels no distance and collapses the
// selection, so click-to-edit is untouched.
function isSelectionDrag(event) {
    if (!gestureStart) return false;

    const moved = Math.abs(event.clientX - gestureStart.x)
        + Math.abs(event.clientY - gestureStart.y);
    if (moved < DRAG_SLOP_PX) return false;

    const selection = window.getSelection();
    return !!selection && !selection.isCollapsed && selection.toString().trim() !== "";
}

/* ------------------------------------------------------------------ *
 * Part B — Ctrl/Cmd+click copies one field
 * ------------------------------------------------------------------ */

// Ctrl on Windows and Linux, Cmd on macOS — where Ctrl+click is the
// context menu and never reaches a click handler anyway. Alt is excluded
// so it stays free for whatever the browser does with it.
function hasCopyModifier(event) {
    return (event.ctrlKey || event.metaKey) && !event.altKey;
}

// The leading <b> ending in a colon is the field's label. Anything else
// bold — "Limiting reagent" is a bold value with no label — is the value.
function labelNode(field) {
    const bold = field.querySelector("b");
    if (!bold) return null;

    return /:\s*$/.test(bold.textContent ?? "") ? bold : null;
}

function fieldValue(field) {
    const clone = field.cloneNode(true);

    labelNode(clone)?.remove();
    clone.querySelectorAll(PLACEHOLDER_SELECTOR).forEach((el) => el.remove());

    return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
}

function fieldText(field, withLabel) {
    const value = fieldValue(field);
    if (!value) return "";
    if (!withLabel) return value;

    const label = labelNode(field)?.textContent?.replace(/\s*:\s*$/, "").trim();
    return label ? `${label}: ${value}` : value;
}

function flash(field, className, ms) {
    field.classList.add(className);
    window.setTimeout(() => field.classList.remove(className), ms);
}

async function copyField(field, withLabel) {
    const text = fieldText(field, withLabel);
    if (!text) return;  // a field showing only "Optional" / "Required"

    const ok = await copyText(text);

    if (ok) flash(field, OK_CLASS, 500);
    else flash(field, ERROR_CLASS, 800);
}

function fieldForEvent(event) {
    if (!hasCopyModifier(event)) return null;

    const field = event.target?.closest?.(FIELD_SELECTOR);
    if (!field?.closest(`.${TABLE_CLASS}`)) return null;

    return field;
}

function swallow(event) {
    // stopImmediatePropagation as well: CDD's own listeners are bound on
    // the row, and one of them opening the popup would undo the point of
    // a gesture that never meant to touch the value.
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
}

function onGestureEvent(event) {
    const field = fieldForEvent(event);

    if (field) {
        swallow(event);
        if (event.type === "click") copyField(field, event.shiftKey);
        return;
    }

    if (event.type === "click"
        && event.target?.closest?.(`.${TABLE_CLASS}`)
        && isSelectionDrag(event)) {
        swallow(event);
    }
}

// `cursor: copy` the moment the modifier goes down, so the gesture is
// discoverable without anyone having to be told it exists.
function updateArmed(event) {
    document.documentElement.classList.toggle(
        ARMED_CLASS, event.ctrlKey || event.metaKey
    );
}

function disarm() {
    document.documentElement.classList.remove(ARMED_CLASS);
    restoreDraggables();
    gestureStart = null;
}

/* ------------------------------------------------------------------ */

let markTimer = null;

export function initStoichTableCopy() {
    injectStyles();
    markTables();

    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("mouseup", restoreDraggables, true);
    document.addEventListener("dragend", restoreDraggables, true);

    GESTURE_EVENTS.forEach((type) => {
        document.addEventListener(type, onGestureEvent, true);
    });

    document.addEventListener("keydown", updateArmed, true);
    document.addEventListener("keyup", updateArmed, true);
    window.addEventListener("blur", disarm);

    // The table is React-rendered and Turbo swaps <body> on in-app
    // navigation, so the class has to be re-applied as rows come and go.
    // <html>, not <body>, for the same reason.
    const observer = new MutationObserver(() => {
        window.clearTimeout(markTimer);
        markTimer = window.setTimeout(markTables, 200);
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
    });
}
