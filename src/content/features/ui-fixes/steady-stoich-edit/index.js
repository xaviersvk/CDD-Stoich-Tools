// ui-fixes/steady-stoich-edit — the value you click stays where you clicked it.
//
// Clicking a value in a stoichiometry table switches the whole table into
// edit mode: every row grows (Role, Entity, ratios, Equivalent…), a reaction
// conditions block appears above the header and the columns shift sideways.
// The value you were looking at lands somewhere else and has to be found
// again. Leaving edit mode does the same in reverse.
//
// On the click (pointerdown, before CDD reacts) the position of every table
// cell and of the page blocks around the table is recorded. When the table
// changes size, the page is scrolled so the clicked spot — or the editor CDD
// opened for it — is back where the click was, and everything else is slid
// from where it was to where it is now (FLIP): what is above moves up, what is
// below moves down, the columns glide sideways.
//
// Leaving edit mode by clicking somewhere else holds the value that was just
// edited instead: its editor (`inline-input-<field>`) turns back into the
// view-mode line (`field-<field>`) of the same cell, and that line stays put.
// Except when the click lands where you are about to type — the entry text,
// another input: then that spot is held, so the caret does not run away.
//
// Strictly an observer. CDD's Slate editor is not touched: no event is
// cancelled, no attribute or style is written — the motion is Web Animations
// (element.animate), which leave the DOM alone. A table that does not change
// size after the click (a click that only opens an editor in a table already
// in edit mode, a picker…) leaves nothing behind.

import { SELECTORS } from "../../../selectors.js";
import { PANEL_ID } from "../../../../shared/plugin-constants.js";
import {
    initSteadyStoichEditFlag,
    isSteadyStoichEditEnabled,
} from "../../../../shared/steady-stoich-edit-flag.js";
import { flipOffset, nearViewport, scrollToKeep } from "./model.js";

// A size change later than this after the click is not the click's doing.
const WAIT_MS = 1200;
// CDD renders edit mode in more than one commit (the inline editor gets its
// focus a moment after the rows grow); keep the spot pinned that long.
const SETTLE_MS = 450;
const DURATION_MS = 700;
const EASING = "cubic-bezier(0.2, 0.8, 0.2, 1)";

// Only edit mode has the reaction conditions rows (separator, Temperature…).
const EDIT_MODE_MARK = '[data-autotest-id^="reaction-conditions"]';
const INLINE_EDITOR = 'textarea, input:not([type="radio"]):not([type="checkbox"])';
// CDD's own field names: the editor in edit mode and the line in view mode
// carry the same one (inline-input-purity ↔ field-purity).
const EDITOR_PREFIX = "inline-input-";
const FIELD_PREFIX = "field-";

/**
 * @typedef {object} Pending
 * @property {Element[]} tables
 * @property {number[]} heights      table heights at the click
 * @property {Element} target        what was clicked
 * @property {number} targetTop
 * @property {Element | null} cell   the table cell clicked in, if any
 * @property {number} cellTop
 * @property {Field | null} field    the value just edited, held when leaving edit mode
 * @property {Map<Element, DOMRect>} before
 * @property {Set<Element>} animated
 * @property {ResizeObserver} observer
 * @property {"wait" | "pin"} phase
 * @property {number} timer
 */

/**
 * @typedef {object} Field
 * @property {Element} cell
 * @property {string} name
 * @property {number} top
 * @property {number} cellTop
 */

/** @type {Pending | null} */
let pending = null;

/** The last value an inline editor was opened for: `{ cell, name }`. */
/** @type {{ cell: Element, name: string } | null} */
let lastEdit = null;

/**
 * The element showing field `name` in `cell`: its editor while it is open,
 * else its view-mode line — or the other way round with `lineFirst`.
 *
 * @param {Element} cell
 * @param {string} name
 * @param {boolean} [lineFirst]
 */
function fieldElement(cell, name, lineFirst = false) {
    const editor = cell.querySelector(`[data-autotest-id="${EDITOR_PREFIX}${CSS.escape(name)}"]`);
    const line = cell.querySelector(`[data-autotest-id="${FIELD_PREFIX}${CSS.escape(name)}"]`);
    return lineFirst ? line || editor : editor || line;
}

// Somewhere the user is about to type: the entry text or another form field
// outside the stoichiometry tables.
/** @param {Element} target */
function isTypingTarget(target) {
    if (target.closest(SELECTORS.stoichTable)) return false;
    if (target.closest("input, textarea, select")) return true;
    return !!target.closest('[contenteditable="true"]') && !target.closest('[contenteditable="false"]');
}

