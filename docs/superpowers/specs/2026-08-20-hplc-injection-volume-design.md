# HPLC/UPLC injection volume — design

Date: 2026-08-20
Status: approved by user (conversation)

## Problem

Before running a reaction sample on UPLC, the chemist works out the
injection volume by hand every time: take an aliquot from the reaction
mixture, dilute it into an HPLC vial, and inject however much of that
carries the target amount onto the column. Every number needed for the
sum is already on the ELN page — the stoichiometry table prints the
reaction molarity — but nothing does the arithmetic.

Reference entry: vault 6884, ELN entry 2504170 (hexane solvent row,
reaction molarity 0.1 mol/L).

## Decision

A compact **HPLC injection block** at the top of each reaction group in
the floating Samples panel. It reads the reaction molarity out of the
captured stoichiometry payload and computes the injection volume from
three user parameters, all three editable both in the options page and
inline in the block itself.

### Formula

Over the solvent rows of one reaction, each carrying its own reaction
molarity `Mᵢ` (moles of limiting reagent per volume of *that* solvent):

```
M_ef = 1 / Σ(1/Mᵢ)          for every row with Mᵢ > 0
```

`M_ef` is exactly `n_limiting / Σ Vᵢ` — the concentration of the mixture
the aliquot is actually drawn from — and it needs no input beyond the
per-row molarities. With one solvent it degenerates to that solvent's
molarity.

```
V_inj [µL] = n_target[nmol] × V_vial[µL] / (1000 × M_ef[mol/L] × V_aliquot[µL])
```

The vial volume is the **final** volume of the diluted sample; the
aliquot is part of it, not added on top.

Worked cases (these are the verification fixtures):

| M_ef | aliquot | vial | target | V_inj |
|---|---|---|---|---|
| 0.1 mol/L | 10 µL | 1.5 mL | 0.2 nmol | 0.30 µL |
| 0.1 mol/L | 10 µL | 1.5 mL | 1.0 nmol | 1.50 µL |
| 0.5 mol/L | 5 µL | 1.0 mL | 0.2 nmol | 0.080 µL |
| 0.2 + 0.2 mol/L (two solvents → M_ef 0.1) | 10 µL | 1.5 mL | 0.2 nmol | 0.30 µL |

Step check of row 1: the aliquot carries 0.1 mol/L × 10 µL = 1000 nmol;
diluted to 1500 µL that is 0.6667 nmol/µL; 0.2 nmol is 0.30 µL.
The table prints each result as the block would display it (see
Formatting), not at full precision.

## Components

### `src/shared/hplc-injection.js` (new)

DOM-free, same shape as `src/shared/purity-threshold.js`: storage keys,
defaults, sanitizers, async load/save, a sync cache refreshed through
`chrome.storage.onChanged`, and a change-listener registry.

| key | default | sanitize |
|---|---|---|
| `cddHplcAliquotVolumeUl` | 10 | finite, > 0, else default |
| `cddHplcVialVolumeMl` | 1.5 | finite, > 0, else default |
| `cddHplcTargetAmountNmol` | 2 | finite, > 0, else default |
| `cddHplcBlockEnabled` | true | boolean, else default |

The maths lives next door in **`src/shared/hplc-injection-math.js`**, split
out because the inject bundle runs in page context — it needs
`collectReactionSolvents` and must not pull in `chrome.storage` code it can
never call:

- `collectReactionSolvents(rows)` → `[{ name, molarity }]`
- `effectiveMolarity(solvents)` → number | null
- `computeInjectionVolume({ molarity, aliquotUl, vialMl, targetNmol })`
  → `{ volumeUl, warning }`, or `null` when any argument is not a finite
  positive number. `warning` is `null`, `"exceeds-vial"` or `"below-minimum"`.
- `formatInjectionVolume(volumeUl)` → string | null
- `formatMolarity(molarity)` → string | null

### `src/inject/parsers/sample-data.js`

The existing row loop cannot supply the molarity: the guard at
`if (!hasSample && !isProduct && !rowBatchId) continue;` drops a solvent
row that carries neither a sample nor a registered batch, which is the
normal shape of a hexane row (the comment above that guard already
describes entry 2504170).

So a **separate pass** over `stoichiometryTable.rows`, independent of the
card filter, collects `{ name, molarity }` for every row with a numeric
`row.molarity`. `extractAllReactionRows` gains a sibling to `samples`:

