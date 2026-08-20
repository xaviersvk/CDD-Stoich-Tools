# HPLC injection volume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show, at the top of each reaction group in the floating Samples panel, how many microlitres of the diluted reaction sample to inject onto the UPLC column — computed from the reaction molarity CDD already prints, plus three parameters the chemist can edit either in the options page or inline in the block.

**Architecture:** Three new files. A dependency-free maths module (`src/shared/hplc-injection-math.js`) holds the whole calculation and is imported by both bundles. A settings module (`src/shared/hplc-injection.js`) mirrors the established `purity-threshold.js` shape. A panel feature (`src/content/features/hplc-injection-block.js`) builds one block per reaction. The inject parser gains a second, unfiltered pass over the stoichiometry rows because the existing card filter drops solvent rows.

**Tech Stack:** Plain ES modules, Vite build (`npm run build`), Chrome/Firefox MV3 content script + page-context inject script, `chrome.storage.local`. No test framework in this repo — pure functions are checked with a throwaway `node` script, behaviour is checked live in the browser.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-20-hplc-injection-volume-design.md`.
- Formula, exact: `V_inj[µL] = n_target[nmol] × V_vial[µL] / (1000 × M_ef[mol/L] × V_aliquot[µL])`, with `M_ef = 1 / Σ(1/Mᵢ)` over the reaction's solvent rows.
- The vial volume is the **final** volume of the diluted sample; the aliquot is part of it, not added on top.
- Storage keys, defaults and units are fixed: `cddHplcAliquotVolumeUl` = 10 µL, `cddHplcVialVolumeMl` = 1.5 mL, `cddHplcTargetAmountNmol` = 0.2 nmol.
- The panel inputs and the options inputs write the **same** keys. There is no second copy of these values anywhere.
- Never write storage on `input` — only on `change` (blur/Enter). A half-typed number must not reach storage, come back sanitised, and land under the caret.
- Never render an empty block. A reaction with no solvent molarity gets no block at all.
- Display format: `toFixed(2)` at or above 0.1 µL, `toFixed(3)` below.
- Live test entry: `https://app.collaborativedrug.com/vaults/6884/eln/entries/2504170` — hexane solvent row, reaction molarity 0.1 mol/L. With the defaults the block must read **0.30 µL**.
- Scratchpad for throwaway scripts: `C:\Users\MATUS~1.DRE\AppData\Local\Temp\claude\C--Users-matus-drexler-WebstormProjects-CDD-Stoich-Tools\5fd07b72-3efa-4e60-968e-9380045f5e3d\scratchpad` (referred to below as `$SCRATCH`).
- Node cannot `import` a `.js` file from this repo directly — `package.json` has no `"type": "module"`, so Node reads `.js` as CommonJS and the ESM `export` keyword is a parse error. Every throwaway check therefore **copies** the module to `$SCRATCH` with an `.mjs` extension first.
- Release steps (version bump, `CHANGELOG.md`, `RELEASES.md`, rebuild, commit) follow `CLAUDE.md` and **stop before any push**. Do not push the commit. Do not create or push a tag.
- Deviation from the spec, deliberate: the spec puts the maths and the settings in one `src/shared/hplc-injection.js`. They are split into two files here because the **inject** bundle (page context) needs the maths and must not pull in `chrome.storage` code it can never call. Amend the spec's Components section as part of Task 1.

---

### Task 1: The calculation

**Files:**
- Create: `src/shared/hplc-injection-math.js`
- Modify: `docs/superpowers/specs/2026-08-20-hplc-injection-volume-design.md` (Components section — record the two-file split)
- Test: throwaway `node` script in `$SCRATCH` (no test framework in repo)

**Interfaces:**
- Produces: `collectReactionSolvents(rows) -> Array<{ name: string|null, molarity: number }>` — used by Task 3.
- Produces: `effectiveMolarity(solvents) -> number | null` — `null` when no row carries a positive molarity. Used by Tasks 3 and 4.
- Produces: `computeInjectionVolume({ molarity, aliquotUl, vialMl, targetNmol }) -> { volumeUl: number, warning: "exceeds-vial" | "below-minimum" | null } | null` — `null` when any argument is not a finite positive number. Used by Task 4.
- Produces: `formatInjectionVolume(volumeUl) -> string | null`. Used by Task 4.
- Produces: `formatMolarity(molarity) -> string | null`. Used by Task 4.
- Produces: `HPLC_MIN_INJECTION_UL = 0.1`. Used by Task 4 (warning copy).

- [ ] **Step 1: Write the maths module**

