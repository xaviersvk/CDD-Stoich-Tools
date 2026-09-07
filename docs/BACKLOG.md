# Backlog

Ideas and requests that are understood but deliberately not built yet. Each
entry records what was already investigated, so picking it up does not mean
starting the research over.

Priority is about **when we would spend time on it**, not about how useful it
would be.

---

## Next up

### Store pages — paste the new text, then redo the screenshots

The Chrome and Firefox pages still show the v3-era description (panel,
print, filter defaults — nothing about inventory, plates, search pickers,
registration or HPLC). **The text is written**, committed 2026-09-07 in
[`store/listing.md`](../store/listing.md), with a plain-text block for
Chrome, an HTML block for AMO and a per-dashboard checklist. Neither store
takes listing text from the publish workflow, so this is a hand job:

1. **Chrome** — Developer Dashboard → *Store listing* → Description → paste
   the plain-text block → *Submit for review*. Category stays *Functionality
   & UI*. The subtitle comes from `manifest.description`, already changed;
   it lands with the next version bump.
2. **AMO** — Developer Hub → *Edit Product Page*: Summary = the subtitle,
   Description = the HTML block, category *Web Development → Productivity*,
   Homepage = `https://xaviersvk.github.io/CDD-Stoich-Tools/`.

**Screenshots** were deliberately left out. Chrome has ~27 and AMO 5, mostly
the old panel; nothing shows Column Manager, plate maps, the location tree
or scan racks. Next step is a shot list of 6–8 screens to take from a real
vault, crop to 1280×800 and upload in the same order in both stores.

### 15.7.0 reload test — the suffix that counts products

Built and committed on 2026-08-28, branch `eln-id-product-ordinal`, **not
merged and not tagged**. The pure part is covered — 28 cases over
`eln-id-carry.js` in node — but everything below is DOM-bound and could only
be checked on a live entry.

What changed: the ELN-ID suffix counts the entry's PRODUCTS instead of its
stoichiometry tables (so a reaction with two products stops registering both
under one Internal ID), and a Register link on a non-product row no longer
writes anything at all.

*To test,* after reloading the unpacked extension and refreshing the page:

1. **Two products in one reaction.** Their two Register links must pre-fill
   `MDX-…` and `MDX-…B` (in whichever style is picked), not the same string
   twice.
2. **The panel button on those same two product cards** must offer exactly
   those two strings. The two routes agreeing is the point of the change.
3. **A reagent row.** Its Register link must leave *Internal ID* empty.
4. **An entry with a parallel (bulk) block.** Its products still read `-1A`,
   `-1B`, and the entry's ordinary product is not pushed along by them. This
   is the riskiest one: the parallel branch is asked before the payload
   precisely because parallel rows print no row number, and that ordering has
   been reasoned about but not seen to work.
5. **Flipping the style or *Mark the first product too*** takes effect on the
   open entry, no reload.

If it passes: merge to `main --no-ff`, tag `v15.7.0`, push both. If test 1 or
2 fails, the thing to look at first is whether the product rows of one table
arrive in the payload in the order the table displays them —
`productOrdinalOf()` in `src/shared/eln-id-carry.js` assumes they do, and the
design doc says so in as many words.

### Two things 14.11.0 shipped without proving

The ELN-id-to-batch write went out on 2026-08-21. Both claims below are
written as *unverified* in `CHANGELOG.md` rather than assumed; neither is a
known bug, and neither could be tested on the entry we had.

**1. The uniqueness collision.** *Internal ID* is `unique_value: true` in vault
6884, so an entry with two products pushed to the same ELN ID should have its
second write refused by CDD — the design deliberately does not predict the
refusal or invent a suffix to dodge it, it just shows what CDD said. Test entry
`2504170` turned out to hold exactly **one** product with an empty *Internal
ID*, so the second write never happened.

*To test:* an entry with two or more products whose batches both have an empty
*Internal ID*. Push both. Expect the second card to report CDD's own refusal
text, and expect the batch to be untouched.

**2. Enrichment of products that HAVE a sample.** The pass originally gated on
`hasSample === false`; the last commit of the release widened it so products
join whether or not they have a sample, because a sampled product can have an
empty *Internal ID* just as easily. All seven sampled products in `2504170`
already had one, so the widened path was never seen to do anything.

*To test:* a product with an inventory sample whose batch has an empty
*Internal ID*. Expect the button to appear on it.

### Mentions: say which row a deduped mention matched

Agreed in outline on 2026-08-21 and never started. The panel currently collapses
mentions that already appear in the stoichiometry table into a bare count — "21
mention(s) already in the table" — which tells you the number and nothing you
can act on.

Three pieces, in order:

1. `splitMentionsAlreadyShown` keeps a `Set`; make it a `Map` so it remembers
   **which table row** each deduped mention matched.
2. A `¶` chip on the table card, marking rows that are also mentioned in the
   entry text.
3. The count becomes an expandable list whose entries scroll to the matching
   card in the panel.

**Open question, asked and never answered:** should that list default to
collapsed? The count is currently one line; an always-open list of 21 entries
is not.

