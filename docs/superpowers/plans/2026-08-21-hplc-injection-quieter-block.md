# A quieter HPLC injection block — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the panel's HPLC injection block show one number at rest, warn on one short line, and stop complaining about injections the instrument delivers happily.

**Architecture:** No arithmetic changes. The block's DOM grows a collapsed body (calculator behind the header), its two message elements merge into one, its `exact … nmol` line is deleted, and the optimiser's comfortable-band defaults widen from 0.3–2 µL to 0.1–5 µL. Because that band is a stored setting, the options page gains a **reset to default** button rather than an upgrade that overwrites a preference.

**Tech Stack:** Vanilla ES modules, no framework. Chrome MV3 extension. Vite builds `dist/`. Panel CSS lives as a template string in the feature module and is spliced into the panel's `<style>` by `sample-panel.js`.

Spec: `docs/superpowers/specs/2026-08-21-hplc-injection-quieter-block-design.md`

## Global Constraints

- **No test runner exists in this project.** `package.json` has only build scripts. Pure shared modules are checked with a `node -e` one-liner (Node 24 detects ESM by syntax, so `import('./src/shared/...js')` works from the repo root). DOM behaviour is checked by hand in the panel after `npm run build` and an extension reload.
- **Never push.** Per `CLAUDE.md`: commit only. No `git push`, no tags, ever, without the user asking.
- `src/shared/hplc-injection-math.js` must stay free of `chrome.*` and DOM access — the page-context INJECT bundle imports it. Do not add imports to it.
- `src/shared/hplc-optimizer.js` must stay pure — no DOM, no `chrome.*`, no clock.
- CSS rules inside `HPLC_BLOCK_STYLES` **must start with exactly two spaces then a dot**. `sample-panel.js:459` does `HPLC_BLOCK_STYLES.replace(/^ {2}\./gm, "  #" + PANEL_ID + " .")` to scope them. A rule indented differently escapes the panel scope.
- Per-reaction state (overrides, and now the collapsed flag) lives in module-level maps, **never on the DOM node**: `renderSamples` rebuilds every block from scratch on each payload and enrichment pass.
- English in all code, comments, UI strings, `CHANGELOG.md` and `RELEASES.md`.

---

### Task 1: Widen the comfortable band, add a way back to the default

**Files:**
- Modify: `src/shared/hplc-optimizer.js` (the `DEFAULT_COMFORT_*` constants, ~lines 36–41)
- Modify: `src/shared/hplc-injection.js` (add `resetHplcComfortBand`, next to `saveHplcComfortBand`)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `DEFAULT_COMFORT_MIN_UL === 0.1`, `DEFAULT_COMFORT_MAX_UL === 5` (exported from `hplc-optimizer.js`)
  - `resetHplcComfortBand(): Promise<void>` — exported from `hplc-injection.js`; removes both stored keys so `loadHplcSettings()` falls back to the defaults. Task 2 imports it.

- [ ] **Step 1: Record today's behaviour so the change is provable**

Run from the repo root:

```bash
node -e "
import('./src/shared/hplc-optimizer.js').then(({optimizeInjection})=>{
  const base={molarity:0.1,dropUl:10,vialLadderMl:[0.25,1.5],injectionMinUl:0.1,injectionMaxUl:10};
  const cases=[
    ['0.2 uL', {targetNmol:0.2,currentAliquotUl:10,currentVialMl:1.0}],
    ['0.08 uL',{targetNmol:0.08,currentAliquotUl:10,currentVialMl:1.0}],
    ['6 uL',   {targetNmol:0.2,currentAliquotUl:10,currentVialMl:30}],
  ];
  for(const [name,c] of cases){
    const r=optimizeInjection({...base,...c});
    console.log(name, r.ok ? 'quiet' : 'WARNS ('+r.reason+')');
  }
});"
```

Expected, **before** the change — this is the bug:

```
0.2 uL WARNS (too-concentrated)
0.08 uL WARNS (too-concentrated)
6 uL WARNS (too-dilute)
```

- [ ] **Step 2: Move the two constants**