```js
// shared/hplc-injection-math.js
//
// "How much do I inject?" — the whole sum, in one dependency-free file.
//
// The chemist pulls a small aliquot out of the reaction mixture, dilutes it
// into an HPLC vial, and injects however much of THAT carries the target
// amount onto the column. Every number needed is already on the ELN page:
// the stoichiometry table prints a reaction molarity for each solvent row.
//
// Kept free of chrome.* and of DOM access on purpose — the INJECT bundle
// runs in page context, where chrome.storage does not exist, and it needs
// collectReactionSolvents. The settings that feed the sum live next door in
// hplc-injection.js, which only the content script and the options page
// import.

// The low end of a common UPLC autosampler. Below this the number is still
// arithmetically right but not something an instrument can deliver, so the
// block says so rather than pretending.
export const HPLC_MIN_INJECTION_UL = 0.1;

// Every solvent row's reaction molarity, straight off the payload rows.
//
// Deliberately NOT filtered the way the card rows are: the guard in
// extractRowsFromReactionFeature drops a row with neither a sample nor a
// registered batch, and that is the normal shape of a solvent row. The
// hexane row of entry 2504170 is exactly that, and it is the row that
// carries `molarity`.
export function collectReactionSolvents(rows) {
    const out = [];

    for (const row of Array.isArray(rows) ? rows : []) {
        const molarity = Number(row?.molarity);
        if (!Number.isFinite(molarity) || molarity <= 0) continue;

        const rawName = row?.moleculeName ?? row?.name ?? null;
        const name =
            typeof rawName === "string" && rawName.trim() ? rawName.trim() : null;

        out.push({ name, molarity });
    }

    return out;
}

// The concentration of the mixture the aliquot is actually drawn from.
//
// CDD's per-row reaction molarity is n_limiting / V_thatSolvent. Across
// several solvents the mixture is n_limiting / ΣV, and since V_i =
// n_limiting / M_i that collapses to 1 / Σ(1/M_i) — no extra input needed.
// With one solvent it is that solvent's molarity, unchanged.
export function effectiveMolarity(solvents) {
    let reciprocalSum = 0;
    let count = 0;

    for (const solvent of Array.isArray(solvents) ? solvents : []) {
        const m = Number(solvent?.molarity);
        if (!Number.isFinite(m) || m <= 0) continue;
        reciprocalSum += 1 / m;
        count += 1;
    }

    if (!count) return null;
    return 1 / reciprocalSum;
}

// V_inj[µL] = n_target[nmol] × V_vial[µL] / (1000 × M[mol/L] × V_aliquot[µL])
//
// The 1000 is the unit bridge: 1 mol/L is 1000 nmol/µL, so M × V_aliquot
// × 1000 is how many nmol the aliquot carries.
//
// The vial volume is the FINAL volume of the diluted sample — the aliquot is
// part of it, not added on top.
export function computeInjectionVolume({ molarity, aliquotUl, vialMl, targetNmol }) {
    const m = Number(molarity);
    const aliquot = Number(aliquotUl);
    const vialUl = Number(vialMl) * 1000;
    const target = Number(targetNmol);

    const usable = [m, aliquot, vialUl, target].every(
        (n) => Number.isFinite(n) && n > 0
    );
    if (!usable) return null;

    const volumeUl = (target * vialUl) / (1000 * m * aliquot);

    let warning = null;
    if (volumeUl > vialUl) warning = "exceeds-vial";
    else if (volumeUl < HPLC_MIN_INJECTION_UL) warning = "below-minimum";

    return { volumeUl, warning };
}

// Two decimals down to 0.1 µL, three below it — "0.08 µL" loses the digit
// that tells 0.08 from 0.084.
export function formatInjectionVolume(volumeUl) {
    if (!Number.isFinite(volumeUl)) return null;
    return volumeUl >= HPLC_MIN_INJECTION_UL
        ? volumeUl.toFixed(2)
        : volumeUl.toFixed(3);
}

// The molarity echo, printed the way CDD prints it: a plain number in
// mol/L, with trailing zeros trimmed ("0.1", not "0.100").
export function formatMolarity(molarity) {
    if (!Number.isFinite(molarity) || molarity <= 0) return null;
    return String(Number(molarity.toPrecision(6)));
}
```

- [ ] **Step 2: Write the throwaway check and run it**

Copy the module to the scratchpad under an `.mjs` name (see Global Constraints
for why), then write and run the check:

```bash
cp src/shared/hplc-injection-math.js "$SCRATCH/hplc-injection-math.mjs"
```

`$SCRATCH/check-hplc.mjs`:

```js
import {
    collectReactionSolvents,
    effectiveMolarity,
    computeInjectionVolume,
    formatInjectionVolume,
    formatMolarity,
} from "./hplc-injection-math.mjs";

let failures = 0;
function check(label, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) {
        failures += 1;
        console.log(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`);
    } else {
        console.log(`ok   ${label} = ${a}`);
    }
}

// --- collectReactionSolvents: only rows with a positive molarity survive ---
check(
    "collect: solvent rows only",
    collectReactionSolvents([
        { moleculeName: "RGT-0000222", molarity: null },
        { moleculeName: "hexane", molarity: 0.1 },
        { name: "", molarity: 0.2 },
        { moleculeName: "water", molarity: 0 },
    ]),
    [{ name: "hexane", molarity: 0.1 }, { name: null, molarity: 0.2 }]
);
check("collect: not an array", collectReactionSolvents(null), []);

// --- effectiveMolarity ---
check("M_ef: single solvent", effectiveMolarity([{ molarity: 0.1 }]), 0.1);
check(
    "M_ef: two equal solvents halve it",
    effectiveMolarity([{ molarity: 0.2 }, { molarity: 0.2 }]),
    0.1
);
check("M_ef: nothing usable", effectiveMolarity([{ molarity: 0 }]), null);
check("M_ef: empty", effectiveMolarity([]), null);

// --- computeInjectionVolume: the four worked cases from the spec ---
const cases = [
    ["spec row 1 (0.1 M, 10 µL, 1.5 mL, 0.2 nmol)",
        { molarity: 0.1, aliquotUl: 10, vialMl: 1.5, targetNmol: 0.2 }, "0.30", null],
    ["spec row 2 (target 1.0 nmol)",
        { molarity: 0.1, aliquotUl: 10, vialMl: 1.5, targetNmol: 1.0 }, "1.50", null],
    ["spec row 3 (0.5 M, 5 µL, 1.0 mL)",
        { molarity: 0.5, aliquotUl: 5, vialMl: 1.0, targetNmol: 0.2 }, "0.080", "below-minimum"],
    ["spec row 4 (two solvents -> 0.1 M)",
        { molarity: effectiveMolarity([{ molarity: 0.2 }, { molarity: 0.2 }]),
          aliquotUl: 10, vialMl: 1.5, targetNmol: 0.2 }, "0.30", null],
];

