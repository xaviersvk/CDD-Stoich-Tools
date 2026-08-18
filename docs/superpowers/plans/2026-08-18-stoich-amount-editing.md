# Stoichiometry amount editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open a stoichiometry field popup with its number preselected, and never let a bare number be committed into a field that had a unit.

**Architecture:** One new content-script module hanging off four capture-phase `document` listeners (`mousedown`, `focusin`, `keydown`, `focusout`). No MutationObserver, no table scraping. Popup inputs are recognised by shape (`input.material-input` inside `.MuiPaper-root`, numeric-looking value); the unit seen at open time is remembered per input in a `WeakMap`.

**Tech Stack:** Plain ES modules, Vite build (`npm run build`), Chrome/Firefox MV3 content script. No test framework in this repo — pure functions are checked with a throwaway `node` script, behaviour is checked live in the browser.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-18-stoich-amount-editing-design.md`.
- Always on — no options toggle, no storage key.
- Act **only** on `event.isTrusted === true`, so `row-fill.js`'s own synthetic fills are never touched.
- Never append a unit to an empty field; never touch a value that already carries a unit.
- Live test entry: `https://app.collaborativedrug.com/vaults/6884/eln/entries/2504170`, row 3 (`RGT-0000222-002`, `Mass: 19 g`, `Volume: 15.5 mL`).
- Another session is editing `src/content/features/panel-csv.js`. Do not stage it, and do not commit `dist/` until that work is committed — a build would bake their unfinished change in.
- Release steps (version bump, `CHANGELOG.md`, `RELEASES.md`, rebuild, commit) follow `CLAUDE.md` and stop before any push.

---

### Task 1: The pure value split

**Files:**
- Create: `src/content/features/ui-fixes/stoich-amount-editing.js`
- Test: throwaway `node` script in the scratchpad (no test framework in repo)

**Interfaces:**
- Produces: `splitAmount(value) -> { number: string, unit: string } | null` — `null` when the value is not a number-with-optional-unit. Used by Task 2 (selection length) and Task 3 (unit memory).

- [ ] **Step 1: Write the module with the parser only**

```js
// content/features/ui-fixes/stoich-amount-editing.js
//
// CDD's one-field stoichiometry popup opens with the caret at the END of
// the value and nothing selected — so changing "19 g" to "25 g" costs
// four backspaces. Worse: Mass and Volume keep their unit INSIDE the
// input text while the popup label states the default ("Mass [mg]"), so
// clearing the field and typing a bare 25 commits 25 mg — a silent 1000x
// error.
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
```

- [ ] **Step 2: Write the throwaway check and run it**

Write to the scratchpad and run with `node`:

```js
import { splitAmount } from "../../src/content/features/ui-fixes/stoich-amount-editing.js";
const cases = [
    ["19 g",     { number: "19", unit: "g" }],
    ["15.5 mL",  { number: "15.5", unit: "mL" }],
    ["1.23",     { number: "1.23", unit: "" }],
    ["3",        { number: "3", unit: "" }],
    ["98.2",     { number: "98.2", unit: "" }],
    ["1,23",     { number: "1,23", unit: "" }],
    ["25 g/cm3", { number: "25", unit: "g/cm3" }],
    ["",         null],
    ["   ",      null],
    ["Optional", null],
    ["g",        null],
];
for (const [input, expected] of cases) {
    const actual = splitAmount(input);
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    console.log(ok ? "ok  " : "FAIL", JSON.stringify(input), JSON.stringify(actual));
}
```

Expected: every line `ok`. A `FAIL` on `""` or `"g"` means the regex is
matching an empty number — fix the regex, not the case.

- [ ] **Step 3: Commit**

```bash
git add src/content/features/ui-fixes/stoich-amount-editing.js
git commit -m "Stoich popup: split an amount into its number and its unit"
```

---

### Task 2: Preselect the number on open (half A)

**Files:**
- Modify: `src/content/features/ui-fixes/stoich-amount-editing.js`
- Modify: `src/content/main.js` (import + call in `init()`, next to the other ui-fixes)

**Interfaces:**
- Consumes: `splitAmount()` from Task 1.
- Produces: `initStoichAmountEditing()` — the module's single entry point, called once from `main.js`. Also `isAmountInput(el)` and the module-level `lastMouseDown` record, both used by Task 3.

- [ ] **Step 1: Add target recognition, the mousedown record, and the focusin selection**

```js
// The popup's editable box: CDD's own input class, inside the floating
// MuiPaper card, holding a number (possibly with a unit). Everything
// else on the page — the solvent picker, the field pickers, the entry
// header forms — fails one of the three.
function isAmountInput(el) {
    if (!el || el.tagName !== "INPUT" || el.type !== "text" || el.readOnly) return false;
    if (!/\bmaterial-input\b/.test(el.className || "")) return false;
    if (!el.closest(".MuiPaper-root")) return false;
    return el.value === "" || splitAmount(el.value) !== null;
}

// A click INTO the box is the user aiming the caret — most likely at the
// unit, the one thing preselecting the number would make unreachable.
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
```

- [ ] **Step 2: Wire it into the content script**

In `src/content/main.js`, next to the other `ui-fixes` imports:

```js
import {initStoichAmountEditing} from "./features/ui-fixes/stoich-amount-editing";
```

and in `init()`, alongside the other ui-fixes calls:

