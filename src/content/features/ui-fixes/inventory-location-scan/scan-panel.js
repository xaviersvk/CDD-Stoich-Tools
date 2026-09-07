// content/features/ui-fixes/inventory-location-scan/scan-panel.js
//
// The overlay that turns a scanner into a shelf of boxes.
//
// The whole point of this feature is one keystroke: a handheld scanner ends
// every barcode with Enter, and Enter in this dialog is Save. So while the
// panel is open, Enter ANYWHERE inside the dialog is ours — claimed on
// `window` in the capture phase, which runs before anything CDD could have
// registered on `document` or below, in either phase. In the scan box it
// commits a row; anywhere else it puts the cursor back in the scan box, which
// is where a scan should have landed in the first place.
//
// A shelf is not all one size, so the grid belongs to the ROW, not to the
// batch. The two boxes at the top are what the next scan starts from; each row
// carries its own pair and can be overwritten in place. Changing the boxes at
// the top rewrites only the rows nobody has touched — otherwise "they are all
// 10 x 10 actually" would mean editing a hundred rows by hand.
//
// Nothing here presses Save. The run creates pending nodes and steps aside.

import {
    inventoryScanSettings,
    sanitizeBoxSide,
} from "../../../../shared/inventory-scan.js";
import {
    PANEL_CLASS,
    createBoxUnder,
    findContent,
    findLeftColumn,
    readTreeRows,
    selectedNodeId,
} from "./dialog-dom.js";
import {
    SCAN_IN_LIST,
    SCAN_IN_TREE,
    SCAN_OK,
    acceptedScans,
    boxTargets,
    buildNodes,
    classifyScan,
} from "./tree-model.js";

const SCAN_CREATED = "created";

let open = null;

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function numberBox(className, value) {
    const input = document.createElement("input");
    input.type = "number";
    input.min = "1";
    input.max = "100";
    input.className = className;
    input.value = String(value);
    return input;
}

// Excel puts a TAB between columns, and only a TAB — splitting on commas too
// would quietly cut a rack whose code contains one. A line is a name, and
// optionally the two numbers after it.
function parsePastedLine(line) {
    const parts = line.split("\t").map((part) => part.trim());
    const name = parts.shift() || "";
    const columns = sanitizeBoxSide(parts[0], null);
    const rows = sanitizeBoxSide(parts[1], null);
    return { name, size: columns && rows ? { columns, rows } : null };
}

// A box's nearest home: itself if it can take one, otherwise the closest
// ancestor that can. Opening the panel with the wrong location preselected is
// how a shelf ends up in the wrong room.
function defaultTarget(nodes, selectedId) {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    let cursor = byId.get(String(selectedId));
    const seen = new Set();
    while (cursor && !seen.has(cursor.id)) {
        seen.add(cursor.id);
        if (cursor.canTakeBox) return cursor.id;
        cursor = cursor.parentId ? byId.get(cursor.parentId) : null;
    }
    const targets = boxTargets(nodes);
    return targets.length ? targets[0].id : null;
}

export function closeScanPanel() {
    if (!open) return;
    window.removeEventListener("keydown", open.onKeyDown, true);
    open.panel.remove();
    if (open.content) open.content.style.position = open.contentPosition;
    open = null;
}

