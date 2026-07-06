# M0 — Multi-position Sample Create: Request-Replay Contract

> Status: **PRODUCTION N-CREATE ✅ SHIPPED (v8.6.0)** — one dialog, one click,
> N samples. Native first save + sequential replay of the rest; replay is gated
> on the native save succeeding. M2 dry-run / M3 live-test scaffolding removed.
> Debug session 2026-06-28 resolved the picker→store→action-bar propagation chain.
> All confirmed facts are marked ✅; open items ⛔; architecture decisions ⚠️.

## 0. The governing principle

The plugin **reuses the exact request CDD generates** and changes **only two
values**: `inventory_location_id` and `inventory_location_position`. It never
reconstructs `inventory_sample[...]`, `inventory_events_attributes[...]`,
`fields_attributes[...]`, or any other field. The less the plugin understands
about CDD's payload, the more it survives CDD frontend changes.

## 0a. Layering & the consumer boundary

Two clean abstractions, no leakage between them:

- **Box Selection Framework** (`features/box-selection/`) exposes exactly one
  object to consumers: **`SelectionContext`** (`boxId`, `selectedPositions`,
  `occupiedPositions`, `emptyPositions`, `allPositions`, `has/isOccupied/
  isEmpty/count/clear/onChange/destroy`). Consumers read the box and its wells
  **only** through this — they never query grid DOM. If CDD restyles the grid,
  only `box-grid.js` changes.
- **Batch Create** (`features/multi-position-sample-create/`, Phase 2) is one
  consumer. It takes a `SelectionContext` and, **internally**, owns request
  capture + replay. No other feature knows (or may depend on) *how* it creates
  records — whether by fetch interception, FormData snapshot, or Request clone
  is a private implementation detail behind the feature's own module boundary.
  Future consumers (Move, Delete, Export, Labels) consume the same
  `SelectionContext` and bring their own internal mechanism.

## 1. Where capture MUST happen (architecture correction)

The suggested file layout put `request-capture.js` under
`src/content/features/multi-position-sample-create/`. **Capture cannot live in
the content (isolated) world.** A content script has its *own* `window.fetch`
and cannot see the page's network calls (this is the whole reason
`src/inject/` exists — see `docs/ARCHITECTURE_REVIEW.md` §3).

Therefore:

- **Capture** (read the outgoing create request + its body) → **inject / page
  world** (`src/inject/`), alongside the existing fetch/XHR hooks.
- **Replay** → recommended **also in the inject world** (see §5), so the
  captured body never has to be serialised across `postMessage`.
- **Orchestration + UI** (selection, confirm dialog, progress, results) →
  **content world**, talking to inject via the existing tagged `postMessage`
  bus (`EVENT_SOURCE` / `EVENTS`).

New events to add (mirrors existing `EVENTS`): a content→inject
`REPLAY_CREATE_SAMPLE { boxId, positions }` and inject→content progress
`REPLAY_PROGRESS { position, ok, status, sampleId?, sampleIdentifier?, errorText? }`.

## 2. fetch vs XHR — ✅ CONFIRMED: `fetch`, multipart

The captured request is **`fetch(...)`**, `method:"POST"`, `credentials:"include"`,
`x-requested-with:"XMLHttpRequest"`, `x-csrf-token:<token>`, body
`multipart/form-data` (boundary `----WebKitFormBoundary…`). It is **not** a
classic Rails-UJS XHR form submit — the **"Create a New Sample" dialog is a React
component** (MUI; the title carries a React `useId` artefact `id="«r66»"`), which
builds and sends the request itself. The existing `hooks/fetch-hook.js` already
sees this call; capture rides on it. (XHR hook stays as a safety net.)

## 3. The value to change — ✅ CONFIRMED from a real request

Location is **one composite field value**, not two keys. The real multipart body
(`POST /vaults/{vault}/molecules/{molecule}/inventory_samples`) encodes the
inventory event's *Location* field (field-definition id `1000001955`) as a single
value `"<boxId>,<position>"`:

```
inventory_sample[units]                                                            = kg
inventory_sample[batch_id]                                                         = 1000561471
…[inventory_events_attributes][0][fields_attributes][0][field_definition_id]       = 1000001953   (Credit)
…[inventory_events_attributes][0][fields_attributes][0][value]                     = 10
…[inventory_events_attributes][0][fields_attributes][1][field_definition_id]       = 1000001954   (Debit)
…[inventory_events_attributes][0][fields_attributes][1][value]                     = 0
…[inventory_events_attributes][0][fields_attributes][2][field_definition_id]       = 1000001955   (Location)
…[inventory_events_attributes][0][fields_attributes][2][value]                     = 1000001682,43
```

