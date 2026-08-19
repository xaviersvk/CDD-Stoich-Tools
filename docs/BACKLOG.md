# Backlog

Ideas and requests that are understood but deliberately not built yet. Each
entry records what was already investigated, so picking it up does not mean
starting the research over.

Priority is about **when we would spend time on it**, not about how useful it
would be.

---

## Next up

### Qodana findings — triaged 2026-08-19, ready to implement

**State.** `main` (`f2ff0e7`) reports **79 problems, all severity Moderate** —
critical and high are zero and stay zero. The quality gate in `qodana.yaml` is a
ratchet at `moderate: 80`: green today, red the moment a change adds one. The
agreed ceiling is **20**; the four items below take the count to roughly 44, at
which point the ratchet drops to 45 and the remainder gets its own decision
(see "What NOT to do").

| Inspection | Count | Verdict |
| --- | --- | --- |
| `Result of method call returning a promise is ignored` | 50 | 1 real bug, ~46 deliberate, 8–11 honestly clearable |
| `Deprecated symbol used` | 22 | 20 are a resolution artefact, 2 are real and stay |
| `Duplicated code fragment` | 7 | 5 worth merging, 2 not |

**Reproducing the report on another machine.** The linter needs the cloud token
(GitHub secret `QODANA_TOKEN_2139620105`; the same value is in the Qodana Cloud
project settings — do **not** commit it):

```
docker run --rm -e QODANA_TOKEN="<token>" \
  -v "<repo>:/data/project/" -v "<tmp>/results:/data/results/" \
  jetbrains/qodana-js:2026.1 --results-dir /data/results
```

`results/qodana.sarif.json` then carries every finding with `file:line`.

> **A local run does not match CI.** Locally it reports **52**, in CI **79**. The
> 27 missing are the 20 `chrome.*` deprecations and the 7 clones. A dev machine
> has an untracked `.idea/workspace.xml` that tells WebStorm what `chrome` is;
> the CI checkout does not, which is exactly what item 2 fixes. Judge counts by
> the CI run, not by a local one.

#### 1. Paste/Fill race in the run-definition toolbar — a real bug

`src/content/features/run-form-templates/toolbar.js:206, 243, 258, 442`

The same class of defect as the doubled "No templates saved yet" note fixed in
14.7.0, one layer out. Paste and Fill write into the **same** `panel` element and
neither disables the other's button while it runs (`buildToolbar` only gates on
`btn.disabled = !editing`, and editing stays on throughout a paste).

Sequence: click **Paste into form** → `runPaste` awaits the stash, then
`applyPaste` walks the plan one `writeField` at a time, each polling through
`waitFor`/`setTimeout` — seconds on a definition with picker or BatchLink fields.
Mid-write, click **Fill from template** → `renderFillPanel` clears the panel and
draws the dropdown. When the paste finally resolves, `renderPasteOutcome` calls
`panel.replaceChildren()` and wipes the fill UI the user is looking at, then
`runPaste` appends a second Close bar. `panel.dataset.mode` is still `"fill"`, so
the storage listener at `:258` later re-renders the fill panel over the paste
report.

The `fillRenderTokens` WeakMap added in 14.7.0 guards `renderFillPanel` against
other `renderFillPanel` calls only — it knows nothing about `runPaste` /
`pasteLines`, which own the same container.

**Fix.** `await` is the wrong tool (these are click handlers that must not
block). Either promote the render token to **one token per panel consulted by
every writer** — `renderFillPanel`, `renderSavePanel`, `renderEditedLinesPanel`,
`runPaste`, `pasteLines`, each taking a token before its first
`replaceChildren()` and bailing after every `await` when it is no longer the
latest — or disable the four toolbar buttons for the duration of `runPaste`, the
pattern the file already uses locally. Worth doing on its own merits; it clears
up to 4 findings as a side effect.

#### 2. Make `chrome` resolve — clears 20 findings without suppressing anything

`@types/chrome` as a devDependency plus a `jsconfig.json` with
`compilerOptions.types: ["chrome"]`.

