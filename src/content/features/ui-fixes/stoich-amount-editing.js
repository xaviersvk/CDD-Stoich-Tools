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

// The unit the field carried when the popup opened. Keyed by the input
// element; a WeakMap so a closed popup's entry dies with its DOM node.
const unitAtOpen = new WeakMap();

function onFocusIn(event) {
    const input = event.target;
    if (!isAmountInput(input)) return;

    const parts = splitAmount(input.value);
    unitAtOpen.set(input, parts ? parts.unit : "");

    if (!parts || clickedInto(input)) return;  // empty box, or a hand-placed caret

    // Only the number. The unit stays in the box, after the caret, so
    // typing a new number keeps it without any further machinery.
    input.setSelectionRange(0, parts.number.length);
}

/* ------------------------------------------------------------------ *
 * The unit safety net.
 *
 * Selecting the number keeps the unit for the ordinary edit, but not for
 * Ctrl+A — and a field cleared to a bare "25" is read against the popup
 * label ("Mass [mg]"), so 25 g becomes 25 mg without a word of warning.
 * If the box is committed as a bare number and it HAD a unit, that unit
 * goes back in first.
 * ------------------------------------------------------------------ */

// React tracks the input's value on the DOM node itself; assigning
// `.value` directly leaves that tracker stale and the change is ignored.
// The prototype setter is the same route row-fill.js takes.
function setNativeValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, "value")?.set;
    if (setter) setter.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
}

// The value that should be committed, or null when the box is already
// fine. Only a BARE number is completed: "25 mg" is the chemist's own
// unit, and an empty box must stay empty — "g" is not a value.
function correctionFor(input) {
    const unit = unitAtOpen.get(input);
    if (!unit) return null;

    const parts = splitAmount(input.value);
    if (!parts || parts.unit !== "") return null;

    return `${parts.number} ${unit}`;
}

function onKeyDown(event) {
    // Trusted events only: row-fill.js drives these same popups and sends
    // its own Enter, and its values are already exactly what it means.
    if (!event.isTrusted || event.key !== "Enter") return;

    const input = event.target;
    if (!isAmountInput(input)) return;

    const corrected = correctionFor(input);
    if (!corrected) return;

    // Swallow this Enter, fix the value, then send Enter again on the
    // next frame — by then React has the corrected value in hand. The
    // re-sent event is synthetic, so this handler ignores it and the
    // exchange cannot loop.
    event.preventDefault();
    event.stopPropagation();
    setNativeValue(input, corrected);

    requestAnimationFrame(() => {
        const options = {
            bubbles: true, cancelable: true,
            key: "Enter", code: "Enter", keyCode: 13, which: 13,
        };
        input.dispatchEvent(new KeyboardEvent("keydown", options));
        input.dispatchEvent(new KeyboardEvent("keypress", options));
        input.dispatchEvent(new KeyboardEvent("keyup", options));
    });
}

// The other way out of the popup. Whether CDD commits on click-outside
// at all is unverified, so this is best effort: the value is simply
// correct by the time any blur handler reads it. Nothing is
// re-dispatched — a blur is not ours to replay.
function onFocusOut(event) {
    if (!event.isTrusted) return;

    const input = event.target;
    if (!isAmountInput(input)) return;

    const corrected = correctionFor(input);
    if (corrected) setNativeValue(input, corrected);
}

export function initStoichAmountEditing() {
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusout", onFocusOut, true);
}