/** @param {Element} table */
const isEditing = (table) => !!table.querySelector(EDIT_MODE_MARK);

/** @param {Element} table */
const cellsOf = (table) => [...table.querySelectorAll("tr > td, tr > th")];

// The blocks around a table: the siblings of every ancestor from the table up
// to the editor's top level (the reaction scheme above it, the paragraphs
// before and after the reaction), as long as they are near the screen. They
// never contain the table, so none of them is an ancestor of an animated
// cell — no transform is applied on top of another.
/** @param {Element} table */
function neighboursOf(table) {
    const out = [];
    const vh = window.innerHeight;
    const editor = table.closest(SELECTORS.entryEditor);
    for (let node = table; node.parentElement && node !== editor; node = node.parentElement) {
        const parent = node.parentElement;
        for (const sib of parent.children) {
            if (sib === node || !(sib instanceof HTMLElement)) continue;
            if (nearViewport(sib.getBoundingClientRect(), vh)) out.push(sib);
        }
        if (parent === editor) break;
    }
    return out;
}

/**
 * The element's top as layout put it, without an animation's transform on it
 * or on the animated block it sits in.
 *
 * @param {Element} el
 * @param {Set<Element>} animated
 */
function layoutTop(el, animated) {
    let top = el.getBoundingClientRect().top;
    for (let n = /** @type {Element | null} */ (el); n; n = n.parentElement) {
        if (!animated.has(n)) continue;
        top -= new DOMMatrixReadOnly(getComputedStyle(n).transform).m42;
        break;
    }
    return top;
}

// Where the clicked spot is now, paired with where it was. The editor CDD
// opened in the clicked cell wins (the value turned into a textarea), then
// the clicked element itself, then its cell.
/** @param {Pending} p */
function anchor(p) {
    if (p.field) {
        const f = p.field;
        const el = f.cell.isConnected ? fieldElement(f.cell, f.name, true) : null;
        if (el) return { el, was: f.top, is: layoutTop(el, p.animated) };
        if (f.cell.isConnected) return { el: f.cell, was: f.cellTop, is: layoutTop(f.cell, p.animated) };
    }
    const active = document.activeElement;
    if (p.cell?.isConnected && active && p.cell.contains(active) && active.matches(INLINE_EDITOR)) {
        return { el: active, was: p.targetTop, is: layoutTop(active, p.animated) };
    }
    if (p.target.isConnected && p.target.getClientRects().length) {
        return { el: p.target, was: p.targetTop, is: layoutTop(p.target, p.animated) };
    }
    if (p.cell?.isConnected) {
        return { el: p.cell, was: p.cellTop, is: layoutTop(p.cell, p.animated) };
    }
    return null;
}

/** @param {Pending} p */
function pin(p) {
    const a = anchor(p);
    if (!a) return;
    const dy = scrollToKeep(a.was, a.is);
    if (dy) window.scrollBy(0, dy);
}

/** @param {Pending} p */
function animate(p) {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const timing = { duration: DURATION_MS, easing: EASING };

    // The cell holding the spot being kept still slides sideways with its
    // column but not up or down: its own top moves (rows above it grow, a
    // Role line appears above the value), and following that would make the
    // value dip and come back during the motion. Its vertical offset is the
    // kept spot's — zero once pinned.
    const a = anchor(p);
    const anchorCell = a && p.tables.some((t) => t.contains(a.el)) ? a.el.closest("td, th") : null;

    for (const [el, was] of p.before) {
        if (!el.isConnected) continue;
        const now = el.getBoundingClientRect();
        const offset = el === anchorCell && a
            ? flipOffset({ left: was.left, top: a.was }, { left: now.left, top: a.is })
            : flipOffset(was, now);
        if (!offset) continue;
        el.animate(
            [{ transform: `translate(${offset.dx}px, ${offset.dy}px)` }, { transform: "translate(0, 0)" }],
            timing,
        );
        p.animated.add(el);
    }

    // Cells edit mode added (Comment column, conditions rows): fade in
    // instead of popping up.
    for (const table of p.tables) {
        for (const cell of cellsOf(table)) {
            if (p.before.has(cell)) continue;
            cell.animate([{ opacity: 0 }, { opacity: 1 }], { ...timing, delay: DURATION_MS / 3, fill: "backwards" });
        }
    }
}

function stop() {
    if (!pending) return;
    pending.observer.disconnect();
    clearTimeout(pending.timer);
    pending = null;
}

