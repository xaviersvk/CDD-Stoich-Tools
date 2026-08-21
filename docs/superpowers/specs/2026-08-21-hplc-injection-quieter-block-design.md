# A quieter HPLC injection block — design

Date: 2026-08-21
Status: approved by user (conversation)

## Problem

The block works. It says too much, and it complains too often.

Feedback from the bench, verbatim:

> je tam hodne moc textu a clovek se v tom ztraci, ciste vizualne […] prijde
> mi to hrozne striktni […] to dava ten alert nekdy uplne zbytecne jen proto
> ze vyjde nastrik 0.2 uL a ne 0.3 uL […] ma to byt fakt kouknu a vidim +
> upozorneni na to ze je to moc/malo a pripadne jak to udelat aby to vyslo,
> kdyz by nekdo chtel pocitat tak at si vezme fyzickou kalkulacku

Two separate faults.

**Visual.** At rest the block can print five things: the title, the volume, a
grey `exact 0.23 µL · 0.18 nmol on column` line, a row of three inputs with a
molarity echo, a note, and an advice bar. The one number anybody came for —
the injection volume — competes with four others for attention.

**Behavioural.** `optimizeInjection` treats the comfortable band as a hard
edge. Ship defaults are 0.3–2 µL, so 0.2 µL — an injection a Waters H-Class
delivers without complaint — raises an amber bar telling the chemist to change
their dilution. The advice is correct and unwanted.

## Decision

Three changes, in the order they matter.

### 1. Collapse the calculator

The block's resting state is one line.

```
┌────────────────────────────────────┐
│ HPLC INJECTION  ⌄          0.4 µL  │
└────────────────────────────────────┘
```

Clicking the header row opens the calculator; clicking it again closes it.

```
┌────────────────────────────────────┐
│ HPLC INJECTION  ⌃          0.4 µL  │
│ 0.1 M · [10] µL → [1.5] mL         │
│         · [0.2] nmol        reset  │
└────────────────────────────────────┘
```

- `.cdd-hplc-exact` is **deleted**, markup and CSS. Rounding to a tenth of a
  microlitre moves the delivered amount by a few percent; this is reaction
  monitoring, not quantitation, and nobody acts on the difference.
- The molarity echo, the three inputs and the `reset` pill all move inside
  the collapsed region. `reset` stops being a top-row element.
- The volume itself keeps its click-to-copy. The copy handler calls
  `stopPropagation()` so copying does not also toggle the block, and the
  chevron `⌄`/`⌃` next to the title advertises that the rest of the row does.
- A reaction carrying a local override shows an amber dot after the title —
  `HPLC INJECTION •` — because the marked input fields and the `reset` pill
  that used to signal it are now behind a collapse.

**Collapsed state lives in module state**, a `Map` keyed by `reaction.index`
beside `overrides`, for exactly the reason the overrides do: `renderSamples`
rebuilds every block from scratch on each payload and enrichment pass, so a
flag kept on the DOM node would be thrown away by a re-render the user did not
ask for. Like `overrides`, it is not persisted and is cleared when the ELN
entry changes.

Default is collapsed.

### 2. One warning line

`.cdd-hplc-note` and `.cdd-hplc-advice` merge into a single element. It sits
directly under the header and **is visible whether the block is collapsed or
open** — a warning that hides is not a warning.

| situation | line | colour | clickable |
|---|---|---|---|
| optimiser has a suggestion | `⚠ Too dilute → 2 drops = 1.4 µL` | amber | yes |
| nothing on the ladder helps | `⚠ Nothing on the ladder brings this in range` | amber | no |
| injection exceeds the vial | `⚠ More than the whole vial` | red | no |
| nothing wrong | *(hidden)* | — | — |

Clicking still applies the suggestion as this reaction's own override, exactly
as today — that interactivity is the part the bench liked.

Precedence when more than one applies: `exceeds-vial` wins the line, because a
volume larger than the whole sample is a mistake rather than a preference.
Otherwise the optimiser's line shows.

