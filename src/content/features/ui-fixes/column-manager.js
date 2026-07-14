// content/features/ui-fixes/column-manager.js
//
// Redesigns CDD's "Select and reorder columns" dialog (its React
// `ColumnsEditor`) into a proper Column Manager, without touching CDD's React
// source, its data, or its behaviour.
//
// The dialog is a MUI <Dialog> containing one react-beautiful-dnd droppable
// (`tbody.sortable[data-rfd-droppable-id="droppable"]`); every available column
// is a draggable `<tr class="row" id="SAMPLE::name">` with a checkbox (native
// selection) and a `.drag-handle` (native reorder). The rows share ONE flat,
// user-defined global order with categories interleaved.
//
// Because reordering (rfd) and that single global order must stay intact, we do
// NOT move, re-sort, or restructure any native row. Everything is done with:
//   * data-* attributes we set on the native <tr>/<td> (survive React re-renders
//     far better than class/style/child edits — React only diffs props it owns),
//   * CSS scoped to `.ColumnsEditor-dialog` (badges, selected styling, drag-
//     handle visibility, compact layout, hiding filtered rows),
//   * one toolbar element of our own inserted at the top of the dialog content
//     (search + category chips + summary).
//
// Selection stays the native checkboxes; reordering stays the native handles;
// filtering just toggles a `data-cdd-hide` attribute. To keep drags clean we
// clear the filter the moment a drag handle is pressed, so rfd always measures
// the full, unhidden list.

const STYLE_ID = "cdd-column-manager-style";
const NS = "cdd-cm";
const DIALOG_SELECTOR = ".ColumnsEditor-dialog";
const ROW_SELECTOR = "tr.row[id]";
const LABEL_CELL_SELECTOR = 'td[data-column-id="label"]';

// id prefix -> display label + badge text. MOLECULE is CDD's internal name for
// the Entity object.
const CATEGORIES = {
    SAMPLE: { label: "Sample", badge: "SAMPLE" },
    BATCH: { label: "Batch", badge: "BATCH" },
    MOLECULE: { label: "Entity", badge: "ENTITY" },
    EVENT: { label: "Event", badge: "EVENT" },
};
const CATEGORY_ORDER = ["SAMPLE", "BATCH", "MOLECULE", "EVENT"];

let started = false;

/* --------------------------------------------------------------------------- */
/* Text helpers                                                                */
/* --------------------------------------------------------------------------- */

function normalize(str) {
    return str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, ""); // strip combining diacritical marks
}

function normalizeQuery(str) {
    return normalize(str).replace(/\s+/g, " ").trim();
}

// A whole-word/phrase occurrence: bounded by non-alphanumeric edges.
function isWholeWord(haystack, needle) {
    let i = haystack.indexOf(needle);
    while (i !== -1) {
        const before = i === 0 ? " " : haystack[i - 1];
        const after =
            i + needle.length >= haystack.length ? " " : haystack[i + needle.length];
        if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) return true;
        i = haystack.indexOf(needle, i + 1);
    }
    return false;
}

// Fuzzy = every query char appears in order (not necessarily adjacent).
function isSubsequence(haystack, needle) {
    let i = 0;
    for (let k = 0; k < haystack.length && i < needle.length; k++) {
        if (haystack[k] === needle[i]) i++;
    }
    return i === needle.length;
}

// Relevance tiers (req. 3): exact > starts-with > whole-word > substring >
// fuzzy > 0 (hidden). Order is preserved in the DOM to protect drag/ordering,
// so the score only decides visibility, not position.
function score(name, query) {
    if (!query) return 1;
    if (name === query) return 100;
    if (name.startsWith(query)) return 80;
    if (isWholeWord(name, query)) return 60;
    if (name.includes(query)) return 40;
    if (isSubsequence(name, query)) return 20;
    return 0;
}

