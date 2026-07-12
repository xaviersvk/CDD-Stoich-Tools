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

const STYLE_ID = "cdd-filter-field-picker-style";
const PANEL_CLASS = "cdd-ffp";

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
// Per column-body: its items/headers in original grouped order, so clearing the
// search box can put a relevance-sorted column back the way it was built.
const ORIGINAL_ORDER = new WeakMap();

/* --------------------------------------------------------------------------- */
/* Styles                                                                      */
/* --------------------------------------------------------------------------- */

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    // Everything is scoped under .cdd-ffp / [data-cdd-ffp-*] so we can never
    // leak into CDD's other dropdowns.
    style.textContent = `
        /* Collapse the native list once we've taken over, but keep it in the
           DOM so its <li>s stay clickable and React-intact. */
        ul[data-cdd-ffp-native] {
            display: none !important;
        }

        /* Turn CDD's modal Paper into a light floating popover: our own rounded
           corners + soft shadow, sized like an oversized autocomplete rather
           than a full-screen overlay. */
        .MuiPaper-root[data-cdd-ffp-paper] {
            max-height: 70vh !important;
            max-width: min(960px, calc(100vw - 24px)) !important;
            overflow: hidden !important;
            border-radius: 10px !important;
            box-shadow: 0 10px 30px rgba(15, 23, 42, 0.18),
                        0 2px 8px rgba(15, 23, 42, 0.10) !important;
        }

        .${PANEL_CLASS} {
            box-sizing: border-box;
            width: min(960px, calc(100vw - 24px));
            max-height: 70vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            border-radius: 10px;
            background: #fff;
            font-family: inherit;
            font-size: 13px;
            color: #1f2933;
        }
        .${PANEL_CLASS} *, .${PANEL_CLASS} *::before, .${PANEL_CLASS} *::after {
            box-sizing: border-box;
        }

        /* Search row: fixed header of the panel, part of the same surface. */
        .${PANEL_CLASS}__search {
            flex: 0 0 auto;
            padding: 10px 12px;
            background: #fff;
            border-bottom: 1px solid #e3e7ec;
        }
        .${PANEL_CLASS}__input {
            width: 100%;
            height: 34px;
            padding: 0 12px;
            border: 1px solid #c6ccd4;
            border-radius: 6px;
            font-size: 13px;
            outline: none;
            background: #fff;
            color: inherit;
        }
        .${PANEL_CLASS}__input:focus {
            border-color: #0077cc;
            box-shadow: 0 0 0 3px rgba(0, 119, 204, 0.15);
        }

        /* Four columns filling the remaining height; each scrolls on its own so
           the panel height stays capped and the page behind stays visible. */
        .${PANEL_CLASS}__columns {
            flex: 1 1 auto;
            min-height: 0;
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 0;
            overflow: hidden;
        }
        .${PANEL_CLASS}__col {
            display: flex;
            flex-direction: column;
            min-width: 0;
            min-height: 0;
            border-left: 1px solid #eceff3;
        }
        .${PANEL_CLASS}__col:first-child {
            border-left: 0;
        }

        .${PANEL_CLASS}__col-head {
            flex: 0 0 auto;
            padding: 8px 12px;
            background: #f5f7fa;
            border-bottom: 1px solid #e3e7ec;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            color: #52606d;
        }
        .${PANEL_CLASS}__col-body {
            flex: 1 1 auto;
            min-height: 0;
            overflow-y: auto;
            overflow-x: hidden;
            padding: 4px 0 8px;
        }

        .${PANEL_CLASS}__group {
            padding: 8px 12px 2px;
            font-size: 11px;
            font-weight: 600;
            color: #7b8794;
        }

        .${PANEL_CLASS}__item {
            display: block;
            width: 100%;
            text-align: left;
            border: 0;
            background: transparent;
            padding: 5px 12px;
            font-family: inherit;
            font-size: 13px;
            line-height: 1.35;
            color: inherit;
            cursor: pointer;
            border-radius: 0;
            white-space: normal;
            overflow-wrap: anywhere;
        }
        /* Our display:flex/block rules would otherwise beat the UA [hidden]
           rule, so filtering could never hide anything — restore it here. */
        .${PANEL_CLASS}__col[hidden],
        .${PANEL_CLASS}__item[hidden] {
            display: none !important;
        }

        .${PANEL_CLASS}__item:hover {
            background: #eef5fb;
        }
        .${PANEL_CLASS}__item:focus,
        .${PANEL_CLASS}__item:focus-visible {
            outline: none;
            background: #e1eefb;
            box-shadow: inset 3px 0 0 #0077cc;
        }
        .${PANEL_CLASS}__item.is-selected {
            font-weight: 600;
            background: #e8f2fb;
        }
        .${PANEL_CLASS}__req {
            color: #d64545;
            margin-right: 1px;
        }

        /* Subtle per-column + whole-panel empty states while searching. */
        .${PANEL_CLASS}__empty {
            padding: 10px 12px;
            font-size: 12px;
            font-style: italic;
            color: #9aa5b1;
        }
        .${PANEL_CLASS}__none {
            display: none;
            padding: 40px 12px;
            min-height: 120px;
            align-items: center;
            justify-content: center;
            text-align: center;
            font-size: 14px;
            font-style: italic;
            color: #9aa5b1;
        }
        .${PANEL_CLASS}.is-empty .${PANEL_CLASS}__columns {
            display: none;
        }
        .${PANEL_CLASS}.is-empty .${PANEL_CLASS}__none {
            display: flex;
        }

        /* Below four columns the grid wraps into rows, so per-column scrolling
           can't work — scroll the whole grid as one instead. */
        @media (max-width: 900px) {
            .${PANEL_CLASS}__columns {
                grid-template-columns: repeat(2, minmax(0, 1fr));
                overflow-y: auto;
            }
            .${PANEL_CLASS}__col-body {
                overflow: visible;
            }
            /* Re-establish the divider for the new second row. */
            .${PANEL_CLASS}__col:nth-child(odd) {
                border-left: 0;
            }
            .${PANEL_CLASS}__col:nth-child(n + 3) {
                border-top: 1px solid #eceff3;
            }
        }
        @media (max-width: 560px) {
            .${PANEL_CLASS}__columns {
                grid-template-columns: 1fr;
            }
            .${PANEL_CLASS}__col {
                border-left: 0;
            }
            .${PANEL_CLASS}__col + .${PANEL_CLASS}__col {
                border-top: 1px solid #eceff3;
            }
        }
    `;

    document.head.appendChild(style);
}

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
/* Building the panel                                                          */
/* --------------------------------------------------------------------------- */

