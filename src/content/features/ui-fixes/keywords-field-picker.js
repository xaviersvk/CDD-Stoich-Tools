// content/features/ui-fixes/keywords-field-picker.js
//
// Redesigns the Search-page "Keywords" field selector.
//
// Unlike the Inventory "Filter Entries" selector (a MUI <Menu>, handled by
// filter-field-picker.js), Keywords is a *plain native* <select>:
//
//   <select class="molecule_criteria__field">
//     <option value="0">Any field</option>            ← General (standalone)
//     <option value="1">Entity name</option>          ← General
//     …
//     <option value="5">Entity Fields</option>        ← category heading
//     <option value="6">- *Toxicity</option>          ← Entity field (required)
//     <option value="7">- *Request system</option>    ← Entity field
//     …
//     <option value="62">Batch Fields</option>        ← category heading
//     <option value="63">- Batch Name</option>        ← Batch field
//     …
//   </select>
//
// The option *value* is a numeric index that CDD's own change handler maps to
// the hidden field/path/data_type_name inputs — so the value, not the label, is
// authoritative and must be preserved exactly.
//
// Columns are derived from THIS list, in order — a "General" section for the
// leading standalone options, then one column per "<Object> Fields" heading the
// vault actually emits (Entity + Batch above; another vault might add Sample /
// Event). Empty categories are never rendered.
//
// A native <select> opens the browser's OS-drawn dropdown, which we can neither
// style nor overlay (the trick used for the MUI menu). So instead we:
//   1. suppress the native dropdown on the field <select> (mouse + keyboard),
//   2. open the *shared* column picker (field-picker-core.js) in our own
//      floating host, anchored under the <select>, and
//   3. on pick, write the chosen option's value back onto the <select> and fire
//      input+change so CDD's handler runs exactly as if the user had picked it.
//
// The <select> stays the source of truth, so every downstream behaviour —
// operator select, value input, Add/Remove term, saved-search serialisation,
// URL params, request payloads — is untouched. No backend change.

import {
    injectPickerStyles,
    buildPickerPanel,
    HOST_CLASS,
} from "./field-picker-core.js";

// Only the Keywords field selector — never the operator select
// (.molecule_criteria__query_style) or anything else on the page.
const FIELD_SELECT_SELECTOR = "select.molecule_criteria__field";

let started = false;
// The single currently-open picker, or null. { host, select, cleanup }.
let openPicker = null;

/* --------------------------------------------------------------------------- */
/* Deriving categories from the native <option>s                               */
/* --------------------------------------------------------------------------- */

// Derive a column heading from a section-heading option: "Entity Fields" ->
// "Entity", "Batch Fields" -> "Batch" (works for any "<Object> Fields" the vault
// emits — Sample/Event/etc. — without hardcoding the object names). Anything
// that doesn't end in " Fields" is used verbatim.
function columnHeading(headingLabel) {
    return headingLabel.trim().replace(/\s+Fields$/i, "");
}

// True if a bare option is a section heading (rather than a real field). CDD
// encodes headings two ways we can read from the DOM alone: they introduce
// dash-indented child options, and they read "<Object> Fields". Requiring
// either lets a heading with no fields under it still be recognised (and thus
// dropped) instead of leaking in as a selectable option.
function isSectionHeading(raw, nextRaw) {
    if (nextRaw && nextRaw.startsWith("-")) return true;
    return /\sFields$/i.test(raw);
}

function makeItem(select, opt, label) {
    return {
        label, // keeps any leading "*"; core strips it for scoring/highlight
        required: label.startsWith("*"),
        selected: opt.selected,
        value: opt.value, // CDD's internal index — preserved verbatim
        select,
    };
}

