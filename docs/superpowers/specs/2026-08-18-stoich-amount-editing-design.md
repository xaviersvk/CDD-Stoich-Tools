# Stoichiometry amount editing — caret and unit — design

Date: 2026-08-18
Status: approved by user (conversation)

## Problem

Editing a number in a stoichiometry row costs more keystrokes than it
should, and one of those edits can silently change the value by 1000×.

Verified live on entry 2504170 (row 3, RGT-0000222-002) — when the
one-field popup opens, `selectionStart === selectionEnd === value.length`
in **every** numeric field. Nothing is ever preselected:

| Field      | Popup input value | Popup label       |
|------------|-------------------|-------------------|
| Mass       | `19 g`            | Mass **[mg]**     |
| Volume     | `15.5 mL`         | Volume **[mL]**   |
| Purity     | `98.2`            | Purity [%]        |
| Density    | `1.23`            | Density [g/cm3]   |
| Equivalent | `3`               | Equivalent        |

Two distinct problems follow:

1. **Ergonomics** — to change 19 g to 25 g the chemist must delete four
   characters before typing anything, in every field.
2. **Correctness** — Mass and Volume carry their unit *inside the input
   text*, but the popup's label states the default unit (`[mg]`, `[mL]`).
   Clear the field, type `25`, press Enter, and CDD reads 25 mg — a
   1000× error that looks like a normal edit.

## Decision

Both halves, because they solve different problems and each covers the
other's gap:

- **A — preselect the number on open.** `19 g` opens with `19` selected
  and ` g` left in place after the caret; `1.23` opens fully selected.
  Typing a number replaces only the number, so the unit survives by
  construction.
- **B — restore the unit on commit.** If the field holds a bare number at
  Enter and the field *had* a unit when the popup opened, the original
  unit is appended before the value is committed. This covers the paths A
  cannot: Ctrl+A then type, or clearing the field by hand.

Scope: **every** numeric popup of the stoichiometry table, recognised by
shape rather than by a list of field names — Mass, Volume, Purity,
Density, Equivalent and Concentration are the ones verified live, and any
other field CDD renders the same way is covered for free. A is useful in
all of them; B is inert in the ones whose value carries no unit.

**Always on** — no options toggle. This is an ergonomics fix with no data
risk of its own, and a checkbox would only add a way to lose the 1000×
guard.

## Components

`src/content/features/ui-fixes/stoich-amount-editing.js`, initialised
from `content/main.js` alongside the other ui-fixes. No MutationObserver
and no table scraping: the whole feature is three capture-phase listeners
on `document` (`mousedown`, `focusin`, `keydown`) plus a `focusout`
best-effort.

**Target recognition.** An `input.material-input` inside a
`.MuiPaper-root` whose value is empty or matches "number, optionally
followed by a unit". Nothing else qualifies — the solvent picker, the
field pickers and the forms outside the table all fail one of the two
structural tests or the value shape.

**Value split.** `19 g` → number `19`, unit `g`; `1.23` → number `1.23`,
unit `""`. A decimal comma counts as part of the number and is preserved
as typed.

**A — selection.** On `focusin` of a target input, select
`[0, number.length]`. Distinguishing "the popup just opened" from "the
user clicked into the text": a `mousedown` on the input itself is
recorded and, when it landed within 500 ms before the focus, the
selection is left alone — otherwise editing the unit would be impossible, because the caret
would jump back onto the number on every click. Empty field: nothing to
select, nothing to do.

**B — unit restore.** The unit present at open time is stored per input in
a `WeakMap`. On a trusted `Enter` keydown where the current value is a
**bare number** and a unit was recorded, the key event is swallowed
(`preventDefault` + `stopPropagation`), the value is corrected to
`<number> <unit>` through the native value setter with an `input` event,
and Enter is re-dispatched on the next frame. The re-dispatched event is
synthetic, so the handler ignores it and cannot loop.

The rule is deliberately strict: only a bare number is completed. A typed
`25 mg` is the chemist's own unit and is left untouched; an empty field
stays empty (a lone `g` is not a value).

The same correction runs on `focusout` as a best effort, in case CDD also
commits on click-outside — there the value is only fixed in the DOM, with
no re-dispatch.

**Coexistence with `row-fill.js`.** That module drives these same popups
and sends its own Enter. Both branches therefore act **only on
`event.isTrusted === true`**, so the plugin's own fills pass through
untouched. A preselection during a fill is harmless: `setNativeInputValue`
replaces the whole value regardless of the selection.

## Verification

The repo has no test framework; verification is the live reload-test loop
on entry 2504170:

- Mass `19 g` → type `25` → Enter → row reads `25 g`
- Volume `15.5 mL` → same with `mL`
- Purity / Density / Equivalent → whole number preselected, no unit ever
  appended
- Ctrl+A in Mass, type `25`, Enter → `25 g` (the B path)
- Type `25 mg` in Mass → committed as `25 mg`, not `25 mg g`
- Click into the middle of the value → caret stays where clicked
- Clear the field entirely → committed as empty, not `g`
- Panel "Fill density/purity/concentration" buttons still work (the
  `isTrusted` guard)

One open item, decided at implementation time with an explicit
value-neutral write to the test entry: whether the popup commits on
click-outside at all, which decides whether the `focusout` branch is
needed or should be dropped.