```js
reactions: [{ index, solvents: [{ name, molarity }], effectiveMolarity }]
```

This rides along in `STATE.lastPayload` next to `samples` and
`reactionCount`.

### `src/content/features/hplc-injection-block.js` (new)

Builds one block for one reaction and returns the element, or `null`
when the reaction has no solvent molarity. Owns its own styles, exposes
a small `update()` so the settings listener can refresh the result text
in place without rebuilding the inputs.

Layout:

```
HPLC injection      0.30 µL
0.1 M · [ 10 ] µL → [ 1.5 ] mL · [ 0.2 ] nmol
```

- The result is click-to-copy, matching the panel's existing gesture.
- The three bracketed values are `<input type="number">`, prefilled from
  the settings cache.
- An input persists on `change` (blur/Enter), not per keystroke, so a
  half-typed number never reaches storage.

### `src/content/features/sample-panel.js`

`renderSamples` inserts the block as the first child of each
`cdd-stoich-group-body`, in the group's colour. Nothing else in the
render path changes.

Focus safety: the panel re-renders only on `SAMPLE_PANEL_SETTINGS_KEY`
(see `initSamplePanelFields`), so writing an HPLC key does **not** trigger
a re-render, and the block's own listener repaints just the result text.
The input the user is typing in keeps focus.

### `src/content/main.js`

Calls `initHplcInjectionSettings()` at startup, alongside the other
shared-cache inits.

### `src/options/options.html` + `options.js`

A new "HPLC injection" card with three number inputs (aliquot volume µL,
vial volume mL, target amount nmol), saving on change, worded so the
formula is visible to the reader.

## Edge cases

- **No solvent molarity in the reaction** → no block at all. There is
  nothing to compute from, and an empty block would read as a bug.
- **Mentions group** → no molarity, so no block, by the same rule.
- **`V_inj` greater than the vial volume** → the value renders red with
  "exceeds vial volume". The dilution is too weak for the target.
- **The 0.5 µL floor kicked in** — the exact volume is below 0.25 µL, so
  rounding to the nearest half would have given zero → amber note saying
  the vial is too concentrated and this injection overshoots the target.
- **The feature is switched off** → no block anywhere, and the panel
  re-renders so blocks already on screen disappear at once.
- **Non-numeric or non-positive input** → the sanitizer returns the
  default, and the input is repainted with it.
- **Multiple reactions in one entry** → one block per reaction group,
  each with its own molarity, all sharing the three global parameters.
  Editing an input in one block therefore changes every block; the
  others repaint through the settings listener rather than going stale.

## Rounding and formatting

Nobody dials an arbitrary volume into a sequence, so the block leads with
the **nearest 0.5 µL**, and 0.5 µL is also the floor — rounding 0.08 µL to
the nearest half would give zero, which is not an injection.

Rounding changes what reaches the column, so it is never silent. Under the
big rounded number the block prints the exact volume and the amount that
rounded injection actually delivers:

```
HPLC injection            3.00 µL
exact 3.00 µL · 2 nmol on column
```

At the old 0.2 nmol target the same reaction reads `0.50 µL` with
`exact 0.30 µL · 0.333 nmol on column` — a two-thirds overshoot, stated
rather than hidden. The 2 nmol default was chosen because it lands the
reference entry on exactly 3.00 µL, with no rounding at all.

The exact volume keeps two decimals at or above 0.1 µL (`0.30 µL`) and
three below (`0.080 µL`); amounts print to three significant figures with
trailing zeros trimmed. The molarity echo prints the effective value as
CDD does, in mol/L.

## Colour

The block takes its reaction group's own colour from `getReactionColor`,
the same one the group border and the cards' left edges use. A hardcoded
tint would make the block in reaction 2 look like it belonged to
reaction 1.

## Verification

The project has no test runner. The pure functions in
`src/shared/hplc-injection.js` are checked against the four worked cases
in the table above, run in the browser console after the build. The rest
is the usual loop: `npm run build`, reload the unpacked extension from
`dist/`, open entry 2504170 and confirm the block reads 0.30 µL, then
edit each input in place and in the options page and confirm both sides
stay in sync and the panel does not lose focus mid-typing.

Release: version bump plus `CHANGELOG.md` / `RELEASES.md` per
`CLAUDE.md`; the tag is pushed only on explicit approval.
