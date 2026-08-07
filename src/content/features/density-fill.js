// content/features/density-fill.js
//
// "Fill density into table": stoichiometry rows without an inventory sample
// often miss the density CDD needs to convert mass ↔ volume, while the
// registered batch knows it (surfaced by batch-field-enrichment). This module
// replays the user's own editing gestures to put that value into the table:
//
//   click the row (the table flips to edit mode)
//   → click the row's Density "Optional"/"Required" link (a one-field popup)
//   → set the input natively (React value-tracker aware) → Enter
//   → click the empty page margin to leave edit mode.
//
// Every step re-verifies the DOM it expects and aborts cleanly when CDD's
// markup has changed — the worst case is that nothing gets written. This is
// deliberately button-triggered only: it edits a scientific record, so one
// click means one write, never a background sweep.

const STEP_TIMEOUT_MS = 3000;
const POLL_MS = 100;

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(probe) {
    const deadline = Date.now() + STEP_TIMEOUT_MS;

    for (;;) {
        const result = probe();
        if (result) return result;
        if (Date.now() > deadline) return null;
        await wait(POLL_MS);
    }
}

function mouseClick(element) {
    const rect = element.getBoundingClientRect();
    const options = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        button: 0,
    };

    element.dispatchEvent(new MouseEvent("mousedown", options));
    element.dispatchEvent(new MouseEvent("mouseup", options));
    element.dispatchEvent(new MouseEvent("click", options));
}

// Same fallback chain the print buttons use to find one container per
// displayed reaction; index = display order = sample.reactionIndex.
function getReactionContainers() {
    const byTestId = Array.from(
        document.querySelectorAll('[data-autotest-id="reaction"]')
    );
    if (byTestId.length) return byTestId;

    for (const selector of [
        '[data-feature-type="reaction"]',
        '[data-testid*="reaction"]',
        ".reaction",
        ".reaction-block",
        ".eln-reaction",
    ]) {
        const found = Array.from(document.querySelectorAll(selector));
        if (found.length) return found;
    }

    return [];
}

// Stoichiometry rows for this sample: real table rows (4+ cells) whose text
// carries the composed batch name. Both the view-mode and edit-mode variants
// of a row match; callers narrow further.
function findRowsByName(container, name) {
    return Array.from(container.querySelectorAll("table tr")).filter((tr) => {
        if (!tr.cells || tr.cells.length < 4) return false;
        return (tr.innerText || "").includes(name);
    });
}

// In edit mode every property renders as "<b>Density:</b> <value>"; a row
// with no density yet shows the blue "Optional" / "Required" link as value.
function findDensityPlaceholderLink(row) {
    for (const span of row.querySelectorAll("span")) {
        const label = span.querySelector(":scope > b");
        if (!label || (label.textContent || "").trim() !== "Density:") continue;

        const value = label.nextElementSibling;
        if (!value) continue;

        if (/^(Optional|Required)$/.test((value.textContent || "").trim())) {
            return value;
        }
    }
    return null;
}

// The editable text input inside the floating "Density [g/cm3]" popup.
function findDensityEditorInput() {
    const candidates = [];

    const active = document.activeElement;
    if (active && active.tagName === "INPUT") candidates.push(active);
    candidates.push(...document.querySelectorAll(".MuiPaper-root input"));

    for (const input of candidates) {
        if (input.readOnly || input.type !== "text") continue;

        let box = input.parentElement;
        for (let i = 0; i < 8 && box; i++) {
            if (/MuiPaper/.test(box.className || "")) break;
            box = box.parentElement;
        }

        if (box && /Density\s*\[/i.test(box.innerText || "")) return input;
    }

    return null;
}

function setNativeInputValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
    )?.set;

    if (setter) {
        setter.call(input, value);
    } else {
        input.value = value;
    }

    input.dispatchEvent(new Event("input", { bubbles: true }));
}

function pressEnter(target) {
    const options = {
        bubbles: true,
        cancelable: true,
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
    };

    target.dispatchEvent(new KeyboardEvent("keydown", options));
    target.dispatchEvent(new KeyboardEvent("keypress", options));
    target.dispatchEvent(new KeyboardEvent("keyup", options));
}

function pressEscape() {
    const target = document.activeElement || document.body;
    const options = {
        bubbles: true,
        cancelable: true,
        key: "Escape",
        code: "Escape",
        keyCode: 27,
        which: 27,
    };

    target.dispatchEvent(new KeyboardEvent("keydown", options));
    target.dispatchEvent(new KeyboardEvent("keyup", options));
}

// Click the empty page margin left of the reaction so the table drops out of
// edit mode. Best effort — if something else sits there, staying in edit
// mode is harmless (CDD autosaves either way).
function clickOutside(container) {
    const rect = container.getBoundingClientRect();
    const x = 8;
    const y = Math.max(8, rect.top - 24);
    const target = document.elementFromPoint(x, y);

    if (target && !container.contains(target)) {
        mouseClick(target);
    }
}

// Fill `value` into the sample's stoichiometry row.
// Returns { ok: true } or { ok: false, reason }.
export async function fillDensityIntoTable(sample, value) {
    value = value != null ? String(value).trim() : "";
    if (!value) return { ok: false, reason: "no density value on this card" };

    const name = String(sample?.name || "").trim();
    if (!name) return { ok: false, reason: "no row name on this card" };

    // Prefer the container at the sample's display index, but fall back to
    // whichever reaction block actually contains the row — the page renders
    // fewer `[data-autotest-id="reaction"]` blocks than reactions for some
    // table variants, so the index alone is not trustworthy.
    const containers = getReactionContainers();
    let container = containers[sample.reactionIndex];
    let viewRows = container ? findRowsByName(container, name) : [];

    if (!viewRows.length) {
        for (const candidate of containers) {
            const rows = findRowsByName(candidate, name);
            if (rows.length) {
                container = candidate;
                viewRows = rows;
                break;
            }
        }
    }

    if (!viewRows.length) return { ok: false, reason: "table row not found" };

    const rowMissingDensity = viewRows.find(
        (tr) => !/Density:/.test(tr.innerText || "")
    );

    // Either the row is view-mode without density, or the table is already
    // in edit mode (then the placeholder link search below decides).
    mouseClick((rowMissingDensity || viewRows[0]).cells[0]);

    // The click re-renders the table into edit mode — re-find the row and
    // its Density placeholder from scratch.
    const link = await waitFor(() => {
        for (const tr of findRowsByName(container, name)) {
            const found = findDensityPlaceholderLink(tr);
            if (found) return found;
        }
        return null;
    });
    if (!link) {
        pressEscape();
        return { ok: false, reason: "row has no empty Density field" };
    }

    mouseClick(link);

    // The one-field popup is a MuiPaper labelled "Density [g/cm3]"; its input
    // sometimes has placeholder="Density" and sometimes none at all, so the
    // popup label is the only reliable marker.
    const input = await waitFor(findDensityEditorInput);
    if (!input) {
        pressEscape();
        return { ok: false, reason: "density editor did not open" };
    }

    setNativeInputValue(input, value);
    pressEnter(input);

    // The popup closes and the edit-mode row shows "Density: <value> …".
    const confirmed = await waitFor(() => {
        for (const tr of findRowsByName(container, name)) {
            const text = tr.innerText || "";
            if (text.includes("Density:") && text.includes(value)) return tr;
        }
        return null;
    });

    if (!confirmed) {
        pressEscape();
        return { ok: false, reason: "value did not stick" };
    }

    clickOutside(container);
    return { ok: true };
}
