// content/features/ui-fixes/eln-filter-field-picker.js
//
// Redesigns the field selector of the ELN Entries page filter
// (/vaults/<id>/eln/entries → funnel → Add filter → first dropdown) the way
// filter-field-picker.js did for Inventory: one searchable panel, the
// built-in ELN fields (ID, Title, Author, Status…) in one column and the
// vault's own fields in another, instead of a single 270px list that scrolls.
//
// This is NOT the MUI menu Inventory uses. CDD renders it with its own
// SelectBox: the trigger is `[data-autotest-id="filter-field-select"]`, the
// list is portalled to `body > .react-portal-overlay > .selectDropdown
// [data-component="PopupContainer"]` (position: fixed) and holds a
// `[role="listbox"]` of `[role="option"]` divs. Group headings are options
// too, just `aria-disabled="true"` — "ELN" first, then the vault's name.
// Measured on vault 6884, 2026-08-22.
//
// The approach is the same as Inventory's: build our panel, put it INSIDE
// CDD's popup container next to the native listbox, hide the listbox, and
// delegate a pick by dispatching the pointer/mouse sequence on the original
// option — CDD's own handler selects the field and closes the popup. React
// drops the list on close, our panel with it.
//
// The native list is VIRTUALISED: it renders only the rows inside its 400px
// window (about 20), so the DOM never holds the tail of a long list — on a
// vault with many fields, most of the vault's own fields are simply not
// there, and once we hide the list it shrinks to a handful of rows. The full
// option list lives in the SelectBox's React props, which only the page
// world can read. So the content script asks the page-world bridge
// (inject/hooks/selectbox-bridge.js) for the options and applies a pick
// through the component's own onChange, also via the bridge. The DOM parse
// and the synthetic click on the native option remain as a fallback for
// when the bridge does not answer (inject script not loaded yet).
//
// One difference from Inventory: there is no focus trap here, the opposite —
// the popup closes as soon as CDD's trigger input loses focus. See
// dismissNative() for how the search box gets real focus regardless.

import { buildPickerPanel, injectPickerStyles, positionPanel, HOST_CLASS, PANEL_CLASS } from "./field-picker-core.js";
import { EVENTS, EVENT_SOURCE } from "../../../shared/event-types.js";

const TRIGGER_SELECTOR = '[data-autotest-id="filter-field-select"]';
const POPUP_SELECTOR = '.selectDropdown[data-component="PopupContainer"]';
// Our own panel's column grid also carries role="listbox" (field-picker-core
// sets it), so the native one must be told apart from it: exclude anything
// inside a panel.
const LISTBOX_SELECTOR = `[role="listbox"]:not(.${PANEL_CLASS} *)`;
const OPTION_SELECTOR = '[role="option"]';
const MARK = "data-cdd-eln-ffp";

// The first group is CDD's built-in set; it is labelled "ELN" in the list.
const DEFAULT_GROUP_LABEL = "ELN";

let started = false;

// Loop guard. If CDD re-renders the list in response to our own changes
// (its popup repositions on size change), every re-render would bring a
// fresh listbox and we would enhance forever. More than LOOP_MAX enhances
// of one popup inside LOOP_WINDOW_MS means exactly that: give up on this
// popup for good and leave CDD's native list alone.
const LOOP_MAX = 3;
const LOOP_WINDOW_MS = 2000;
const OFF_MARK = `${MARK}-off`;
// On CDD's popup while our host stands in for it.
const HIDDEN_MARK = `${MARK}-hidden`;
const enhanceStamps = new WeakMap();

function loopDetected(popup) {
    const now = Date.now();
    const stamps = (enhanceStamps.get(popup) || []).filter((t) => now - t < LOOP_WINDOW_MS);
    stamps.push(now);
    enhanceStamps.set(popup, stamps);
    if (stamps.length <= LOOP_MAX) return false;
    popup.setAttribute(OFF_MARK, "1");
    console.warn("[CDD Stoich Tools] ELN filter picker: CDD keeps re-rendering the list, leaving it native.");
    return true;
}

function isElnEntriesPage() {
    return /^\/vaults\/\d+\/eln\/entries\/?$/.test(location.pathname || "");
}