for (const [label, args, expectedText, expectedWarning] of cases) {
    const result = computeInjectionVolume(args);
    check(`${label} value`, formatInjectionVolume(result.volumeUl), expectedText);
    check(`${label} warning`, result.warning, expectedWarning);
}

// --- warnings and refusals ---
check(
    "exceeds the vial",
    computeInjectionVolume({ molarity: 0.1, aliquotUl: 10, vialMl: 1.5, targetNmol: 2000 }).warning,
    "exceeds-vial"
);
check("no molarity -> null",
    computeInjectionVolume({ molarity: null, aliquotUl: 10, vialMl: 1.5, targetNmol: 0.2 }), null);
check("zero aliquot -> null",
    computeInjectionVolume({ molarity: 0.1, aliquotUl: 0, vialMl: 1.5, targetNmol: 0.2 }), null);
check("text vial -> null",
    computeInjectionVolume({ molarity: 0.1, aliquotUl: 10, vialMl: "abc", targetNmol: 0.2 }), null);

// --- formatters ---
check("format 0.1 exactly", formatInjectionVolume(0.1), "0.10");
check("format below the floor", formatInjectionVolume(0.0842), "0.084");
check("format NaN", formatInjectionVolume(NaN), null);
check("molarity trims zeros", formatMolarity(0.1), "0.1");
check("molarity keeps precision", formatMolarity(0.05), "0.05");

console.log(failures ? `\n${failures} FAILURE(S)` : "\nall ok");
process.exit(failures ? 1 : 0);
```

Run: `node "$SCRATCH/check-hplc.mjs"`
Expected: every line `ok`, final line `all ok`, exit code 0.

- [ ] **Step 3: Record the file split in the spec**

In `docs/superpowers/specs/2026-08-20-hplc-injection-volume-design.md`, under
`### src/shared/hplc-injection.js (new)`, replace the paragraph beginning "The
same file carries the pure maths" and the bullet list under it with:

```markdown
The maths lives next door in **`src/shared/hplc-injection-math.js`**, split out
because the inject bundle runs in page context — it needs
`collectReactionSolvents` and must not pull in `chrome.storage` code it can
never call:

- `collectReactionSolvents(rows)` → `[{ name, molarity }]`
- `effectiveMolarity(solvents)` → number | null
- `computeInjectionVolume({ molarity, aliquotUl, vialMl, targetNmol })`
  → `{ volumeUl, warning }`, or `null` when any argument is not a finite
  positive number. `warning` is `null`, `"exceeds-vial"` or `"below-minimum"`.
- `formatInjectionVolume(volumeUl)` → string | null
- `formatMolarity(molarity)` → string | null
```

- [ ] **Step 4: Commit**

```bash
git add src/shared/hplc-injection-math.js docs/superpowers/specs/2026-08-20-hplc-injection-volume-design.md
git commit -m "HPLC injection: the calculation, on its own"
```

---

### Task 2: Settings, and the options card that edits them

**Files:**
- Create: `src/shared/hplc-injection.js`
- Modify: `src/options/options.html` (new card after the "Remembered batch values" section that ends at line 360)
- Modify: `src/options/options.js` (import block near line 39, wiring near line 662, init call at the file tail)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `getHplcSettings() -> { aliquotUl: number, vialMl: number, targetNmol: number }` — a sync read of the cache, safe on render paths. Used by Task 4.
- Produces: `initHplcSettings() -> Promise<settings>` (called once from `src/content/main.js`) and `onHplcSettingsChanged(cb) -> unsubscribe`. Used by Task 4.
- Produces: `loadHplcSettings() -> Promise<settings>`, `saveHplcAliquotVolumeUl(v)`, `saveHplcVialVolumeMl(v)`, `saveHplcTargetAmountNmol(v)`. Used by Task 4 and by the options page.

- [ ] **Step 1: Write the settings module**

This mirrors `src/shared/purity-threshold.js` deliberately — same cache, same
`onChanged` refresh, same swallowed errors. Read that file first if anything
here looks arbitrary.