/* --------------------------------------------------------------------------- */
/* Styles                                                                      */
/* --------------------------------------------------------------------------- */

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        /* A little more room so a name + badge sit comfortably. */
        ${DIALOG_SELECTOR} .MuiDialog-paper {
            max-width: 480px !important;
        }

        /* Sticky toolbar: summary + search + category chips. */
        .${NS} {
            position: sticky;
            top: 0;
            z-index: 3;
            background: #fff;
            padding: 10px 4px 8px;
            margin-bottom: 4px;
            border-bottom: 1px solid #e3e7ec;
            font-family: inherit;
        }
        .${NS}__summary {
            display: flex;
            gap: 14px;
            font-size: 12px;
            color: #52606d;
            margin-bottom: 8px;
        }
        .${NS}__summary b { color: #1f2933; }

        .${NS}__search {
            width: 100%;
            height: 32px;
            padding: 0 10px;
            border: 1px solid #c6ccd4;
            border-radius: 6px;
            font-size: 13px;
            outline: none;
            box-sizing: border-box;
        }
        .${NS}__search:focus {
            border-color: #0077cc;
            box-shadow: 0 0 0 3px rgba(0, 119, 204, 0.15);
        }

        .${NS}__chips {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-top: 8px;
        }
        .${NS}__chip {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            border: 1px solid #cfd6de;
            background: #f5f7fa;
            color: #3e4c59;
            border-radius: 999px;
            padding: 3px 10px;
            font-size: 12px;
            font-family: inherit;
            cursor: pointer;
            user-select: none;
        }
        .${NS}__chip:hover { background: #eef2f6; }
        .${NS}__chip.is-active {
            background: #0077cc;
            border-color: #0077cc;
            color: #fff;
        }
        .${NS}__chip[disabled] {
            opacity: 0.4;
            cursor: default;
            pointer-events: none;
        }
        .${NS}__chip-count {
            font-size: 11px;
            font-weight: 700;
            background: rgba(0, 0, 0, 0.08);
            border-radius: 999px;
            padding: 0 6px;
            min-width: 18px;
            text-align: center;
        }
        .${NS}__chip.is-active .${NS}__chip-count { background: rgba(255, 255, 255, 0.25); }

        /* Hide CDD's italic "(Sample)" suffix — replaced by a badge. */
        ${DIALOG_SELECTOR} .group-name { display: none !important; }

        /* Coloured category badge, drawn from a data-* attribute so we never add
           child nodes to CDD's label cell. */
        ${DIALOG_SELECTOR} ${LABEL_CELL_SELECTOR}[data-cdd-badge]::after {
            content: attr(data-cdd-badge);
            display: inline-block;
            margin-left: 8px;
            padding: 1px 6px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.04em;
            vertical-align: middle;
            border: 1px solid transparent;
        }
        ${DIALOG_SELECTOR} tr[data-cdd-cat="SAMPLE"] ${LABEL_CELL_SELECTOR}::after {
            background: #e6f0fb; color: #1b5fa6; border-color: #c4ddf5;
        }
        ${DIALOG_SELECTOR} tr[data-cdd-cat="BATCH"] ${LABEL_CELL_SELECTOR}::after {
            background: #e6f5ec; color: #1f7a45; border-color: #c2e6d1;
        }
        ${DIALOG_SELECTOR} tr[data-cdd-cat="MOLECULE"] ${LABEL_CELL_SELECTOR}::after {
            background: #efe9fb; color: #6034b3; border-color: #d8ccf2;
        }
        ${DIALOG_SELECTOR} tr[data-cdd-cat="EVENT"] ${LABEL_CELL_SELECTOR}::after {
            background: #fdeede; color: #a65a12; border-color: #f5d8b4;
        }

        /* Selected (checked) rows stand out (req. 4). */
        ${DIALOG_SELECTOR} tr.row:has(input[type="checkbox"]:checked) {
            background: #f2f8ff !important;
            box-shadow: inset 3px 0 0 #0077cc;
        }

        /* Only selected rows can affect order, so only they show a handle (5). */
        ${DIALOG_SELECTOR} tr.row:not(:has(input[type="checkbox"]:checked)) .drag-handle {
            visibility: hidden;
        }

        /* Compact rows (req. 7). */
        ${DIALOG_SELECTOR} .ReorderDataTable td {
            padding-top: 2px !important;
            padding-bottom: 2px !important;
        }
        ${DIALOG_SELECTOR} ${LABEL_CELL_SELECTOR} {
            line-height: 1.3;
        }

        /* Rows filtered out by search / category chip. */
        ${DIALOG_SELECTOR} tr.row[data-cdd-hide] { display: none !important; }
    `;

    document.head.appendChild(style);
}

/* --------------------------------------------------------------------------- */
/* Enhancement                                                                 */
/* --------------------------------------------------------------------------- */

function categoryOf(tr) {
    const prefix = (tr.id || "").split("::")[0];
    return CATEGORIES[prefix] ? prefix : null;
}

// The field name without CDD's "(Category)" suffix, for search + (untouched)
// display.
function readName(labelCell) {
    const clone = labelCell.cloneNode(true);
    clone.querySelector(".group-name")?.remove();
    return clone.textContent.trim();
}

function enhance(dialog) {
    // Mark before we mutate anything (our edits re-trigger the observer).
    dialog.dataset.cddCm = "1";

    // --- Tag every row: category (for filter + badge colour) + badge text ---
    const rows = [];
    for (const tr of dialog.querySelectorAll(ROW_SELECTOR)) {
        const cat = categoryOf(tr);
        if (!cat) continue;
        const labelCell = tr.querySelector(LABEL_CELL_SELECTOR);
        if (!labelCell) continue;

        tr.dataset.cddCat = cat;
        labelCell.dataset.cddBadge = CATEGORIES[cat].badge;

        rows.push({ tr, cat, key: normalize(readName(labelCell)) });
    }

    // --- Build the toolbar ------------------------------------------------
    const toolbar = buildToolbar(rows);
    const content = dialog.querySelector(".dialog-contents") ||
        dialog.querySelector(".MuiDialogContent-root");
    if (content) content.insertBefore(toolbar.el, content.firstChild);

    // --- Live "Visible columns" count on every checkbox toggle ------------
    const refreshSummary = () => {
        const checked = dialog.querySelectorAll(
            'tr.row input[type="checkbox"]:checked'
        ).length;
        toolbar.setVisibleCount(checked);
    };
    dialog.addEventListener("change", (e) => {
        if (e.target.matches?.('input[type="checkbox"]')) refreshSummary();
    });
    refreshSummary();

    // --- Clear the filter when a drag begins, so rfd sees the full list ----
    dialog.addEventListener(
        "pointerdown",
        (e) => {
            if (e.target.closest?.(".drag-handle")) toolbar.reset();
        },
        true
    );
}

/* --------------------------------------------------------------------------- */
/* Toolbar (search + chips + summary) + filtering                              */
/* --------------------------------------------------------------------------- */

function buildToolbar(rows) {
    const el = document.createElement("div");
    el.className = NS;

    // Summary -------------------------------------------------------------
    const summary = document.createElement("div");
    summary.className = `${NS}__summary`;
    const visibleEl = document.createElement("span");
    visibleEl.innerHTML = `Visible columns: <b>0</b>`;
    const totalEl = document.createElement("span");
    totalEl.innerHTML = `Total available: <b>${rows.length}</b>`;
    summary.append(visibleEl, totalEl);

    // Search --------------------------------------------------------------
    const search = document.createElement("input");
    search.className = `${NS}__search`;
    search.type = "text";
    search.placeholder = "Search columns…";
    search.setAttribute("aria-label", "Search columns");
    search.autocomplete = "off";
    search.spellcheck = false;

    // Category chips ------------------------------------------------------
    const chipsWrap = document.createElement("div");
    chipsWrap.className = `${NS}__chips`;

    let activeCat = null; // null = All
    const chips = {}; // cat -> { btn, countEl }

    const makeChip = (cat, label) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `${NS}__chip`;
        btn.dataset.cat = cat || "ALL";
        const text = document.createElement("span");
        text.textContent = label;
        const countEl = document.createElement("span");
        countEl.className = `${NS}__chip-count`;
        btn.append(text, countEl);
        btn.addEventListener("click", () => {
            // Toggle back to All when clicking the active category.
            activeCat = activeCat === cat ? null : cat;
            apply();
        });
        chipsWrap.appendChild(btn);
        chips[cat || "ALL"] = { btn, countEl };
        return btn;
    };

    makeChip(null, "All");
    for (const cat of CATEGORY_ORDER) makeChip(cat, CATEGORIES[cat].label);

    el.append(summary, search, chipsWrap);

    // Filtering -----------------------------------------------------------
    const apply = () => {
        const query = normalizeQuery(search.value);
        const counts = { ALL: 0, SAMPLE: 0, BATCH: 0, MOLECULE: 0, EVENT: 0 };

        // Pass 1: score every row and tally per-category match counts.
        for (const row of rows) {
            row._match = score(row.key, query) > 0;
            if (row._match) {
                counts[row.cat]++;
                counts.ALL++;
            }
        }

        // If a search empties the active category, fall back to All so the user
        // never faces a blank list.
        const effectiveCat =
            activeCat && counts[activeCat] > 0 ? activeCat : null;

        // Pass 2: hide via a data-* attribute (survives React re-renders; CSS
        // does the actual hiding).
        for (const row of rows) {
            const show =
                row._match && (effectiveCat === null || row.cat === effectiveCat);
            if (show) delete row.tr.dataset.cddHide;
            else row.tr.dataset.cddHide = "1";
        }

        // Update chip counts, disabled state, and active highlight.
        for (const [key, { btn, countEl }] of Object.entries(chips)) {
            const n = counts[key];
            countEl.textContent = String(n);
            const isActive = activeCat === null ? key === "ALL" : key === activeCat;
            btn.classList.toggle("is-active", isActive);
            // A category with no matches (while searching) can't be chosen.
            btn.disabled = key !== "ALL" && n === 0;
        }
    };

    apply();

    search.addEventListener("input", apply);

    return {
        el,
        setVisibleCount(n) {
            visibleEl.innerHTML = `Visible columns: <b>${n}</b>`;
        },
        reset() {
            if (!search.value && activeCat === null) return;
            search.value = "";
            activeCat = null;
            apply();
        },
    };
}

/* --------------------------------------------------------------------------- */
/* Observation                                                                 */
/* --------------------------------------------------------------------------- */

function scan() {
    for (const dialog of document.querySelectorAll(
        `${DIALOG_SELECTOR}:not([data-cdd-cm])`
    )) {
        // Wait until the row list is actually rendered.
        if (dialog.querySelector(ROW_SELECTOR)) enhance(dialog);
    }
}

export function initColumnManager() {
    if (started) return;
    started = true;

    injectStyles();

    const observer = new MutationObserver(() => scan());
    // <html>, not <body>: Turbo swaps <body> on in-app navigation.
    observer.observe(document.documentElement, { childList: true, subtree: true });

    scan();
}