// Walk the native listbox once: a disabled option opens a new group, every
// other option belongs to the current group. Returns the groups in CDD's
// order, each { label, items:[{ label, selected, el }] }.
function parseGroups(listbox) {
    const groups = [];
    let current = null;

    for (const el of listbox.querySelectorAll(OPTION_SELECTOR)) {
        const label = el.textContent.trim();
        if (!label) continue;

        if (el.getAttribute("aria-disabled") === "true") {
            current = { label, items: [] };
            groups.push(current);
            continue;
        }
        if (!current) {
            current = { label: DEFAULT_GROUP_LABEL, items: [] };
            groups.push(current);
        }
        current.items.push({
            label,
            required: false,
            selected: el.getAttribute("aria-selected") === "true",
            el,
        });
    }

    return groups.filter((g) => g.items.length);
}

// Is this popup the ELN field selector? Its first group heading says "ELN"
// and the trigger exists on the page. Value pickers (Status: Open/Finalized…)
// and the operator select have no disabled group headings.
function isFieldListbox(listbox) {
    if (!document.querySelector(TRIGGER_SELECTOR)) return false;
    const first = listbox.querySelector(OPTION_SELECTOR);
    return !!first && first.getAttribute("aria-disabled") === "true";
}

// One column per group: "ELN" (built-in fields), then each vault.
function columnsFor(groups) {
    return groups.map((g, i) => ({ key: `g${i}`, heading: g.label }));
}

function bucketsFor(groups) {
    const buckets = {};
    groups.forEach((g, i) => {
        // No group label: the column heading already says it.
        buckets[`g${i}`] = [{ label: "", items: g.items }];
    });
    return buckets;
}

// Fire the sequence CDD's Option expects on the native element. Verified on
// the live page: pointerdown/mousedown/pointerup/mouseup/click selects the
// field, updates the filter row and closes the popup.
function selectNative(el) {
    const opts = { bubbles: true, cancelable: true, view: window, button: 0 };
    el.dispatchEvent(new PointerEvent("pointerdown", opts));
    el.dispatchEvent(new MouseEvent("mousedown", opts));
    el.dispatchEvent(new PointerEvent("pointerup", opts));
    el.dispatchEvent(new MouseEvent("mouseup", opts));
    el.dispatchEvent(new MouseEvent("click", opts));
}

// Every filter row has its own field select, all with the same autotest
// id. The one that opened the popup is the one holding focus (CDD focuses
// its input on open); it gets a private id so the bridge can address it.
const TRIGGER_ID_ATTR = "data-cdd-eln-ffp-trigger";
let triggerCounter = 0;

function findActiveTrigger() {
    const focused = document.activeElement?.closest?.(TRIGGER_SELECTOR);
    const trigger = focused || document.querySelector(TRIGGER_SELECTOR);
    if (!trigger) return null;
    if (!trigger.getAttribute(TRIGGER_ID_ATTR)) {
        trigger.setAttribute(TRIGGER_ID_ATTR, String(++triggerCounter));
    }
    return trigger;
}

function triggerSelector(trigger) {
    return `[${TRIGGER_ID_ATTR}="${trigger.getAttribute(TRIGGER_ID_ATTR)}"]`;
}

function findAnchor(trigger) {
    return trigger.querySelector('[data-component="SelectBox"]') || trigger;
}

// The popup closes the moment CDD's own (read-only) trigger input loses
// focus — measured: React's onBlur on that input. Our search box needs real
// focus (caret, arrow keys, the works), so while the picker is open a
// capturing focusout listener swallows the event whenever focus moves INTO
// our host: React never learns the input blurred, the popup stays open.
// Leaving the host (Tab out, click elsewhere, Escape) is then ours to
// handle: a synthetic Escape on CDD's input closes the popup — measured —
// and React drops the list, which takes our host down through scan().
function isInsideTrigger(node) {
    return !!node && node.nodeType === Node.ELEMENT_NODE && !!node.closest(TRIGGER_SELECTOR);
}

function dismissNative(trigger) {
    const input = trigger?.querySelector("input");
    if (!input) return;
    input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, which: 27, bubbles: true, cancelable: true })
    );
}

/* --------------------------------------------------------------------------- */
/* Page-world bridge                                                           */
/* --------------------------------------------------------------------------- */

const BRIDGE_TIMEOUT_MS = 400;
let requestCounter = 0;

