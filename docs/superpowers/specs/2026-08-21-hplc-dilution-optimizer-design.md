# HPLC dilution optimiser — design

Date: 2026-08-21
Status: approved by user (conversation)

## Problem

The injection block computes a volume. It does not say what to do when that
volume is one the instrument cannot deliver.

A UPLC injects roughly **0.1 to 10 µL**, and is comfortable between **0.5 and
2 µL**. Outside that, the answer is not a smaller number — it is a different
dilution, and working out which one is the arithmetic the bench currently does
by reading a printed grid.

## The one degree of freedom

The injection volume depends only on the **dilution ratio**, not on the vial
and aliquot separately:

```
V_inj = n_target × (V_vial / V_aliquot) / (1000 × M)
```

So every lever below is the same lever — they differ only in how much bench
work they cost, and in which direction they move the ratio.

| lever | effect on `V_inj` | cost |
|---|---|---|
| vial volume ↑ | ↑ | cheapest — pick a different vessel |
| more drops (2…5 × one drop) | ↓ | one more drop |
| serial dilution of the aliquot (2×, 5×, 10×, 20×) | ↑ | an extra dilution step |

**Below one drop is impossible.** A sub-drop aliquot is not pipetted; it is one
drop serially diluted, which is why the bench's own grid labels those rows
"20× dillut. (0.5 µL)". The optimiser never suggests an aliquot smaller than
one drop — it suggests a dilution.

Which means:

- **Too dilute** (injection comes out too big) → smaller vial; if even the
  smallest is not enough, more drops.
- **Too concentrated** (injection comes out too small) → bigger vial; if even
  the largest is not enough, dilute the aliquot.

Serial dilution carries no accuracy warning. This work is reaction monitoring,
not quantitation — see the `hplc-work-is-qualitative` note.

## Decision

A new pure module `src/shared/hplc-optimizer.js`:

```js
optimizeInjection({
    molarity,            // mol/L, effective
    targetNmol,
    dropUl,              // the aliquot setting = one drop
    currentAliquotUl,
    currentVialMl,
    vialLadderMl,        // from settings
}) -> {
    ok: boolean,                 // is the CURRENT setting already comfortable?
    reason: null | "too-dilute" | "too-concentrated" | "impossible",
    suggestion: null | { drops, vialMl, dilution, volumeUl },
}
```

### Search order

Layer by layer, cheapest first. The first layer that lands inside the
**comfortable** band wins:

1. one drop × every vial in the ladder
2. 2–5 drops × every vial
3. dilution 2×, 5×, 10×, 20× × every vial (one drop)

If no layer reaches the comfortable band, the same search runs again against
the **instrument** range (0.1–10 µL) — an awkward injection beats an
impossible one. If that also fails, `reason` is `"impossible"` and the block
says so rather than inventing a number.

### Picking within a layer

Not the first candidate that passes. Candidates are ranked on two keys, in
order:

1. **How many levers it changes** from what is set now. A suggestion that
   only changes the dilution beats one that changes the dilution *and* the
   vial, even if the second lands nearer the middle. The whole point of the
   layered order is to ask for as little bench work as possible, and that
   principle does not stop at the layer boundary.
2. **Closeness to the band's geometric mean**, √(0.5 × 2) = **1.0 µL**. The
   quantity is a ratio, so its natural centre is multiplicative: 0.5 and 2
   are equally far from 1.0, which is how a chemist reads that band. Measured
   as `|ln(V / 1.0)|`.

Without the first key the optimiser gets the 0.1 M row of the table below
wrong: it would propose "dilute 5× **and** switch to a 1 mL vial" (exactly
1.0 µL) over "dilute 5×, keep the 1.5 mL you already have" (1.5 µL, equally
inside the band) — more work, for a number that is no more injectable.

### Worked cases

All at target 0.2 nmol, one drop = 10 µL, ladder
`0.1 / 0.25 / 0.5 / 1 / 1.5 / 2` mL.

| M | at 1.5 mL | verdict | suggestion | gives |
|---|---|---|---|---|
| 0.01 | 3.0 µL | too dilute | dilute into 0.5 mL | 1.0 µL |
| 0.03 | 1.0 µL | already comfortable | — | — |
| 0.1 | 0.3 µL | injectable but tight | dilute the aliquot 5×, same vial | 1.5 µL |
| 0.5 | 0.06 µL | too concentrated | dilute the aliquot 20× | 1.2 µL |

The last row is worth stating: at 0.5 M even a full 2 mL vial only reaches
0.08 µL, still under the injector's floor, and more drops make it worse — so
the aliquot has to be diluted. The bench's printed grid gives 1.2 for
`20× dillut.` at `0.5 M`, which is the same answer arrived at independently.

## Settings

One new field: the **vial ladder**, a comma-separated list of millilitre
volumes, default `0.1, 0.25, 0.5, 1, 1.5, 2`. Vaults and labs differ in what
vessels they stock, so this is configuration; it lives beside the existing
HPLC settings and is global, not per-reaction.

The comfortable band (0.5–2 µL), the instrument range (0.1–10 µL), the drop
ceiling (5) and the dilution factors (2, 5, 10, 20) stay **constants**. They
describe the instrument and the glassware, not a preference, and each is one
line to change if a different instrument ever arrives.

The drop volume is **not** a new setting: the existing *Default aliquot volume*
(10 µL) already is one drop, and the optimiser works in multiples of it.

## UI

One sentence under the block, in the amber note slot that already exists:

```
HPLC INJECTION      0.1 µL
0.5 M · 10 µL → 1.5 mL · 0.2 nmol

⚠ Too concentrated — dilute the aliquot 20×
  → 1.2 µL injection                    [click to apply]
```

The sentence is **clickable**, and applying it writes the suggested vial
volume and drop count as **per-reaction overrides** — the machinery already
built for the inline inputs. So nothing global changes, no other reaction
moves, and the existing `reset` chip undoes it.

A suggested serial dilution has no input to write into; that part of the
suggestion is instruction only, and clicking applies whatever vial and drop
count came with it.

When the current setting is already comfortable, there is no sentence at all.

## Verification

No test runner. `optimizeInjection` is pure, so the throwaway `node` script
covers it, including every row of the worked-cases table above and the three
edges: the comfortable case that must suggest nothing, the case that only the
instrument range can satisfy, and the impossible case.

The bench's printed grid is a ready-made fixture — a spot-check confirms the
optimiser's chosen volumes match its cells for the same inputs.

Then the usual loop: build, reload, and read the sentence on a real reaction.

## Not in scope

Showing alternatives. The user chose one recommendation over a ranked list:
one sentence, one action. If the top suggestion is ever the wrong one in
practice, that is the moment to reconsider, not before.
