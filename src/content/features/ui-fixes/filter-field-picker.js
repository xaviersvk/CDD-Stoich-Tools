// content/features/ui-fixes/filter-field-picker.js
//
// Redesigns CDD's Inventory "Filter Entries" field selector.
//
// CDD renders that selector as a single MUI <Menu> (portalled to end of <body>
// as `#menu- .MuiPaper-root > ul[role="listbox"]`) whose <li> options stack
// Sample, Batch, Entity and Event attributes into one very long, very narrow
// column. On a Vault with many custom fields it becomes an endless scroll.
//
// We do NOT own that React component, so instead of rebuilding it we overlay it:
// when the field menu opens we build our own four-column picker and append it
// *inside* CDD's own .MuiPaper-root, then hide (but keep) the native <ul>.
//
// Appending inside the Paper matters for two reasons:
//   1. MUI's Modal focus-trap only allows focus between its sentinel nodes,
//      which wrap the Paper. Our search input lives inside the Paper, so the
//      trap is satisfied and never yanks focus away from us.
//   2. When the menu closes, React removes the Paper subtree in one shot; our
//      injected panel is an unknown DOM descendant that rides along with it, so
//      React never calls removeChild on a node it didn't create (which is what
//      throws the infamous NotFoundError when you move React-managed nodes).
//
// Selection is delegated straight back to CDD: clicking one of our items
// dispatches a real mousedown/mouseup/click sequence on the original <li>, so
// CDD's own MenuItem handler runs, the same value is chosen, and the menu closes
// itself. We never touch data-value, request payloads, or filter semantics —
// this is a pure presentation layer over the existing options.
//
// The visual/search/keyboard machinery is shared with the Search-page Keywords
// picker; see field-picker-core.js. This file is just the MUI-menu adapter:
// parse <li> options, position, delegate selection.

import {
    injectPickerStyles,
    buildPickerPanel,
    positionPanel,
} from "./field-picker-core.js";

// The single marker that identifies THIS menu (and separates it from CDD's
// operator/style selects, the columns editor, and every other MUI menu, which
// contain neither of these classes).
const FIELD_ITEM_SELECTOR = "li.search-bar__filters__field-name";

// data-value prefix -> our four buckets. The prefix is authoritative, so we
// never classify by the (localisable) visible text.
const CATEGORY_BY_PREFIX = {
    SAMPLE: "sample",
    BATCH: "batch",
    MOLECULE: "entity", // CDD calls the Entity object "molecule" internally
    EVENT: "event",
};

// Fixed left-to-right column order + headings (matches the requested design).
const COLUMNS = [
    { key: "sample", heading: "Sample" },
    { key: "batch", heading: "Batch" },
    { key: "entity", heading: "Entity" },
    { key: "event", heading: "Event" },
];

let started = false;
// The window-level listeners for the currently-open panel, torn down on close.
let activeCleanup = null;

/* --------------------------------------------------------------------------- */
/* Parsing CDD's native option list                                            */
/* --------------------------------------------------------------------------- */

// Walk the native <ul> once and bucket every field <li> into one of the four
// categories, preserving CDD's grouping (vault groups first, then "Default").
// Returns { sample: [group,…], batch: […], entity: […], event: […] } where each
// group is { label, items:[{ label, required, li }] }. We keep live references
// to the original <li>s — the picker is a view over CDD's data, not a copy.
function parseNativeItems(ul) {
    const buckets = { sample: [], batch: [], entity: [], event: [] };
    // Track the current second-level group label per category, so a group only
    // materialises in the category its fields actually belong to.
    const currentGroupLabel = {};
    const currentGroupRef = {};

    for (const li of ul.children) {
        if (li.classList.contains("search-bar__filters__second-level-category")) {
            // A new grouping header (e.g. the vault name, or "Default").
            const label = li.textContent.trim();
            // Applies to whichever category's fields come next; reset all so the
            // next field in each category opens a fresh group under this label.
            for (const key of Object.keys(buckets)) {
                currentGroupLabel[key] = label;
                currentGroupRef[key] = null;
            }
            continue;
        }

        if (!li.classList.contains("search-bar__filters__field-name")) {
            // top-level-category headers and anything else: skip, category is
            // taken from the field's own data-value below.
            continue;
        }

        const value = li.getAttribute("data-value") || "";
        const prefix = value.split("::")[0];
        const category = CATEGORY_BY_PREFIX[prefix];
        if (!category) continue;

        const rawLabel = li.textContent.trim();
        const required = rawLabel.startsWith("*");

        // Open a group lazily so empty groups never render.
        let group = currentGroupRef[category];
        if (!group) {
            group = {
                label: currentGroupLabel[category] || "Fields",
                items: [],
            };
            buckets[category].push(group);
            currentGroupRef[category] = group;
        }

        group.items.push({
            label: rawLabel,
            required,
            selected: li.getAttribute("aria-selected") === "true",
            li,
        });
    }

    return buckets;
}