```js
initStoichAmountEditing();
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: both `build:content` and `build:inject` succeed, `dist/assets/content.js` is rewritten.

- [ ] **Step 4: Verify live**

Reload the unpacked extension from `dist/`, open the test entry, click row 3 into edit mode, then:

- click `Mass: 19 g` → popup opens with `19` highlighted, ` g` visible after it
- type `25` → box reads `25 g`
- press Escape (do not commit yet)
- click `Purity: 98.2` → whole `98.2` highlighted
- click `Density: 1.23` → whole `1.23` highlighted
- reopen Mass, then click between the `9` and the `g` → caret stays where clicked, nothing gets selected

- [ ] **Step 5: Commit**

```bash
git add src/content/features/ui-fixes/stoich-amount-editing.js src/content/main.js
git commit -m "Stoich popup: preselect the number so the unit survives a retype"
```

---

### Task 3: Put the unit back on commit (half B)

**Files:**
- Modify: `src/content/features/ui-fixes/stoich-amount-editing.js`

**Interfaces:**
- Consumes: `splitAmount()`, `isAmountInput()`, `initStoichAmountEditing()`.
- Produces: nothing new for other tasks — this closes the feature.

- [ ] **Step 1: Remember the unit at open time**

Add above `onFocusIn`, and record inside it (before the selection, so an
empty box is remembered too):

```js
// The unit the field carried when the popup opened. Keyed by the input
// element; a WeakMap so a closed popup's entry dies with its DOM node.
const unitAtOpen = new WeakMap();
```

In `onFocusIn`, replace the early `if (!parts) return;` with:

```js
    unitAtOpen.set(input, parts ? parts.unit : "");
    if (!parts) return;                       // empty box: nothing to select
```

- [ ] **Step 2: Correct a bare number on Enter**

```js
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
```

Register it in `initStoichAmountEditing()`:

```js
    document.addEventListener("keydown", onKeyDown, true);
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: both builds succeed.

- [ ] **Step 4: Verify live — this is the first task that writes to the entry**

Reload the extension, open the test entry, row 3. Ask the user before the
first write; the entry is a TEST REACTION duplicate and the value goes
back to `19 g` at the end.

- Mass `19 g` → type `25` over the preselected number → Enter → row reads `25 g`
- Mass → Ctrl+A → type `30` → Enter → row reads `30 g` (the correction path)
- Mass → Ctrl+A → type `30 mg` → Enter → row reads `30 mg`, **not** `30 mg g`
- Volume `15.5 mL` → Ctrl+A → type `20` → Enter → row reads `20 mL`
- Purity → Ctrl+A → type `95` → Enter → row reads `95 %`, no stray unit appended
- Panel card button "Fill density" on another row still works (the `isTrusted` guard)
- Restore: Mass back to `19 g`, Volume to `15.5 mL`, Purity to `98.2`

- [ ] **Step 5: Answer the spec's open question about click-outside**

With the popup open on Mass, Ctrl+A, type `31`, then click the empty page
margin instead of pressing Enter.

- If the row reads `31 mg`, CDD commits on blur and the `focusout` branch
  below is needed. Add it, rebuild, and re-run this check — it must then
  read `31 g`.
- If the row still reads the previous value (or `31 g`), CDD does not
  commit on blur; drop the branch and note it in the spec's open item.

```js
function onFocusOut(event) {
    if (!event.isTrusted) return;

    const input = event.target;
    if (!isAmountInput(input)) return;

    const corrected = correctionFor(input);
    if (corrected) setNativeValue(input, corrected);
}
```

Registered as:

```js
    document.addEventListener("focusout", onFocusOut, true);
```

Restore Mass to `19 g` afterwards either way.

- [ ] **Step 6: Update the spec's open item with the answer**

Edit `docs/superpowers/specs/2026-08-18-stoich-amount-editing-design.md`:
replace the closing "One open item…" paragraph with what was actually
observed and what shipped.

- [ ] **Step 7: Commit**

```bash
git add src/content/features/ui-fixes/stoich-amount-editing.js docs/superpowers/specs/2026-08-18-stoich-amount-editing-design.md
git commit -m "Stoich popup: restore the field's unit when a bare number is committed"
```

---

### Task 4: Release preparation

**Files:**
- Modify: `manifest.json` (version)
- Modify: `CHANGELOG.md`, `RELEASES.md`
- Modify: `dist/` (rebuild output)

**Interfaces:**
- Consumes: the finished feature from Tasks 1–3.

- [ ] **Step 1: Confirm the version number with the user**

A new user-visible behaviour with no breaking change — `14.1.0` unless
the user says otherwise. Ask; do not pick silently.

- [ ] **Step 2: Check the other session's work is committed**

Run: `git status --short`
Expected: `src/content/features/panel-csv.js` no longer modified. If it
still is, stop and ask — committing `dist/` now would bake their
unfinished change into the build.

- [ ] **Step 3: Bump, document, rebuild**

Bump `version` in `manifest.json`, add the entry to `CHANGELOG.md` and
`RELEASES.md` in English, then run `npm run build`.

- [ ] **Step 4: Commit and stop**

```bash
git add -A
git commit -m "Release <version>: preselect the amount, keep the unit"
```

Then **STOP**. Per `CLAUDE.md`: no `git push`, no tag. Say the commit is
ready and wait for an explicit go-ahead for each.