### Qodana findings — triaged 2026-08-19, items 1–4 done and measured 2026-08-21

**Where it stands.** `main` reports **94** (63 ignored promises, 24 deprecated,
7 clones) against a ratchet of 80, so the check has been **red**. Branch
`qodana-chrome-types` brought it to **74** in CI, and 14.11.0 took it to
**76** — 70 promises, 4 clones, 2 deprecated. The ratchet sits at **76**.
The +2 are two more of the options page’s independent `init*UI()` calls, the
same deliberate shape as the eleven beside them. Still far from the agreed
ceiling of 20; see "What is left" below for the only honest ways there.

**A fifth change was needed, and it was a CI defect.** The first run of the
branch reported **90**, not the ~72 predicted: deprecated had gone 24 → 23, so
item 2 had done nothing at all. The workflow never ran `npm ci`, so there was
no `node_modules`, `jsconfig.json`'s `types: ["chrome"]` resolved to nothing,
`chrome` stayed an unresolved global, and every `chrome.*.addListener` was
resolved against the DOM — landing on the deprecated
`MediaQueryList.addListener`. Adding a setup-node + `npm ci` step took the run
to 74. **A config change that depends on a dependency is worth nothing until
something installs it.**

**Judge counts by CI, never by a local run.** Locally it reports 70: the clone
check does not run at all, and a dev machine's untracked `.idea/workspace.xml`
already tells WebStorm what `chrome` is regardless of config. Reproducing CI
needs the cloud token (GitHub secret `QODANA_TOKEN_2139620105`, same value in
the Qodana Cloud project settings — do **not** commit it):

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

#### 2. Make `chrome` resolve — DONE, 24 → 2 (but only after the workflow fix)

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

#### 4. Five duplications — DONE, 7 → 4

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

**Four clones remain, not the two predicted.** Two are the rAF +
`MutationObserver` boilerplate left alone deliberately (see "What NOT to do").
The other two are unidentified: the clone check does not run locally, and the
per-location detail only exists in the cloud report for the run. Open it and
name them before deciding whether they are worth merging.

**Smoke-tested 2026-08-21:** both plate export paths and both entity-type
picklists behave as before. Worth repeating if any of them is touched again —
they run against live CDD pages and have no test coverage.

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

---

## Stoichiometry table copy — disabled, cause not yet isolated

**Status.** `initStoichTableCopy()` is commented out in `src/content/main.js`
as of **15.4.3**. The module still builds and one line brings it back.

**Symptom.** Insert an entity link into an ELN entry with `@`, then edit the
stoichiometry table in the **same page session**, and the link — plus anything
else typed since the page loaded — disappears. Reload between the two steps and
it survives, which is why it looked intermittent for a long time.

**Cause.** `src/content/features/ui-fixes/stoich-table-copy.js`. Bisected on
2026-08-25 with a page-side kill list over 25 feature inits: with only this
module running the fault reproduces; with only `stoich-amount-editing.js`
running it does not; with the extension off it never happens.

**Which part of it is still open.** Two suspects were tested and neither is the
answer on its own:

- `suppressDraggables()` — rewrote the `draggable` attribute on the reaction
  `<figure>` and the batch `<a>`, both nodes Slate owns. Replaced with a
  cancelled `dragstart` (no DOM write at all). **Did not fix it.**
- the `user-select: text !important` rule, which lifts Slate's void
  protection — ruled out in a separate run.

That leaves the capture-phase gesture handlers (`pointerdown`, `pointerup`,
`mousedown`, `mouseup`, `click`, `dblclick`), the `copy` handler, and
`markTables()` adding `cdd-stoich-selectable` to a `<table>` inside the editor.

**The failure chain, measured.** Worth keeping, because every visible symptom is
the *end* of it and points away from the real cause:

1. a Slate transform throws `undefined is not iterable (cannot read property
   Symbol(Symbol.iterator))` inside `Object.withoutNormalizing` — no extension
   frames anywhere on the stack
2. CDD's error boundary catches it and paints *"The last action caused an
   error. If the error persists, contact us."*
3. CDD reports the failure with `PUT /vaults/<v>/eln/entries/<id>` carrying
   `{"eln_entry":{"lock_version":N},"errored":true}` plus a
   `POST /eln/debugs/`
4. that reporter's `lock_version` was captured before the last autosave, so the
   server answers **422 `["Invalid entry version"]`** — this is the only thing
   visible in the console, and it is a red herring
5. the editor is recovered from an earlier document and the next autosave
   writes it back — the entry body is re-sent **byte-identical** to a previous
   version