`1000001682` = box (inventory_location_id), `43` = inventory_location_position;
the response echoes them as `location.id` / `location.position`.

**Replacement strategy (M3):** locate the `[fields_attributes][K][value]` whose
*sibling* `[fields_attributes][K][field_definition_id]` equals the Location
field-definition id, and rewrite it to `${keepBoxId},${newPosition}` — keep the
box id from the request (§6), vary only the position. Locate the entry by sibling
field_definition_id (preferred); fallback: the only value shaped `^\d+,\d+$`.
**Never** assume index `[2]`. The earlier "two suffix keys" plan is retracted.

> Note: this body is minimal — the user only set amount + location, so it carries
> no `*Sample ID` (server-assigned: `next_identifier` → `SM003064`) and no
> Barcode. If a future create includes a **unique** field (Sample ID/Barcode with
> a concrete value), replays would collide; M5 must detect and warn. For the
> amount/location-only case shown, replays are safe.

## 4. Body type, cloning & reuse limitations

- A **`Request`/`Response` body is a one-shot stream.** `Request.clone()` only
  helps *before* the body is read and the clones still drain. Do **not** rely on
  re-reading a live request body.
- The safe capture is to **snapshot the body at the hook, before CDD sends it**:
  - `fetch(url, init)` → `init.body` is available synchronously in the hook.
  - `xhr.send(body)` → the `body` argument is available in the send hook.
- If the body is **`FormData`**, snapshot by copying entries into a fresh
  `FormData` (`for (const [k,v] of body.entries()) copy.append(k,v)`). A
  `FormData` built this way is **reusable N times**. String / `URLSearchParams`
  bodies are trivially reusable.
- ⚠️ **Content-Type / multipart boundary:** if the body is `multipart/form-data`,
  the boundary is part of the header. **Never copy the original Content-Type
  header onto a replay** — let `fetch` regenerate it from the `FormData`.
  Copying a stale boundary corrupts parsing. For `application/x-www-form-
  urlencoded` you may reuse the string + its Content-Type.

## 5. Replay location & session/CSRF

Recommended: **replay in the inject (page) world** using the page's own
`fetch`/cookies. Rationale: the snapshot stays in the world that captured it (no
cross-world body serialisation, no `File`/boundary pitfalls), and the page world
naturally carries the session.

Session & CSRF preservation:

- Same-origin `fetch` with `credentials: "include"` sends the CDD session cookie.
- The original request's CSRF lives either in a header (`X-CSRF-Token`, rails-
  ujs) and/or as an `authenticity_token` field inside the FormData. Because we
  **reuse the captured request verbatim** (headers + body), CSRF is preserved by
  construction. If we must rebuild headers, re-read the token from
  `meta[name="csrf-token"]` (as `content/api/cdd-api.js` already does) — but
  prefer verbatim reuse.

## 6. The "first request is native" flow + ⛔ open decisions

To capture, **one native create must fire** (that request is the template). So:

