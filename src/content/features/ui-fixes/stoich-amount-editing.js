// content/features/ui-fixes/stoich-amount-editing.js
//
// CDD's one-field stoichiometry popup keeps the unit of Mass and Volume
// INSIDE the input text while the popup label states the default
// ("Mass [mg]"), so clearing the field and typing a bare 25 commits
// 25 mg — a silent 1000x error that looks like a normal edit. This puts
// the remembered unit back if the field is committed as a bare number.
//
// This file used to preselect the number on open as well; CDD now
// selects the value itself, so that half was removed in 18.9.1.

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

// The unit the field carried when the popup opened. Keyed by the input
// element; a WeakMap so a closed popup's entry dies with its DOM node.
const unitAtOpen = new WeakMap();

function onFocusIn(event) {
    const input = event.target;
    if (!isAmountInput(input)) return;

    const parts = splitAmount(input.value);
    unitAtOpen.set(input, parts ? parts.unit : "");
}

/* ------------------------------------------------------------------ *
 * The unit safety net.
 *
 * A field retyped as a bare "25" is read against the popup label
 * ("Mass [mg]"), so 25 g becomes 25 mg without a word of warning.
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
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusout", onFocusOut, true);
}
