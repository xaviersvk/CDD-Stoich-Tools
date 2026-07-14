// content/features/ui-fixes/field-picker-core.js
//
// Shared engine for CDD's structured, multi-column field pickers.
//
// Two very different CDD selectors are redesigned into the same picker:
//   * the Inventory "Filter Entries" field menu — a MUI <Menu> of <li> options
//     (see filter-field-picker.js), and
//   * the Search-page "Keywords" field <select> — a plain native dropdown
//     (see keywords-field-picker.js).
//
// The *presentation* (a floating, searchable, relevance-sorted, keyboard-driven
// column grid) is identical for both, so it lives here. Each consumer supplies
// only what differs: the column set, the parsed buckets, how a chosen item is
// applied back to CDD, and (optionally) an Escape handler. Everything visual and
// interactive — styles, search normalisation, relevance scoring, highlight,
// column rendering, keyboard navigation and viewport-aware positioning — is
// shared, so the two pickers are literally the same component with two adapters.

export const STYLE_ID = "cdd-filter-field-picker-style";
export const PANEL_CLASS = "cdd-ffp";
// Standalone floating host used when there's no CDD surface to overlay (the
// native-<select> case). The MUI case injects the panel into CDD's own Paper.
export const HOST_CLASS = "cdd-ffp-host";

// Per column-body: its items/headers in original grouped order, so clearing the
// search box can put a relevance-sorted column back the way it was built.
const ORIGINAL_ORDER = new WeakMap();

/* --------------------------------------------------------------------------- */
/* Styles                                                                      */
/* --------------------------------------------------------------------------- */