```js
// shared/hplc-injection.js — the three parameters behind the panel's HPLC
// injection block, all in chrome.storage.local:
//
//   aliquot  µL   drawn out of the reaction mixture
//   vial     mL   FINAL volume of the diluted sample (aliquot included)
//   target   nmol wanted on the column
//
// There is exactly one copy of each: the panel's inline inputs and the
// options page write the same keys, so editing either is the same edit.
//
// DOM-free; read by the content script (sync cache) and the options page
// (async load/save). The arithmetic these feed lives in
// hplc-injection-math.js, which the page-context inject bundle also uses.

export const HPLC_ALIQUOT_VOLUME_UL_KEY = "cddHplcAliquotVolumeUl";
export const HPLC_VIAL_VOLUME_ML_KEY = "cddHplcVialVolumeMl";
export const HPLC_TARGET_AMOUNT_NMOL_KEY = "cddHplcTargetAmountNmol";

export const DEFAULT_HPLC_ALIQUOT_VOLUME_UL = 10;
export const DEFAULT_HPLC_VIAL_VOLUME_ML = 1.5;
export const DEFAULT_HPLC_TARGET_AMOUNT_NMOL = 0.2;

// Every one of the three is a positive volume or amount; zero and negatives
// are not "small", they are unusable, and they fall back to the default.
function sanitizePositive(raw, fallback) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return n;
}

export function sanitizeAliquotVolumeUl(raw) {
    return sanitizePositive(raw, DEFAULT_HPLC_ALIQUOT_VOLUME_UL);
}

export function sanitizeVialVolumeMl(raw) {
    return sanitizePositive(raw, DEFAULT_HPLC_VIAL_VOLUME_ML);
}

export function sanitizeTargetAmountNmol(raw) {
    return sanitizePositive(raw, DEFAULT_HPLC_TARGET_AMOUNT_NMOL);
}

const DEFAULTS = {
    aliquotUl: DEFAULT_HPLC_ALIQUOT_VOLUME_UL,
    vialMl: DEFAULT_HPLC_VIAL_VOLUME_ML,
    targetNmol: DEFAULT_HPLC_TARGET_AMOUNT_NMOL,
};

export async function loadHplcSettings() {
    try {
        const result = await chrome.storage.local.get([
            HPLC_ALIQUOT_VOLUME_UL_KEY,
            HPLC_VIAL_VOLUME_ML_KEY,
            HPLC_TARGET_AMOUNT_NMOL_KEY,
        ]);
        return {
            aliquotUl: sanitizeAliquotVolumeUl(result?.[HPLC_ALIQUOT_VOLUME_UL_KEY]),
            vialMl: sanitizeVialVolumeMl(result?.[HPLC_VIAL_VOLUME_ML_KEY]),
            targetNmol: sanitizeTargetAmountNmol(result?.[HPLC_TARGET_AMOUNT_NMOL_KEY]),
        };
    } catch {
        return { ...DEFAULTS };
    }
}

async function saveKey(key, value, sanitize) {
    try {
        await chrome.storage.local.set({ [key]: sanitize(value) });
    } catch {
        // Orphaned content script — nothing useful to do.
    }
}

export function saveHplcAliquotVolumeUl(value) {
    return saveKey(HPLC_ALIQUOT_VOLUME_UL_KEY, value, sanitizeAliquotVolumeUl);
}

export function saveHplcVialVolumeMl(value) {
    return saveKey(HPLC_VIAL_VOLUME_ML_KEY, value, sanitizeVialVolumeMl);
}

export function saveHplcTargetAmountNmol(value) {
    return saveKey(HPLC_TARGET_AMOUNT_NMOL_KEY, value, sanitizeTargetAmountNmol);
}

/* Sync cache for render paths, refreshed via chrome.storage.onChanged. */

let cached = { ...DEFAULTS };
let listenerAttached = false;
const changeListeners = new Set();

function notify() {
    for (const cb of changeListeners) {
        try {
            cb(cached);
        } catch {
            /* a misbehaving listener must not break the others */
        }
    }
}

export function getHplcSettings() {
    return cached;
}

export function onHplcSettingsChanged(cb) {
    changeListeners.add(cb);
    return () => changeListeners.delete(cb);
}

export async function initHplcSettings() {
    if (!listenerAttached && chrome?.storage?.onChanged) {
        listenerAttached = true;
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== "local") return;

            let touched = false;
            if (changes[HPLC_ALIQUOT_VOLUME_UL_KEY]) {
                cached = {
                    ...cached,
                    aliquotUl: sanitizeAliquotVolumeUl(changes[HPLC_ALIQUOT_VOLUME_UL_KEY].newValue),
                };
                touched = true;
            }
            if (changes[HPLC_VIAL_VOLUME_ML_KEY]) {
                cached = {
                    ...cached,
                    vialMl: sanitizeVialVolumeMl(changes[HPLC_VIAL_VOLUME_ML_KEY].newValue),
                };
                touched = true;
            }
            if (changes[HPLC_TARGET_AMOUNT_NMOL_KEY]) {
                cached = {
                    ...cached,
                    targetNmol: sanitizeTargetAmountNmol(changes[HPLC_TARGET_AMOUNT_NMOL_KEY].newValue),
                };
                touched = true;
            }
            if (touched) notify();
        });
    }

    cached = await loadHplcSettings();
    notify();
    return cached;
}
```

- [ ] **Step 2: Add the options card**

In `src/options/options.html`, insert this immediately **after** the closing
`</section>` of the "Remembered batch values" card (line 360) and **before**
`</main>`. The tile number continues the sequence — the last existing card is
`6`.

```html
    <section class="card" aria-labelledby="col-hplc-heading">
        <header class="card__head">
            <span class="tile" aria-hidden="true">
                <span class="tile__no">7</span>
                <span class="tile__sym">Ij</span>
            </span>
            <div class="card__titles">
                <h2 class="card__name" id="col-hplc-heading">HPLC injection</h2>
                <p class="card__desc">
                    The panel works out the injection volume for each reaction
                    from the reaction molarity CDD prints on the solvent row:
                    an aliquot of the mixture is diluted to the vial volume,
                    and the injection is however much of that carries the
                    target amount. These three values are also editable
                    directly in the panel block.
                </p>
            </div>
        </header>

        <div class="card__body">
            <label class="field-item purity-threshold-row">
                <span>
                    <strong>Aliquot volume (µL)</strong> — how much is drawn
                    out of the reaction mixture.
                </span>
                <input type="number" id="hplcAliquotVolume"
                       min="0" step="1"
                       class="purity-threshold-input" />
            </label>

            <label class="field-item purity-threshold-row">
                <span>
                    <strong>HPLC vial volume (mL)</strong> — the final volume
                    of the diluted sample, aliquot included.
                </span>
                <input type="number" id="hplcVialVolume"
                       min="0" step="0.1"
                       class="purity-threshold-input" />
            </label>

            <label class="field-item purity-threshold-row">
                <span>
                    <strong>Target injected amount (nmol)</strong> — how much
                    should reach the column.
                </span>
                <input type="number" id="hplcTargetAmount"
                       min="0" step="0.1"
                       class="purity-threshold-input" />
            </label>
        </div>
    </section>
```

- [ ] **Step 3: Wire the card up**

In `src/options/options.js`, add the import next to the `purity-threshold.js`
import block (around lines 35-39):