In `src/shared/hplc-optimizer.js`, replace the `DEFAULT_COMFORT_MIN_UL` / `DEFAULT_COMFORT_MAX_UL` block (including its comment) with:

```js
// Where the injection is pleasant to work with — and deliberately wide.
//
// It started at 0.3–2 µL, which is where the method is happiest, and that
// turned out to be the wrong thing for a DEFAULT to say: 0.2 µL is an
// injection the loop delivers without complaint, and the block was telling
// the chemist to go and re-dilute for it. A default band should mark where
// a different dilution is genuinely worth the bench time, not where the
// method is at its best.
//
// Unlike the injector's own 0.1–10 µL limits, this pair is a PREFERENCE — it
// depends on the method and on who is running it — so these are only the
// defaults; the band arrives as an argument. See shared/hplc-injection.js.
export const DEFAULT_COMFORT_MIN_UL = 0.1;
export const DEFAULT_COMFORT_MAX_UL = 5;
```

- [ ] **Step 3: Run the same check and see the difference**

Run the identical command from Step 1. Expected, **after**:

```
0.2 uL quiet
0.08 uL WARNS (too-concentrated)
6 uL WARNS (too-dilute)
```

If `0.2 uL` still warns, the constants did not take — check for a second definition or a stale import.

- [ ] **Step 4: Add `resetHplcComfortBand`**

In `src/shared/hplc-injection.js`, immediately **after** `saveHplcComfortBand`, add:

```js
// The band is the one HPLC setting whose default has moved after release, so
// it is the one that needs a way back. Removing the keys rather than writing
// the current defaults into them means a future default change reaches
// anyone who has pressed this, instead of freezing them at today's numbers.
export async function resetHplcComfortBand() {
    try {
        await chrome.storage.local.remove([
            HPLC_COMFORT_MIN_KEY,
            HPLC_COMFORT_MAX_KEY,
        ]);
    } catch {
        // Orphaned content script — nothing useful to do.
    }
}
```

- [ ] **Step 5: Check the module still parses and exports what Task 2 needs**

```bash
node -e "import('./src/shared/hplc-optimizer.js').then(m=>console.log('band', m.DEFAULT_COMFORT_MIN_UL, m.DEFAULT_COMFORT_MAX_UL))"
```

Expected: `band 0.1 5`

```bash
node -e "import('./src/shared/hplc-injection.js').then(m=>console.log('reset export:', typeof m.resetHplcComfortBand))"
```

Expected: `reset export: function`

- [ ] **Step 6: Commit**

```bash
git add src/shared/hplc-optimizer.js src/shared/hplc-injection.js
git commit -m "Widen the comfortable band, and give it a way back"
```

---

### Task 2: A reset button on the comfortable-range setting

**Files:**
- Modify: `src/options/options.html:569-583` (the comfortable-range row)
- Modify: `src/options/options.js:850-906` (element handles, commit, echo, init)
- Modify: `src/options/options.css:888-917` (a duplicated `.range-pair` block, plus the new button style)

**Interfaces:**
- Consumes: `resetHplcComfortBand()` from Task 1.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Delete the duplicated `.range-pair` block**

`src/options/options.css` defines `.range-pair`, `.range-pair .purity-threshold-input` and `.range-pair__to` **twice**, back to back around lines 888–917. The first copy is dead — the second wins and sets a 64px input instead of 68px. Delete the **first** of the two copies, so only this remains:

```css
/* A range is one setting with two ends, so it stays one row. */
.range-pair {
    display: flex;
    align-items: center;
    gap: 7px;
}

.range-pair .purity-threshold-input {
    width: 64px;
}

.range-pair__to {
    font-size: 12px;
    color: var(--muted);
}
```

Verify exactly one copy is left:

```bash
grep -c "^\.range-pair {" src/options/options.css
```

Expected: `1`

- [ ] **Step 2: Add the button style**

Append to `src/options/options.css`:

```css
/* Sits inside .range-pair, after the two ends — a way back to the shipped
   default for the one band whose default has moved since release. */
.range-reset {
    padding: 3px 7px;
    font-size: 11px;
    font-family: inherit;
    color: var(--muted);
    background: transparent;
    border: 1px solid var(--rule);
    border-radius: var(--radius);
    cursor: pointer;
    white-space: nowrap;
}

.range-reset:hover {
    color: var(--ink);
    border-color: var(--ink);
}
```

