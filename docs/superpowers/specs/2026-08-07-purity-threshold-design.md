# Configurable purity threshold — design

Date: 2026-08-07
Status: approved by user (conversation)

## Problem

Purity fills only matter when the purity actually changes the
stoichiometry — high purities (95, 98, 100 %) are noise. The panel also
already flags "⚠ LOW PURITY" at a hardcoded ≤ 93 %.

## Decision

Amended after user reconsideration: **two independent thresholds** (both
default **93 %**):
- **Fill purity threshold** — the Fill purity offer is shown only when
  the offered value (batch or remembered) is ≤ this. Auto-fill and Fill
  all inherit the rule via `computeFillOffers`. Capture is unchanged
  (remembering a high purity is harmless; it just is not offered).
- **Low purity warning threshold** — the **⚠ LOW PURITY badge** fires at
  or below this (replaces the hardcoded 93).

A batch purity above the threshold does NOT fall through to the
remembered value — the batch stays authoritative.

## Components

- `src/shared/purity-threshold.js` — key `cddPurityThreshold`, default 93,
  sanitize (finite, 0 < n ≤ 100, else default), async load/save, sync
  cached `getPurityThreshold()` + `initPurityThreshold()` +
  `onPurityThresholdChanged()` (same pattern as the other shared caches).
- `fill-offers.js` — purity offers gated by the threshold.
- `sample-panel.js` — badge uses `getPurityThreshold()`.
- `main.js` — init + re-render on change.
- Options card "Remembered batch values": number input
  "Purity threshold (%)" (1–100, step 0.1), saves on change.

## Verification

Build + live: with default 93 the purity (95/98/100) offers disappear
from the test entry's cards; lowering the threshold in options brings the
badge/offers in line live. Release prepared as 12.6.0 — tag pushed only
after explicit user approval.
