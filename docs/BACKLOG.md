# Backlog

Ideas and requests that are understood but deliberately not built yet. Each
entry records what was already investigated, so picking it up does not mean
starting the research over.

Priority is about **when we would spend time on it**, not about how useful it
would be.

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
