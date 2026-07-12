# CDD Stoichiometric Table Tools

A free browser extension that makes everyday work in **CDD Vault** faster and
less fiddly. It adds small, practical helpers right onto the CDD pages you
already use — one-click copying, clearer sample data, printable stoichiometry
sheets, structure previews, batch sample creation, and more.

Everything happens **locally in your browser**: it runs only on CDD pages, has
no backend, collects no data, and never sends anything anywhere.

- 🧪 Built for medicinal-chemistry / ELN work on CDD Vault
- 🔒 No tracking, no accounts, no remote code
- 🌐 Works in Chrome and Firefox (142+)
- 📦 Current version **9.0.0** — see [what's new](./RELEASES.md)

**Install:**
[Chrome Web Store](https://chromewebstore.google.com/detail/cdd-stoichiometric-table/ghbhjmmmgejokgekdcbcmgcfaoddlffg)
· [Firefox Add-ons](https://addons.mozilla.org/en-GB/firefox/addon/cdd-stoichiometric-table-tools/)

---

## What it does

CDD Vault is powerful but generic, so routine lab work means a lot of manual
copying, re-typing stoichiometry values, and fighting default UI behaviour. This
extension layers small, targeted helpers onto the pages so the common things take
one click instead of several.

Here's the short version of everything it adds:

### 📋 Sample panel
- A floating, draggable panel that shows every sample in your ELN reaction table
  at a glance, grouped by reaction.
- **Click any value to copy it.** Concentrations are copied in a paste-ready,
  CDD-friendly format (e.g. µM/nM converted to mmol/L).
- Choose exactly which fields you want to see (name, location, purity, density,
  molecular weight, batch, owner, …) in the extension's settings.
- Automatically spots vault-specific custom fields and offers them too.
- Highlights low-purity and depleted samples, and remembers where you put the
  panel.

### 🖨️ Printing
- A print button on each reaction gives you a clean A4 stoichiometry sheet
  (masses, volumes, equivalents, yield, plus the reaction scheme).
- The sample panel can also print exactly the columns you've chosen.

### 🧫 Inventory & locations
- **Batch sample creation** — select several empty wells in the "Pick Location"
  grid and create all the samples at once, with a results panel showing what
  succeeded.
- **Structure preview** — hover an occupied well to see the molecule's structure
  and name.
- **Colour by prefix** — colour-code wells by sample-ID prefix so you can spot
  groups at a glance (colours chosen in settings).
- **Plate location tooltip** — hover a plate link to see where it physically
  lives (e.g. `Lab 2 > Fridge 2`).
- **Plate list locations** — the Plates tab gets a Location column that fills
  in automatically for every plate on the page.
- **Export plate locations** — download a CSV of every plate (from a search's
  Export dialog, or straight from the Plates tab) together with its inventory
  location.
- **Plate Map previews** — hover a well on a plate map or heat map to see the
  entity's synonym and structure; nearby wells preload in the background.
- **Four-column filter attribute picker** — the "Filter Entries" field selector
  opens as a wide popover split into Sample / Batch / Entity / Event columns with
  a ranked, accent-insensitive search that highlights matches, instead of one
  long narrow dropdown.
- **Column Manager** — "Select and reorder columns" gains a search (with fuzzy
  typing), category chips with counts, coloured type badges, a visible/total
  summary, and drag handles only on the columns you've actually selected.

### 🧬 Registration
- **Entity-type picklists in your order, defaulted to your last choice** — both
  the Create Entity form picker and the bulk-registration ("slurp") type list
  arrive in the order you set on the settings page and preselect the type you
  last used in that vault. They share one memory, so the two agree.

### 📈 Dose-response
- An "Easy Override" toggle in the search results lets you bulk-adjust
  dose-response curve calculations (set to max/min, skip, or don't overwrite) and
  writes the change straight back to CDD.

### ✨ Quality-of-life fixes
- One-click copy on molecule and batch fields, "Copy Link" on saved searches,
  smarter filter defaults, a resizable location-picker, collapsible
  consumed/depleted batches, and a handful of layout tidy-ups.

> For the full, detailed feature list see
> [`docs/FEATURE_CATALOG.md`](./docs/FEATURE_CATALOG.md).

---

## Installation

For most people: install from the store and you're done — open any CDD Vault page
and the helpers appear automatically.

- **Chrome:** [Chrome Web Store](https://chromewebstore.google.com/detail/cdd-stoichiometric-table/ghbhjmmmgejokgekdcbcmgcfaoddlffg)
- **Firefox:** [Firefox Add-ons](https://addons.mozilla.org/en-GB/firefox/addon/cdd-stoichiometric-table-tools/)

What changed in each version, in plain language:
[**What's new**](https://xaviersvk.github.io/CDD-Stoich-Tools/) — also linked from the
settings page and published as a GitHub Release per tag.

Settings (which fields show, prefix colours, tab-title mode, registration-form
order and default, …) live on the extension's own settings page. Open it by
clicking the extension icon, or from **CDD Plugin options** in CDD's user
dropdown. Most settings apply after you refresh the CDD page.

Developers who want to run it from source: see [For developers](#for-developers).

---

## What's new

See **[`RELEASES.md`](./RELEASES.md)** for a plain-language history of each
release — what changed and why it matters. The full technical changelog lives in
[`CHANGELOG.md`](./CHANGELOG.md).

## Feedback & bug reports

Found a bug, or want something added? Please open a
[**GitHub issue**](https://github.com/xaviersvk/CDD-Stoich-Tools/issues) — it's
the quickest way to get it seen.

---

# For developers

Everything below is for people building, maintaining, or extending the extension.
It's deliberately precise about file paths and data flow.

> **At a glance:** a **Manifest V3 browser extension** for the
> **Collaborative Drug Discovery (CDD) Vault** web app
> (`*.collaborativedrug.com`). No backend, no remote code — all logic is bundled
> locally with Vite. Runtime version `9.0.0` (`manifest.json`); targets Chrome
> (MV3) and Firefox (Gecko `strict_min_version: 142.0`); MIT licensed.

---

## Architecture

This is a **two-world** browser extension with **no backend, no service worker,
and no database**. The complexity lives in how the two in-browser worlds
cooperate.

### Frontend

There is no separate "frontend app" — the UI is injected directly into CDD's
pages by the **content script** (isolated world), plus the extension's
**options page** for settings.

```
src/
├── content/     content script  – isolated world, owns the DOM & extension UI
│   ├── features/    one folder/file per feature
│   ├── api/         cdd-api.js – authenticated fetch helper (CSRF + credentials)
│   ├── utils/       clipboard, dom, url, format, log helpers
│   ├── main.js          entry point: init() wires every feature
│   ├── message-router.js  receives inject→content messages into STATE
│   ├── state.js         in-memory STATE (last payload, flags, depleted IDs)
│   ├── inject-loader.js   injects the page script into the MAIN world
│   ├── url-watcher.js     SPA navigation detection
│   └── overlay-watcher.js Ketcher dialog detection
│
├── inject/      page script – MAIN world, hooks network & performs printing
│   ├── hooks/       fetch-hook.js, xhr-hook.js (monkey-patch network)
│   ├── parsers/     sample-data.js, print-data.js, field-resolvers.js, common.js
│   ├── print/       dispatcher.js (hidden-iframe printing)
│   ├── bus.js       post() → window.postMessage
│   └── main.js      installs hooks, parses payloads, posts results
│
├── options/     settings page (4 columns) – plain ES module, not bundled
│   └── options.html / options.js / options.css
│
├── background.js  opens the options page (toolbar icon + CDD menu entry)
│
└── shared/      code used by content, inject AND the options page
    ├── sample-panel-fields.js  field registry + settings + lifecycle
    ├── event-types.js          EVENT_SOURCE / EVENTS message tags
    ├── plugin-constants.js     PANEL_ID, reaction colors, inject path
    ├── prefix-colors.js        Sample ID prefix -> colour
    ├── registration-form.js    registration-form order + default
    └── page-detection.js       page predicates
```

**Content script (isolated world):** declared in `manifest.json` under
`content_scripts → assets/content.js`, injected at `document_idle` on
`*://*.collaborativedrug.com/*`. It can read/modify the DOM and use `chrome.*`
APIs, but it **cannot** see the page's own JS objects or its `window.fetch`.

**Inject script (MAIN world):** `assets/inject.js` is listed under
`web_accessible_resources`; the content script injects it as a `<script src>` so
it runs in the page's own JS context. This is the only place that can
monkey-patch `window.fetch` / `XMLHttpRequest` to observe CDD's API responses,
parse them, and post the results back.

The two halves communicate **only** through `window.postMessage` objects tagged
`source: "CDD_STOICH_TOOLS"` (`EVENT_SOURCE`). Either side ignores any message
without that tag.

```
   CDD server ──JSON──▶ [MAIN] fetch/xhr hooks ──▶ inject/main.js processJsonPayload()
                                                      ├─ REACTION_VISIBILITY
                                                      ├─ SAMPLE_DATA   ──postMessage──▶
                                                      └─ PRINT_DATA                    │
   [ISOLATED] message-router.js ◀──────────────────────────────────────────────────────┘
        └─ STATE ─▶ sample-panel.js renders panel / print buttons / depleted marks
        └─ PRINT_REQUEST {html} ──postMessage──▶ [MAIN] print/dispatcher.js → hidden iframe → print()
```

### Backend

**None.** The extension has no server component. The closest thing is
`src/content/api/cdd-api.js`, an authenticated `fetchJson` helper that talks to
**CDD's own API** (reusing the logged-in session) to PUT dose-response override
payloads and POST inventory samples.

### Database / storage

No database. Persistence uses browser storage only:

| Data | Mechanism |
| --- | --- |
| Field selection, ELN-title mode, discovered custom fields, prefix colors | `chrome.storage.local` (async) |
| Panel position / collapsed state, location-tree width | `localStorage` (page origin) |
| Last captured payload, runtime flags | in-memory `STATE` (lost on reload) |

### Authentication

No custom auth. Write-backs reuse **CDD's existing session cookies and CSRF
token** via `cdd-api.js` (`credentials: 'include'`). The extension never stores
credentials; it only acts within an already-authenticated CDD session.

### Deployment

Packaged as a static MV3 bundle (`dist/`) and distributed through browser stores
(see [Deployment](#deployment)). No servers to deploy.

> Deeper architecture: [`docs/ARCHITECTURE_REVIEW.md`](./docs/ARCHITECTURE_REVIEW.md)
> and [`docs/DATA_FLOW_DIAGRAMS.md`](./docs/DATA_FLOW_DIAGRAMS.md).

---

## Development Setup

### Required services

**None.** There is no server, database, or external service to run locally. You
only need a CDD Vault account and a CDD page open in the browser to exercise the
extension against real data.

### Prerequisites

- **Node.js** (reference env: 22.13.1) and **npm** (reference: 10.8.3)
- A Chromium browser (or Firefox `≥ 142.0`)
- The only build dependency is **Vite**.

### Local development

```bash
npm install          # installs vite (the only dependency)
npm run build        # builds content + inject into dist/ and copies options/shared
# or individually:
npm run build:content
npm run build:inject
```

`build` runs `build:content` then `build:inject`. **Order matters:**
`build:content` empties `dist/` and copies the static assets; `build:inject` has
`emptyOutDir: false`, so it adds `inject.js` without wiping the rest.

> There is **no `dev`/watch script and no test/lint/CI setup** — only production
> builds. Iterating means: rebuild, then reload the unpacked extension.

### Loading the extension (Chrome)

1. `npm run build`
2. Open `chrome://extensions`, enable **Developer mode**.
3. **Load unpacked** → select the `dist/` folder.
4. After code changes: `npm run build`, click the **reload** icon on the
   extension card, then refresh the CDD page.

The manifest's `browser_specific_settings.gecko` block means the same `dist/`
loads as a temporary add-on in Firefox.

### Build output

```
dist/
├── manifest.json          (copied from repo root)
├── assets/
│   ├── content.js         bundled content script (entry: src/content/main.js)
│   └── inject.js          bundled page script   (entry: src/inject/main.js)
├── background.js          copied from src/background.js (unbundled, no imports)
├── options/               copied verbatim from src/options/ (real ES module at runtime)
├── shared/                copied verbatim from src/shared/ (the options page imports it)
└── icons/                 copied from icons/
```

Both bundles use `inlineDynamicImports: true` and `minify: false` (readable
output). The options page is **not bundled** — that is why `src/shared/` is
copied into `dist/shared/` so its `import "../shared/sample-panel-fields.js"`
resolves. `background.js` is copied unbundled too, so it must stay
import-free.

> See also: [`docs/LEARNING_GUIDE.md`](./docs/LEARNING_GUIDE.md) for the
> extension concepts, and [`docs/ADDING_NEW_FIELDS.md`](./docs/ADDING_NEW_FIELDS.md)
> for the most common change (adding a panel field).

---

## Configuration

### Runtime settings (user-facing, via the options page)

| Setting | Storage key | Storage area | Used by |
| --- | --- | --- | --- |
| ELN tab title mode | `cddPluginElnTitleMode` | `chrome.storage.local` | `eln-title.js` |
| Sample-panel visible fields | `cddSamplePanelVisibleFields` | `chrome.storage.local` | `sample-panel.js` |
| Discovered custom fields (+`lastSeen`) | `cddSamplePanelCustomFields` | `chrome.storage.local` | options page + `sample-panel.js` |
| Registration-form names / order | `cddRegistrationFormNames` / `cddRegistrationFormOrder` | `chrome.storage.local` | `registration-form-default.js` |
| Registration-form default | `cddRegistrationFormMode` / `cddRegistrationFormFixedName` / `cddRegistrationFormLastUsed` | `chrome.storage.local` | `registration-form-default.js` |
| Prefix colors | `chrome.storage.local` | `chrome.storage.local` | `prefix-colors.js` + visualizations |
| Panel position / collapsed | `cdd-stoich-panel-state` | `localStorage` | `sample-panel.js` |
| Location-tree width | `cdd-location-picker-tree-width` | `localStorage` | `location-picker-resize.js` |

`cddSamplePanelVisibleFields` is a `{ key: boolean }` map; on read it is merged
over the registry defaults so new static fields appear automatically and custom
keys are preserved.

### Manifest configuration (`manifest.json`)

| Key | Value | Meaning |
| --- | --- | --- |
| `permissions` | `["storage"]` | Only `chrome.storage` — no host/tabs/scripting permissions. |
| `content_scripts.matches` | `*://*.collaborativedrug.com/*` | The extension runs **only** on CDD. |
| `web_accessible_resources` | `assets/inject.js` | The page script the content side injects. |
| `gecko.strict_min_version` | `142.0` | Minimum Firefox version. |
| `data_collection_permissions.required` | `["none"]` | No data collection / telemetry. |

### Environment variables

**None.** The extension has no environment variables, `.env` files, or runtime
configuration beyond the manifest and the browser-storage settings above. There
is no remote endpoint to configure — it always talks to the CDD origin the user
is already on.

### Adding a new setting

1. Pick a key + default, e.g. `const MY_KEY = "cddMyFeatureEnabled";`.
2. Add the control to `src/options/options.html`.
3. In `src/options/options.js`, load with
   `chrome.storage.local.get({ [MY_KEY]: false })` and save on `change`.
4. Consume it in the feature (optionally react live via
   `chrome.storage.onChanged`).
5. **Inject code cannot read `chrome.storage`** — pass values from the content
   side via `postMessage`, or gate the behaviour on the content side.

---

## Deployment

There are no servers; "deployment" means publishing the packaged extension.

### DEV (local / unpacked)

- `npm run build` → **Load unpacked** `dist/` in `chrome://extensions`, or load
  `dist/` as a temporary add-on in Firefox.
- Iterate by rebuilding and reloading. No staging server, no environment config.

### PROD (store releases)

1. `npm run build`.
2. **Bump `manifest.json`** to the release version (see the version note below).
3. Zip the **contents of `dist/`** (there is no packaging script in
   `package.json`).
4. Upload to the stores:
   - **Chrome Web Store:** <https://chromewebstore.google.com/detail/cdd-stoichiometric-table/ghbhjmmmgejokgekdcbcmgcfaoddlffg>
   - **Firefox Add-ons (AMO):** <https://addons.mozilla.org/en-GB/firefox/addon/cdd-stoichiometric-table-tools/>

> **Version note:** `manifest.json` is now `9.0.0` (see
> [`RELEASES.md`](./RELEASES.md) and the [CHANGELOG](./CHANGELOG.md)).
> `package.json` carries an unrelated `1.0.0` and is not used for the extension
> version. Published store builds may be ahead of or behind this source.

---

## Documentation Index

| Document | What it's for |
| --- | --- |
| [`README.md`](./README.md) | This file — overview, features, architecture, setup, deployment. |
| [`RELEASES.md`](./RELEASES.md) | Plain-language, human-readable release log. |
| [`CHANGELOG.md`](./CHANGELOG.md) | Full historical changelog reconstructed from git/tags/release notes. |
| [`DOCUMENTATION_AUDIT.md`](./DOCUMENTATION_AUDIT.md) | Audit of information sources, contradictions, and stale-doc recommendations. |
| [`docs/README.md`](./docs/README.md) | Documentation hub / reading order. |
| [`docs/ARCHITECTURE_REVIEW.md`](./docs/ARCHITECTURE_REVIEW.md) | Full architectural audit: boot sequence, two-world model, every significant file. |
| [`docs/DATA_FLOW_DIAGRAMS.md`](./docs/DATA_FLOW_DIAGRAMS.md) | Mermaid sequence + dependency diagrams of one CDD response → rendered panel. |
| [`docs/FEATURE_CATALOG.md`](./docs/FEATURE_CATALOG.md) | Complete feature inventory with value, data source, and regression risk. |
| [`docs/ADDING_NEW_FIELDS.md`](./docs/ADDING_NEW_FIELDS.md) | Step-by-step guide to adding a Sample-Panel field. |
| [`docs/LEARNING_GUIDE.md`](./docs/LEARNING_GUIDE.md) | Concepts course on browser-extension architecture, taught with this code. |
| [`docs/RELEASE_NOTES.md`](./docs/RELEASE_NOTES.md) | User-facing notes for the prepared `8.0.0` release. |

---

## Current Project Status

### Done (in the current `9.0.0` build)

- Floating, draggable, configurable **Sample Panel** with custom-field discovery,
  card warnings, and state persistence.
- Per-reaction **stoichiometry print sheets** and **panel print**.
- **ELN tab-title** override with three modes + options-page UI.
- **Dose-response "Easy Override"** writing back through CDD's API.
- **Batch sample creation** — select multiple empty wells in the Pick Location
  grid and create all samples in one click, gated behind CDD's own native save,
  with a per-position results panel and retry.
- **Prefix-based colors** — sample IDs grouped by prefix and colour-coded across
  the inventory box grid and visualizations; colours managed on the options page.
- **Inventory well structure tooltip** — molecule structure + synonym on hover in
  the Pick Location box, with per-molecule caching and idle prefetch.
- **Plate Inventory Location tooltip** — plate's inventory location on hover over
  plate links in the search results, fetched from the plate page and cached.
- **Plates list Location column** — the Explore Data → Plates table shows each
  plate's inventory location, streamed in per row from the shared cache.
- **Export Plate Locations (CSV)** — collapsed section in the Export dialog that
  downloads every plate across the whole result set with its inventory location,
  with large-set warning, progress and cancel; also available as a one-click
  link on the Plates tab that pages through the entire (optionally filtered)
  plate list.
- **Plate Map structure tooltip** — synonym + rendered structure bubble when
  hovering wells on plate maps and heat maps, with ±2 neighbour prefetch.
- **Depleted-sample** marking; **consumed-batches** collapse.
- **Saved-search Copy Link**; the full bundle of CSS/DOM **UI fixes**.
- Shared field registry, unified clipboard helper, and standardised `EVENTS`
  message names (the `8.0.0` clean-up — see CHANGELOG).

### Known limitations

- **Settings apply after a page refresh**, not instantly in an open tab.
- **Custom fields appear only after data loads** — a vault field is discovered
  only once you open an ELN reaction containing it.
- **Panel needs captured data** — it shows on ELN entry pages with a reaction
  table once CDD's data has loaded; otherwise "Waiting for reaction data…". It is
  hidden while the Ketcher structure editor is open.
- **Field detection is best-effort** — values are read by known field
  names/locations; an unexpectedly named/nested field is simply not shown.
- **No automated tests** — CDD-shape changes may need a manual check.
- **Version metadata split** — `manifest.json` is `9.0.0` while `package.json`
  remains an unrelated `1.0.0` (build-only metadata), and the legacy
  `7.7.0`/`v7.7.0` tags remain in git history — see
  [`DOCUMENTATION_AUDIT.md`](./DOCUMENTATION_AUDIT.md) §3.
- **Observer sprawl** — ~10 always-on `MutationObserver`s on `document.body`
  (`subtree: true`) across features, with no central manager or teardown — a
  standing CPU cost on a busy SPA.

### Privacy & security

No remote code is executed; all logic is bundled locally with Vite. The manifest
declares `data_collection → none` and requests only the `storage` permission. The
extension acts strictly within the user's existing CDD session.

---

## License

[MIT](./LICENSE).