```js
import {
    loadHplcSettings,
    saveHplcAliquotVolumeUl,
    saveHplcVialVolumeMl,
    saveHplcTargetAmountNmol,
} from "../shared/hplc-injection.js";
```

Add the wiring immediately after the `initPurityThresholdUI` function
(around line 662):

```js
const hplcAliquotInput = document.getElementById("hplcAliquotVolume");
const hplcVialInput = document.getElementById("hplcVialVolume");
const hplcTargetInput = document.getElementById("hplcTargetAmount");

hplcAliquotInput.addEventListener("change", () => {
    saveHplcAliquotVolumeUl(hplcAliquotInput.value);
});
hplcVialInput.addEventListener("change", () => {
    saveHplcVialVolumeMl(hplcVialInput.value);
});
hplcTargetInput.addEventListener("change", () => {
    saveHplcTargetAmountNmol(hplcTargetInput.value);
});

async function initHplcInjectionUI() {
    const settings = await loadHplcSettings();
    hplcAliquotInput.value = settings.aliquotUl;
    hplcVialInput.value = settings.vialMl;
    hplcTargetInput.value = settings.targetNmol;
}
```

Add the init call to the list at the very end of the file, after
`initHeatMapFieldsUI();`:

```js
initHplcInjectionUI();
```

- [ ] **Step 4: Build and verify live**

Run: `npm run build`
Then reload the unpacked extension from `dist/` and open the options page.

Expected:
- The new card 7 "HPLC injection" appears, prefilled `10`, `1.5`, `0.2`.
- Change all three (e.g. `20`, `2`, `0.5`), reload the options page — the new values are still there.
- Type `-5` into the aliquot and blur, then reload the page: it reads `10` again (the sanitiser rejected it).
- The browser console shows no errors.

- [ ] **Step 5: Commit**

```bash
git add src/shared/hplc-injection.js src/options/options.html src/options/options.js
git commit -m "HPLC injection: the three parameters, and the options card"
```

---

### Task 3: Reaction molarity out of the payload

**Files:**
- Modify: `src/inject/parsers/sample-data.js` (import block at lines 1-14; above `extractRowsFromReactionFeature` at line 64; `extractAllReactionRows` at line 190)
- Test: throwaway `node` script in `$SCRATCH`

**Interfaces:**
- Consumes: `collectReactionSolvents`, `effectiveMolarity` from `src/shared/hplc-injection-math.js` (Task 1).
- Produces: `extractAllReactionRows(payload)` gains a third key alongside `reactionCount` and `samples`:
  `reactions: Array<{ index: number, solvents: Array<{ name: string|null, molarity: number }>, effectiveMolarity: number|null }>`.
  It rides through `post(EVENTS.SAMPLE_DATA, sampleResult)` in `src/inject/main.js:92` and lands whole in `STATE.lastPayload` (`src/content/message-router.js:36`) — no plumbing changes needed. Used by Task 4.
- Produces: `extractReactionSolvents(feature) -> { solvents, effectiveMolarity }` (module-local, not exported).

- [ ] **Step 1: Add the import**

At the top of `src/inject/parsers/sample-data.js`, after the
`field-resolvers.js` import block:

```js
import {
    collectReactionSolvents,
    effectiveMolarity,
} from "../../shared/hplc-injection-math.js";
```

- [ ] **Step 2: Add the second pass**

Insert this function immediately **above**
`export function extractRowsFromReactionFeature` (line 64), so the comment
sits next to the guard it is about:

```js
// The reaction molarity, per reaction — a second, UNFILTERED pass over the
// same rows.
//
// It cannot come out of extractRowsFromReactionFeature below: that loop
// drops any row with neither a sample nor a registered batch, which is what
// a solvent row normally is. The hexane row of entry 2504170 is exactly
// that shape, and it is the row that carries `molarity`.
function extractReactionSolvents(feature) {
    const stoichTable = feature?.data?.stoichiometryTable;
    const rows = Array.isArray(stoichTable?.rows) ? stoichTable.rows : [];
    const solvents = collectReactionSolvents(rows);

    return { solvents, effectiveMolarity: effectiveMolarity(solvents) };
}
```

- [ ] **Step 3: Return it from `extractAllReactionRows`**

Replace the body of `extractAllReactionRows` (line 190 to the end of the file)
with:

```js
export function extractAllReactionRows(payload) {
    const reactionFeatures = getReactionFeatures(payload);
    const allRows = [];
    const reactions = [];

    reactionFeatures.forEach((feature, index) => {
        const rows = extractRowsFromReactionFeature(feature, index);
        allRows.push(...rows);

        const { solvents, effectiveMolarity: molarity } = extractReactionSolvents(feature);
        reactions.push({ index, solvents, effectiveMolarity: molarity });
    });

    return {
        reactionCount: reactionFeatures.length,
        samples: allRows,
        // Per-reaction data that is NOT per-sample: the HPLC injection block
        // reads its molarity from here, since no card carries one.
        reactions,
    };
}
```

- [ ] **Step 4: Write the throwaway check and run it**

`extractReactionSolvents` is not exported, so the check exercises the pair it
delegates to, against the row shape the payload actually has.

```bash
cp src/shared/hplc-injection-math.js "$SCRATCH/hplc-injection-math.mjs"
```

`$SCRATCH/check-parser.mjs`:

