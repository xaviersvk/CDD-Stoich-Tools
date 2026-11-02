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
const DURATION_MS = 280;
const EASING = "cubic-bezier(0.2, 0.8, 0.2, 1)";

// Only edit mode has the reaction conditions rows (separator, Temperature…).
const EDIT_MODE_MARK = '[data-autotest-id^="reaction-conditions"]';
const INLINE_EDITOR = 'textarea, input:not([type="radio"]):not([type="checkbox"])';

/**
 * @typedef {object} Pending
 * @property {Element[]} tables
 * @property {number[]} heights      table heights at the click
 * @property {Element} target        what was clicked
 * @property {number} targetTop
 * @property {Element | null} cell   the table cell clicked in, if any
 * @property {number} cellTop
 * @property {Map<Element, DOMRect>} before
 * @property {Set<Element>} animated
 * @property {ResizeObserver} observer
 * @property {"wait" | "pin"} phase
 * @property {number} timer
 */

/** @type {Pending | null} */
let pending = null;

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
    const active = document.activeElement;
    if (p.cell?.isConnected && active && p.cell.contains(active) && active.matches(INLINE_EDITOR)) {
        return { was: p.targetTop, is: layoutTop(active, p.animated) };
    }
    if (p.target.isConnected && p.target.getClientRects().length) {
        return { was: p.targetTop, is: layoutTop(p.target, p.animated) };
    }
    if (p.cell?.isConnected) {
        return { was: p.cellTop, is: layoutTop(p.cell, p.animated) };
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

    for (const [el, was] of p.before) {
        if (!el.isConnected) continue;
        const offset = flipOffset(was, el.getBoundingClientRect());
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

    const clicked = target.closest(SELECTORS.stoichTable);
    // A click in a table may switch it into edit mode; a click anywhere may
    // switch a table that is in edit mode back out.
    const tables = [...document.querySelectorAll(SELECTORS.stoichTable)]
        .filter((t) => t === clicked || isEditing(t));
    stop();
    if (!tables.length) return;

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

// The user scrolling takes over: stop holding the spot.
function onUserScroll() {
    if (pending?.phase === "pin") stop();
}

export function initSteadyStoichEdit() {
    initSteadyStoichEditFlag();
    document.addEventListener("pointerdown", onPointerDown, { capture: true, passive: true });
    window.addEventListener("wheel", onUserScroll, { capture: true, passive: true });
    window.addEventListener("touchmove", onUserScroll, { capture: true, passive: true });
}
