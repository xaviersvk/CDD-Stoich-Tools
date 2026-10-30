// content/features/ui-fixes/run-readout-filter/selection.js
//
// Tick boxes in a run's readout table and the bulk delete behind them.
//
// Every row gets a box before its Edit link and the header one that ticks
// every row shown. The table is a bigDataTable — four clones, and the left
// columns a user sees and clicks are the .rowHeaders clone, not .cells — so
// the selection is kept by row id, not on the boxes, and painted onto every
// clone after each change and each rebuild.
//
// A row is deleted the way its own Delete link does it (data-turbo-method
// delete): DELETE on the link's path with the page's CSRF token, one row at
// a time, stopping at the first refusal. The page is reloaded afterwards so
// the count, pagination and Data Summary are CDD's again.

export const CHECK_CLASS = "cdd-readout-select";
const ALL_CLASS = "cdd-readout-select-all";
const ROW_SELECTOR = 'tr[id^="detail_row_"]';

function box(className, title) {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = className;
    input.title = title;
    return input;
}

// Add the boxes CDD's rows and header rows lack. True when the .cells table
// changed, which is when the clones need rebuilding to the new widths.
export function ensureBoxes(root) {
    let cellsChanged = false;

    for (const row of root.querySelectorAll(ROW_SELECTOR)) {
        const cell = row.cells[0];
        if (!cell || cell.querySelector(`.${CHECK_CLASS}`)) continue;
        const input = box(CHECK_CLASS, "Select for Delete selected");
        input.dataset.rowId = row.id;
        cell.prepend(input);
        if (row.closest(".cells")) cellsChanged = true;
    }

    for (const table of root.querySelectorAll("table")) {
        const header = table.tHead?.rows[0] || table.rows[0];
        const cell = header?.cells[0];
        if (!cell || header.id || cell.querySelector(`.${ALL_CLASS}`)) continue;
        cell.prepend(box(ALL_CLASS, "Select every row shown"));
        if (table.closest(".cells")) cellsChanged = true;
    }

    return cellsChanged;
}

export function shownRowIds(root) {
    const table = root.querySelector(".cells table");
    return table ? [...table.querySelectorAll(ROW_SELECTOR)].map((row) => row.id) : [];
}

export function paint(root, selected) {
    for (const input of root.querySelectorAll(`.${CHECK_CLASS}`)) {
        input.checked = selected.has(input.dataset.rowId);
    }
    const shown = shownRowIds(root);
    const all = shown.length > 0 && shown.every((id) => selected.has(id));
    const some = shown.some((id) => selected.has(id));
    for (const input of root.querySelectorAll(`.${ALL_CLASS}`)) {
        input.checked = all;
        input.indeterminate = some && !all;
    }
}

// A change on any box, in any clone → the new selection.
export function onBoxChange(root, selected, target) {
    if (target.classList.contains(ALL_CLASS)) {
        for (const id of shownRowIds(root)) {
            if (target.checked) selected.add(id);
            else selected.delete(id);
        }
    } else if (target.classList.contains(CHECK_CLASS)) {
        if (target.checked) selected.add(target.dataset.rowId);
        else selected.delete(target.dataset.rowId);
    }
}

function deletePath(root, rowId) {
    const link = root.querySelector(`tr[id="${rowId}"] a.delete-readout-row`);
    const href = link?.getAttribute("href");
    return href ? href.split("?")[0] : null;
}

function csrfToken() {
    return document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") || "";
}

// Delete the rows one at a time. Resolves with how many went; rejects with
// { deleted, error } at the first one CDD refuses.
export async function deleteRows(root, rowIds, onProgress) {
    let deleted = 0;
    for (const rowId of rowIds) {
        const path = deletePath(root, rowId);
        try {
            if (!path) throw new Error(`${rowId}: no Delete link`);
            const response = await fetch(path, {
                method: "DELETE",
                credentials: "include",
                headers: {
                    "X-CSRF-Token": csrfToken(),
                    Accept: "text/vnd.turbo-stream.html, text/html, application/xhtml+xml",
                },
            });
            if (!response.ok) throw new Error(`${rowId}: HTTP ${response.status}`);
        } catch (error) {
            throw { deleted, error };
        }
        deleted += 1;
        onProgress(deleted, rowIds.length);
    }
    return deleted;
}
