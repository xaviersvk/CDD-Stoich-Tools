# M0 — Multi-position Sample Create: Request-Replay Contract

> Status: **DRAFT — not yet verified against real CDD traffic.** Items marked
> ⛔ MUST be confirmed from a real create request before any POST code (M3) is
> written. This document is the "lock the contract" deliverable for M0.

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

## 2. fetch vs XHR — ⛔ MUST VERIFY

The create form is Rails `data-remote="true"`. Depending on CDD's stack this is
either:

- **rails-ujs** → `XMLHttpRequest` (body = `FormData`), or
- **Turbo** → `fetch` (body = `FormData`).

The page loads Turbo (`turbo-*` meta tags) *and* legacy `application.js`, so we
cannot assume. The existing inject layer already hooks **both** `fetch`
(`hooks/fetch-hook.js`) and `XHR` (`hooks/xhr-hook.js`) — so capture can cover
both with one code path per hook. **Determine which one fires** for this exact
form using the probe in §7, and confirm the body type.

## 3. The two values to change — ⛔ CONFIRM EXACT KEYS

From the pasted single-sample response, the location is echoed as
`location.id` / `location.position` and lives on the inventory **event**. In the
request body the expected keys (array indices to confirm) are:

```
inventory_sample[inventory_events_attributes][0][fields_attributes][N][inventory_location_id]
inventory_sample[inventory_events_attributes][0][fields_attributes][N][inventory_location_position]
```

(The "Add a sample" form for an existing batch posts to
`POST /vaults/{vault}/molecules/{molecule}/inventory_samples`; the "Add batch +
create sample" form posts to `…/specified_batches` and nests the same keys under
`new_specified_batch[inventory_samples_attributes][0]…`.)

The replay finds these keys **by suffix** (`endsWith("[inventory_location_id]")`
/ `endsWith("[inventory_location_position]")`) — **not** by a hardcoded index —
so it works for either form and survives index changes.

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

⛔ Open decisions to confirm from real data:

- **Box id source.** Is the selected tree node's `data-nodeid` equal to
  `inventory_location_id` (`1000001682` in the sample)? If yes, the framework's
  `getBoxId()` is usable directly. If not, take the id from the **captured
  request body** (the value CDD itself wrote) and only vary `position` — safer,
  and the recommended default regardless. **On any detected mismatch: hard
  stop, do not guess.**
- **Unique fields.** Does the body carry a concrete `*Sample ID` / `Barcode`, or
  are they blank/server-assigned (`next_identifier` suggests server-assigned)?
  If a concrete unique value is present, replays will collide after #1 — M5 must
  warn before POSTing. ⛔ confirm from the cURL.

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

## 8. Still-required real-CDD data (gates M3)

1. Copy-as-cURL / Copy-as-fetch of one real create request.
2. The serialized body (or the probe output from §7).
3. outerHTML of the create form containing the picker.
4. outerHTML of: one empty `.box-position-element`, one filled one, and the
   `.LocationBoxPicker .positions` parent.
5. Confirm `data-nodeid` == `inventory_location_id` (or decide to take id from
   the captured body, §6).
6. Box-occupancy request/response (for the empty-vs-filled cross-check).
7. Screenshot of the create form + picker placement.

Until 1–5 are answered, **stop after M2** (capture + dry-run preview); do not
ship replay/POST.