1. User fills the form and picks **one** well normally (this populates the
   form's location id/position → that becomes sample **#1**, 100% native).
2. User multi-selects the **other** empty wells via the framework.
3. Plugin "Create N Samples": triggers/awaits the single native submit, the
   inject hook captures it, and **on success** replays for the remaining
   positions (sequential).

Resolved / open:

- ✅ **Box id source — RESOLVED.** Take the box id from the **captured request's
  composite location value** (the digits before the comma). No dependency on the
  tree `data-nodeid` at all, which removes that uncertainty. `SelectionContext`
  only needs to supply the *positions*; the box id rides along in the captured
  payload. (If a future need requires cross-box, revisit.)
- ✅ **Unique fields — clarified.** Sample ID is server-assigned (not in the
  body). Only a user-entered Barcode/Sample ID would collide; M5 warns if any
  unique field with a concrete value is present in the captured body.
- ⛔ **Empty/occupied position semantics across boxes:** positions are
  box-relative row-major indices; a replay must pair the kept box id with
  positions from *that same box's* grid. The create dialog shows one box at a
  time, so this holds; document the single-box assumption.

## 7. Verification probe (run once, on the real create form)

Paste in DevTools console, then do a normal single create. It logs whether the
request went via fetch or XHR, the URL/method, and the body type — without
changing behaviour. This is how we replace guesses with facts for §2/§3/§4.

```js
(() => {
  const of = window.fetch;
  window.fetch = function (input, init = {}) {
    const url = typeof input === "string" ? input : input?.url;
    if (url && /inventory_samples|specified_batches/.test(url)) {
      const body = init.body ?? (input && input.body);
      console.log("[probe] FETCH", init.method || "GET", url,
        "bodyType=", body?.constructor?.name);
      if (body instanceof FormData) for (const e of body.entries()) console.log("  ", e[0], "=", e[1]);
    }
    return of.apply(this, arguments);
  };
  const os = XMLHttpRequest.prototype.send, oo = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, u) { this.__m = m; this.__u = u; return oo.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (body) {
    if (this.__u && /inventory_samples|specified_batches/.test(this.__u)) {
      console.log("[probe] XHR", this.__m, this.__u, "bodyType=", body?.constructor?.name);
      if (body instanceof FormData) for (const e of body.entries()) console.log("  ", e[0], "=", e[1]);
    }
    return os.apply(this, arguments);
  };
  console.log("[probe] installed — now create one sample normally");
})();
```

## 8. Real-CDD data status

1. ✅ Copy-as-fetch of a real create request — received.
2. ✅ Serialized multipart body — received (see §3).
3. ✅ Box grid outerHTML (create dialog) — received (see §10).
4. ✅ Empty + filled cell markup — received; `.box-position-empty` /
   `.box-position-filled` both confirmed (§10).
5. ✅ Box id source — resolved without `data-nodeid` (§6: taken from the request).
6. ⛔ Box-occupancy request/response — still useful for the API↔DOM cross-check,
   but the DOM already encodes occupancy via `.box-position-empty/-filled`, so
   it is no longer a blocker.
7. ⬜ Screenshot of dialog + picker placement — nice-to-have for bar placement.

## 9. `FormData(form)` vs request capture — ⛔ ONE probe decides

You asked whether `new FormData(button.closest("form"))` can reproduce the body,
so we can delete interception entirely. **I cannot prove it from the cURL alone**,
and here is the precise tension:

- *Argument it might work:* the body uses clean Rails-style nested names
  (`inventory_sample[inventory_events_attributes][0][fields_attributes][2][value]`)
  with sequential indices — exactly what `new FormData(formEl)` produces **if**
  the dialog renders real inputs with those `name=` attributes.
- *Argument it won't:* the dialog is **React/MUI** (`«r66»` useId). React dialogs
  commonly build `FormData` programmatically (`.append(...)`) from component
  state and render no serialisable `<form>`. Decisively, the **Location** is a
  *composed* value `"<boxId>,<position>"` assembled in JS from the tree selection
  + the clicked well — that string is unlikely to exist as a single input value;
  it's the field most likely to be missing/empty in `new FormData(form)`.

So the question is empirical and must be answered against the **live dialog**.
Run this with the "Create a New Sample" dialog open and a location picked:

```js
(() => {
  const forms = [...document.querySelectorAll("form")];
  let hit = false;
  forms.forEach((f, i) => {
    const fd = new FormData(f);
    const keys = [...fd.keys()];
    if (keys.some((k) => k.includes("inventory_sample"))) {
      hit = true;
      console.log(`[probe] form#${i} reproduces inventory_sample keys:`);
      for (const [k, v] of fd.entries()) console.log("   ", k, "=", v);
      const loc = [...fd.entries()].find(([k]) => /\[value\]$/.test(k) && /^\d+,\d+$/.test(String(fd.get(k))));
      console.log("[probe] composite location value present:", loc || "NO — capture required");
    }
  });
  if (!hit) console.log("[probe] NO <form> serialises inventory_sample[...] -> React-built body -> capture required");
})();
```

**Decision rule:**
- If a form's `FormData` reproduces *all* body keys **including** the composite
  `…[value] = boxId,position`, then **delete interception**: read `FormData(form)`,
  clone, rewrite the location value, POST N times (`cdd-form-data.js` +
  `inventory-samples.js`, content world). Simpler, no page-world coupling.
- Otherwise (no form, or the location value isn't serialised), **keep capture**:
  the React-built request is the only faithful source of truth.

Either way the **mutation is identical** (swap the one composite location value),
so `cdd-form-data.js` is built first and is reused by whichever source wins.

## 10. Grid DOM confirmations (create dialog)

From the pasted dialog markup:

- Grid: `<div class="positions">` → rows `<div class="row">` → cells
  `<div class="box-position-element  box-position-empty|box-position-filled">`,
  each with `<label>`=row-major position (e.g. `43`). **9×9 = 81**; position 43 =
  row E, col 7 = (5−1)·9+7 ✓ (row-major confirmed).
- ✅ `.box-position-empty` exists explicitly → the framework's
  `gridTagsEmpties()` path is exact (selectable = `.box-position-empty` and not
  `.box-position-filled`).
- ⚠️ **Grid-selector gap:** in this dialog the grid has **no `.LocationBoxPicker`
  ancestor** (it sits in a bare `.MuiCard-root`). The framework's
  `GRID_SELECTOR = ".LocationBoxPicker .positions"` will **not** match here. The
  consumer/discovery must match the grid ancestor-agnostically — e.g. a
  `.positions` element that contains `.box-position-element`. This is a correctness
  fix to `box-grid.js` discovery (not a capability broadening); make it when
  wiring the consumer.

Until §9 is answered, **stop after M2** (capture/serialise + dry-run preview); do
not ship replay/POST.

---

## 11. Debug session findings — 2026-06-28

### 11a. FormData(form) answer — ✅ RESOLVED

`new FormData(form)` **does NOT work** for the Create Sample dialog. The dialog is
React/MUI and builds the multipart body programmatically. The `FormData(form)` probe
finds no form with `inventory_sample[...]` keys. **Captured request is required as the
payload template.** §9 answer: keep capture.

### 11b. Root causes fixed (picker → store → action bar chain)

The chain `well click → SelectionContext.onChange → selection-store → action bar refresh`
was broken by **three independent bugs**:

**Bug 1 — Wrong gate (skipped attachment)**
`watchPickerGrids` gated overlay attachment on `isPickLocationDialogOpen()` (heading
text match). MUI portals render the picker grid at `document.body` level — the grid
element has no `[role="dialog"]` ancestor. When the observer fired, the heading text
check returned false and `attachBoxSelection` was never called.

Fix: gate on `isCreateSampleDialogOpen()` (heading match is reliable for the Create
dialog which is always present when the picker opens) OR on a `LocationBoxPicker`
class selector anywhere in the document. Either condition is sufficient to pass.

**Bug 2 — SelectionContext API mismatch (crash before onChange wired)**
`multi-position-sample-create/init.js` called `ctx.getBoxId()` and `ctx.getSelectedPositions()`
— methods that do not exist. The `SelectionContext` exposes these as **getter properties**:
`ctx.boxId`, `ctx.selectedPositions`. The handler crashed before `ctx.onChange` was ever
registered, so the store was never updated.

Fix: replace all `ctx.getBoxId()` → `ctx.boxId`, `ctx.getSelectedPositions()` → `ctx.selectedPositions`.

**Canonical SelectionContext API** (getters, not methods):
```
ctx.boxId               string | null  (getter — live)
ctx.selectedPositions   string[]       (getter — live, sorted)
ctx.occupiedPositions   string[]       (getter — live)
ctx.emptyPositions      string[]       (getter — live)
ctx.allPositions        string[]       (getter — live)
ctx.count()             number         (method)
ctx.has(pos)            boolean        (method)
ctx.isOccupied(pos)     boolean        (method)
ctx.isEmpty(pos)        boolean        (method)
ctx.clear()             void           (method)
ctx.onChange(cb)        unsubscribe    (method — cb receives ctx)
ctx.destroy()           void           (method)
ctx._model              internal       (escape hatch for advanced consumers)
```

**Bug 3 — Click events swallowed by CDD (bubble phase)**
The overlay's `onClick` handler was registered in the **bubble phase**
(`grid.addEventListener("click", onClick)`). CDD's native well-click handler calls
`event.stopPropagation()` at the target, preventing the event from bubbling up to our
grid listener. Our **passive capture-phase logger** still fired (it ran on the way
down), which is why `LAST WELL CLICK` showed `pos=58 isEmpty=true` but `LAST CTX.ONCHANGE`
was empty — the overlay never saw the click.

Fix: register the overlay click handler in **capture phase**:
```js
grid.addEventListener("click", onClick, true);   // capture = true
// destroy() must match:
grid.removeEventListener("click", onClick, true);
```
Capture phase runs during the descending pass, before CDD's target-level handler has any
chance to stop propagation.

### 11c. What is working now (commit c431773)

- ✅ Box grid detection: ancestor-agnostic via `isBoxGrid()` + LocationBoxPicker class fallback
- ✅ SelectionContext attaches in capture phase; clicks on empty wells toggle selection
- ✅ Occupied wells blocked (isSelectable guard): clicking one flashes `.cdd-box-pos-denied`
- ✅ picker selection → `selection-store` → action bar counter refresh working end-to-end
- ✅ `selection-store.setBoxId()` emits so action bar refreshes immediately when box id arrives
- ✅ In-page debug panel: store count / listeners / last grid-detect / last well click / last onChange / last refresh — all live without DevTools
- ✅ M2 dry-run: resolves payload from captured request, swaps location, previews all N payloads in console, nothing sent
- ✅ M3 single guarded live test: one POST to real vault (guarded by `confirm()`), shows ✓/✗ result

### 11d. Architecture: replay stays in content world

§1 and §5 recommended replay in the inject (page) world to avoid cross-world body
serialisation. **This was reconsidered.** The `FormData` snapshot is serialised to
`entries: [[k,v],...]` on capture and reconstructed with `formDataFromEntries()` in
the content world — File/Blob fields are flagged (`hadNonString=true`) and the live
test blocks if any are present. For the location-only payloads used so far, the round
trip is lossless. Replay in the content world is simpler (no content→inject protocol
needed) and confirmed working with M3.

### 11e. Production batch create — ✅ IMPLEMENTED (v8.6.0)

**Requirement**: User clicks "Create N Samples" once — no manual preliminary native
save required. First selected position is created by CDD natively; remaining N-1 are
replayed by the plugin.

**UX decisions (confirmed with the user, 2026-06-29):**
- **Pure one-click. No confirmation dialog** (no `confirm()`, no two-step arm, no
  modal). The explicit click on a button that reads the live count is the consent.
- **Dynamic button label** reflects the count: `Create 2 Samples` / `Create 14
  Samples` — the count itself is the misclick guard.
- During the run the bar is **disabled** (no double-click); the native dialog
  unmounts on Save anyway, so progress lives in the floating panel.
- **The only hard safety rule: never start replay unless the native first save
  succeeded.** Implemented as a gate on the captured response's `ok`.
- **Dry-run and Live-test buttons + the in-page debug panel were removed.** The
  `FormData(form)` source and `payload-source.js` (the two-source decision) are
  deleted — capture is the sole, settled payload source.

**Implemented flow** (see `init.js#runCreateN`):
1. User fills Create Sample dialog, selects N positions in picker.
2. Clicks "Create N Samples" (no confirmation).
3. `armResponseWaiter()` then click the native Save button **exactly once**.
4. Inject `create-request-capture.js` captures the request body (template) and
   taps the response via a CLONE; posts `CREATE_SAMPLE_CAPTURED` +
   `CREATE_SAMPLE_RESPONDED` (paired by a `correlationId`).
