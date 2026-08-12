// content/features/control-layout/toolbar.js
//
// The UI that sits above a control-layout edit grid. Two bars:
//
//   1. Paint wells:  [+ Positive] [- Negative] [# Reference] [Clear]
//      Arms a brush. Painting itself lives in painter.js; this bar only decides
//      which state is armed and shows which one it is. Clicking the armed
//      button disarms it, which hands the grid straight back to CDD.
//
//   2. Saved <N>-well layouts:  [ dropdown ] [Load] [Save as...] [Delete]
//      Named presets per plate geometry (see shared/control-layout-presets.js).
//      Load only fills the grid — CDD's own "Save changes" is what persists a
//      layout to the vault, and the status line says so.
//
// Everything is created with DOM calls (no innerHTML) and every button is
// type="button": the toolbar lives INSIDE CDD's `<form>`, where a default-type
// button would submit the layout on click.

import {
    STATE_EMPTY,
    STATE_POSITIVE,
    STATE_NEGATIVE,
    STATE_REFERENCE,
    formatKey,
    formatLabel,
    decodeStates,
    getPresetsForFormat,
    savePreset,
    deletePreset,
    onControlLayoutPresetsChanged,
    sanitizePresetName,
    isExtensionContextAlive,
    MAX_PRESET_NAME_LENGTH,
} from "../../../shared/control-layout-presets.js";
import {
    isControlLayoutEditTable,
    readGridSize,
    readStateMatrix,
    writeStateMatrix,
} from "./layout-grid.js";
import { attachPainter } from "./painter.js";
import {
    injectControlLayoutStyles,
    ROOT_CLASS,
    BAR_CLASS,
    LABEL_CLASS,
    BUTTON_CLASS,
    BRUSH_CLASS,
    ARMED_CLASS,
    SWATCH_CLASS,
    HINT_CLASS,
    STATUS_CLASS,
    SELECT_CLASS,
    NAME_INPUT_CLASS,
} from "./styles.js";

// The controller is parked on the toolbar node.
const CONTROLLER_KEY = "__cddControlLayoutController";

// Every toolbar this instance actually BUILT (listeners and all). Membership is
// the only reliable proof that a toolbar is alive, because CDD restores a
// collapsed layout section from serialized HTML: re-opening the editor after a
// cancel re-parses the section, which CLONES our toolbar. The clone keeps every
// class, button and label, and loses every event listener — it looks perfect
// and does nothing. A clone is not in this set; the original is.
const liveRoots = new WeakSet();

const STATUS_TIMEOUT_MS = 5000;

const BRUSHES = [
    { state: STATE_POSITIVE, label: "Positive control" },
    { state: STATE_NEGATIVE, label: "Negative control" },
    { state: STATE_REFERENCE, label: "Reference molecule" },
    { state: STATE_EMPTY, label: "Clear" },
];

const PLACEHOLDER_VALUE = "";

// Storage is unreachable after the extension is reloaded under an open page.
// Painting still works (it is plain DOM), only saved layouts are cut off — so
// the message names the cause and the one-step cure instead of just failing.
const RELOADED_MESSAGE = "Extension was reloaded — refresh this CDD page to use saved layouts.";

const HINT_IDLE =
    "pick one, then drag a rectangle across the wells (row/column header fills a whole line)";
const HINT_ARMED =
    "drag a rectangle across the wells, or shift+click to extend — click the armed button again for CDD's normal one-well cycling";

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function button(label, title) {
    const node = el("button", BUTTON_CLASS, label);
    node.type = "button";
    if (title) node.title = title;
    return node;
}

// Our toolbar ALWAYS sits immediately before the grid it drives. That one
// invariant is the whole bookkeeping — see isStaleToolbar() for why nothing
// smarter is allowed.
export function toolbarOf(table) {
    const previous = table.previousElementSibling;
    return previous?.classList?.contains(ROOT_CLASS) ? previous : null;
}