function onResize() {
    const p = pending;
    if (!p) return;
    // ResizeObserver reports every table once on observe(): not a change.
    if (p.phase === "wait") {
        if (p.tables.every((t, i) => /** @type {HTMLElement} */ (t).offsetHeight === p.heights[i])) return;
        p.phase = "pin";
        pin(p);
        animate(p);
        const until = performance.now() + SETTLE_MS;
        const follow = () => {
            if (pending !== p) return;
            pin(p);
            if (performance.now() < until) requestAnimationFrame(follow);
            else stop();
        };
        requestAnimationFrame(follow);
        return;
    }
    pin(p);
}

/** @param {PointerEvent} e */
function onPointerDown(e) {
    if (e.button !== 0 || !isSteadyStoichEditEnabled()) return;
    const target = e.target instanceof Element ? e.target : null;
    if (!target || target.closest(`#${PANEL_ID}`)) return;
    begin(target);
}

/**
 * The panel's fill buttons click the table themselves (row-fill.js), with
 * synthetic mouse events and no pointerdown — call this right before such a
 * click on `target` and it moves like a click of the user's: the row stays
 * where it was, the rest slides. Same flag as the user's clicks.
 *
 * The click that ends a fill lands in the entry text above the table, which
 * for a user's click means "hold where I am about to type". Nobody types
 * there after a fill: the value just filled is what stays put.
 *
 * @param {Element} target
 */
export function steadyBeforeClick(target) {
    if (!isSteadyStoichEditEnabled() || !(target instanceof Element)) return;
    begin(target, true);
}

/**
 * @param {Element} target
 * @param {boolean} [synthetic]  a click of ours, not the user's
 */
function begin(target, synthetic = false) {
    const clicked = target.closest(SELECTORS.stoichTable);
    // A click in a table may switch it into edit mode; a click anywhere may
    // switch a table that is in edit mode back out.
    const tables = [...document.querySelectorAll(SELECTORS.stoichTable)]
        .filter((t) => t === clicked || isEditing(t));
    stop();
    // Entering edit mode: whatever was edited last time is history.
    if (clicked && !isEditing(clicked)) lastEdit = null;
    if (!tables.length) return;

    /** @type {Field | null} */
    let field = null;
    if (!clicked && (synthetic || !isTypingTarget(target)) && lastEdit?.cell.isConnected
        && tables.some((t) => t.contains(lastEdit?.cell ?? null))) {
        const el = fieldElement(lastEdit.cell, lastEdit.name);
        field = {
            ...lastEdit,
            top: (el || lastEdit.cell).getBoundingClientRect().top,
            cellTop: lastEdit.cell.getBoundingClientRect().top,
        };
    }

    /** @type {Map<Element, DOMRect>} */
    const before = new Map();
    for (const table of tables) {
        for (const el of [...cellsOf(table), ...neighboursOf(table)]) {
            before.set(el, el.getBoundingClientRect());
        }
    }
    const cell = clicked ? target.closest("td, th") : null;

    const observer = new ResizeObserver(onResize);
    pending = {
        tables,
        heights: tables.map((t) => /** @type {HTMLElement} */ (t).offsetHeight),
        target,
        targetTop: target.getBoundingClientRect().top,
        cell,
        cellTop: cell ? cell.getBoundingClientRect().top : 0,
        field,
        before,
        animated: new Set(),
        observer,
        phase: "wait",
        timer: window.setTimeout(() => {
            if (pending?.phase === "wait") stop();
        }, WAIT_MS),
    };
    for (const table of tables) observer.observe(table);
}

/** @param {FocusEvent} e */
function onFocusIn(e) {
    const el = e.target instanceof Element ? e.target : null;
    const id = el?.getAttribute("data-autotest-id") || "";
    if (!el || !id.startsWith(EDITOR_PREFIX) || !el.closest(SELECTORS.stoichTable)) return;
    const cell = el.closest("td, th");
    if (cell) lastEdit = { cell, name: id.slice(EDITOR_PREFIX.length) };
}

// The user scrolling takes over: stop holding the spot.
function onUserScroll() {
    if (pending?.phase === "pin") stop();
}

export function initSteadyStoichEdit() {
    initSteadyStoichEditFlag();
    document.addEventListener("pointerdown", onPointerDown, { capture: true, passive: true });
    document.addEventListener("focusin", onFocusIn, { capture: true, passive: true });
    window.addEventListener("wheel", onUserScroll, { capture: true, passive: true });
    window.addEventListener("touchmove", onUserScroll, { capture: true, passive: true });
}