export function injectPickerStyles() {
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
            max-height: min(70vh, 640px) !important;
            max-width: min(960px, calc(100vw - 24px)) !important;
            overflow: hidden !important;
            border-radius: 10px !important;
            box-shadow: 0 10px 30px rgba(15, 23, 42, 0.18),
                        0 2px 8px rgba(15, 23, 42, 0.10) !important;
        }

        /* Standalone floating host (native-<select> case): its own surface,
           since there's no MUI Paper to ride on. Floats above the page without
           dimming it. */
        .${HOST_CLASS} {
            position: fixed;
            z-index: 2147483000;
            border-radius: 10px;
            border: 1px solid #e3e7ec;
            box-shadow: 0 10px 30px rgba(15, 23, 42, 0.18),
                        0 2px 8px rgba(15, 23, 42, 0.10);
        }

        .${PANEL_CLASS} {
            box-sizing: border-box;
            width: min(960px, calc(100vw - 24px));
            max-height: min(70vh, 640px);
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

        /* Columns fill the remaining height; each scrolls on its own so the
           panel height stays capped and the page behind stays visible. Empty
           categories aren't rendered at all, so the track count follows the
           number of columns actually shown (data-cols, 1–5) at wide widths;
           the responsive collapse below governs narrow screens. */
        .${PANEL_CLASS}__columns {
            flex: 1 1 auto;
            min-height: 0;
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            /* The single row must be minmax(0, 1fr), not the implicit auto:
               an auto row sizes to the tallest column's content, so the column
               bodies never receive a constrained height and Firefox clips
               their tails unscrollably (Chromium re-constrains stretched items
               against the container, which masked this). With 1fr the row
               equals the grid's own (capped) height and each column body owns
               exactly the overflow. */
            grid-template-rows: minmax(0, 1fr);
            gap: 0;
            overflow: hidden;
        }
        @media (min-width: 901px) {
            .${PANEL_CLASS}__columns[data-cols="1"] { grid-template-columns: repeat(1, minmax(0, 1fr)); }
            .${PANEL_CLASS}__columns[data-cols="2"] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
            .${PANEL_CLASS}__columns[data-cols="3"] { grid-template-columns: repeat(3, minmax(0, 1fr)); }
            .${PANEL_CLASS}__columns[data-cols="4"] { grid-template-columns: repeat(4, minmax(0, 1fr)); }
            .${PANEL_CLASS}__columns[data-cols="5"] { grid-template-columns: repeat(5, minmax(0, 1fr)); }
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
            scrollbar-gutter: stable;
            /* Bottom padding keeps the last item clear of the clip edge. */
            padding: 4px 0 10px;
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
        /* The matched slice of the name while searching. */
        .${PANEL_CLASS}__hl {
            background: #fff3b0;
            color: inherit;
            font-weight: 700;
            border-radius: 2px;
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
                /* Back to content-sized rows: here the grid itself is the one
                   scroller, so its rows must grow with their content. */
                grid-template-rows: none;
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
/* Building the panel                                                          */
/* --------------------------------------------------------------------------- */

// Build the whole picker panel from a category spec.
//
//   columns : [{ key, heading }]              left-to-right column order
//   buckets : { [key]: [ group, … ] } where group = { label, items:[item] }
//             and item = { label, required, selected, …payload } — `label` may
//             carry a leading "*" required marker; any extra fields (an <li>, a
//             value, …) are opaque and handed straight back to onSelect.
//   opts    : { placeholder, onSelect(item), onEscape() }
//
// Returns { panel, input }. Selection, dismissal and positioning are the
// caller's to wire (via onSelect/onEscape and positionPanel) — this function
// owns only the panel's own DOM, search and in-panel keyboard nav.
export function buildPickerPanel(columns, buckets, opts = {}) {
    const { placeholder = "Search attributes…", onSelect, onEscape } = opts;

    const panel = document.createElement("div");
    panel.className = PANEL_CLASS;

    // --- Search row -------------------------------------------------------
    const searchRow = document.createElement("div");
    searchRow.className = `${PANEL_CLASS}__search`;

    const input = document.createElement("input");
    input.className = `${PANEL_CLASS}__input`;
    input.type = "text";
    input.placeholder = placeholder;
    input.setAttribute("aria-label", placeholder);
    input.autocomplete = "off";
    input.spellcheck = false;
    searchRow.appendChild(input);
    panel.appendChild(searchRow);

    // --- Columns ----------------------------------------------------------
    const columnsEl = document.createElement("div");
    columnsEl.className = `${PANEL_CLASS}__columns`;
    columnsEl.setAttribute("role", "listbox");

    let ord = 0; // running index across all items, for stable sort/restore
    let rendered = 0; // columns that actually have fields (empties are skipped)

    for (const { key, heading } of columns) {
        const groups = buckets[key] || [];
        // Hide empty categories entirely, so the grid only sizes tracks for the
        // columns that carry fields.
        if (!groups.some((g) => g.items && g.items.length)) continue;
        rendered++;

        const col = document.createElement("div");
        col.className = `${PANEL_CLASS}__col`;
        col.dataset.cddFfpCol = key;

        const head = document.createElement("div");
        head.className = `${PANEL_CLASS}__col-head`;
        head.textContent = heading;
        col.appendChild(head);

        const body = document.createElement("div");
        body.className = `${PANEL_CLASS}__col-body`;

        for (const group of groups) {
            // A group only renders a sub-label when it has one; single-group
            // columns (Keywords) pass "" so the column head stands alone.
            if (group.label) {
                const groupEl = document.createElement("div");
                groupEl.className = `${PANEL_CLASS}__group`;
                groupEl.textContent = group.label;
                groupEl.dataset.cddFfpGroup = "1";
                body.appendChild(groupEl);
            }

            for (const item of group.items) {
                const btn = buildItem(item, onSelect);
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
        columnsEl.appendChild(col);

        // Snapshot the grouped order so an emptied search box can restore it.
        ORIGINAL_ORDER.set(body, Array.from(body.children));
    }

    // Drives the wide-screen grid template (see CSS); the responsive collapse
    // still governs narrow widths.
    columnsEl.dataset.cols = String(rendered);
    panel.appendChild(columnsEl);

    // Whole-panel empty state.
    const none = document.createElement("div");
    none.className = `${PANEL_CLASS}__none`;
    none.textContent = "No matching fields";
    panel.appendChild(none);

    wireSearch(panel, input);
    wireKeyboard(panel, input, onEscape);

    return { panel, input };
}

function buildItem(item, onSelect) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `${PANEL_CLASS}__item`;
    if (item.selected) btn.classList.add("is-selected");
    btn.setAttribute("role", "option");
    btn.dataset.cddFfpItem = "1";

    // Field name WITHOUT the leading "*" required marker, so "Sample ID" scores
    // an exact match against "*Sample ID".
    const nameOnly = item.required ? item.label.slice(1) : item.label;
    // Fold once (case + diacritics) keeping an index map back to the original,
    // so we can both score and highlight the exact matched slice of the name.
    const fold = foldWithMap(nameOnly);

    btn.dataset.search = fold.norm; // scoring key
    btn._ffpName = nameOnly; // original text as displayed
    btn._ffpRequired = item.required;
    btn._ffpFold = fold;

    if (typeof onSelect === "function") {
        btn.addEventListener("click", () => onSelect(item));
    }

    paintItem(btn, ""); // initial plain render
    return btn;
}

// Render a button's label, wrapping the slice that matches `query` (already
// normalised) in a highlight span. `query` empty -> plain text.
function paintItem(btn, query) {
    btn.replaceChildren();

    if (btn._ffpRequired) {
        const star = document.createElement("span");
        star.className = `${PANEL_CLASS}__req`;
        star.textContent = "*";
        btn.appendChild(star);
    }

    const name = btn._ffpName;
    const { norm, map } = btn._ffpFold;
    const at = query ? norm.indexOf(query) : -1;

    if (at === -1) {
        btn.appendChild(document.createTextNode(name));
        return;
    }

    // Map the normalised [at, at+len) range back onto the original characters.
    const start = map[at];
    const end = map[at + query.length - 1] + 1;

    if (start > 0) btn.appendChild(document.createTextNode(name.slice(0, start)));
    const mark = document.createElement("span");
    mark.className = `${PANEL_CLASS}__hl`;
    mark.textContent = name.slice(start, end);
    btn.appendChild(mark);
    if (end < name.length) btn.appendChild(document.createTextNode(name.slice(end)));
}

// Fold `str` (lower-case + strip diacritics) while recording, for each folded
// character, the index of the original character it came from — so a match
// found in the folded string can be projected back onto the displayed text.
function foldWithMap(str) {
    let norm = "";
    const map = [];
    for (let i = 0; i < str.length; i++) {
        const folded = normalize(str[i]);
        for (let j = 0; j < folded.length; j++) {
            norm += folded[j];
            map.push(i);
        }
    }
    return { norm, map };
}

/* --------------------------------------------------------------------------- */
/* Search filtering                                                            */
/* --------------------------------------------------------------------------- */

// Fold case and diacritics so "priloha" matches "Príloha", "id" matches "ID".
export function normalize(str) {
    return str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, ""); // strip combining diacritical marks
}

// Collapse internal runs of whitespace and trim, so "  Sample   ID " behaves
// exactly like "Sample ID".
export function normalizeQuery(str) {
    return normalize(str).replace(/\s+/g, " ").trim();
}

// Relevance score of a (already-normalised) label against the query.
// exact 100 > prefix 80 > whole-word 60 > substring 30 > 0 (hidden).
const SCORE_EXACT = 100;
const SCORE_PREFIX = 80;
const SCORE_WORD = 60;
const SCORE_SUBSTR = 30;

export function scoreLabel(label, query) {
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

// Gecko workaround: a column flex container sized only by max-height does not
// reliably re-flex its children against the clamped height — the panel box is
// clipped at the cap, but the columns grid inside keeps its unclamped content
// height, so the per-column scrollers think nothing (or too little) overflows
// and the tail of a long column ends up beyond the scrollbar's reach. Chromium
// re-runs flex layout with the clamped size, which is why it never showed.
//
// The fix is to hand the scrollable region a finite explicit pixel height, but
// only when the content actually overflows the capped panel (detected by
// comparing the panel's scroll and client heights after clearing any previous
// override). When everything fits, the inline height is removed and the panel
// keeps sizing to its content exactly as before — so browsers without the bug,
// and short lists everywhere, are pixel-identical to the old behaviour.
export function syncColumnsHeight(panel) {
    const columns = panel.querySelector(`.${PANEL_CLASS}__columns`);
    if (!columns) return;

    columns.style.height = "";

    // 1px tolerance for fractional layouts at odd browser zooms.
    if (panel.scrollHeight - panel.clientHeight <= 1) return;

    const search = panel.querySelector(`.${PANEL_CLASS}__search`);
    const height = panel.clientHeight - (search ? search.offsetHeight : 0);
    if (height > 0) columns.style.height = `${height}px`;
}

function wireSearch(panel, input) {
    const columns = panel.querySelector(`.${PANEL_CLASS}__columns`);
    const cols = Array.from(panel.querySelectorAll(`.${PANEL_CLASS}__col`));

    const apply = () => {
        const query = normalizeQuery(input.value);

        if (!query) {
            restoreBrowseView(panel, columns, cols);
            // Re-measure: the restored (full) list may overflow the cap again.
            syncColumnsHeight(panel);
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
                if (score > 0) {
                    paintItem(btn, query); // highlight the matched slice
                    scored.push({ btn, score, ord: Number(btn.dataset.ord) });
                }
            }
            scored.sort((a, b) => b.score - a.score || a.ord - b.ord);
            for (const { btn } of scored) body.appendChild(btn);

            // Hide the whole column when nothing in it matches.
            col.hidden = scored.length === 0;
            if (scored.length) liveColumns++;
        }

        // Let the surviving columns share the full width (a lone one expands).
        columns.style.gridTemplateColumns = liveColumns
            ? `repeat(${liveColumns}, minmax(0, 1fr))`
            : "";

        // Nothing anywhere → single centered message.
        panel.classList.toggle("is-empty", liveColumns === 0);

        // Filtering changes the content height, so re-derive whether the
        // columns still need an explicit height (see syncColumnsHeight).
        syncColumnsHeight(panel);
    };

    input.addEventListener("input", apply);
}

// Empty query: put every column back into its original grouped order and show
// all items/headers again.
function restoreBrowseView(panel, columns, cols) {
    panel.classList.remove("is-empty");
    // Clear the inline template so the CSS grid (incl. data-cols + responsive
    // rules) governs the browse view again.
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
            // Drop any leftover highlight from the previous query.
            if (node.dataset.cddFfpItem) paintItem(node, "");
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

// `onEscape` is optional: when the caller owns dismissal (native-<select> host)
// it closes the picker here; when omitted (MUI menu) Escape is left to bubble to
// MUI's Modal, which closes the menu and restores focus to the trigger.
function wireKeyboard(panel, input, onEscape) {
    panel.addEventListener("keydown", (event) => {
        const { key, target } = event;

        if (key === "Escape") {
            if (onEscape) {
                event.preventDefault();
                event.stopPropagation();
                onEscape();
            }
            return;
        }

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
/* Positioning                                                                 */
/* --------------------------------------------------------------------------- */

// Anchor a fixed-positioned surface to its trigger like a normal dropdown: left
// edge aligned with the field, a small gap below it, flipping above when there's
// no room, and always clamped inside the viewport (never full-bleed). Works for
// both CDD's MUI Paper and our own floating host.
const MARGIN = 8; // keep this far from every viewport edge
const GAP = 6; // offset between the trigger and the surface

export function positionPanel(surface, anchor) {
    // Settle the panel's internal heights before measuring the surface: on
    // open and on every resize the columns grid may need (or may no longer
    // need) its explicit pixel height (see syncColumnsHeight).
    const panel = surface.classList.contains(PANEL_CLASS)
        ? surface
        : surface.querySelector(`.${PANEL_CLASS}`);
    if (panel) syncColumnsHeight(panel);

    const rect = surface.getBoundingClientRect(); // size is position-independent
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

    surface.style.left = `${left}px`;
    surface.style.top = `${top}px`;
}