- [ ] **Step 3: Add the button to the markup**

In `src/options/options.html`, inside the comfortable-range `<span class="range-pair">` (the one holding `hplcComfortMin` / `hplcComfortMax`), after the `hplcComfortMax` input and before the closing `</span>`, add:

```html
                        <button type="button" id="hplcComfortReset"
                                class="range-reset"
                                title="Back to the shipped default, 0.1 to 5 µL">
                            reset
                        </button>
```

`type="button"` matters: the row is a `<label>`, and a submit-typed button inside one is a trap for stray Enter presses.

Do **not** touch the injector-range row above it — that band's default has not moved.

- [ ] **Step 4: Wire it up**

In `src/options/options.js`:

1. Add `resetHplcComfortBand` to the existing import block from `../shared/hplc-injection.js` (the one that already brings in `saveHplcComfortBand`, around line 47).
2. Extend the existing optimiser import on line 50 — do not add a second statement for the same module:

```js
import {
    DEFAULT_COMFORT_MAX_UL,
    DEFAULT_COMFORT_MIN_UL,
    formatVialLadder,
} from "../shared/hplc-optimizer.js";
```
3. Below `const hplcComfortEcho = …` (line 852) add:

```js
const hplcComfortResetButton = document.getElementById("hplcComfortReset");
```

4. Replace `commitComfortBand` and the two listeners under it with a version that also repaints the echo — today the echo is written once at init and goes stale the moment the band is edited:

```js
// The ends are saved together: a band whose bottom is above its top is not
// a band, and sanitizeComfortBand can only see that when it has both.
function commitComfortBand() {
    saveHplcComfortBand(hplcComfortMinInput.value, hplcComfortMaxInput.value);
    paintComfortEcho(hplcComfortMinInput.value, hplcComfortMaxInput.value);
}
```

5. After the two `hplcComfortM*Input` change listeners, add:

```js
hplcComfortResetButton?.addEventListener("click", async () => {
    await resetHplcComfortBand();
    hplcComfortMinInput.value = DEFAULT_COMFORT_MIN_UL;
    hplcComfortMaxInput.value = DEFAULT_COMFORT_MAX_UL;
    paintComfortEcho(DEFAULT_COMFORT_MIN_UL, DEFAULT_COMFORT_MAX_UL);
});
```

`paintComfortEcho` is declared with `function`, so it is hoisted and may be called from a listener registered above its definition — this matches how the file already works.

- [ ] **Step 5: Build and check by hand**

```bash
npm run build
```

Expected: two Vite builds finish with no error. Then reload the unpacked extension at `chrome://extensions` and open the options page.

Under **Settings → HPLC injection → Comfortable injection range**:

1. A `reset` button sits after the two number inputs, on the same row.
2. Type `0.4` and `3` into the two ends, tab out — the sentence under **Vial volumes you stock** now reads `0.4–3 µL` straight away, without a reload.
3. Press `reset` — the inputs become `0.1` and `5`, and the echo reads `0.1–5 µL`.
4. Reload the options page — it still reads `0.1` and `5`, proving the keys were removed rather than just blanked on screen.

- [ ] **Step 6: Commit**

```bash
git add src/options/options.html src/options/options.js src/options/options.css
git commit -m "A reset button for the comfortable injection range"
```

---

### Task 3: One warning line instead of two, and no `exact` echo

**Files:**
- Modify: `src/content/features/hplc-injection-block.js` (element creation, `repaint`, `paintAdvice`, `HPLC_BLOCK_STYLES`)

**Interfaces:**
- Consumes: the widened defaults from Task 1 (behaviour only — no import change).
- Produces: a single element `warn` with class `cdd-hplc-warn`, and a `paintWarning(current, computed)` function inside `createHplcInjectionBlock`. Task 4 places `warn` between the header and the collapsible body.

- [ ] **Step 1: Delete the `exact` element**

In `createHplcInjectionBlock`, remove:

