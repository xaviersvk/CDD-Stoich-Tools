// content/features/ui-fixes/run-readout-filter/index.js
//
// A filter box over a run's readout table (All Data, #run-readouts): type a
// molecule, plate or well and CDD's own table shows only the matching rows of
// the whole run, every page of it, with the pagination hidden. Clearing the
// box puts the page CDD served back. Query rules: model.js.
//
// The rows of the other pages come from CDD's own pages
// (/vaults/<v>/runs/<r>/readouts?page[run_readouts]=N), fetched once on the
// first filter of a page visit, FETCH_CONCURRENCY at a time. Not per_page:
// CDD remembers that in the session, so asking for 1000 rows once would
// change every later readout page the user opens.
//
// The table is a CDD bigDataTable: four clones of one table (cells, column
// headers, row headers, corner). Rows are swapped in the .cells table and
// CDD's rebuildBigDataTable makes the other three again, through the
// page-world bridge (inject/hooks/big-data-table-bridge.js).
//
// A row is used as a node, not copied: the rows of this page are the ones
// CDD put there, kept aside while filtered, and a row CDD replaced in place
// (Edit, through its turbo frame) is picked up from the table again before
// the next filter.
//
// Tick boxes and Delete selected: selection.js. The query is kept in
// sessionStorage per run, so the reload after a delete (or any reload) comes
// back filtered.

import { EVENTS, EVENT_SOURCE } from "../../../../shared/event-types.js";
import { mapLimit } from "../../../utils/concurrency.js";
import { watchDocument } from "../../../utils/dom.js";
import { columnIndexes, matchesQuery, parseQuery } from "./model.js";
import { CHECK_CLASS, deleteRows, ensureBoxes, onBoxChange, paint, shownRowIds } from "./selection.js";

const LOG_PREFIX = "[CDD readout filter]";

const STYLE_ID = "cdd-readout-filter-style";
const BAR_CLASS = "cdd-readout-filter";

const TABLE_ID = "run-readouts-data";
const COUNT_ID = "readout-rows-count";
const PAGINATION_ID = "readoutRowsPagination";
const OPTIONS_ID = "readout-table-options-hash";
const PAGE_SELECT_ID = "page_run_readouts";
const PAGE_PARAM = "page[run_readouts]";
const ROW_SELECTOR = 'tr[id^="detail_row_"]';

const FETCH_CONCURRENCY = 3;
const TYPE_DELAY_MS = 250;
const STORAGE_PREFIX = "cdd-readout-filter:";

let started = false;

// One per readout table CDD rendered; a Turbo visit or a page change brings a
// new table and so a fresh state.
/** @type {WeakMap<Element, ReturnType<typeof newState>>} */
const states = new WeakMap();