/**
 * isStaleToolbar(root) — true when this toolbar must go. Three ways to be dead:
 *
 *  1. It no longer sits in front of a grid. CDD re-renders a layout editor by
 *     swapping the <table> inside the <form> while keeping the form, which
 *     leaves our toolbar behind as an orphan — that is how "Edit -> cancel ->
 *     Edit" grew a second and third "Paint wells" bar.
 *  2. It is a CLONE. Re-opening the editor after a cancel restores the section
 *     from serialized HTML, so our toolbar comes back re-parsed: same markup,
 *     no event listeners. Clicking "Positive control" on such a clone does
 *     nothing at all, which is exactly what it looked like — and why pressing
 *     CDD's Save and reopening cured it, that path fetches the form from the
 *     server without a toolbar in it, so a live one gets attached.
 *  3. It is ours but points at a table that has since been replaced, so its
 *     painter is wired to a node that is no longer on the page.
 *
 * Case 2 is why membership of `liveRoots` — not merely "a toolbar is present" —
 * is the test. A toolbar built by a SECOND installed copy of the extension is
 * also not in our set and will be replaced; init.js caps how often that may
 * happen for one grid so two copies cannot swap toolbars forever.
 */
export function isStaleToolbar(root) {
    const next = root.nextElementSibling;
    if (!next || !isControlLayoutEditTable(next)) return true;
    if (!liveRoots.has(root)) return true;

    const controller = root[CONTROLLER_KEY];
    return !controller || controller.table !== next;
}

// True for a toolbar this instance built — init.js uses it to tell "replacing a
// dead clone" (fine, expected) from "fighting another extension copy" (capped).
export function isOwnToolbar(root) {
    return liveRoots.has(root);
}

export function destroyToolbar(root) {
    const controller = root[CONTROLLER_KEY];
    if (controller) controller.destroy();
    else root.remove(); // a clone (or another copy's): no listeners to unwind
}

/**
 * attachControlLayoutTools(table) — idempotent. Returns the controller, or null
 * when the table already has a LIVE toolbar or holds no wells (nothing to
 * paint). A dead clone in front of the grid is not treated as a toolbar; the
 * new one is inserted next to the grid and init.js's sweep then removes the
 * clone, which by that point no longer sits in front of a table.
 */