```js
    const exact = document.createElement("div");
    exact.className = "cdd-hplc-exact";
```

and drop `exact` from the `block.append(...)` call. In `repaint`, delete both branches that write to it — the three lines in the `if (!computed)` early return (`exact.textContent = ""` / `exact.hidden = true`) and the whole `roundingMoved` paragraph:

```js
        const roundingMoved =
            Math.abs(computed.roundedUl - computed.volumeUl) > 1e-9;

        exact.hidden = !roundingMoved;
        exact.textContent = roundingMoved
            ? `exact ${formatInjectionVolume(computed.volumeUl)} µL · ` +
              `${formatNmol(computed.deliveredNmol)} nmol on column`
            : "";
```

`formatInjectionVolume` and `formatNmol` now have no caller here — remove them from the import from `../../shared/hplc-injection-math.js`. Leave both **exported** from the math module; it is shared, and deleting an export is not this change's business.

`HPLC_INJECTION_STEP_UL` is also imported only for the `floored` note, which Step 3 deletes — remove it from the import too.

- [ ] **Step 2: Replace `note` and `advice` with one `warn`**

Delete both element declarations:

```js
    const note = document.createElement("div");
    note.className = "cdd-hplc-note";
    note.hidden = true;

    const advice = document.createElement("button");
    advice.type = "button";
    advice.className = "cdd-hplc-advice";
    advice.hidden = true;
```

and put in their place:

```js
    // One line, one action. It says what is wrong and — when there is one —
    // what to do about it; clicking applies that as this reaction's own
    // override, so nothing global moves. Never more than a line: the bench
    // reads this at a glance, and a paragraph here is a paragraph nobody
    // reads.
    const warn = document.createElement("button");
    warn.type = "button";
    warn.className = "cdd-hplc-warn";
    warn.hidden = true;
```

Update the append call to use `warn` where `note` and `advice` were.

- [ ] **Step 3: Rewrite the message logic**

In `repaint`, replace the `if (!computed)` early return's message lines and the `note` block that follows the result painting. The `if (!computed)` return becomes:

```js
        if (!computed) {
            result.textContent = "—";
            result.classList.remove("cdd-hplc-result-warn");
            copyValue = "";
            hideWarning();
            return;
        }
```

and everything from `result.classList.toggle("cdd-hplc-result-warn", …)` down to the closing brace of the `note` if/else chain, plus the trailing `paintAdvice(current);`, becomes:

```js
        result.classList.toggle(
            "cdd-hplc-result-warn",
            computed.warning === "exceeds-vial"
        );

        paintWarning(current, computed);
```

Then replace the whole `paintAdvice` function with:

```js
    function hideWarning() {
        warn.hidden = true;
        warn.onclick = null;
    }

    function showWarning(text, { error = false, onclick = null } = {}) {
        warn.hidden = false;
        warn.disabled = !onclick;
        warn.textContent = text;
        warn.className = error ? "cdd-hplc-warn cdd-hplc-warn-error" : "cdd-hplc-warn";
        warn.title = onclick ? "Apply to this reaction only" : "";
        warn.onclick = onclick;
    }

    // What to say when the injection is not one the bench wants to make.
    //
    // An injection larger than the whole sample takes the line whatever the
    // optimiser thinks: that is a mistake, not a preference, and it is the
    // only red one here.
    function paintWarning(current, computed) {
        if (computed.warning === "exceeds-vial") {
            showWarning("⚠ More than the whole vial", { error: true });
            return;
        }

        const settings = getHplcSettings();
        const outcome = optimizeInjection({
            molarity,
            targetNmol: current.targetNmol,
            dropUl: settings.aliquotUl,
            currentAliquotUl: current.aliquotUl,
            currentVialMl: current.vialMl,
            vialLadderMl: settings.vialLadderMl,
            comfortMinUl: settings.comfortMinUl,
            comfortMaxUl: settings.comfortMaxUl,
            injectionMinUl: settings.injectionMinUl,
            injectionMaxUl: settings.injectionMaxUl,
        });

        if (outcome.ok) {
            hideWarning();
            return;
        }

        // "impossible" and "nothing on the ladder does better" are the same
        // sentence to the person holding the vial: there is no move to make.
        if (!outcome.suggestion) {
            showWarning("⚠ Nothing on the ladder brings this in range");
            return;
        }

        const s = outcome.suggestion;
        const lead = outcome.reason === "too-dilute" ? "Too dilute" : "Too concentrated";

        const steps = [];
        if (Math.abs(s.vialMl - current.vialMl) > 1e-9) steps.push(`${s.vialMl} mL`);

        const currentDrops = Math.max(1, Math.round(current.aliquotUl / settings.aliquotUl));
        if (s.drops !== currentDrops) {
            steps.push(`${s.drops} drop${s.drops === 1 ? "" : "s"}`);
        }
        if (s.dilution !== 1) steps.push(`${s.dilution}× dilution`);

        showWarning(
            `⚠ ${lead} → ${steps.join(", ")} = ${s.volumeUl.toFixed(1)} µL`,
            {
                onclick: () => {
                    setOverride(reactionIndex, "vialMl", s.vialMl);
                    // The EFFECTIVE aliquot, dilution folded in — a 5×-diluted
                    // drop puts the same material in the vial as 2 µL would,
                    // which is exactly how the bench's own grid labels that
                    // row. Without this the click would apply a suggestion
                    // whose dilution has nowhere to live, and the number would
                    // not move.
                    setOverride(reactionIndex, "aliquotUl", s.aliquotUl);
                    repaint();
                },
            }
        );
    }
```