5. `waitForNextResponse(30s)` resolves with the native response.
6. If it **failed / timed out** → show error, replay NOTHING, abort.
7. If it **succeeded** → first ✓ row in the floating panel.
8. `nativePosition = findLocationField(capturedTemplate).position`.
9. `replayPositions = selectedPositions.filter(p => p !== nativePosition)`.
10. Sequentially: `withReplacedPosition` (box kept, position swapped) →
    `createInventorySample` → append ✓/✗ row.
11. Summary line + "Retry failed (N)" button (retries only failures, no native
    save; re-wires itself after each retry round).
12. Selection cleared on completion so a reopened dialog can't re-create it.
    File/Blob payloads abort replay after the native one (can't be replayed).

**Files (as built):**
- `event-types.js` — `CREATE_SAMPLE_RESPONDED` ✅
- `inject/hooks/create-request-capture.js` — `correlationId`; fetch/XHR response
  tap via clone; `onResponse` callback ✅
- `inject/main.js` — passes `onResponse` → posts `CREATE_SAMPLE_RESPONDED` ✅
- `content/message-router.js` — routes it → `notifyCreateResponse` ✅
- `content/features/multi-position-sample-create/response-store.js` (new) —
  `armResponseWaiter` / `waitForNextResponse(timeout)` / `notifyCreateResponse` ✅
- `.../init.js` — `runCreateN` orchestrator, `findNativeSaveButton`,
  `replaySequential`, `wireRetry`; dry-run/live-test/debug-panel removed ✅
- `.../results-panel.js` (new) — floating `position:fixed` results panel ✅
- `.../styles.js` — `.cdd-mp-create` button + `.cdd-mp-float*` panel styles ✅

### 11f. Child samples from debit — ✅ IMPLEMENTED (v10.0.0)

**Requirement**: bulk-create CHILD samples too. Creating a child (aliquot) from a
parent sample's debit event fires a different request than the plain create:

- **`PUT`** (not POST) to
  `/vaults/<v>/molecules/<m>/inventory_samples/<parentId>/create_sample_from_debit`
- Same multipart shape, but the new sample is nested under
  `inventory_sample[inventory_events_attributes][0][child_sample_attributes][...]`.
- The Location field uses the SAME `field_definition_id` (1000001955) and the same
  composite `"<boxId>,<position>"` value — just on the child's nested event:
  `...[child_sample_attributes][inventory_events_attributes][0][fields_attributes][N][value]`.
- The **response is the updated PARENT sample**, not the child. The created child
  is the newest entry in `inventory_events[]` carrying a `child_sample_id`
  (events come back newest-first).
- The `child_sample_attributes[name]` sent by CDD is the PARENT's name; the server
  assigns the real child identifier itself (observed: sent `...SM003103`, created
  `...SM003107`). Replaying an identical payload N times is therefore safe —
  no duplicate names.
- **Each replay debits the parent again** by the payload's Debit amount — N
  children = N × debit. Insufficient parent amount surfaces as a per-position
  error in the results panel.

**Verified against a real request/response pair (2026-07-06, vault 1000000109).**

**How it plugs into the existing flow** (no new orchestrator):
- `create-request-capture.js`: `isCreateRequest()` now also matches
  `PUT .../create_sample_from_debit`; the capture record's `method` is replayed
  verbatim (`createInventorySample(url, formData, method)`).
- `cdd-form-data.js#findLocationField`: when a payload carries multiple Location
  fields, keys containing `[child_sample_attributes]` win (the child is the one
  being created).
- Dialog detection: the debit dialog has no "Create a New Sample" heading; it is
  recognised by `[data-testid="createSampleFromDebit"]`, accepted only when that
  element sits inside a dialog container (`[role="dialog"]`/`.MuiDialog-*`) so a
  same-testid trigger button elsewhere can never count as an open dialog.
- `inventory-samples.js` + `init.js#parseCreatedLabel`: on the debit endpoint the
  created child's id/name are read from the parent response's `inventory_events[]`.

---

#### Original design notes (kept for reference)

**Flow**:
1. User fills Create Sample dialog, selects N positions in picker.
2. Clicks "Create N Samples" → confirmation dialog.
3. Plugin clicks the native Save button programmatically (position p1 = whatever
   CDD's form has = the last-selected native position in the picker).
4. CDD's fetch fires → inject hook captures the request body (template for p2..pN)
   AND awaits the response, then posts `CREATE_SAMPLE_RESPONDED` to content world.
5. Plugin awaits the `CREATE_SAMPLE_RESPONDED` message (30s timeout).
6. If p1 **failed** → show error, do NOT replay, abort.
7. If p1 **succeeded** → show ✓ in floating results panel.
8. Determine `nativePosition` from `findLocationField(capturedFormData).position`.
9. `replayPositions = selectedPositions.filter(p => p !== nativePosition)`.
10. For each position in `replayPositions` sequentially:
    a. Swap location in capturedFormData via `withReplacedPosition`.
    b. POST via `createInventorySample`.
    c. Append ✓/✗ row to floating results panel.
11. After all: show summary line + "Retry failed (N)" button if any failures.
12. Retry reruns only the failed positions (same flow, no native save).

**Why floating panel (not action bar)**: clicking native Save closes the Create Sample
dialog, destroying the action bar. Results must live in a `position:fixed` overlay
appended to `document.body`.

**New files/changes needed**:
- `event-types.js` — add `CREATE_SAMPLE_RESPONDED`
- `inject/hooks/create-request-capture.js` — make fetch wrapper async; after
  response, call `onResponse({correlationId, ok, status, bodyText})`
- `inject/main.js` — pass `onResponse` callback to `installCreateRequestCapture`
- `content/message-router.js` — route `CREATE_SAMPLE_RESPONDED` → `notifyCreateResponse()`
- `content/features/multi-position-sample-create/response-store.js` (new) —
  `waitForNextResponse(timeoutMs)` / `notifyCreateResponse(record)` (Promise-based, single pending slot)
- `content/features/multi-position-sample-create/init.js` — replace `runLiveTest` with `runCreateN`;
  add `findNativeSaveButton(dialog)`; floating results panel DOM
- `styles.js` — `.cdd-mp-float`, `.cdd-mp-result-row`, `.cdd-mp-ok/err`, `.cdd-mp-retry`