```js
import { collectReactionSolvents, effectiveMolarity } from "./hplc-injection-math.mjs";

// A stoichiometryTable.rows shaped like entry 2504170: a reactant with a
// sample, a product with neither, and the hexane solvent row that carries
// the molarity and nothing else the card filter would keep.
const rows = [
    { role: "reactant", sample: { id: 1 }, moleculeName: "RGT-0000222", molarity: null },
    { role: "product", moleculeName: "product", molarity: undefined },
    { role: "agent", rowType: "solvent", moleculeName: "hexane", molarity: 0.1 },
];

const solvents = collectReactionSolvents(rows);
const m = effectiveMolarity(solvents);

console.log("solvents:", JSON.stringify(solvents));
console.log("effectiveMolarity:", m);

const ok =
    JSON.stringify(solvents) === JSON.stringify([{ name: "hexane", molarity: 0.1 }]) &&
    m === 0.1;

console.log(ok ? "all ok" : "FAILURE");
process.exit(ok ? 0 : 1);
```

Run: `node "$SCRATCH/check-parser.mjs"`
Expected: `solvents: [{"name":"hexane","molarity":0.1}]`, `effectiveMolarity: 0.1`,
`all ok`, exit 0.

- [ ] **Step 5: Build and confirm nothing regressed**

Run: `npm run build`
Then reload the unpacked extension and open entry 2504170.

Expected: the panel still lists the same cards as before (this task adds data,
it changes no rendering), and the console shows no
`[CDD Stoich Tools] sample parse failed` warning.

- [ ] **Step 6: Commit**

```bash
git add src/inject/parsers/sample-data.js
git commit -m "HPLC injection: carry each reaction's solvent molarity in the payload"
```

---

### Task 4: The block in the panel

**Files:**
- Create: `src/content/features/hplc-injection-block.js`
- Modify: `src/content/features/sample-panel.js` (import block at lines 1-40; the style template around line 413; `renderSamples` at line 1136, group body at line 1196)
- Modify: `src/content/main.js` (import block; `init()` right after the `initPurityThresholds()` call)

**Interfaces:**
- Consumes: `effectiveMolarity`, `computeInjectionVolume`, `formatInjectionVolume`, `formatMolarity`, `HPLC_MIN_INJECTION_UL` from `src/shared/hplc-injection-math.js` (Task 1).
- Consumes, in the block module: `getHplcSettings`, `onHplcSettingsChanged`, `saveHplcAliquotVolumeUl`, `saveHplcVialVolumeMl`, `saveHplcTargetAmountNmol` from `src/shared/hplc-injection.js` (Task 2). Separately, `src/content/main.js` consumes `initHplcSettings` from the same module.
- Consumes: `reactions` on the payload (Task 3).
- Produces: `createHplcInjectionBlock(reaction) -> HTMLElement | null`, `resetHplcInjectionBlocks()`, `HPLC_BLOCK_STYLES` (a CSS string the panel splices into its own `<style>`).

- [ ] **Step 1: Write the block module**

Two things here are not decoration and must not be simplified away:

1. **One listener, not one per block.** `renderSamples` runs on every payload,
   every field-visibility change and every enrichment pass. Subscribing per
   block would add a listener per render, forever. The module subscribes once
   and repaints whatever blocks are currently live.
2. **Repaint never touches a focused input.** Committing a value writes
   storage, storage notifies, the repaint runs — and if it rewrote the input
   the user is standing in, their caret would jump.