**Ruled out along the way.** The server (saves carrying the link were accepted
and echoed back with it); `inject/hooks/fetch-hook.js` (entry saves go over
XHR, so it was never on the path); `print-buttons.js` appending a `<button>`
inside the contenteditable; the *Mentioned in text* panel source; Grammarly;
and DOM deletion (`removeChild`/`remove` never fire — the node is dropped from
Slate's model, not from the DOM).

**Plan for the next session** (parked 2026-08-26, picking up the week of
2026-08-31).

Four candidates are left in the file. Ranked:

1. **`markTables()`** — the favourite. It does
   `row.closest("table")?.classList.add("cdd-stoich-selectable")`, which writes
   an attribute onto a `<table>` **inside the Slate editor**: the same category
   of sin as `suppressDraggables()`, which was the first suspect. Worse, it is
   driven by a MutationObserver on a 200 ms debounce, so it fires again every
   time CDD re-renders the table — immediately after an autosave, which is
   exactly when the fault lands.
2. **`onGestureEvent`** — capture-phase listeners on `pointerdown`,
   `pointerup`, `mousedown`, `mouseup`, `click`, `dblclick`. It only calls
   `preventDefault`/`stopImmediatePropagation` under a Ctrl/Cmd modifier or a
   real selection drag, neither of which the reproduction uses — but it is on
   every one of those events.
3. **`onCopy`** — capture-phase `copy` on `document`. Not in the reproduction
   path at all; listed for completeness.
4. **`updateArmed`** — toggles a class on `document.documentElement`, outside
   the editor. Lowest risk.

**Method.** Do not re-enable the module for users. Put a kill list inside
`initStoichTableCopy()` itself, read from `localStorage.CDD_DIAG_STC`
(`styles`, `mark`, `gestures`, `copy`, `armed`, `dragstart`), and have the
function return immediately when the key is absent — so the shipped default
stays off and a page reload is all a test round costs. The same pattern as the
`CDD_DIAG_OFF` list used to find the module, which worked well: no extension
reload between rounds.

First round: run **only `mark`**, nothing else. If the fault appears, it is
confirmed in one step and the fix is to stop marking the table — style it by
an ancestor outside the editor, or match CDD's own `[data-autotest-id]`
attributes instead of adding a class of ours.

**Signal to measure**, not "did the link vanish" — that is confounded by
duplicate Slate node keys (three `a` nodes shared `link-node-key-1`), which
make a node persist in the body yet never render:

- `undefined is not iterable` in the console, or
- the red *"The last action caused an error"* box

Both are immediate and unambiguous. The console survives a page reload, so a
round is: set the list → reload the page → reproduce → read the console.

**Note for whoever picks this up.** CDD's own debug payload says
`"Editor data not available - likely the error did not occur in the editor"`.
That is wrong — it only means `slate_history` was not attached. The stack shows
Slate.

**Reproduction.** ELN entry, extension on: `@` → pick a batch → *Save* → wait
for *Saved* → change a value in the stoichiometry table. Both steps in one page
session. Signal to watch: `undefined is not iterable` in the console, or the red
error box.

---

## Sharing phrases with colleagues — options, and what they cost

Analysed 2026-08-25. Nothing built; this is the decision record so the question
does not get re-opened from scratch.

**What constrains it**

- The manifest asks for **`permissions: ["storage"]` only**, with the content
  script confined to `collaborativedrug.com` and no `host_permissions`.
- The Firefox manifest declares `data_collection_permissions: required: ["none"]`.
  Anything that sends phrase text to a server changes that declaration and
  brings a privacy policy and fresh review in both stores.
- **Phrases are ELN text** — potentially the employer's IP. That is the real
  constraint, and it is not a technical one.

**The options**

| Path | What it means | Cost | Verdict |
| --- | --- | --- | --- |
| **File (today)** | Export JSON → email/Teams → Import | done | works, but is not "online" |
| **Share code** | Phrases deflated (`CompressionStream('deflate-raw')`) + base64url into one string. "Copy code" in Settings, colleague pastes it into a "Paste code" box. | ~150 lines, **no new permissions, no server, nothing stored anywhere** | **recommended** |
| **Share link** | Same payload behind `#` on the existing GitHub Pages site — a fragment is never sent to the server, so the page never sees the content. | + a landing page; Teams/Outlook break links past ~2 000 chars, so ~5–15 phrases per link | nice, fragile |
| **Curated packs** | Starter packs (Workup, HPLC, Safety) as JSON in the repo, served from Pages, "Browse packs" in Settings | + `host_permissions` for the Pages origin | one-way — good for starter sets, not for "send Peter my twelve" |
| **Own backend** | Short code `CDD-7K2Q`, Cloudflare Worker + KV | hosting, TTL, moderation, GDPR, privacy policy, changed Firefox declaration, review | the only route to a genuinely nice UX, but it puts **ELN text on a third-party server**; defensible only end-to-end encrypted, key in the code, server holding ciphertext |
| **Through CDD** | The pack lives in a shared vault (an ELN entry, "Phrase library"); the extension already runs there with the user's session | medium, but brittle (DOM / undocumented API) | **data never leaves CDD, permissions handled by CDD** — the right answer for colleagues in the same vault |
| **`chrome.storage.sync`** | — | — | **not sharing at all** — it syncs a user's own devices, and 8 KB per item against a 20 000-char text limit does not fit anyway |

**Decision.** If this is picked up, build the **share code** first: nothing is
uploaded, no new permission, identical in Chrome and Firefox, and the "online"
part is handled by the email or chat everyone already uses. **Through CDD** is
the natural follow-on once colleagues are known to share a vault. A backend
should only be opened if those two prove insufficient.