function newState() {
    return {
        /** @type {Element[] | null} this page's rows as CDD served them, in order */
        original: null,
        /** @type {Promise<{ id: string, node: Element, molecule: string, plate: string, well: string }[]> | null} */
        allRows: null,
        /** @type {Map<string, Element>} row id → the node to show for it */
        pool: new Map(),
        query: "",
        // Bumped per keystroke: a slow load must not paint an old query.
        token: 0,
        /** @type {Set<string>} ticked row ids */
        selected: new Set(),
        /** @type {HTMLElement | null} */
        bar: null,
        deleting: false,
    };
}

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        .${BAR_CLASS} {
            display: flex;
            align-items: center;
            justify-content: flex-end;
            flex-wrap: wrap;
            gap: 8px;
            margin: 4px 0 10px;
            font-size: 12px;
        }

        .${BAR_CLASS} input {
            width: 340px;
            max-width: 100%;
            padding: 4px 8px;
            font-size: 12px;
        }

        .${BAR_CLASS} button {
            padding: 2px 8px;
            font-size: 12px;
            cursor: pointer;
        }

        .${BAR_CLASS} .cdd-readout-filter-status {
            color: #555;
        }

        .${BAR_CLASS} .is-error {
            color: #b00020;
        }

        .${BAR_CLASS} .cdd-readout-filter-delete {
            color: #b00020;
            font-weight: 600;
        }

        #${TABLE_ID} input.${CHECK_CLASS},
        #${TABLE_ID} input.cdd-readout-select-all {
            margin: 0 6px 0 0;
            vertical-align: middle;
        }
    `;
    document.head.appendChild(style);
}

/* ------------------------------------------------------------------ *
 * The table
 * ------------------------------------------------------------------ */

// The first table under #run-readouts-data: the .cells clone once CDD has
// split it, the table itself in a fetched page (split only by CDD's script).
function mainTable(root) {
    return root.querySelector(".cells table") || root.querySelector("table");
}

function headerTexts(table) {
    const header = table.tHead?.rows[0] || table.rows[0];
    return header ? [...header.cells].map((cell) => cell.textContent || "") : [];
}

function readRow(node, columns) {
    const text = (index) => (index >= 0 ? (node.cells[index]?.textContent || "").trim() : "");
    return {
        id: node.id,
        node,
        molecule: text(columns.molecule),
        plate: text(columns.plate),
        well: text(columns.well),
    };
}

function rebuild() {
    const raw = document.getElementById(OPTIONS_ID)?.getAttribute("data-options");
    let options = {};
    try {
        options = raw ? JSON.parse(raw) : {};
    } catch {
        // CDD's defaults then; the table still splits.
    }
    window.postMessage(
        { source: EVENT_SOURCE, type: EVENTS.BIG_DATA_TABLE_REBUILD, payload: { id: TABLE_ID, options } },
        "*",
    );
}

// Show `nodes` (in order) as the table's rows.
function showRows(root, state, nodes) {
    const table = mainTable(root);
    if (!table) return;
    const body = table.tBodies[0] || table;
    for (const row of [...table.querySelectorAll(ROW_SELECTOR)]) row.remove();
    body.append(...nodes);
    // Rows from other pages come without boxes; give them theirs before the
    // clones are made, not in a second rebuild after.
    ensureBoxes(root);
    rebuild();

    // Only what is shown can stay ticked: Delete selected never takes a row
    // the filter has hidden.
    const shown = new Set(nodes.map((node) => node.id));
    for (const id of [...state.selected]) if (!shown.has(id)) state.selected.delete(id);
    refreshSelection(root, state);
}

/* ------------------------------------------------------------------ *
 * Loading every page
 * ------------------------------------------------------------------ */

// Not getElementById: the "Add a readout" form above the table carries a
// hidden <input id="page_run_readouts"> too, and it comes first.
function pageCount() {
    const select = document.querySelector(`#${PAGINATION_ID} select#${PAGE_SELECT_ID}`);
    return select instanceof HTMLSelectElement ? Math.max(1, select.options.length) : 1;
}

function runPath() {
    return location.pathname.replace(/\/(readouts)?\/?$/, "");
}

function readoutsPath() {
    const form = document.getElementById("pagination_form");
    const action = form?.getAttribute("action");
    if (action) return action.split("#")[0].split("?")[0];
    return `${runPath()}/readouts`;
}

async function fetchPageRows(path, page) {
    const url = `${path}?${encodeURIComponent(PAGE_PARAM)}=${page}`;
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) throw new Error(`page ${page}: HTTP ${response.status}`);

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const root = doc.getElementById(TABLE_ID);
    const table = root && mainTable(root);
    if (!table) throw new Error(`page ${page}: no readout table`);

    const columns = columnIndexes(headerTexts(table));
    return [...table.querySelectorAll(ROW_SELECTOR)].map((node) => readRow(document.importNode(node, true), columns));
}

function loadAllRows(root, onProgress) {
    const pages = pageCount();
    const live = mainTable(root);
    const columns = columnIndexes(live ? headerTexts(live) : []);

    // One page only: nothing to fetch.
    if (pages === 1) {
        return Promise.resolve([...root.querySelectorAll(`.cells ${ROW_SELECTOR}`)].map((node) => readRow(node, columns)));
    }

    const path = readoutsPath();
    let done = 0;
    const numbers = Array.from({ length: pages }, (_, i) => i + 1);
    return mapLimit(numbers, FETCH_CONCURRENCY, async (page) => {
        const rows = await fetchPageRows(path, page);
        done += 1;
        onProgress(done, pages);
        return rows;
    }).then((perPage) => perPage.flat());
}

/* ------------------------------------------------------------------ *
 * Filtering
 * ------------------------------------------------------------------ */