```js
// content/features/hplc-injection-block.js
//
// "How much do I inject?" answered in the panel, once per reaction.
//
// An aliquot is drawn out of the reaction mixture, diluted into an HPLC
// vial, and the injection is however much of THAT carries the target amount
// onto the column. The reaction molarity comes off the stoichiometry table
// (see the solvent pass in inject/parsers/sample-data.js); the other three
// numbers are settings.
//
// The inputs ARE the settings, not a local copy of them: typing here is the
// same edit as typing in the options page. They write on `change` — blur or
// Enter — so a half-typed "1." never reaches storage, comes back sanitised,
// and lands under the caret.

import { copyTextWithFeedback } from "../utils/clipboard.js";
import {
    effectiveMolarity,
    computeInjectionVolume,
    formatInjectionVolume,
    formatMolarity,
    HPLC_MIN_INJECTION_UL,
} from "../../shared/hplc-injection-math.js";
import {
    getHplcSettings,
    onHplcSettingsChanged,
    saveHplcAliquotVolumeUl,
    saveHplcVialVolumeMl,
    saveHplcTargetAmountNmol,
} from "../../shared/hplc-injection.js";

// The blocks currently in the DOM. renderSamples clears this before it
// rebuilds the list, so the single settings listener below never repaints a
// block that has been thrown away.
let liveBlocks = [];
let listenerAttached = false;

export function resetHplcInjectionBlocks() {
    liveBlocks = [];
}

function attachSettingsListener() {
    if (listenerAttached) return;
    listenerAttached = true;

    onHplcSettingsChanged(() => {
        for (const repaint of liveBlocks) {
            try {
                repaint();
            } catch {
                /* one bad block must not stop the others */
            }
        }
    });
}

function unit(text) {
    const span = document.createElement("span");
    span.className = "cdd-hplc-unit";
    span.textContent = text;
    return span;
}

function numberInput(value, step, onCommit) {
    const input = document.createElement("input");
    input.type = "number";
    input.className = "cdd-hplc-input";
    input.min = "0";
    input.step = step;
    input.value = String(value);
    input.addEventListener("change", () => onCommit(input.value));
    return input;
}

// "hexane 0.1 M" — the tooltip that says where the molarity came from, and
// the only place the individual solvents are named.
function describeSolvents(solvents) {
    const parts = (solvents || [])
        .filter((s) => Number.isFinite(Number(s?.molarity)) && Number(s.molarity) > 0)
        .map((s) => `${s.name || "solvent"} ${formatMolarity(Number(s.molarity))} M`);

    if (parts.length > 1) {
        return `${parts.join(" + ")} → effective ${formatMolarity(effectiveMolarity(solvents))} M`;
    }
    return parts[0] || "";
}

// The block for one reaction, or null when the reaction has no solvent
// molarity — there is nothing to compute from, and an empty block reads as
// a bug rather than as an absence.
export function createHplcInjectionBlock(reaction) {
    const molarity = effectiveMolarity(reaction?.solvents);
    if (molarity == null) return null;

    attachSettingsListener();

    const block = document.createElement("div");
    block.className = "cdd-hplc-block";

    const top = document.createElement("div");
    top.className = "cdd-hplc-top";

    const title = document.createElement("span");
    title.className = "cdd-hplc-title";
    title.textContent = "HPLC injection";

    const result = document.createElement("span");
    result.className = "cdd-hplc-result";

    top.append(title, result);

    const molarityEl = document.createElement("span");
    molarityEl.className = "cdd-hplc-molarity";
    molarityEl.textContent = `${formatMolarity(molarity)} M`;
    molarityEl.title = describeSolvents(reaction.solvents);

    const settings = getHplcSettings();
    const aliquotInput = numberInput(settings.aliquotUl, "1", saveHplcAliquotVolumeUl);
    const vialInput = numberInput(settings.vialMl, "0.1", saveHplcVialVolumeMl);
    const targetInput = numberInput(settings.targetNmol, "0.1", saveHplcTargetAmountNmol);

    aliquotInput.title = "Aliquot drawn from the reaction mixture";
    vialInput.title = "Final volume of the diluted sample";
    targetInput.title = "Amount that should reach the column";

    const inputs = document.createElement("div");
    inputs.className = "cdd-hplc-inputs";
    inputs.append(
        molarityEl,
        unit(" · "),
        aliquotInput,
        unit(" µL → "),
        vialInput,
        unit(" mL · "),
        targetInput,
        unit(" nmol"),
    );

    const note = document.createElement("div");
    note.className = "cdd-hplc-note";
    note.hidden = true;

    block.append(top, inputs, note);

    let copyValue = "";
    result.addEventListener("click", async () => {
        if (!copyValue) return;
        await copyTextWithFeedback(result, copyValue);
    });

    function repaint() {
        const current = getHplcSettings();

        // Never write over the box the user is standing in — the commit that
        // triggered this repaint came from it.
        for (const [input, value] of [
            [aliquotInput, current.aliquotUl],
            [vialInput, current.vialMl],
            [targetInput, current.targetNmol],
        ]) {
            if (input !== document.activeElement) input.value = String(value);
        }

        const computed = computeInjectionVolume({
            molarity,
            aliquotUl: current.aliquotUl,
            vialMl: current.vialMl,
            targetNmol: current.targetNmol,
        });

        if (!computed) {
            result.textContent = "—";
            result.classList.remove("cdd-hplc-result-warn");
            copyValue = "";
            note.hidden = true;
            return;
        }

        const text = formatInjectionVolume(computed.volumeUl);
        result.textContent = `${text} µL`;
        copyValue = text;

        result.classList.toggle(
            "cdd-hplc-result-warn",
            computed.warning === "exceeds-vial"
        );

        if (computed.warning === "exceeds-vial") {
            note.textContent =
                "Exceeds the vial volume — the dilution is too weak for this target.";
            note.className = "cdd-hplc-note cdd-hplc-note-error";
            note.hidden = false;
        } else if (computed.warning === "below-minimum") {
            note.textContent =
                `Below ${HPLC_MIN_INJECTION_UL} µL — under the typical injector minimum.`;
            note.className = "cdd-hplc-note cdd-hplc-note-warn";
            note.hidden = false;
        } else {
            note.hidden = true;
        }
    }

    repaint();
    liveBlocks.push(repaint);

    return block;
}

// Spliced into the panel's own <style> so the block inherits the panel-id
// scoping the rest of the rules use.
export const HPLC_BLOCK_STYLES = `
  .cdd-hplc-block {
    border: 1px solid rgba(56, 189, 248, 0.35);
    border-radius: 10px;
    padding: 8px 10px;
    background: rgba(56, 189, 248, 0.07);
  }

  .cdd-hplc-top {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
  }

  .cdd-hplc-title {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.4px;
    text-transform: uppercase;
    color: #7dd3fc;
  }

  .cdd-hplc-result {
    font-size: 15px;
    font-weight: 700;
    color: #f9fafb;
    cursor: pointer;
    padding: 1px 4px;
    border-radius: 4px;
  }

  .cdd-hplc-result:hover {
    background: rgba(255,255,255,0.08);
  }

  .cdd-hplc-result-warn {
    color: #ef4444;
  }

  .cdd-hplc-inputs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    margin-top: 6px;
    font-size: 11px;
    color: #cbd5e1;
  }

  .cdd-hplc-molarity {
    font-weight: 700;
    color: #93c5fd;
  }

  .cdd-hplc-unit {
    white-space: pre;
  }

  .cdd-hplc-input {
    width: 52px;
    padding: 1px 4px;
    font-size: 11px;
    font-family: inherit;
    color: #f9fafb;
    background: rgba(15, 23, 42, 0.9);
    border: 1px solid #374151;
    border-radius: 4px;
  }

  .cdd-hplc-input:focus {
    outline: none;
    border-color: rgba(56, 189, 248, 0.7);
  }

  .cdd-hplc-note {
    margin-top: 5px;
    font-size: 10px;
    line-height: 1.35;
  }

  .cdd-hplc-note-warn {
    color: #f59e0b;
  }

  .cdd-hplc-note-error {
    color: #ef4444;
  }
`;
```

- [ ] **Step 2: Splice the styles into the panel**

In `src/content/features/sample-panel.js`, add to the import block at the top:

```js
import {
    createHplcInjectionBlock,
    resetHplcInjectionBlocks,
    HPLC_BLOCK_STYLES,
} from "./hplc-injection-block.js";
```