- [ ] **Step 4: Update the styles**

In `HPLC_BLOCK_STYLES`, delete the `.cdd-hplc-exact`, `.cdd-hplc-note`, `.cdd-hplc-note-warn` and `.cdd-hplc-note-error` rules, and replace the `.cdd-hplc-advice[hidden]`, `.cdd-hplc-advice`, `.cdd-hplc-advice:hover:not(:disabled)` and `.cdd-hplc-advice:disabled` rules with:

```css
  /* An author display rule beats the UA stylesheet's [hidden] rule, so without
     this the element stays on screen when warn.hidden = true -- an empty
     amber bar on every reaction that needs no advice. */
  .cdd-hplc-warn[hidden] {
    display: none;
  }

  .cdd-hplc-warn {
    display: block;
    width: 100%;
    margin-top: 6px;
    padding: 5px 7px;
    font-size: 10px;
    font-family: inherit;
    line-height: 1.35;
    text-align: left;
    color: #fbbf24;
    background: rgba(245, 158, 11, 0.1);
    border: 1px solid rgba(245, 158, 11, 0.4);
    border-radius: 6px;
    cursor: pointer;
  }

  .cdd-hplc-warn:hover:not(:disabled) {
    background: rgba(245, 158, 11, 0.22);
  }

  .cdd-hplc-warn:disabled {
    cursor: default;
    opacity: 0.85;
  }

  .cdd-hplc-warn-error {
    color: #fca5a5;
    background: rgba(239, 68, 68, 0.12);
    border-color: rgba(239, 68, 68, 0.45);
  }
```

Keep the two-space-then-dot indentation — see Global Constraints.

- [ ] **Step 5: Confirm nothing dead is left behind**

```bash
grep -n "cdd-hplc-exact\|cdd-hplc-note\|cdd-hplc-advice\|paintAdvice\|formatNmol\|formatInjectionVolume\|HPLC_INJECTION_STEP_UL" src/content/features/hplc-injection-block.js
```

Expected: no output.

```bash
npm run build
```

Expected: both builds succeed.

- [ ] **Step 6: Check by hand**

Reload the extension, open an ELN entry with the block switched on (**Settings → HPLC injection**). With the band at its new default:

1. A reaction whose injection lands around 0.2–3 µL shows **no** message line at all, and no `exact … nmol on column` line anywhere.
2. Set the target very low (e.g. `0.01` nmol) so the injection falls under 0.1 µL — one amber line appears, no more, reading `⚠ Too concentrated → …`.
3. Click it — the inputs move, the volume moves, and the line disappears or changes. It must not stay identical after a click.
4. Set the vial to something absurd (e.g. `30` mL) — the volume goes red and the line reads `⚠ Too dilute → …`; if the suggested injection still exceeds the vial you get the red `⚠ More than the whole vial` instead.