function buildPanel(buckets) {
    const panel = document.createElement("div");
    panel.className = PANEL_CLASS;

    // --- Search row -------------------------------------------------------
    const searchRow = document.createElement("div");
    searchRow.className = `${PANEL_CLASS}__search`;

    const input = document.createElement("input");
    input.className = `${PANEL_CLASS}__input`;
    input.type = "text";
    input.placeholder = "Search attributes…";
    input.setAttribute("aria-label", "Search attributes");
    input.autocomplete = "off";
    input.spellcheck = false;
    searchRow.appendChild(input);
    panel.appendChild(searchRow);

    // --- Columns ----------------------------------------------------------
    const columns = document.createElement("div");
    columns.className = `${PANEL_CLASS}__columns`;

    let ord = 0; // running index across all items, for stable sort/restore

    for (const { key, heading } of COLUMNS) {
        const col = document.createElement("div");
        col.className = `${PANEL_CLASS}__col`;
        col.dataset.cddFfpCol = key;

        const head = document.createElement("div");
        head.className = `${PANEL_CLASS}__col-head`;
        head.textContent = heading;
        col.appendChild(head);

        const body = document.createElement("div");
        body.className = `${PANEL_CLASS}__col-body`;

        const groups = buckets[key] || [];
        for (const group of groups) {
            const groupEl = document.createElement("div");
            groupEl.className = `${PANEL_CLASS}__group`;
            groupEl.textContent = group.label;
            groupEl.dataset.cddFfpGroup = "1";
            body.appendChild(groupEl);

            for (const item of group.items) {
                const btn = buildItem(item);
                // Stable tie-break for equal scores + restore key for browsing.
                btn.dataset.ord = String(ord++);
                body.appendChild(btn);
            }
        }

        // Shown only when a search hides every field in this column.
        const empty = document.createElement("div");
        empty.className = `${PANEL_CLASS}__empty`;
        empty.textContent = "No matches";
        empty.hidden = true;
        empty.dataset.cddFfpEmpty = "1";
        body.appendChild(empty);

        col.appendChild(body);
        columns.appendChild(col);

        // Snapshot the grouped order so an emptied search box can restore it.
        ORIGINAL_ORDER.set(body, Array.from(body.children));
    }

    panel.appendChild(columns);

    // Whole-panel empty state.
    const none = document.createElement("div");
    none.className = `${PANEL_CLASS}__none`;
    none.textContent = "No matching attributes";
    panel.appendChild(none);

    wireSearch(panel, input);
    wireKeyboard(panel, input);

    return panel;
}