The panel's style template prefixes every rule with `#${PANEL_ID}`. Splice the
block's rules in with the same prefix — find the `.cdd-stoich-group-body`
rule (line 413) and insert this line immediately **before** it, inside the
template literal:

```js
  ${HPLC_BLOCK_STYLES.replace(/^ {2}\./gm, `  #${PANEL_ID} .`)}
```

- [ ] **Step 3: Render the block**

In `renderSamples`, add the reset right after `list.replaceChildren();`
(line 1139) — before the early return for the empty case, so a payload with
no samples also clears the registry:

```js
    resetHplcInjectionBlocks();
```

Then, immediately after `groupBody.className = "cdd-stoich-group-body";`
(line 1196), insert:

```js
        // Per-reaction, so it belongs to the group rather than to any card:
        // how much of the diluted aliquot to inject. Returns null (and
        // nothing renders) when the reaction has no solvent molarity.
        const hplcBlock = createHplcInjectionBlock(
            (payload?.reactions || []).find((r) => r.index === group.reactionIndex)
        );
        if (hplcBlock) groupBody.appendChild(hplcBlock);
```

- [ ] **Step 4: Init the settings cache at startup**

In `src/content/main.js`, add to the imports next to the `purity-threshold.js`
import:

```js
import {initHplcSettings} from "../shared/hplc-injection.js";
```

and inside `init()`, immediately after the `initPurityThresholds()` block:

```js
  // The three HPLC injection parameters. Fire-and-forget: the block paints
  // with the defaults until the (fast) storage read lands, and the block's
  // own listener repaints it then — no panel re-render involved, which is
  // what keeps focus in an input the user is typing in.
  initHplcSettings();
```

- [ ] **Step 5: Build and verify live**

Run: `npm run build`
Then reload the unpacked extension and open entry 2504170.

Expected, in order:
1. Each reaction group shows an "HPLC INJECTION" block above its cards, reading **0.30 µL**, with `0.1 M · 10 µL → 1.5 mL · 0.2 nmol` under it.
2. Hovering the `0.1 M` shows `hexane 0.1 M`.
3. Clicking `0.30 µL` copies `0.30` and flashes green.
4. Type `5` into the aliquot box and press Enter → the result becomes `0.60 µL`, and the caret stays in the box.
5. Open the options page: the aliquot reads `5`. Change it back to `10` there → the panel block returns to `0.30 µL` without a page reload.
6. Set the target to `2000` nmol → the injection would be 3000 µL against a 1500 µL vial, so the result turns red with "Exceeds the vial volume". (`1000` nmol lands on exactly 1500 µL, which is not over the limit and correctly does NOT warn.)
7. Set the target back to `0.2` and the vial to `0.1` mL → the result reads `0.020 µL` with the amber "under the typical injector minimum" note.
8. Open an ELN entry whose reaction has no solvent row → no block, no empty box, no console error.
9. Click the panel's refresh button several times, then edit an input once. With a breakpoint in `repaint`, it must be hit once per live block — not once per past render. A growing count means the reset in Step 3 is missing or misplaced.

- [ ] **Step 6: Commit**

```bash
git add src/content/features/hplc-injection-block.js src/content/features/sample-panel.js src/content/main.js
git commit -m "HPLC injection: the block at the top of each reaction group"
```

---

### Task 5: Release

**Files:**
- Modify: `manifest.json` (line 4)
- Modify: `CHANGELOG.md`
- Modify: `RELEASES.md`
- Modify: `dist/` (rebuilt)

**Interfaces:**
- Consumes: everything from Tasks 1-4.
- Produces: a commit ready for the user to test. Nothing is pushed.

- [ ] **Step 1: Bump the version**

In `manifest.json`, `"version": "14.8.0"` → `"version": "14.9.0"`. A new
user-facing feature, no breaking change.

- [ ] **Step 2: Write the changelog entry**

Add a `## 14.9.0` section at the top of the version list in `CHANGELOG.md`,
following the format of the existing entries (English, dated `2026-08-20`):

```markdown
### Added

- **HPLC injection volume in the panel.** Each reaction group now opens with
  an "HPLC injection" block: it takes the reaction molarity CDD prints on the
  solvent row and works out how much of the diluted aliquot to inject onto
  the column. Click the volume to copy it.
- **Three new settings** (options card 7, and editable inline in the block
  itself): aliquot volume (default 10 µL), HPLC vial volume (1.5 mL) and
  target injected amount (0.2 nmol).
- The block flags an injection that would exceed the vial volume, or fall
  below 0.1 µL — the low end of a common UPLC autosampler.
- Reactions with several solvents combine into one effective molarity,
  `1 / Σ(1/Mᵢ)` — the concentration of the mixture the aliquot is actually
  drawn from.
```

- [ ] **Step 3: Write the release note**

Add the matching `14.9.0` section to `RELEASES.md`, covering the same four
points as Step 2 but in the user-facing prose voice the existing sections use
(English): what the block does, where it appears, which three numbers are
editable and where, and what the two warnings mean.

- [ ] **Step 4: Rebuild**

Run: `npm run build`
Expected: both bundles build with no errors.

- [ ] **Step 5: Commit and stop**

```bash
git add manifest.json CHANGELOG.md RELEASES.md dist
git commit -m "Release 14.9.0: HPLC injection volume in the panel"
```

**Then STOP.** Per `CLAUDE.md`: do not push the commit, do not create a tag,
do not push a tag. Tell the user the commit is ready, that they should reload
the extension from `dist/` and test entry 2504170, and wait for an explicit
go-ahead for each push. Pushing the `v14.9.0` tag publishes to the Chrome Web
Store and Firefox AMO.