// Ask the page world for the SelectBox's full option list. Resolves with the
// serialised options, or null when nothing answers in time.
function requestOptions(trigger) {
    return new Promise((resolve) => {
        const requestId = `eln-ffp-${++requestCounter}`;
        let settled = false;

        const finish = (options) => {
            if (settled) return;
            settled = true;
            window.removeEventListener("message", onMessage);
            clearTimeout(timer);
            resolve(options);
        };
        const onMessage = (event) => {
            if (event.source !== window) return;
            const data = event.data;
            if (!data || data.source !== EVENT_SOURCE || data.type !== EVENTS.SELECTBOX_OPTIONS) return;
            if (data.payload?.requestId !== requestId) return;
            finish(Array.isArray(data.payload.options) ? data.payload.options : null);
        };
        const timer = setTimeout(() => finish(null), BRIDGE_TIMEOUT_MS);

        window.addEventListener("message", onMessage);
        window.postMessage(
            { source: EVENT_SOURCE, type: EVENTS.SELECTBOX_OPTIONS_REQUEST, payload: { requestId, selector: triggerSelector(trigger) } },
            "*"
        );
    });
}

function selectViaBridge(trigger, value) {
    window.postMessage(
        { source: EVENT_SOURCE, type: EVENTS.SELECTBOX_SELECT, payload: { selector: triggerSelector(trigger), value } },
        "*"
    );
}

// Bridge options -> the same group shape parseGroups() builds from the DOM,
// with `value` in place of `el`.
function groupsFromOptions(options) {
    const groups = [];
    let current = null;
    for (const option of options) {
        if (!option.label) continue;
        if (option.header) {
            current = { label: option.label, items: [] };
            groups.push(current);
            continue;
        }
        if (option.disabled) continue;
        if (!current) {
            current = { label: DEFAULT_GROUP_LABEL, items: [] };
            groups.push(current);
        }
        current.items.push({
            label: option.label,
            required: false,
            selected: option.selected,
            value: option.value,
        });
    }
    return groups.filter((g) => g.items.length);
}

// The open picker: our floating host, the CDD popup it stands in for, and
// the listeners to drop when it goes. One at a time.
let open = null;

function closePicker() {
    if (!open) return;
    const { host, popup, cleanup } = open;
    open = null;
    cleanup();
    if (host.isConnected) host.remove();
    popup.removeAttribute(HIDDEN_MARK);
}

