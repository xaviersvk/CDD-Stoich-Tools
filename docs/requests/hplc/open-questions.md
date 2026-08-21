# HPLC injection — the parameters, and where they came from

Status: **answered.** Pavel Kraina replied on 2026-08-21; his answers are in
the chat log of that day. Everything below is now in code.

## The parameters

| parameter | value | where | source |
|---|---|---|---|
| one drop | 10 µL | `DEFAULT_HPLC_ALIQUOT_VOLUME_UL` | ~±5 µL across solvents and technique |
| drop ceiling | **3** | `MAX_DROPS` | "nejvice bezne je jedna kapka, ale dve az tri nejsou problem" |
| dilution factors | **2, 5** | `DILUTION_FACTORS` | "realne se pouziva asi jen 2x a 5x" |
| injector range | 0.1–10 µL | `INJECTION_MIN_UL` / `_MAX_UL` | Waters Acquity H-Class, 0.1 µL steps |
| comfortable band | **0.3–2 µL** | `COMFORT_MIN_UL` / `_MAX_UL` | "nejlepsi je davat zhruba mezi 0.3 a 2 uL" |
| injection step | 0.1 µL | `HPLC_INJECTION_STEP_UL` | finer is possible, "ale to nikdo delat nebude" |
| target amount | 0.2 nmol | `DEFAULT_HPLC_TARGET_AMOUNT_NMOL` | measured default, real range 0.1–0.3 |
| vial ladder | **0.25, 1.5 mL** | `DEFAULT_VIAL_LADDER_ML` | insert + standard vial; nothing between |

Four were wrong before he answered — the drop ceiling, the dilution factors,
the band's lower edge, and the whole ladder.

## What changed, and why it mattered

**The band starts at 0.3, not 0.5.** This alone silences the block on the
reference entry: 0.1 M with one drop into 1.5 mL computes exactly 0.30 µL,
and the tool had been calling that too concentrated and offering to fix it.
The reason for 0.3 is not precision but headroom — "at je prostor doladit
koncentraci".

**The insert is 250 µL, not 100.** The old default ladder offered 0.1 mL,
a vessel the lab does not own, along with 0.5, 1 and 2 mL, which it also
does not use. 2 mL exists but is "skoro nepouzitelne".

**Lever order depends on direction.** The original search always tried the
vessel first. Pavel's answer to E1 splits it:

- **too dilute** → more drops first, the insert only if drops run out
- **too concentrated** → the pour-out dilution (a drop into 1.5–2 mL, half
  tipped out, topped up again — that is one 2×)

Levers that push the wrong way are now excluded from the search rather than
ranked last: more drops can only make a concentrated sample worse, and
diluting can only make a dilute one worse.

**Diluting is expensive, and that is a workflow fact, not a chemistry one.**
"Nechci resit 5 minut redeni vzorku, kdyz se denne meri stovky vzorku." It
stays the last resort even where it is the only lever that works. This is
separate from accuracy — see `hplc-work-is-qualitative`, this is still not
quantitation.

**10 µL is a real ceiling.** "Nastrik 10 uL neni vubec problem, je to krajni
hodnota ale pouziva se." So the fallback to the instrument range when the
comfortable band is unreachable is right, not a compromise.

## Consequences worth knowing

With only two vessels the vial lever spans 6×, and it is useless in one
direction: a smaller vessel makes a concentrated sample worse. At or above
about 0.1 M, diluting the aliquot is the only lever there is — which is
exactly what Pavel confirmed in B4.

And with dilutions capped at 5×, the concentrated end runs out sooner than
the old 20× grid suggested. Around 0.5 M the best available lands on 0.30 µL,
right at the bottom of the band; past roughly 1 M the block falls back to
"injectable but not comfortable", and past about 2 M it says so plainly
rather than inventing a number.

## Still open

Nothing on parameters. Two things not asked because they are ours, not his:

- The target amount is a single global default. Pavel says the real range is
  0.1–0.3 nmol depending on how well the compound ionises, extrapolated from
  caffeine. Per-compound targets are not modelled and nobody has asked for
  them.
- The optimiser suggests one thing. If the top suggestion turns out to be
  the wrong one in practice, that is the moment to reconsider showing
  alternatives.