The `floored` note — *"Rounded up to the 0.1 µL minimum — the vial is too
concentrated, so this injection overshoots the target."* — is dropped. That
case is by definition too concentrated, so the optimiser already produces an
actionable line for it, and the long sentence only restated the problem.

Suggestion phrasing shortens from
`⚠ Too dilute — dilute into 0.25 mL, take 2 drops → 1.2 µL injection`
to `⚠ Too dilute → 0.25 mL, 2 drops = 1.2 µL`: the steps stay, the connective
prose goes.

### 3. Widen the comfortable band, do not rewrite the rule

The alarm logic is untouched. Only the defaults move, in
`src/shared/hplc-optimizer.js`:

```
DEFAULT_COMFORT_MIN_UL   0.3  →  0.1
DEFAULT_COMFORT_MAX_UL   2    →  5
```

0.2 µL now falls inside the band and says nothing. 0.08 µL and 6 µL still
speak up.

This was chosen over adding a tolerance factor or moving the alarm onto the
injector's hard limits, because the band is already a setting and already
means "outside this, offer me something else". It was tuned too tight; the
fix is the number, not a second concept.

`comfortCentre` is `sqrt(0.1 × 5)` ≈ 0.71 µL, which is where the optimiser
now aims. `optimizeInjection` clamps the band into the injector range, and
0.1–5 sits inside 0.1–10, so the overlap logic is unaffected.

**The upgrade gap.** `saveHplcComfortBand` writes to `chrome.storage.local`
on every `change` of those two option fields, and `loadHplcSettings` prefers
a stored value over the default. Anyone who has ever touched the field keeps
`0.3 / 2` and sees no difference. Overwriting a stored preference during an
upgrade would be worse than the problem, so instead:

> **Settings → HPLC injection → Comfortable injection range** gains a
> `reset to default` button that clears both stored keys and repaints the
> inputs from `DEFAULT_COMFORT_MIN_UL` / `DEFAULT_COMFORT_MAX_UL`.

A new `resetHplcComfortBand()` in `src/shared/hplc-injection.js` does the
`chrome.storage.local.remove` of both keys, so removal stays next to the
paired write that made them.

## Files

| file | change |
|---|---|
| `src/content/features/hplc-injection-block.js` | collapse state, chevron, override dot, merged warning line, `exact` removed, CSS |
| `src/shared/hplc-optimizer.js` | two default constants |
| `src/shared/hplc-injection.js` | `resetHplcComfortBand()` |
| `src/options/options.html` | reset button in the comfortable-range row |
| `src/options/options.js` | wire the button, repaint inputs and echo |

## Verification

The project has no test runner, so this is checked the way the rest of the
panel is: rebuild, reload the unpacked extension, open an ELN entry with the
block switched on.

`computeInjectionVolume` and `optimizeInjection` are untouched, so the numbers
themselves cannot move. What has to be seen:

1. A reaction whose injection lands at 0.2 µL shows **no** warning line.
2. A reaction at roughly 0.08 µL and one at roughly 6 µL still show one, and
   clicking it still moves that reaction's inputs and only that reaction's.
3. The block opens and closes on the header row; clicking the volume copies it
   and does **not** toggle.
4. Open a block, then let the panel re-render (toggle a field, or wait for the
   enrichment pass) — it stays open.
5. Move to another ELN entry — the block is collapsed again and carries no
   override dot.
6. A warning line is visible while the block is collapsed.
7. **Settings → HPLC injection → Comfortable injection range → reset to
   default** puts 0.1 and 5 in the inputs, updates the echo, and a panel
   already on screen repaints through `onHplcSettingsChanged`.

## Out of scope

- The injector range (0.1–10 µL) and the vial ladder keep their defaults.
- Persisting the collapsed state across entries or sessions. It is a glance,
  not a preference.
- Any change to `hplc-injection-math.js`.