async function enhance(popup, listbox) {
    closePicker();

    // Re-entrancy guard before touching the DOM (the observer re-fires).
    // Marked on the LISTBOX: the popup container is reused across opens,
    // the listbox is built fresh each time.
    listbox.setAttribute(MARK, "1");

    const trigger = findActiveTrigger();
    if (!trigger) return;
    const anchor = findAnchor(trigger);

    // Full list from the page world when it answers; the (partial) DOM
    // otherwise. The popup may have closed while we waited.
    const options = await requestOptions(trigger);
    if (!listbox.isConnected) return;
    const groups = options ? groupsFromOptions(options) : parseGroups(listbox);
    if (!groups.length) return;

    const { panel, input } = buildPickerPanel(columnsFor(groups), bucketsFor(groups), {
        placeholder: "Search fields…",
        onSelect: (item) => {
            closePicker();
            if (item.el) selectNative(item.el);
            else selectViaBridge(trigger, item.value);
        },
        onEscape: () => {
            closePicker();
            dismissNative(trigger);
        },
    });
    panel.setAttribute(MARK, "1");
    // Belt and braces with LISTBOX_SELECTOR: the grid must never look like
    // CDD's list to a later scan.
    panel.querySelector(`.${PANEL_CLASS}__columns`)?.setAttribute("role", "group");

    // Our own surface, like the Search-page Keywords picker: the same
    // floating host, anchored under the field. CDD's popup stays open
    // (that is what keeps its input focused and its state alive) but is
    // made invisible; a pick goes through its onChange, Escape through its
    // own handler, and both take the popup — and with it, us — down.
    const host = document.createElement("div");
    host.className = HOST_CLASS;
    host.setAttribute(MARK, "1");
    host.style.left = "-9999px";
    host.style.top = "-9999px";
    host.appendChild(panel);

    popup.setAttribute(HIDDEN_MARK, "1");
    document.body.appendChild(host);

    // A click into the already-focused search box must change nothing:
    // no focus traffic at all, so nothing downstream can react to it.
    input.addEventListener("mousedown", (event) => {
        if (document.activeElement === input) event.preventDefault();
    });

    // Focus moving from CDD's input into our host must not reach React
    // (see the note above dismissNative). Capture phase on document runs
    // before React's root listener.
    const guardFocus = (event) => {
        if (host.contains(event.relatedTarget)) event.stopPropagation();
    };
    // Focus leaving the host for anywhere but the trigger: close like a
    // dropdown would. A click outside does the same on mousedown, which is
    // before the focus change, so the guard never has to reason about it.
    const onFocusOut = (event) => {
        const to = event.relatedTarget;
        if (!to || host.contains(to) || isInsideTrigger(to)) return;
        closePicker();
        dismissNative(trigger);
    };
    const onPointerDownOutside = (event) => {
        if (host.contains(event.target) || isInsideTrigger(event.target)) return;
        closePicker();
        dismissNative(trigger);
    };
    // One layout pass per frame, never re-entrant: positionPanel restores
    // the columns' scrollTop, which itself fires scroll events — a scroll
    // listener that repositions synchronously would spin forever.
    let positionRaf = 0;
    const reposition = () => {
        if (positionRaf) return;
        positionRaf = requestAnimationFrame(() => {
            positionRaf = 0;
            if (host.isConnected) positionPanel(host, anchor);
        });
    };
    const onScroll = (event) => {
        if (host.contains(event.target)) return;
        reposition();
    };
    document.addEventListener("focusout", guardFocus, true);
    host.addEventListener("focusout", onFocusOut);
    document.addEventListener("mousedown", onPointerDownOutside, true);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", onScroll, true);

    open = {
        host,
        popup,
        listbox,
        cleanup: () => {
            document.removeEventListener("focusout", guardFocus, true);
            host.removeEventListener("focusout", onFocusOut);
            document.removeEventListener("mousedown", onPointerDownOutside, true);
            window.removeEventListener("resize", reposition);
            window.removeEventListener("scroll", onScroll, true);
            cancelAnimationFrame(positionRaf);
        },
    };

    // Place it now and again once layout has settled; the fonts and the
    // panel's own height sync can move it by a few pixels.
    if (host.isConnected) positionPanel(host, anchor);
    requestAnimationFrame(() => {
        if (input.isConnected) input.focus();
    });
    setTimeout(reposition, 120);
}

function scan() {
    if (!isElnEntriesPage()) {
        closePicker();
        return;
    }

    // CDD dropped its list (closed, or re-rendered): the host goes with it —
    // unless the user is in our panel, in which case whatever closed CDD's
    // popup was not the user's doing and the panel stays. A pick still works
    // with the popup closed (onChange lives on the trigger, not the popup);
    // Escape and a click outside close the panel on their own.
    if (open && !open.listbox.isConnected && !open.host.contains(document.activeElement)) closePicker();

    for (const popup of document.querySelectorAll(`${POPUP_SELECTOR}:not([${OFF_MARK}])`)) {
        const listbox = popup.querySelector(`${LISTBOX_SELECTOR}:not([${MARK}])`);
        if (!listbox || !isFieldListbox(listbox)) continue;
        if (loopDetected(popup)) continue;
        enhance(popup, listbox);
    }
}

function injectOwnStyles() {
    if (document.getElementById("cdd-eln-ffp-style")) return;
    const style = document.createElement("style");
    style.id = "cdd-eln-ffp-style";
    // CDD's popup stays open underneath (that keeps its state alive) but
    // our host stands in for it visually.
    style.textContent = `
        .selectDropdown[${HIDDEN_MARK}] {
            visibility: hidden !important;
            pointer-events: none !important;
        }
    `;
    document.head.appendChild(style);
}

export function initElnFilterFieldPicker() {
    if (started) return;
    started = true;

    injectPickerStyles();
    injectOwnStyles();

    const observer = new MutationObserver(() => scan());
    // <html>, not <body>: Turbo swaps <body> on in-app navigation.
    observer.observe(document.documentElement, { childList: true, subtree: true });
    scan();
}