export function attachControlLayoutTools(table) {
    const existing = toolbarOf(table);
    if (existing && liveRoots.has(existing)) return existing[CONTROLLER_KEY] || null;

    const { rowCount, colCount } = readGridSize(table);
    if (!rowCount || !colCount) return null;

    injectControlLayoutStyles();

    const key = formatKey(rowCount, colCount);
    const painter = attachPainter(table, {
        onPaint: (count) => setStatus(`${count} ${count === 1 ? "well" : "wells"} updated.`),
    });

    /* ---------------- bar 1: brushes ---------------- */

    const root = el("div", ROOT_CLASS);
    const paintBar = el("div", BAR_CLASS);
    paintBar.append(el("span", LABEL_CLASS, "Paint wells:"));

    const brushButtons = new Map();
    for (const { state, label } of BRUSHES) {
        const node = button(label);
        node.classList.add(BRUSH_CLASS);
        const swatch = el("span", SWATCH_CLASS);
        swatch.dataset.state = state;
        node.prepend(swatch);
        node.addEventListener("click", () => armBrush(painter.getBrush() === state ? null : state));
        brushButtons.set(state, node);
        paintBar.append(node);
    }

    const hint = el("span", HINT_CLASS, HINT_IDLE);
    paintBar.append(hint);

    /* ---------------- bar 2: presets ---------------- */

    const presetBar = el("div", BAR_CLASS);
    presetBar.append(el("span", LABEL_CLASS, `Saved ${formatLabel(rowCount, colCount)} layouts:`));

    const select = el("select", SELECT_CLASS);
    const loadButton = button("Load", "Fill this grid from the selected saved layout");
    const saveButton = button("Save as…", "Store the current grid under a name");
    const deleteButton = button("Delete", "Delete the selected saved layout");
    const status = el("span", STATUS_CLASS);
    presetBar.append(select, loadButton, saveButton, deleteButton, status);

    // Name entry replaces the row's controls while "Save as..." is open.
    const nameInput = el("input", NAME_INPUT_CLASS);
    nameInput.type = "text";
    nameInput.placeholder = "Layout name";
    nameInput.maxLength = MAX_PRESET_NAME_LENGTH;
    const confirmButton = button("Save");
    const cancelButton = button("Cancel");
    const nameBar = el("div", BAR_CLASS);
    nameBar.append(el("span", LABEL_CLASS, "Save as:"), nameInput, confirmButton, cancelButton);
    nameBar.hidden = true;

    root.append(paintBar, presetBar, nameBar);
    table.parentElement?.insertBefore(root, table);

    /* ---------------- behaviour ---------------- */

    let statusTimer = 0;
    function setStatus(text) {
        status.textContent = text;
        clearTimeout(statusTimer);
        if (text) statusTimer = setTimeout(() => (status.textContent = ""), STATUS_TIMEOUT_MS);
    }

    function armBrush(state) {
        painter.setBrush(state);
        for (const [value, node] of brushButtons) {
            node.classList.toggle(ARMED_CLASS, value === state);
        }
        hint.textContent = state === null ? HINT_IDLE : HINT_ARMED;
    }

    let presets = [];

    function renderPresets(keepName) {
        const wanted = keepName ?? select.value;
        select.replaceChildren();

        // An unreachable storage looks exactly like an empty one, so say which
        // it is rather than claiming the user has never saved anything.
        const placeholder = el(
            "option",
            null,
            presets.length
                ? "Select a saved layout…"
                : isExtensionContextAlive()
                  ? "No saved layouts yet"
                  : "Extension reloaded — refresh the page"
        );
        placeholder.value = PLACEHOLDER_VALUE;
        select.append(placeholder);

        for (const preset of presets) {
            const option = el("option", null, preset.name);
            option.value = preset.name;
            select.append(option);
        }

        select.value = presets.some((p) => p.name === wanted) ? wanted : PLACEHOLDER_VALUE;
        syncPresetButtons();
    }

    function syncPresetButtons() {
        const chosen = select.value !== PLACEHOLDER_VALUE;
        loadButton.disabled = !chosen;
        deleteButton.disabled = !chosen;
    }

    async function refresh(keepName) {
        presets = await getPresetsForFormat(key);
        renderPresets(keepName);
    }

    select.addEventListener("change", syncPresetButtons);

    loadButton.addEventListener("click", () => {
        const preset = presets.find((p) => p.name === select.value);
        if (!preset) return;

        const changed = writeStateMatrix(table, decodeStates(preset.rows));
        setStatus(
            changed
                ? `Loaded "${preset.name}" (${changed} ${changed === 1 ? "well" : "wells"} changed) — press Save changes to store it in CDD.`
                : `"${preset.name}" already matches this grid.`
        );
    });

    saveButton.addEventListener("click", () => {
        nameInput.value = select.value !== PLACEHOLDER_VALUE ? select.value : "";
        nameBar.hidden = false;
        presetBar.hidden = true;
        nameInput.focus();
        nameInput.select();
    });

    function closeNameBar() {
        nameBar.hidden = true;
        presetBar.hidden = false;
    }

    cancelButton.addEventListener("click", closeNameBar);

    // Enter must save, not submit CDD's form; Escape cancels.
    nameInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            confirmButton.click();
        } else if (event.key === "Escape") {
            event.preventDefault();
            closeNameBar();
        }
    });

    confirmButton.addEventListener("click", async () => {
        const name = sanitizePresetName(nameInput.value);
        if (!name) {
            nameInput.focus();
            return;
        }

        const existing = presets.find((p) => p.name.toLowerCase() === name.toLowerCase());
        if (existing && !window.confirm(`A layout named "${existing.name}" already exists. Overwrite it?`)) {
            return;
        }

        const result = await savePreset(key, name, readStateMatrix(table));
        closeNameBar();

        if (result.ok) {
            await refresh(name);
            setStatus(`Saved "${name}".`);
        } else if (result.reason === "limit") {
            setStatus("Too many saved layouts for this plate format — delete one first.");
        } else if (!isExtensionContextAlive()) {
            setStatus(RELOADED_MESSAGE);
        } else {
            setStatus("Could not save the layout.");
        }
    });

    deleteButton.addEventListener("click", async () => {
        const name = select.value;
        if (name === PLACEHOLDER_VALUE) return;
        if (!window.confirm(`Delete the saved layout "${name}"?`)) return;

        const removed = await deletePreset(key, name);
        await refresh(PLACEHOLDER_VALUE);
        setStatus(removed ? `Deleted "${name}".` : "That layout was already gone.");
    });

    // Another tab (or the same page's other grid) changing presets updates the
    // dropdown in place, so the list is never stale.
    const stopWatchingStorage = onControlLayoutPresetsChanged(() => {
        refresh(select.value);
    });

    armBrush(null);
    refresh(PLACEHOLDER_VALUE);

    const controller = {
        table,
        destroy() {
            stopWatchingStorage();
            painter.destroy();
            clearTimeout(statusTimer);
            liveRoots.delete(root);
            delete root[CONTROLLER_KEY];
            root.remove();
        },
    };

    root[CONTROLLER_KEY] = controller;
    liveRoots.add(root);
    return controller;
}