// Walk the <option>s once, in their original order, and split them into columns
// exactly the way CDD's list is grouped:
//   * start in a "General" section;
//   * a bare option that is a section heading ("Entity Fields", "Batch Fields",
//     …) switches the current section — deriving the column from the heading
//     text — and is NOT itself rendered as a field;
//   * a "- …" option is a field of the current section (dash = indented child);
//   * any other bare option is a standalone field of the current section (the
//     leading General entries land in "General").
// Only sections that end up with fields become columns, in source order — so a
// vault with just Entity + Batch yields exactly General / Entity / Batch, never
// empty Sample/Event columns.
//
// Returns { columns, buckets } ready for buildPickerPanel: `columns` is the
// ordered [{key, heading}] list and `buckets` maps each key to a single group
// (label "" so only the column head names it).
function parseFieldSelect(select) {
    const general = { key: "general", heading: "General", items: [] };
    const sections = [general];
    let current = general;

    const options = Array.from(select.options);
    for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        const raw = (opt.textContent || "").trim();
        if (!raw) continue;

        if (raw.startsWith("-")) {
            // Indented child field of the current section.
            current.items.push(makeItem(select, opt, raw.replace(/^-\s*/, "")));
            continue;
        }

        const nextRaw = options[i + 1]
            ? (options[i + 1].textContent || "").trim()
            : "";
        if (isSectionHeading(raw, nextRaw)) {
            // The heading ("Entity Fields", "Batch Fields", …) is itself a real,
            // selectable option in CDD's native <select>, so keep it as a choice
            // under General — preserving its internal value — while it ALSO
            // switches the active section for the "- …" fields that follow. It is
            // never additionally rendered as a child of its own section.
            general.items.push(makeItem(select, opt, raw));
            current = { key: `sec-${i}`, heading: columnHeading(raw), items: [] };
            sections.push(current);
            continue;
        }

        // Standalone bare field of the current section.
        current.items.push(makeItem(select, opt, raw));
    }

    const columns = [];
    const buckets = {};
    for (const sec of sections) {
        if (!sec.items.length) continue; // drop empty categories entirely
        columns.push({ key: sec.key, heading: sec.heading });
        buckets[sec.key] = [{ label: "", items: sec.items }];
    }
    return { columns, buckets };
}

/* --------------------------------------------------------------------------- */
/* Selection (delegated to the real <select>)                                  */
/* --------------------------------------------------------------------------- */

// Write the chosen option's value back onto the <select> and fire the events
// CDD listens for. Using the prototype value setter updates React's internal
// value tracker (when the builder is React-controlled) so the change isn't
// deduped; dispatching both input and change also covers a plain jQuery
// `.on("change")` handler. Either way CDD's own logic runs — we never compute
// field/path/data_type_name ourselves.
function applySelection(select, value) {
    const setter = Object.getOwnPropertyDescriptor(
        HTMLSelectElement.prototype,
        "value"
    ).set;
    setter.call(select, value);
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
}

/* --------------------------------------------------------------------------- */
/* Open / close lifecycle                                                      */
/* --------------------------------------------------------------------------- */

function closePicker({ refocus = true } = {}) {
    if (!openPicker) return;
    const { host, select, cleanup } = openPicker;
    openPicker = null;
    cleanup();
    if (host.isConnected) host.remove();
    if (refocus && select.isConnected) select.focus();
}

// Open the picker under `select`. `seedChar` (a printable key that triggered the
// open) pre-fills the search box so typing on the closed select flows straight
// into filtering.
function openPickerFor(select, seedChar) {
    // Toggle: re-triggering on the same select closes it.
    if (openPicker && openPicker.select === select) {
        closePicker();
        return;
    }
    closePicker({ refocus: false });

    const { columns, buckets } = parseFieldSelect(select);

    const host = document.createElement("div");
    host.className = HOST_CLASS;
    // Off-screen until positioned, so it never flashes at 0,0.
    host.style.left = "-9999px";
    host.style.top = "-9999px";

    const { panel, input } = buildPickerPanel(columns, buckets, {
        placeholder: "Search fields…",
        onSelect: (item) => {
            applySelection(item.select, item.value);
            closePicker();
        },
        onEscape: () => closePicker(),
    });
    host.appendChild(panel);
    document.body.appendChild(host);

    // Dismiss on any pointer/focus outside the host, on Tab out of it, and keep
    // the host glued to the select while the page scrolls or resizes.
    const onPointerDown = (event) => {
        if (!host.contains(event.target)) closePicker({ refocus: false });
    };
    const onFocusIn = (event) => {
        if (!host.contains(event.target) && event.target !== select) {
            closePicker({ refocus: false });
        }
    };
    const onReflow = () => {
        if (host.isConnected) positionHost(host, select);
    };
    // Deferred so the very mousedown/keydown that opened us doesn't close us.
    const attach = () => {
        document.addEventListener("mousedown", onPointerDown, true);
        document.addEventListener("focusin", onFocusIn, true);
    };
    const timer = setTimeout(attach, 0);
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);

    openPicker = {
        host,
        select,
        cleanup: () => {
            clearTimeout(timer);
            document.removeEventListener("mousedown", onPointerDown, true);
            document.removeEventListener("focusin", onFocusIn, true);
            window.removeEventListener("resize", onReflow);
            window.removeEventListener("scroll", onReflow, true);
        },
    };

    if (seedChar) {
        input.value = seedChar;
        input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    // Position after layout, then focus the search box.
    requestAnimationFrame(() => {
        if (host.isConnected) positionHost(host, select);
        if (input.isConnected) input.focus();
    });
}