- [ ] **Step 7: Commit**

```bash
git add src/content/features/hplc-injection-block.js
git commit -m "One warning line, and no echo of a number nobody acts on"
```

---

### Task 4: Collapse the calculator behind the header

**Files:**
- Modify: `src/content/features/hplc-injection-block.js` (module state, element creation, `repaint`, `HPLC_BLOCK_STYLES`)
- Modify: `src/content/main.js:112` (rename the state-clearing call)

**Interfaces:**
- Consumes: the `warn` element and `paintWarning` from Task 3.
- Produces:
  - `clearHplcInjectionState()` replaces the exported `clearHplcInjectionOverrides()`; same call site, now clears the collapse map too.
  - Resting DOM: `.cdd-hplc-header` (title, override dot, chevron, result) → `.cdd-hplc-warn` → `.cdd-hplc-body[hidden]` (molarity, three inputs, reset).

- [ ] **Step 1: Add the collapse map and widen the clear**

Below the `overrides` map declaration, add:

```js
// reactionIndex -> open. Same home as `overrides`, for the same reason: a
// flag kept on the DOM node would be thrown away by the next renderSamples,
// which rebuilds every block on each payload and enrichment pass. Not
// persisted either — this is a glance, not a preference.
const expanded = new Set();
```

Rename the exported clear and widen it:

```js
// Called when the ELN entry changes — see the url-watcher callback in
// content/main.js, next to resetState().
export function clearHplcInjectionState() {
    overrides.clear();
    expanded.clear();
}
```

In `src/content/main.js`, update the import on line 58 and the call on line 112 to `clearHplcInjectionState`.

Confirm the old name is gone:

```bash
grep -rn "clearHplcInjectionOverrides" src/
```

Expected: no output.

- [ ] **Step 2: Restructure the header**

Replace the `top` block. The title, the override dot and the chevron go in a left group; the result stays on the right; `reset` leaves the header entirely.

```js
    const header = document.createElement("div");
    header.className = "cdd-hplc-header";
    header.setAttribute("role", "button");
    header.tabIndex = 0;

    const title = document.createElement("span");
    title.className = "cdd-hplc-title";
    title.textContent = "HPLC injection";

    // The inputs are behind a collapse now, and so is the `reset` pill that
    // used to say "this reaction is not on the settings' numbers". Without
    // this dot that fact would be invisible at rest.
    const dot = document.createElement("span");
    dot.className = "cdd-hplc-dot";
    dot.textContent = "•";
    dot.title = "This reaction uses its own numbers";
    dot.hidden = true;

    const chevron = document.createElement("span");
    chevron.className = "cdd-hplc-chevron";

    const headLeft = document.createElement("span");
    headLeft.className = "cdd-hplc-head-left";
    headLeft.append(title, dot, chevron);

    const result = document.createElement("span");
    result.className = "cdd-hplc-result";

    header.append(headLeft, result);
```

Keep the existing `reset` button declaration exactly as it is — only its parent changes, in the next step.

- [ ] **Step 3: Put the calculator in a body and assemble the block**

After the `inputs` element is built, append `reset` to it and wrap it:

```js
    const body = document.createElement("div");
    body.className = "cdd-hplc-body";
    inputs.append(reset);
    body.append(inputs);
```

and replace the block assembly with:

```js
    block.append(header, warn, body);
```

The warning sits **outside** the body on purpose: it has to be readable while the block is shut.

- [ ] **Step 4: Wire the toggle, and keep copy out of its way**

Replace the existing `result` click listener with a pair that cannot fight each other:

```js
    // The header toggles; the number copies. Nested interactive elements are
    // not valid markup, so the result stops its own click from reaching the
    // header rather than being a button inside one.
    result.addEventListener("click", async (event) => {
        event.stopPropagation();
        if (!copyValue) return;
        await copyTextWithFeedback(result, copyValue);
    });

    header.addEventListener("click", toggle);
    header.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        toggle();
    });

    function toggle() {
        if (expanded.has(reactionIndex)) expanded.delete(reactionIndex);
        else expanded.add(reactionIndex);
        paintCollapse();
    }

    function paintCollapse() {
        const open = expanded.has(reactionIndex);
        body.hidden = !open;
        chevron.textContent = open ? "⌃" : "⌄";
        header.setAttribute("aria-expanded", String(open));
    }
```