All 22 "Deprecated symbol used" hits were checked individually. **Twenty are
false**: `chrome` is an unresolved global, so the analyser resolves the method
name against the DOM and lands on `MediaQueryList.addListener`, which *is*
deprecated. `chrome.storage.onChanged.addListener` is current MV3 API, is the
only way to observe storage changes, and behaves the same under `chrome.*` in
Firefox. Sites: `src/background.js:20,24`, `content/features/auto-fill.js:72`,
`eln-title.js:14`, `sample-panel.js:882`, `ui-fixes/eln-id-to-registration.js:263`,
`ui-fixes/form-filter-chips.js:148`, `ui-fixes/registration-form-default.js:189`,
`ui-fixes/slurp-type-default.js:178`, `options/options.js:830`,
`shared/control-layout-presets.js:234,235`, `shared/density-memory.js:308`,
`shared/heat-map-fields.js:103`, `shared/panel-sources-flag.js:75`,
`shared/prefix-colors.js:284`, `shared/purity-threshold.js:83`,
`shared/run-form-templates.js:269,270`, `shared/show-products-flag.js:50`.

**Watch for:** correct typings may surface a few *new* findings — that is the
point of the change, not a reason to skip it. Alternative with the same effect
and an independent benefit: funnel all 20 through one `onStorageChanged(keys, cb)`
shim, which would also make the `browser` vs `chrome` namespace handling
consistent (only `content/inject-loader.js:7` does it today).

#### 3. The nine `shared/` helpers without a `try/catch`

`saveFieldMap` (`shared/registration-form-fields.js:184`), `savePrefixColorMap`
(`shared/prefix-colors.js:161`), `saveAutoFillEnabled`
(`shared/auto-fill-flag.js:14`), `clearRegistrationFormLastUsed`
(`shared/registration-form.js:209`) and the four other `saveRegistrationForm*`
writers.

Every sibling in `shared/` wraps its `chrome.storage.local.set` in a `try/catch`
with the same comment: "Extension context invalidated" — the extension was
reloaded while an old content script was still alive. These nine do not, and
seven **content-script** call sites let the promise float:
`content/api/registration-form-fields.js:172`,
`shared/prefix-colors.js:228`, `ui-fixes/registration-form-default.js:150,163`,
`ui-fixes/slurp-type-default.js:142,155`, plus `options-menu-link.js:31`'s
`chrome.runtime.sendMessage`. Reload the extension with a CDD tab open and each
one is a genuine unhandled rejection. It does not break the page (isolated
world, console noise only) — fix it **in the helpers**, matching their siblings,
not by adding `.catch()` at seven call sites.

**Separate, real, and not fixed by any of this:** `savePrefixColorMap` is a
whole-map replace written from both the options page and the content-script
cache, so an options-page colour edit concurrent with a content-side prefix
discovery can clobber the other. A lost update, unrelated to the missing
`await`. Worth its own look.

#### 4. Five duplications worth merging

1. **`ui-fixes/plate-list-export.js:159` ↔ `ui-fixes/plate-location-export.js:163`**
   — 29 lines identical bar one comment: `mapLimit` over plates, `getPlateInfo`
   per plate, progress into `status.textContent`, cancel check, numeric sort,
   `downloadCsv("cdd-plate-locations.csv", …)`. Extract
   `resolveAndDownloadPlateLocations({ plates, status, stop })` into a new
   `ui-fixes/plate-location-csv.js`; both files already import all four
   collaborators. The differing `WARN_THRESHOLD` (500 vs 1000) and the two
   `finally` blocks stay in the callers. **Touches the plate export paths — smoke
   test both after.**
2. **`ui-fixes/registration-form-default.js:68` ↔ `ui-fixes/slurp-type-default.js:59`**
   — `optionNames` and `applyOrder` are identical; move them into
   `shared/registration-form.js` (or a DOM-aware sibling if `shared/` is to stay
   DOM-free). `SELECT_SELECTOR`, `getSelect` and the `applyingDefault` flag stay
   per-file.
3. **`registration-form-default.js:181` ↔ `slurp-type-default.js:172`** — the
   same `started` guard + `chrome.storage.onChanged` listener with the same
   three-key filter. Add `onRegistrationFormSettingsChanged(cb)` to
   `shared/registration-form.js`; both import lists shrink, and it removes 2 of
   item 2's twenty as a side effect.
4. **`ui-fixes/plate-location-tooltip.js:81` ↔ `ui-fixes/plate-map-structure-tooltip.js:99`**
   — the known `positionBubble` pair. They differ in one line: the map tooltip
   clamps with `Math.max(pad, …)`, the location one does not. Adopt the clamped
   form in both (strictly safer, a no-op in practice for a one-line bubble) and
   move it to `content/utils/dom.js` as `positionAtCursor(el, event)`. No flag
   argument.