function buildItem(item) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `${PANEL_CLASS}__item`;
    if (item.selected) btn.classList.add("is-selected");
    btn.setAttribute("role", "option");
    btn.dataset.cddFfpItem = "1";
    // Search key = normalised field name WITHOUT the leading "*" required
    // marker, so "Sample ID" scores an exact match against "*Sample ID".
    const nameOnly = item.required ? item.label.slice(1) : item.label;
    btn.dataset.search = normalize(nameOnly).trim();

    if (item.required) {
        // Preserve the "*" required marker, but render it as an accent so the
        // field name stays readable (e.g. *Sample ID).
        const star = document.createElement("span");
        star.className = `${PANEL_CLASS}__req`;
        star.textContent = "*";
        btn.appendChild(star);
        btn.appendChild(document.createTextNode(item.label.slice(1)));
    } else {
        btn.textContent = item.label;
    }

    btn.addEventListener("click", () => selectNative(item.li));
    return btn;
}

/* --------------------------------------------------------------------------- */
/* Search filtering                                                            */
/* --------------------------------------------------------------------------- */

// Fold case and diacritics so "priloha" matches "Príloha", "id" matches "ID".
function normalize(str) {
    return str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, ""); // strip combining diacritical marks
}

// Collapse internal runs of whitespace and trim, so "  Sample   ID " behaves
// exactly like "Sample ID".
function normalizeQuery(str) {
    return normalize(str).replace(/\s+/g, " ").trim();
}

// Relevance score of a (already-normalised) label against the query.
// exact 100 > prefix 80 > whole-word 60 > substring 30 > 0 (hidden).
const SCORE_EXACT = 100;
const SCORE_PREFIX = 80;
const SCORE_WORD = 60;
const SCORE_SUBSTR = 30;

function scoreLabel(label, query) {
    if (label === query) return SCORE_EXACT;
    if (label.startsWith(query)) return SCORE_PREFIX;
    if (isWholeWord(label, query)) return SCORE_WORD;
    if (label.includes(query)) return SCORE_SUBSTR;
    return 0;
}

// True if `needle` appears in `haystack` bounded by non-alphanumeric edges
// (i.e. as a whole word/phrase), e.g. "location" in "current sample location".
function isWholeWord(haystack, needle) {
    let i = haystack.indexOf(needle);
    while (i !== -1) {
        const before = i === 0 ? " " : haystack[i - 1];
        const after =
            i + needle.length >= haystack.length
                ? " "
                : haystack[i + needle.length];
        if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) return true;
        i = haystack.indexOf(needle, i + 1);
    }
    return false;
}

function wireSearch(panel, input) {
    const columns = panel.querySelector(`.${PANEL_CLASS}__columns`);
    const cols = Array.from(panel.querySelectorAll(`.${PANEL_CLASS}__col`));

    const apply = () => {
        const query = normalizeQuery(input.value);

        if (!query) {
            restoreBrowseView(panel, columns, cols);
            return;
        }

        let liveColumns = 0;

        for (const col of cols) {
            const body = col.querySelector(`.${PANEL_CLASS}__col-body`);
            // Group headers are meaningless once results are relevance-sorted.
            for (const g of col.querySelectorAll(`[data-cdd-ffp-group]`)) {
                g.hidden = true;
            }
            const empty = col.querySelector(`[data-cdd-ffp-empty]`);
            if (empty) empty.hidden = true;

            // Score, filter, and sort this column's items by descending score
            // (ties keep their original order).
            const scored = [];
            for (const btn of col.querySelectorAll(`[data-cdd-ffp-item]`)) {
                const score = scoreLabel(btn.dataset.search, query);
                btn.hidden = score === 0;
                if (score > 0) scored.push({ btn, score, ord: Number(btn.dataset.ord) });
            }
            scored.sort((a, b) => b.score - a.score || a.ord - b.ord);
            for (const { btn } of scored) body.appendChild(btn);

            // Hide the whole column when nothing in it matches (req. 6).
            col.hidden = scored.length === 0;
            if (scored.length) liveColumns++;
        }

        // Let the surviving columns share the full width (a lone one expands).
        columns.style.gridTemplateColumns = liveColumns
            ? `repeat(${liveColumns}, minmax(0, 1fr))`
            : "";

        // Nothing anywhere → single centered message (req. 13).
        panel.classList.toggle("is-empty", liveColumns === 0);
    };

    input.addEventListener("input", apply);
}

// Empty query: put every column back into its original grouped order and show
// all items/headers again.
function restoreBrowseView(panel, columns, cols) {
    panel.classList.remove("is-empty");
    columns.style.gridTemplateColumns = "";

    for (const col of cols) {
        col.hidden = false;
        const body = col.querySelector(`.${PANEL_CLASS}__col-body`);
        const order = ORIGINAL_ORDER.get(body);
        if (order) {
            for (const node of order) body.appendChild(node);
        }
        for (const node of body.children) {
            if (node.dataset.cddFfpEmpty) node.hidden = true;
            else node.hidden = false;
        }
    }
}

/* --------------------------------------------------------------------------- */
/* Keyboard navigation                                                         */
/* --------------------------------------------------------------------------- */