- [ ] **Step 5: Paint the dot and the collapse on every repaint**

In `repaint`, the line

```js
        reset.hidden = !Object.keys(local).length;
```

becomes

```js
        const overridden = Object.keys(local).length > 0;
        reset.hidden = !overridden;
        dot.hidden = !overridden;
        paintCollapse();
```

`paintCollapse()` inside `repaint` is what makes an open block survive a re-render: `createHplcInjectionBlock` runs again and reads the map, rather than starting shut.

- [ ] **Step 6: Style the header, chevron, dot and body**

In `HPLC_BLOCK_STYLES`, rename the `.cdd-hplc-top` rule to `.cdd-hplc-header` and give it `cursor: pointer;` — it keeps its existing `display: flex`, `justify-content: space-between`, `align-items: baseline` and `gap: 8px`:

```css
  .cdd-hplc-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    cursor: pointer;
  }
```

Then add:

```css
  .cdd-hplc-header:focus-visible {
    outline: 1px solid rgba(56, 189, 248, 0.7);
    outline-offset: 2px;
    border-radius: 4px;
  }

  .cdd-hplc-head-left {
    display: flex;
    align-items: baseline;
    gap: 5px;
    min-width: 0;
  }

  .cdd-hplc-chevron {
    font-size: 9px;
    line-height: 1;
    color: #64748b;
  }

  /* This reaction is not on the settings' numbers. */
  .cdd-hplc-dot {
    font-size: 14px;
    line-height: 1;
    color: #f59e0b;
  }

  .cdd-hplc-dot[hidden] {
    display: none;
  }

  .cdd-hplc-body[hidden] {
    display: none;
  }
```

The `[hidden]` rules are not optional — `.cdd-hplc-inputs` sets `display: flex`, which beats the UA stylesheet's `[hidden]` rule on the ancestor's children only if the ancestor itself is still `display: block`. Same trap the advice bar already hit.

Confirm the old class name is gone:

```bash
grep -n "cdd-hplc-top" src/content/features/hplc-injection-block.js
```

Expected: no output.

- [ ] **Step 7: Build and run the whole verification list**

```bash
npm run build
```

Then reload the extension and open an ELN entry with the block on:

1. At rest the block is **one line**: `HPLC INJECTION ⌄` on the left, the volume on the right.
2. Clicking the title or anywhere on that row opens it — molarity, three inputs and `reset` appear, the chevron flips to `⌃`. Clicking again shuts it.
3. Clicking the **volume** copies it (green flash, `Copied`) and does **not** open or shut the block.
4. Tab to the header, press Enter — it toggles. Press Space — it toggles, and the panel does not scroll.
5. Open a block, then change one of its inputs. It stays open through the repaint.
6. Open a block, then force a full re-render — toggle a field in the panel's own field switches, or wait for the enrichment pass to land. It stays open.
7. Change an input away from the settings default: an amber `•` appears after the title. Shut the block — the dot is still there. Press `reset` — the dot goes.
8. Navigate to a different ELN entry and back: every block is shut again and carries no dot.
9. A reaction with a warning shows its line while the block is shut.

- [ ] **Step 8: Commit**

```bash
git add src/content/features/hplc-injection-block.js src/content/main.js
git commit -m "Put the injection calculator behind the header"
```

---

### Task 5: Release 14.12.0

Follow `CLAUDE.md`'s release workflow exactly, then **stop**. Do not push, do not tag.

**Files:**
- Modify: `manifest.json` (version)
- Modify: `CHANGELOG.md`
- Modify: `RELEASES.md`
- Rebuild: `dist/`

**Interfaces:**
- Consumes: Tasks 1–4, all committed.
- Produces: a release commit awaiting the user's test-and-go-ahead.

- [ ] **Step 1: Bump the version**

