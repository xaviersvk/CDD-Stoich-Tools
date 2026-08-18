// content/features/ui-fixes/stoich-amount-editing.js
//
// CDD's one-field stoichiometry popup opens with the caret at the END of
// the value and nothing selected — so changing "19 g" to "25 g" costs
// four backspaces. Worse: Mass and Volume keep their unit INSIDE the
// input text while the popup label states the default ("Mass [mg]"), so
// clearing the field and typing a bare 25 commits 25 mg — a silent 1000x
// error that looks like a normal edit.
//
// Two halves, one file: preselect the number on open (the unit stays in
// the box, after the caret), and put the remembered unit back if the
// field is committed as a bare number anyway.

// "19 g" -> { number: "19", unit: "g" }; "1.23" -> { number: "1.23",
// unit: "" }; "" and anything not starting with a number -> null.
// The decimal separator is kept as typed — CDD accepts a comma, and
// rewriting it would be an edit nobody asked for.
export function splitAmount(value) {
    const match = /^\s*(\d+(?:[.,]\d+)?)\s*(.*?)\s*$/.exec(String(value ?? ""));
    if (!match) return null;
    return { number: match[1], unit: match[2] };
}

// The popup's editable box: CDD's own input class, inside the floating
// MuiPaper card, holding a number (possibly with a unit) or nothing at
// all. Everything else on the page — the solvent picker, the field
// pickers, the entry header forms — fails one of the three.
function isAmountInput(el) {
    if (!el || el.tagName !== "INPUT" || el.type !== "text" || el.readOnly) return false;
    if (!/\bmaterial-input\b/.test(el.className || "")) return false;
    if (!el.closest(".MuiPaper-root")) return false;
    return el.value === "" || splitAmount(el.value) !== null;
}

// A click INTO the box is the user aiming the caret — most likely at the
// unit, the one thing preselecting the number would put out of reach.
// The popup's own auto-focus has no mousedown on the input at all, which
// is what tells the two apart.
const CLICK_WINDOW_MS = 500;
let lastMouseDown = { target: null, at: 0 };

function onMouseDown(event) {
    if (!event.isTrusted) return;
    lastMouseDown = { target: event.target, at: Date.now() };
}

function clickedInto(input) {
    if (lastMouseDown.target !== input) return false;
    return Date.now() - lastMouseDown.at < CLICK_WINDOW_MS;
}

function onFocusIn(event) {
    const input = event.target;
    if (!isAmountInput(input) || clickedInto(input)) return;

    const parts = splitAmount(input.value);
    if (!parts) return;                       // empty box: nothing to select

    // Only the number. The unit stays in the box, after the caret, so
    // typing a new number keeps it without any further machinery.
    input.setSelectionRange(0, parts.number.length);
}

export function initStoichAmountEditing() {
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("focusin", onFocusIn, true);
}
