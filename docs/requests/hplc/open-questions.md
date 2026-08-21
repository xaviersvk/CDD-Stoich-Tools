# HPLC injection — what is assumed, and what is still open

Status: **waiting on Pavel Kraina.** No date. Everything below is shipped and
working; the open items are parameter values, not design.

The questionnaire sent to Pavel is in the chat log of 2026-08-21. This file is
so the work can be picked up cold.

## Where the numbers live

| assumption | value | where in code | how confident |
|---|---|---|---|
| one drop | 10 µL | `DEFAULT_HPLC_ALIQUOT_VOLUME_UL`, `shared/hplc-injection.js` | from the printed guide's footer |
| drop ceiling | 5 drops | `MAX_DROPS`, `shared/hplc-optimizer.js` | from the guide's rows |
| dilution factors | 2, 5, 10, 20 | `DILUTION_FACTORS`, same file | from the guide's rows |
| injector range | 0.1–10 µL | `INJECTION_MIN_UL` / `INJECTION_MAX_UL` | Matúš, not confirmed against the instrument |
| comfortable band | 0.5–2 µL | `COMFORT_MIN_UL` / `COMFORT_MAX_UL` | Matúš |
| injection step | 0.1 µL | `HPLC_INJECTION_STEP_UL`, `shared/hplc-injection-math.js` | matches the guide, which prints one decimal |
| target amount | 0.2 nmol | `DEFAULT_HPLC_TARGET_AMOUNT_NMOL` | Matúš, corrected from 2 back to 0.2 |
| vial ladder | 0.1, 0.25, 0.5, 1, 1.5, 2 mL | `DEFAULT_VIAL_LADDER_ML`, `shared/hplc-optimizer.js` | **known partly wrong — see below** |
| lever priority | vial → drops → dilute aliquot | layer order in `layers()` | Matúš; Pavel not yet asked |

Everything except the ladder and the aliquot/vial/target defaults is a
**constant**, on the grounds that it describes the instrument rather than a
preference. Each is one line to change.

## The known-wrong default

Matúš asked Pavel about vials on 2026-08-21 and got:

> Ředíme to do 1.5 mL, ta vialka má 2 mL celkem ale to je fakt úplně na hranu
> a insert má 250 µL.

So the shipped default ladder is wrong in two ways:

- **0.1 mL does not exist.** The insert is **0.25 mL**. The optimiser can
  currently suggest a vessel the lab does not own.
- **2 mL is "on the edge"** and probably should not be offered at all.
- 0.5 and 1 mL are **unknown** — question D1 asks whether anything sits
  between the insert and 1.5 mL.

Deliberately **not** changed yet: dropping to `0.25, 1.5` now and changing it
again when D1 comes back would move the default twice, and a default that
moves under users who have not touched the setting is worse than one that is
briefly too generous. The ladder is editable in the options page meanwhile.

**Decision to make when Pavel answers:** set `DEFAULT_VIAL_LADDER_ML` once,
from D1 + D2.

## What the narrow ladder implies

Worth knowing before reading Pavel's answers, because it shapes what the
optimiser can do at all.

With only 0.25 and 1.5 mL, the vial lever spans **6×**. That is enough for
dilute reactions and useless for concentrated ones:

| M | 1 drop into 1.5 mL | 1 drop into 0.25 mL | what actually helps |
|---|---|---|---|
| 0.01 | 3.0 µL (too big) | **0.5 µL** ✓ | the insert |
| 0.1 | 0.3 µL (too small) | 0.05 µL (worse) | dilution only |
| 0.5 | 0.06 µL | 0.01 µL | dilution only |

A smaller vial makes a concentrated sample **worse**, so for anything at or
above ~0.1 M the only lever is diluting the aliquot. That is why questions B4
and B5 exist: if Pavel does something else in that situation, the advice text
is wrong even though the arithmetic is right.

## Verified against the bench's own grid

`docs/requests/hplc/db455d19-9b02-4108-8ad0-a54e4e7edf0f.jpg` is Pavel's
printed *UPLC-MS Injection Volume Guide*, and every cell of it is this
plugin's formula. Thirteen cells are pinned as fixtures in the throwaway node
checks, including:

- 1 drop, 0.01 M → 3.0
- 1 drop, 0.04 M → 0.8 (proves the 0.1 µL rounding)
- 20× dilution, 0.06 M → 10.0
- 20× dilution, 0.5 M → 1.2 — which the optimiser reaches independently

The grid's footer fixes the other inputs: 0.2 nmol, 1.5 mL vial, 10 µL drop.

## Two things Pavel might overturn

- **Lever priority (section E).** The only assumption taken from Matúš rather
  than from the grid, and the one that decides which sentence the block
  shows. A different order is a one-line change to `layers()`.
- **Serial dilution being free (section B6).** The current design never warns
  about it, because this is reaction monitoring rather than quantitation. If
  Pavel disagrees the whole ranking changes, not just the copy.