In `manifest.json`, `"version": "14.11.0"` → `"version": "14.12.0"`. Minor bump: behaviour of a shipped feature changes, nothing breaks.

- [ ] **Step 2: Write the changelog entry**

Directly above `## [14.11.0] — 2026-08-21`. The heading is bracketed — that is the file's style, and `## 14.12.0` would be the odd one out:

```markdown
## [14.12.0] — 2026-08-21

### Changed

- **The HPLC injection block is quiet at rest.** It shows the title and the
  injection volume on one line; the molarity, the three inputs and `reset`
  open on a click of the header. The `exact … nmol on column` echo is gone —
  tenth-microlitre rounding moves the delivered amount by a few percent, and
  this is reaction monitoring, not quantitation.
- **One warning line instead of two.** The note and the advice bar merged.
  It is readable while the block is shut, still clickable, and shorter:
  `⚠ Too dilute → 0.25 mL, 2 drops = 1.2 µL`.
- **A reaction using its own numbers is marked with an amber dot** after the
  title, because the marked input fields that used to show it are now behind
  the collapse.
- **The default comfortable injection range widened from 0.3–2 µL to
  0.1–5 µL.** 0.2 µL is an injection the loop delivers without complaint, and
  the block was asking for a re-dilution over it. Anyone who has edited that
  setting keeps their own band; **Settings → HPLC injection → Comfortable
  injection range** now has a `reset` button that returns it to the default.

### Fixed

- The comfortable-range echo under **Vial volumes you stock** updated only on
  a page reload, so it could quote a band that had already been changed.
- `.range-pair` was defined twice in the options stylesheet.
```

- [ ] **Step 3: Write the What's new entry**

`RELEASES.md` is the public page and reads differently — short, factual, what to do about it. Update the `# What's new in 14.11.0` heading to `14.12.0` and insert above the `## 14.11.0` section:

```markdown
## 14.12.0 — 2026-08-21

The HPLC injection block now shows just the number. Click its header to open
the calculator when you want to change the aliquot, the vial or the target.

- The block warns only when the injection is genuinely too big or too small,
  and says what to change on one line. Click that line to apply it.
- The default comfortable range is now 0.1–5 µL, so ordinary injections stop
  raising it. If you have set your own range, it is kept — *Settings → HPLC
  injection → Comfortable injection range* has a `reset` button.
- A reaction using its own aliquot or vial is marked with an amber dot next to
  the title.
```

- [ ] **Step 4: Rebuild**

```bash
npm run build
```

Expected: both Vite builds succeed and `dist/` is updated.

- [ ] **Step 5: Commit everything and stop**

```bash
git add manifest.json CHANGELOG.md RELEASES.md dist
git commit -m "Release 14.12.0: a quieter HPLC injection block"
```

Then say the commit is ready and **wait**. `git push` only when the user asks; the `v14.12.0` tag only when the user asks, and that one publishes to the Chrome Web Store and Firefox AMO.

---

## Self-review notes

**Spec coverage.** Every section of the spec maps to a task: collapse the calculator → Task 4; delete `exact` → Task 3 Step 1; merged warning line with its three cases and precedence → Task 3 Step 3; dropped `floored` sentence → Task 3 Step 3; shortened suggestion phrasing → Task 3 Step 3; widened band defaults → Task 1 Step 2; `resetHplcComfortBand` → Task 1 Step 4; the options button → Task 2. The spec's seven Verification items appear as hand-checks: items 1–2 in Task 3 Step 6 and Task 1 Step 3, items 3–6 in Task 4 Step 7, item 7 in Task 2 Step 5.

**Names used consistently across tasks.** `warn` element, `.cdd-hplc-warn` / `.cdd-hplc-warn-error` classes, `paintWarning` / `showWarning` / `hideWarning` (Task 3) are what Task 4 appends and repaints. `resetHplcComfortBand` (Task 1) is what Task 2 imports. `clearHplcInjectionState` (Task 4) replaces `clearHplcInjectionOverrides` in both files at once.

**The one ordering constraint.** Task 3 before Task 4 — Task 4 appends `warn`, which Task 3 creates. Tasks 1 and 2 are independent of both, but Task 2 imports from Task 1.