5. **`sample-panel.js:1213` ↔ `sample-panel.js:1287`** — same file, same closure:
   build `.cdd-stoich-card-top` + `.cdd-stoich-reaction-badge`. A local
   `buildCardTop()`; each caller appends its own extra badges. Cheapest of the
   five.

#### What NOT to do

- **Do not `await` or `void` the ~40 remaining floating promises.** They are
  deliberate: the options page's eleven independent `init*UI()` calls (one
  section failing must not stop the other ten), the content-script startup
  warm-ups that already carry "fire-and-forget" comments, debounced writes
  inside `setTimeout` that *cannot* be awaited, and long-running click handlers
  with their own re-entry guard and `try/catch/finally`. Silencing them means 40
  lines of `.catch(() => {})` in front of callees that already swallow the
  error — it would bury the one finding that mattered.
- **`document.execCommand("copy")` (`content/utils/clipboard.js:19`) stays.** It
  is the fallback after `navigator.clipboard.writeText` is missing or rejects
  (unfocused document, gesture window drift — routine on a Turbo app), and it is
  still the only synchronous clipboard write in Chromium and Firefox.
- **`doc.write` (`inject/print/dispatcher.js:57`) stays for now.** `srcdoc` is
  the replacement and is available in both browsers, but it populates
  asynchronously, so `waitForImages` would have to move into an
  `iframe.addEventListener("load", …)`. A restructure of the print path in a
  repo with no test suite, for a rarely exercised feature — not worth it to move
  a number.
- **Do not merge the rAF + `MutationObserver` boilerplate to chase findings.**
  Qodana flagged 3 copies of an idiom that appears ~21 times (`let scheduled =
  false` occurs 21× in `src/`). A `watchDocument(run, opts)` helper in
  `content/utils/dom.js` is the right refactor and would delete ~150 lines — but
  it touches ~25 feature entry points and a bug in it breaks every feature at
  once. Do it because the code deserves it, on its own change, with a manual
  smoke pass; not for two findings.

**If 20 is still the goal after all this,** the honest options are to disable
`JSIgnoredPromiseFromCall` for `src/options/` and `src/shared/` (where it is
almost entirely deliberate) or to take a baseline. Chasing an absolute count is
what pushes a project into suppressing findings like `execCommand`, which are
correct and load-bearing.

---

## Low priority

### Copy a column on the Visualization page

**Request.** Extend the search-results column copy
(`src/content/features/ui-fixes/search-column-copy.js`, 13.1.0/13.1.1) to the
Data Table on the visualization page, e.g.
`/vaults/<v>/searches/<id>/visualization?launched_from_search=true`.

**Why it is not a small change.** The visualization is a separate React
application, not the CDD page the rest of the extension works against.
Investigated 2026-08-12:

- **It is not a `<table>`.** `document.querySelectorAll('table')` returns
  nothing for the grid. It is nested `div`s — `.header-container`,
  `.cell-header`, inside `.rc-scrollbars-view` — with **no ARIA table
  semantics** at all (`[role="grid"]`, `[role="row"]`, `[role="columnheader"]`
  are all absent). So `buildGrid()`, which the search-results feature is built
  on, has nothing to attach to.
- **Styling classes are generated** (`css-1o3264n`, `css-jb504p`). They change
  whenever CDD rebuilds the app, so a selector aimed at them is not durable.
  Only `.cell-header` / `.header-container` look semantic enough to rely on.
- **The rows are virtualised.** Only the visible rows exist in the DOM, so
  "copy the column" cannot simply read the DOM — it would have to scroll the
  whole grid and stitch the pieces together.
- **The values are already aggregated and truncated.** The grid shows one row
  per *molecule*, not per batch, and squashes the batches into one cell:
  `001, 002, 003, …, 013` and
  `TEST-0002895-001, TEST-0002895-002, TEST-0002895-003, TEST-…` with a
  trailing ellipsis. Even a perfect DOM read would therefore yield cut-off
  strings rather than usable data.

**What a real implementation would need.** Reading the component's own state
(React fibre / the app's store) rather than the DOM, which is fragile against
every CDD release — the kind of coupling the rest of the codebase avoids.

**Workaround today.** The visualization page has CDD's own **Export**, and the
plain search results page supports the Ctrl+click column and section copy.

**Decision.** Parked at low priority (2026-08-12) — revisit only if Export
turns out not to cover the need.
