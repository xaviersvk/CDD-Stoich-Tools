# Backlog

Ideas and requests that are understood but deliberately not built yet. Each
entry records what was already investigated, so picking it up does not mean
starting the research over.

Priority is about **when we would spend time on it**, not about how useful it
would be.

---

## Next up

### Qodana findings — triaged 2026-08-19, items 1–4 done 2026-08-21

**Where it stands.** `main` reports **94 moderate problems** (63 ignored
promises, 24 deprecated, 7 clones) against a ratchet of 80 in `qodana.yaml`, so
the check has been **red**. Branch `qodana-chrome-types` carries the four items
below; the next CI run is expected to report **≈72** — 68 promises, 2
deprecated, 2 clones — which is green again but still far from the agreed
ceiling of 20. Lower the ratchet once that real number is in hand.

**Judge counts by CI, never by a local run.** Locally it reports 70: the clone
check does not run at all, and a dev machine's untracked `.idea/workspace.xml`
already tells WebStorm what `chrome` is, which is exactly what item 2 fixed for
CI. Reproducing CI needs the cloud token (GitHub secret
`QODANA_TOKEN_2139620105`, same value in the Qodana Cloud project settings — do
**not** commit it):

```
qodana scan --image jetbrains/qodana-js:2026.1 --results-dir <tmp>
```

`<tmp>/qodana.sarif.json` then carries every finding with `file:line`.

#### 1. Paste/Fill race in the run-definition toolbar — DONE, a real bug

`src/content/features/run-form-templates/toolbar.js`

Paste and Fill wrote into the **same** `panel` element and neither disabled the
other's button while it ran. `applyPaste` walks its plan one `writeField` at a
time, each polling through `waitFor`/`setTimeout` — seconds on a definition with
picker or BatchLink fields. Press Fill mid-write and, when the paste resolved,
`renderPasteOutcome` called `panel.replaceChildren()` over the dropdown the user
was looking at and appended a second Close bar; `panel.dataset.mode` was still
`"fill"`, so the storage listener later redrew the fill panel over the paste
report.

Fixed by promoting the 14.7.0 render token to **one token per panel consulted by
every writer** — `renderFillPanel`, `renderSavePanel`, `renderEditedLinesPanel`,
`runPaste`, `pasteLines`, plus `closePanel` and the edit-mode teardown, which
are writes too. Each claims before its first `replaceChildren()` and bails after
every `await` when it is no longer the latest.

**It cleared zero findings.** The triage guessed "up to 4" and was wrong: the
three surviving hits (`:212`, `:249`, `:264`) are at the *call sites* — click
handlers that must not block, and a storage listener — which stay
fire-and-forget by design. Worth doing entirely on its own merits.

#### 2. Make `chrome` resolve — DONE, 24 → 2

`@types/chrome` as a devDependency plus `jsconfig.json` with
`compilerOptions.types: ["chrome"]`.

All 22 (later 24) "Deprecated symbol used" hits were checked individually and 20
were false: `chrome` was an unresolved global, so the analyser resolved the
method name against the DOM and landed on `MediaQueryList.addListener`, which
*is* deprecated. `chrome.storage.onChanged.addListener` is current MV3 API and
the only way to observe storage changes.

As predicted, correct typings surfaced **five new** promise findings —
`chrome.storage.local.set` is finally known to return one. That is the change
working, not a regression.

The two that remain are real and stay: `document.execCommand("copy")` and
`doc.write` (see "What NOT to do").

#### 3. The nine `shared/` helpers without a `try/catch` — DONE, 0 findings moved

`saveFieldMap`, `savePrefixColorMap`, `saveAutoFillEnabled`,
`clearRegistrationFormLastUsed` and the four other `saveRegistrationForm*`
writers now wrap their `chrome.storage.local.set` exactly like every sibling in
`shared/` already did, with the same reason: "Extension context invalidated" —
the extension was reloaded while an old content script was still alive.

Seven **content-script** call sites let those promises float, so each was a
genuine unhandled rejection on every reload with a CDD tab open. It never broke
the page (isolated world, console noise only). Fixing it in the helpers rather
than with `.catch()` at seven call sites is what makes the fire-and-forget calls
honest rather than merely quiet — and it is also why the finding count did not
move: Qodana flags the call site, not the callee.

#### 4. Five duplications — DONE, 7 → 2

1. `plate-list-export.js` ↔ `plate-location-export.js` — 29 identical lines
   (`mapLimit` over plates, `getPlateInfo` each, progress, cancel check, numeric
   sort, `downloadCsv`) extracted to
   `ui-fixes/plate-location-csv.js` as `resolveAndDownloadPlateLocations({
   plates, status, stop })`. The differing `WARN_THRESHOLD` (500 vs 1000) and
   the two `finally` blocks stayed in the callers.
2. `registration-form-default.js` ↔ `slurp-type-default.js` — `optionNames` and
   `applyOrder` moved to `ui-fixes/entity-type-select.js` as `applyOptionOrder(
   select, order)`. It sits in `ui-fixes/`, not `shared/`, because `shared/` is
   deliberately DOM-free — the options page imports it.
3. The same pair's `chrome.storage.onChanged` listener with its three-key filter
   became `onRegistrationFormSettingsChanged(cb)` in
   `shared/registration-form.js`.
4. The `positionBubble` pair in the two plate tooltips became
   `positionAtCursor(el, event)` in `content/utils/dom.js`. They differed in one
   line — the map tooltip clamped the flipped-above position with `Math.max(pad,
   …)`, the location one did not, so a tall bubble near the bottom of a long
   plate map could sit off the top of the screen. Both took the clamped form.
5. `sample-panel.js` — the clone here *was* the reaction badge, which 14.10.1
   deleted. What was left is four badges built the same three lines each, now
   one `cardTopBadge(className, text, title)`.

**Not smoke-tested yet:** both plate export paths and both entity-type
picklists. Behaviour is unchanged by construction, but these run against live
CDD pages and have no test coverage.

#### What is left, and the honest choice

The remaining ~68 are `JSIgnoredPromiseFromCall`, and the triage found ~46 of
them deliberate. Getting to 20 means one of:

- **Scope the inspection off `src/options/` and `src/shared/`.** Now defensible
  in a way it was not before item 3: every `shared/` writer guards itself, so a
  floating call there cannot reject. The options page's eleven independent
  `init*UI()` calls are the same story — one section failing must not stop the
  other ten.
- **Take a baseline** (`--baseline qodana.sarif.json`), which counts only what a
  change adds and freezes the rest out of sight.

Do not `await` or `void` the rest. They are deliberate: the content-script
startup warm-ups that already carry "fire-and-forget" comments, debounced writes
inside `setTimeout` that *cannot* be awaited, and long-running click handlers
with their own re-entry guard and `try/catch/finally`. Silencing them means ~40
lines of `.catch(() => {})` in front of callees that already swallow the error.

#### What NOT to do

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
- **Separate, real, and not fixed by any of this:** `savePrefixColorMap` is a
  whole-map replace written from both the options page and the content-script
  cache, so an options-page colour edit concurrent with a content-side prefix
  discovery can clobber the other. A lost update, unrelated to the missing
  `await`. Worth its own look.

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