export function openScanPanel(dialog) {
    closeScanPanel();

    const content = findContent(dialog);
    if (!content) return;

    const nodes = buildNodes(readTreeRows(dialog));
    const targets = boxTargets(nodes);
    const settings = inventoryScanSettings();

    const state = {
        // The scanned codes, in the order they arrived. Each carries its own
        // grid and a `sized` flag saying whether a human set it.
        scans: [],
        targetId: defaultTarget(nodes, selectedNodeId(dialog)),
        // The panel's OWN copy of the default grid. Settings hold what a panel
        // starts from; a shelf of 10 x 10 trays must not redefine that.
        gridColumns: settings.columns,
        gridRows: settings.rows,
        organized: settings.organized,
        busy: false,
        status: "",
    };

    const panel = el("div", PANEL_CLASS);

    /* ----- head ----- */
    const head = el("div", "cdd-scan-head");
    head.append(el("span", "cdd-scan-title", "Scan racks"));
    head.append(el("span", "cdd-scan-note",
        "Enter adds a row. Paste a list to add many. Nothing is saved until you press Save."));
    panel.append(head);

    /* ----- controls ----- */
    const controls = el("div", "cdd-scan-controls");

    const intoLabel = el("label", null);
    intoLabel.append(el("span", null, "Into"));
    const intoSelect = document.createElement("select");
    for (const target of targets) {
        const option = document.createElement("option");
        option.value = target.id;
        option.textContent = target.path;
        intoSelect.append(option);
    }
    if (state.targetId) intoSelect.value = state.targetId;
    intoSelect.addEventListener("change", () => {
        state.targetId = intoSelect.value;
    });
    intoLabel.append(intoSelect);
    controls.append(intoLabel);

    const sizeLabel = el("label", null);
    sizeLabel.append(el("span", null, "New rows"));
    const columnsInput = numberBox(null, state.gridColumns);
    const rowsInput = numberBox(null, state.gridRows);
    sizeLabel.append(columnsInput, el("span", "cdd-scan-times", "×"), rowsInput);
    controls.append(sizeLabel);

    const organizedLabel = el("label", null);
    const organizedInput = document.createElement("input");
    organizedInput.type = "checkbox";
    organizedInput.checked = state.organized;
    organizedInput.addEventListener("change", () => {
        state.organized = organizedInput.checked;
        render();
    });
    organizedLabel.append(organizedInput);
    organizedLabel.append(el("span", null, "Organized"));
    controls.append(organizedLabel);

    panel.append(controls);

    /* ----- scan box ----- */
    const scanInput = document.createElement("input");
    scanInput.type = "text";
    scanInput.className = "cdd-scan-input";
    scanInput.placeholder = "Scan a rack barcode, or paste a list";
    scanInput.autocomplete = "off";
    scanInput.spellcheck = false;
    panel.append(scanInput);

    /* ----- list ----- */
    const list = el("div", "cdd-scan-list");
    panel.append(list);

    /* ----- foot ----- */
    const foot = el("div", "cdd-scan-foot");
    const createButton = el("button", "cdd-scan-create", "Create 0 boxes");
    createButton.type = "button";
    const closeButton = el("button", "cdd-scan-close", "Cancel");
    closeButton.type = "button";
    closeButton.addEventListener("click", () => closeScanPanel());
    const status = el("span", "cdd-scan-status");
    foot.append(createButton, closeButton, status);
    panel.append(foot);

    /* ----- adding rows ----- */
    function addScan(raw, size) {
        const scan = classifyScan(raw, nodes, state.scans);
        if (!scan) return false;
        scan.columns = size ? size.columns : state.gridColumns;
        scan.rows = size ? size.rows : state.gridRows;
        // A size that came in with the row counts as set by hand: the boxes at
        // the top must not overwrite what an Excel sheet already said.
        scan.sized = Boolean(size);
        state.scans.push(scan);
        return true;
    }

    function applyDefaultSize() {
        for (const scan of state.scans) {
            if (scan.sized) continue;
            scan.columns = state.gridColumns;
            scan.rows = state.gridRows;
        }
    }

    columnsInput.addEventListener("change", () => {
        state.gridColumns = sanitizeBoxSide(columnsInput.value, state.gridColumns);
        columnsInput.value = String(state.gridColumns);
        applyDefaultSize();
        render();
    });
    rowsInput.addEventListener("change", () => {
        state.gridRows = sanitizeBoxSide(rowsInput.value, state.gridRows);
        rowsInput.value = String(state.gridRows);
        applyDefaultSize();
        render();
    });

    /* ----- rendering ----- */

    // Deliberately does NOT re-render: the row is being edited, and rebuilding
    // the list under the cursor would throw the focus out of the box.
    function sizeInput(scan, field) {
        const input = numberBox("cdd-scan-size-input", scan[field]);
        input.addEventListener("change", () => {
            scan[field] = sanitizeBoxSide(input.value, scan[field]);
            input.value = String(scan[field]);
            scan.sized = true;
        });
        return input;
    }

    function render() {
        columnsInput.disabled = !state.organized || state.busy;
        rowsInput.disabled = !state.organized || state.busy;
        organizedInput.disabled = state.busy;
        intoSelect.disabled = state.busy;
        scanInput.disabled = state.busy || !targets.length;

        list.textContent = "";
        if (!state.scans.length) {
            list.append(el("p", "cdd-scan-empty", "Nothing scanned yet."));
        }

        state.scans.forEach((scan, index) => {
            const row = el("div", "cdd-scan-row");
            if (scan.status === SCAN_IN_TREE || scan.status === SCAN_IN_LIST) {
                row.classList.add("cdd-scan-row--refused");
            }
            if (scan.status === SCAN_CREATED) row.classList.add("cdd-scan-row--created");

            row.append(el("span", "cdd-scan-ordinal", String(index + 1)));
            row.append(el("span", "cdd-scan-name", scan.name));

            if (scan.status === SCAN_IN_TREE) {
                row.append(el("span", "cdd-scan-why", `already in ${scan.where}`));
            } else if (scan.status === SCAN_IN_LIST) {
                row.append(el("span", "cdd-scan-why", "already in the list"));
            } else if (scan.status === SCAN_CREATED) {
                row.append(el("span", "cdd-scan-why", "created"));
            } else if (state.organized && !state.busy) {
                const size = el("span", "cdd-scan-size");
                size.append(
                    sizeInput(scan, "columns"),
                    el("span", "cdd-scan-times", "×"),
                    sizeInput(scan, "rows"),
                );
                row.append(size);
            }

            if (scan.status !== SCAN_CREATED && !state.busy) {
                const drop = el("button", "cdd-scan-drop", "✕");
                drop.type = "button";
                drop.title = "Remove";
                drop.addEventListener("click", () => {
                    state.scans.splice(index, 1);
                    render();
                    scanInput.focus();
                });
                row.append(drop);
            }

            list.append(row);
        });

        const count = acceptedScans(state.scans).length;
        createButton.textContent = count === 1 ? "Create 1 box" : `Create ${count} boxes`;
        createButton.disabled = state.busy || count === 0 || !state.targetId;

        status.textContent = state.status;

        list.scrollTop = list.scrollHeight;
    }

    function commitScan() {
        const added = addScan(scanInput.value, null);
        scanInput.value = "";
        if (!added) return;
        state.status = "";
        render();
    }

    // A pasted block is a list: one rack per line, and if a line carries two
    // more TAB-separated numbers they are that rack's columns and rows. A
    // single code with no tabs and no newlines is left alone — that is someone
    // pasting one barcode, and the Enter after it commits the row.
    scanInput.addEventListener("paste", (event) => {
        const text = event.clipboardData?.getData("text") ?? "";
        if (!text.includes("\n") && !text.includes("\t")) return;

        event.preventDefault();
        let added = 0;
        for (const line of text.split(/\r?\n/)) {
            const { name, size } = parsePastedLine(line);
            if (addScan(name, size)) added += 1;
        }
        scanInput.value = "";
        state.status = added ? "" : "Nothing in that paste looked like a rack.";
        render();
    });

    /* ----- the create run ----- */
    async function createAll() {
        const pending = acceptedScans(state.scans);
        if (state.busy || !pending.length || !state.targetId) return;

        state.busy = true;
        state.status = "";
        render();

        let made = 0;
        try {
            for (const scan of pending) {
                await createBoxUnder(dialog, {
                    parentId: state.targetId,
                    name: scan.name,
                    columns: scan.columns,
                    rows: scan.rows,
                    organized: state.organized,
                });
                scan.status = SCAN_CREATED;
                made += 1;
                render();
            }
            closeScanPanel();
        } catch (error) {
            // Whatever was created stays: those rows are in the tree, they are
            // visible, and discarding them is what CDD's own Cancel is for.
            state.busy = false;
            state.status = `Created ${made} of ${pending.length}. `
                + `Stopped at "${pending[made]?.name}" — ${error.message}.`;
            render();
        }
    }

    createButton.addEventListener("click", createAll);

    /* ----- Enter ----- */
    function onKeyDown(event) {
        if (event.key !== "Enter") return;
        if (!dialog.contains(event.target)) return;

        event.preventDefault();
        event.stopImmediatePropagation();

        if (state.busy) return;
        if (event.target === scanInput) commitScan();
        else scanInput.focus();
    }

    window.addEventListener("keydown", onKeyDown, true);

    /* ----- mount ----- */
    const contentPosition = content.style.position;
    if (!contentPosition) content.style.position = "relative";

    const left = findLeftColumn(dialog);
    panel.style.left = `${left ? left.offsetWidth : 320}px`;

    content.append(panel);
    open = { panel, content, contentPosition, onKeyDown };

    if (!targets.length) {
        state.status = "There is no location that can hold a box. Create one first.";
    }

    render();
    scanInput.focus();
}