function visibleItemsByColumn(panel) {
    return Array.from(panel.querySelectorAll(`.${PANEL_CLASS}__col`)).map((col) =>
        Array.from(col.querySelectorAll(`[data-cdd-ffp-item]`)).filter(
            (btn) => !btn.hidden
        )
    );
}

function wireKeyboard(panel, input) {
    panel.addEventListener("keydown", (event) => {
        const { key, target } = event;

        // Escape is handled by MUI's Modal (it closes the menu and restores
        // focus to the trigger), so we deliberately let it bubble.
        if (key === "Escape") return;

        const cols = visibleItemsByColumn(panel);
        const fromInput = target === input;

        if (fromInput) {
            if (key === "ArrowDown" || key === "Enter") {
                const first = firstNonEmptyColumn(cols);
                if (first) {
                    event.preventDefault();
                    first[0].focus();
                }
            }
            return;
        }

        if (!target.dataset || !target.dataset.cddFfpItem) return;

        // Locate the focused item within the visible grid.
        let ci = -1;
        let ii = -1;
        cols.forEach((arr, c) => {
            const idx = arr.indexOf(target);
            if (idx >= 0) {
                ci = c;
                ii = idx;
            }
        });
        if (ci < 0) return;

        if (key === "ArrowDown") {
            event.preventDefault();
            const next = cols[ci][ii + 1];
            if (next) next.focus();
        } else if (key === "ArrowUp") {
            event.preventDefault();
            if (ii > 0) cols[ci][ii - 1].focus();
            else input.focus();
        } else if (key === "ArrowRight") {
            event.preventDefault();
            focusAdjacentColumn(cols, ci, ii, +1);
        } else if (key === "ArrowLeft") {
            event.preventDefault();
            focusAdjacentColumn(cols, ci, ii, -1);
        } else if (key === "Home") {
            event.preventDefault();
            if (cols[ci][0]) cols[ci][0].focus();
        } else if (key === "End") {
            event.preventDefault();
            const arr = cols[ci];
            if (arr.length) arr[arr.length - 1].focus();
        }
        // Enter/Space on a <button> selects natively — no handling needed.
    });
}

function firstNonEmptyColumn(cols) {
    return cols.find((arr) => arr.length > 0) || null;
}

// Step to the nearest column in `dir` that has any visible item, landing on the
// item closest to the current vertical position.
function focusAdjacentColumn(cols, ci, ii, dir) {
    for (let c = ci + dir; c >= 0 && c < cols.length; c += dir) {
        const arr = cols[c];
        if (arr.length) {
            arr[Math.min(ii, arr.length - 1)].focus();
            return;
        }
    }
}

/* --------------------------------------------------------------------------- */
/* Positioning + lifecycle                                                     */
/* --------------------------------------------------------------------------- */

// Anchor the panel to its trigger like a normal dropdown: left edge aligned
// with the field, a small gap below it, flipping above when there's no room.
// MUI positioned the Paper for its old narrow width, so we override left/top
// outright. The menu doesn't re-render while open, so inline styles are safe.
const MARGIN = 8; // keep this far from every viewport edge
const GAP = 6; // offset between the trigger and the panel

function reposition(paper, anchor) {
    const rect = paper.getBoundingClientRect(); // size is position-independent
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left;
    let top;

    if (anchor && anchor.isConnected) {
        const a = anchor.getBoundingClientRect();
        left = a.left;
        top = a.bottom + GAP;

        // Flip above the trigger if it doesn't fit below but does above.
        const roomBelow = vh - a.bottom - GAP;
        if (rect.height > roomBelow && a.top - GAP > roomBelow) {
            top = a.top - GAP - rect.height;
        }
    } else {
        left = rect.left;
        top = rect.top;
    }

    // Clamp inside the viewport without ever going full-bleed.
    left = Math.max(MARGIN, Math.min(left, vw - rect.width - MARGIN));
    top = Math.max(MARGIN, Math.min(top, vh - rect.height - MARGIN));

    paper.style.left = `${left}px`;
    paper.style.top = `${top}px`;
}

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
    const panel = buildPanel(buckets);

    // Insert our panel where the list was, inside the Paper (see file header).
    paper.insertBefore(panel, ul);

    // MUI auto-focuses the (now hidden) list on mount; move focus to our search.
    // Deferring one frame lets MUI's own focus logic settle first.
    const input = panel.querySelector(`.${PANEL_CLASS}__input`);
    requestAnimationFrame(() => {
        if (input && input.isConnected) input.focus();
        if (paper.isConnected) reposition(paper, anchor);
    });

    // Reflow if the window resizes while the menu is open; torn down on close.
    const onResize = () => {
        if (paper.isConnected) reposition(paper, anchor);
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

    injectStyles();

    const observer = new MutationObserver(() => scan());
    observer.observe(document.body, { childList: true, subtree: true });

    // Catch a menu that's somehow already open at init time.
    scan();
}