function remember(query) {
    try {
        const key = STORAGE_PREFIX + runPath();
        if (query.trim()) sessionStorage.setItem(key, query);
        else sessionStorage.removeItem(key);
    } catch {
        // No storage: the filter just does not survive a reload.
    }
}

function remembered() {
    try {
        return sessionStorage.getItem(STORAGE_PREFIX + runPath()) || "";
    } catch {
        return "";
    }
}

function setStatus(state, text, isError = false) {
    const status = state.bar?.querySelector(".cdd-readout-filter-status");
    if (!status) return;
    status.textContent = text;
    status.classList.toggle("is-error", isError);
}

// The node to show for a row: what CDD has in the table now (Edit replaces a
// row in place), else the one kept aside, else the fetched copy.
function refreshPool(root, state) {
    for (const node of mainTable(root)?.querySelectorAll(ROW_SELECTOR) || []) state.pool.set(node.id, node);
}

async function applyFilter(root, state, query) {
    const token = ++state.token;
    state.query = query;
    remember(query);
    const groups = parseQuery(query);
    const pagination = document.getElementById(PAGINATION_ID);

    if (!groups.length) {
        if (state.original) {
            refreshPool(root, state);
            showRows(root, state, state.original.map((node) => state.pool.get(node.id) || node));
            state.original = null;
        }
        if (pagination) pagination.hidden = false;
        setStatus(state, "");
        return;
    }

    if (!state.original) {
        state.original = [...(mainTable(root)?.querySelectorAll(ROW_SELECTOR) || [])];
        for (const node of state.original) state.pool.set(node.id, node);
    } else {
        refreshPool(root, state);
    }

    if (!state.allRows) {
        setStatus(state, "Loading readouts…");
        state.allRows = loadAllRows(root, (done, pages) => {
            if (token === state.token) setStatus(state, `Loading page ${done} of ${pages}…`);
        });
        // A failed load is not remembered: the next keystroke tries again.
        state.allRows.catch(() => {
            state.allRows = null;
        });
    }

    let rows;
    try {
        rows = await state.allRows;
    } catch (error) {
        if (token === state.token) setStatus(state, "Could not load all readouts — try again", true);
        throw error;
    }
    if (token !== state.token) return;

    const matching = rows.filter((row) => matchesQuery(row, groups));
    showRows(
        root,
        state,
        matching.map((row) => {
            if (!state.pool.has(row.id)) state.pool.set(row.id, row.node);
            return state.pool.get(row.id);
        }),
    );
    if (pagination) pagination.hidden = true;
    setStatus(state, `${matching.length} of ${rows.length} readouts`);
}

/* ------------------------------------------------------------------ *
 * Selection and Delete selected
 * ------------------------------------------------------------------ */

// Boxes onto any row lacking them, ticks painted from the state, and the
// Delete button's count. Run after every DOM change: CDD's rebuild makes
// three of the four clones anew, without our ticks.
function refreshSelection(root, state) {
    if (ensureBoxes(root)) rebuild();
    paint(root, state.selected);
    renderDelete(root, state);
}

function renderDelete(root, state) {
    const slot = state.bar?.querySelector(".cdd-readout-filter-actions");
    if (!slot || state.deleting || slot.dataset.confirming) return;

    // The count of ticked rows that are on screen — the only ones it deletes.
    const shown = new Set(shownRowIds(root));
    const count = [...state.selected].filter((id) => shown.has(id)).length;
    if (String(count) === slot.dataset.count) return;
    slot.dataset.count = String(count);
    slot.replaceChildren();
    if (!count) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "cdd-readout-filter-delete";
    button.textContent = `Delete ${count} selected`;
    button.addEventListener("click", () => confirmDelete(root, state));
    slot.append(button);
}