/* --------------------------------------------------------------------------- */
/* Positioning — keep the panel visually tethered to the field                 */
/* --------------------------------------------------------------------------- */
//
// A wide (up to 960px) panel dropping from a narrow, right-column field needs
// more care than the shared positioner (which is tuned for the MUI menu). Two
// things make it feel *attached* to the Keywords field:
//
//   * Height is capped to the room actually available beside the field, so the
//     panel always sits directly under (or above) it with a small gap and its
//     columns scroll internally — it never has to slide up over the field to
//     fit, which is what read as "detached".
//   * Horizontally the panel is tied to a field edge: left edge aligned to the
//     field's left, or (when that overflows the right) right edge aligned to the
//     field's right, before any viewport clamp.

const GAP = 6; // 4–8px breathing room between the field and the panel
const MARGIN = 8; // keep this far from every viewport edge
// If at least this much room is free below the field (clear of the Search
// button), open below; otherwise consider flipping above.
const MIN_ROOM_BELOW = 240;

function positionHost(host, anchor) {
    const panel = host.firstElementChild;
    const a = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Measure the panel's natural height with no cap, so we can decide whether
    // it needs to scroll internally.
    if (panel) panel.style.maxHeight = "";
    const width = host.getBoundingClientRect().width;
    const natural = host.getBoundingClientRect().height;

    // Vertical room below, kept clear of the Search button when it sits below
    // the field so the panel doesn't cover it unless it has to.
    let belowLimit = vh - MARGIN;
    const searchBtn = document.getElementById("search_button");
    if (searchBtn) {
        const s = searchBtn.getBoundingClientRect();
        if (s.top >= a.bottom) belowLimit = Math.min(belowLimit, s.top - GAP);
    }
    const roomBelow = belowLimit - (a.bottom + GAP);
    const roomAbove = a.top - GAP - MARGIN;

    // Prefer directly below whenever there's enough space; otherwise flip above
    // only if it genuinely has more room. Either way the panel stays anchored
    // to the field.
    let placeBelow;
    if (roomBelow >= Math.min(natural, MIN_ROOM_BELOW)) placeBelow = true;
    else placeBelow = roomAbove <= roomBelow;

    // Cap at the room available on the chosen side, but never taller than the
    // existing 70vh sensible maximum.
    const avail = Math.min(
        Math.max(0, placeBelow ? roomBelow : roomAbove),
        Math.round(vh * 0.7)
    );
    if (panel) panel.style.maxHeight = `${Math.floor(avail)}px`;
    const shown = Math.min(natural, avail);
    const top = placeBelow ? a.bottom + GAP : a.top - GAP - shown;

    // Tie a panel edge to a field edge: left-align, falling back to right-align
    // when the wide panel would overflow the right viewport edge.
    let left = a.left;
    if (left + width > vw - MARGIN) left = a.right - width;
    left = Math.max(MARGIN, Math.min(left, vw - width - MARGIN));

    host.style.left = `${Math.round(left)}px`;
    host.style.top = `${Math.round(Math.max(MARGIN, top))}px`;
}

/* --------------------------------------------------------------------------- */
/* Intercepting the native dropdown                                            */
/* --------------------------------------------------------------------------- */

// Suppressing a native <select> means catching every gesture that would open it
// or change its value while closed: the pointer, and the keyboard (Enter/Space/
// arrows open it; a printable key does incremental type-select). We handle all
// of them in the capture phase and route into our picker instead. Delegating on
// document (not per-element) covers the selects CDD clones in via "Add a term"
// for free.

function onDocMouseDown(event) {
    const select = event.target.closest?.(FIELD_SELECT_SELECTOR);
    if (!select) return;
    // Stop the OS dropdown; open ours anchored to the same <select>.
    event.preventDefault();
    event.stopPropagation();
    select.focus();
    openPickerFor(select);
}

function onDocKeyDown(event) {
    // While the picker is open its own handlers own the keyboard.
    if (openPicker) return;

    const select = event.target.closest?.(FIELD_SELECT_SELECTOR);
    if (!select) return;

    const { key } = event;
    if (event.altKey || event.ctrlKey || event.metaKey) {
        // Alt+Down opens a native select; anything else with a modifier we
        // leave alone (don't hijack shortcuts).
        if (!(event.altKey && key === "ArrowDown")) return;
    }

    const printable = key.length === 1;
    const opens =
        key === "Enter" ||
        key === " " ||
        key === "Spacebar" ||
        key === "ArrowDown" ||
        key === "ArrowUp";

    if (!printable && !opens) return; // Tab, Shift, etc. pass through

    event.preventDefault();
    event.stopPropagation();
    openPickerFor(select, printable ? key : undefined);
}

export function initKeywordsFieldPicker() {
    if (started) return;
    started = true;

    injectPickerStyles();

    document.addEventListener("mousedown", onDocMouseDown, true);
    document.addEventListener("keydown", onDocKeyDown, true);
}