/* --------------------------------------------------------------------------- */
/* Selection (delegated to CDD's real <li>)                                    */
/* --------------------------------------------------------------------------- */

// Fire the same mouse sequence CDD's MenuItem expects, on the original <li>.
// This runs CDD's own React onClick handler — the value chosen and everything
// downstream is exactly as if the user had clicked the native option.
function selectNative(li) {
    const rect = li.getBoundingClientRect();
    const opts = {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 0,
        // The native <li> is hidden (display:none) so its rect is empty; the
        // coordinates are irrelevant to MUI's click handler, they're only here
        // to form well-shaped events.
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
    };
    li.dispatchEvent(new MouseEvent("mousedown", opts));
    li.dispatchEvent(new MouseEvent("mouseup", opts));
    li.dispatchEvent(new MouseEvent("click", opts));
}

/* --------------------------------------------------------------------------- */
/* Positioning + lifecycle                                                     */
/* --------------------------------------------------------------------------- */

// The field <select> that opened this menu: it owns the list via aria-controls.
function findAnchor(ul) {
    if (ul.id) {
        const byControls = document.querySelector(`[aria-controls="${ul.id}"]`);
        if (byControls) return byControls;
    }
    return document.querySelector(
        '.filter-field-select [role="combobox"][aria-expanded="true"]'
    );
}

function enhance(paper) {
    const ul = paper.querySelector('ul[role="listbox"]');
    if (!ul) return;

    // Drop any stray listener from a previous menu that closed without a scan
    // clearing it, so resize listeners can never accumulate.
    if (activeCleanup) {
        activeCleanup();
        activeCleanup = null;
    }

    // Re-entrancy guard: mark before building (buildPanel mutates the DOM and
    // re-triggers the observer).
    paper.setAttribute("data-cdd-ffp-paper", "1");
    ul.setAttribute("data-cdd-ffp-native", "1");

    // Capture the trigger now, before selecting anything can collapse the menu.
    const anchor = findAnchor(ul);

    const buckets = parseNativeItems(ul);
    // Escape/dismissal is owned by MUI's Modal here, so no onEscape.
    const { panel, input } = buildPickerPanel(COLUMNS, buckets, {
        onSelect: (item) => selectNative(item.li),
    });

    // Insert our panel where the list was, inside the Paper (see file header).
    paper.insertBefore(panel, ul);

    // MUI auto-focuses the (now hidden) list on mount; move focus to our search.
    // Deferring one frame lets MUI's own focus logic settle first.
    requestAnimationFrame(() => {
        if (input && input.isConnected) input.focus();
        if (paper.isConnected) positionPanel(paper, anchor);
    });

    // Reflow if the window resizes while the menu is open; torn down on close.
    const onResize = () => {
        if (paper.isConnected) positionPanel(paper, anchor);
    };
    window.addEventListener("resize", onResize);
    activeCleanup = () => window.removeEventListener("resize", onResize);
}

/* --------------------------------------------------------------------------- */
/* Observation                                                                 */
/* --------------------------------------------------------------------------- */

function scan() {
    // Any open MUI menu Paper that holds field-name options and isn't ours yet.
    const papers = document.querySelectorAll(
        ".MuiPaper-root.MuiMenu-paper:not([data-cdd-ffp-paper]), " +
        ".MuiPopover-paper:not([data-cdd-ffp-paper])"
    );

    for (const paper of papers) {
        if (paper.querySelector(FIELD_ITEM_SELECTOR)) {
            enhance(paper);
        }
    }

    // The menu (and our panel) is gone: drop the window listener.
    if (activeCleanup && !document.querySelector("[data-cdd-ffp-paper]")) {
        activeCleanup();
        activeCleanup = null;
    }
}

export function initFilterFieldPicker() {
    if (started) return;
    started = true;

    injectPickerStyles();

    const observer = new MutationObserver(() => scan());
    // <html>, not <body>: Turbo swaps <body> on in-app navigation.
    observer.observe(document.documentElement, { childList: true, subtree: true });

    // Catch a menu that's somehow already open at init time.
    scan();
}