function confirmDelete(root, state) {
    const slot = state.bar?.querySelector(".cdd-readout-filter-actions");
    if (!slot) return;
    const shown = new Set(shownRowIds(root));
    const ids = [...state.selected].filter((id) => shown.has(id));
    if (!ids.length) return;

    slot.dataset.confirming = "1";
    const question = document.createElement("span");
    question.className = "cdd-readout-filter-delete";
    question.textContent = `Delete ${ids.length} ${ids.length === 1 ? "row" : "rows"} and all their readouts?`;

    const yes = document.createElement("button");
    yes.type = "button";
    yes.className = "cdd-readout-filter-delete";
    yes.textContent = "Yes, delete";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";

    const reset = () => {
        delete slot.dataset.confirming;
        delete slot.dataset.count;
        renderDelete(root, state);
    };
    cancel.addEventListener("click", reset);
    yes.addEventListener("click", () => {
        delete slot.dataset.confirming;
        runDelete(root, state, ids).catch((err) => console.warn(LOG_PREFIX, err));
    });

    slot.replaceChildren(question, yes, cancel);
}

async function runDelete(root, state, ids) {
    const slot = state.bar?.querySelector(".cdd-readout-filter-actions");
    state.deleting = true;
    const say = (text, isError = false) => {
        if (!slot) return;
        const line = document.createElement("span");
        line.textContent = text;
        if (isError) line.className = "is-error";
        slot.replaceChildren(line);
    };

    say(`Deleting 0 of ${ids.length}…`);
    try {
        await deleteRows(root, ids, (done, total) => say(`Deleting ${done} of ${total}…`));
    } catch (failure) {
        const { deleted = 0, error } = failure || {};
        console.warn(LOG_PREFIX, "delete stopped", error);
        say(`Deleted ${deleted} of ${ids.length}; CDD refused the next one. Reloading…`, true);
        setTimeout(() => location.reload(), 2500);
        return;
    }
    say(`Deleted ${ids.length}. Reloading…`);
    location.reload();
}

/* ------------------------------------------------------------------ *
 * The box
 * ------------------------------------------------------------------ */

function buildBar(root, state) {
    const bar = document.createElement("div");
    bar.className = BAR_CLASS;

    const status = document.createElement("span");
    status.className = "cdd-readout-filter-status";

    const input = document.createElement("input");
    input.type = "search";
    input.placeholder = "Filter: molecule, plate, well — e.g. PHA-0334303 or 1059 H*";
    input.title =
        "Words in one search must all match (1059 H* = plate 1059, row H).\n" +
        "Separate searches with a comma to show either (PHA-0334303, PHA-0334468).\n" +
        "* is a wildcard. Searches every page of the run.";

    const clear = document.createElement("button");
    clear.type = "button";
    clear.textContent = "Clear";

    const actions = document.createElement("span");
    actions.className = "cdd-readout-filter-actions";

    let timer = null;
    const run = () => {
        clearTimeout(timer);
        if (input.value.trim() === state.query.trim()) return;
        applyFilter(root, state, input.value).catch((err) => console.warn(LOG_PREFIX, err));
    };

    input.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(run, TYPE_DELAY_MS);
    });
    input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        // Not CDD's form submit, should the box ever end up inside one.
        event.preventDefault();
        run();
    });
    clear.addEventListener("click", () => {
        input.value = "";
        run();
        input.focus();
    });

    bar.append(status, input, clear, actions);
    state.bar = bar;

    const saved = remembered();
    if (saved) {
        input.value = saved;
        // After the bar is in the page, so the status has somewhere to go.
        queueMicrotask(run);
    }
    return bar;
}

function sync() {
    const root = document.getElementById(TABLE_ID);
    const count = document.getElementById(COUNT_ID);
    if (!root || !count) return;

    let state = states.get(root);
    if (!state) {
        state = newState();
        states.set(root, state);
    }

    if (!count.nextElementSibling?.classList.contains(BAR_CLASS)) {
        injectStyles();
        count.after(buildBar(root, state));
    }
    refreshSelection(root, state);
}

export function initRunReadoutFilter() {
    if (started) return;
    started = true;

    // Delegated: the boxes a user clicks are in whichever clone is on top, and
    // CDD's rebuild replaces three of them.
    document.addEventListener("change", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        const root = target.closest(`#${TABLE_ID}`);
        const state = root && states.get(root);
        if (!state) return;
        onBoxChange(root, state.selected, target);
        paint(root, state.selected);
        renderDelete(root, state);
    });

    const schedule = watchDocument(() => {
        try {
            sync();
        } catch (error) {
            console.warn(LOG_PREFIX, error);
        }
    });
    schedule();
}
