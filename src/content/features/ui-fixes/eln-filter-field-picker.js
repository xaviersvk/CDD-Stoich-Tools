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
// tears the whole portal down in one go, our panel with it.

import { buildPickerPanel, injectPickerStyles, positionPanel } from "./field-picker-core.js";

const TRIGGER_SELECTOR = '[data-autotest-id="filter-field-select"]';
const POPUP_SELECTOR = '.selectDropdown[data-component="PopupContainer"]';
const LISTBOX_SELECTOR = '[role="listbox"]';
const OPTION_SELECTOR = '[role="option"]';
const MARK = "data-cdd-eln-ffp";

// The first group is CDD's built-in set; it is labelled "ELN" in the list.
const DEFAULT_GROUP_LABEL = "ELN";

let started = false;
let activeCleanup = null;

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
        buckets[`g${i}`] = [{ label: g.label, items: g.items }];
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

function findAnchor() {
    const trigger = document.querySelector(`${TRIGGER_SELECTOR} [data-component="SelectBox"]`);
    return trigger || document.querySelector(TRIGGER_SELECTOR);
}

function enhance(popup, listbox) {
    if (activeCleanup) {
        activeCleanup();
        activeCleanup = null;
    }

    // Re-entrancy guard before touching the DOM (the observer re-fires).
    popup.setAttribute(MARK, "1");
    listbox.setAttribute(`${MARK}-native`, "1");

    const anchor = findAnchor();
    const groups = parseGroups(listbox);
    if (!groups.length) return;

    const { panel, input } = buildPickerPanel(columnsFor(groups), bucketsFor(groups), {
        placeholder: "Search fields…",
        onSelect: (item) => selectNative(item.el),
    });

    // CDD sizes the popup to the trigger's 270px; let it grow to the panel.
    popup.style.width = "auto";
    popup.style.maxWidth = "none";
    for (const node of [listbox.parentElement, listbox.parentElement?.parentElement]) {
        if (node && node !== popup) {
            node.style.width = "auto";
            node.style.maxWidth = "none";
        }
    }

    listbox.parentElement.insertBefore(panel, listbox);
    listbox.style.display = "none";

    requestAnimationFrame(() => {
        if (input && input.isConnected) input.focus();
        if (popup.isConnected) positionPanel(popup, anchor);
    });

    const onResize = () => {
        if (popup.isConnected) positionPanel(popup, anchor);
    };
    window.addEventListener("resize", onResize);
    activeCleanup = () => window.removeEventListener("resize", onResize);
}

function scan() {
    if (!isElnEntriesPage()) return;

    for (const popup of document.querySelectorAll(`${POPUP_SELECTOR}:not([${MARK}])`)) {
        const listbox = popup.querySelector(LISTBOX_SELECTOR);
        if (listbox && isFieldListbox(listbox)) enhance(popup, listbox);
    }

    if (activeCleanup && !document.querySelector(`[${MARK}]`)) {
        activeCleanup();
        activeCleanup = null;
    }
}

export function initElnFilterFieldPicker() {
    if (started) return;
    started = true;

    injectPickerStyles();

    const observer = new MutationObserver(() => scan());
    // <html>, not <body>: Turbo swaps <body> on in-app navigation.
    observer.observe(document.documentElement, { childList: true, subtree: true });
    scan();
}
