# CDD Stoichiometric Table Tools

A **Manifest V3 browser extension** that adds quality-of-life tooling on top of
the **Collaborative Drug Discovery (CDD) Vault** web app
(`*.collaborativedrug.com`). It runs only on CDD pages, has **no backend**, and
executes **no remote code** — all logic is bundled locally with Vite.

- **Runtime version:** `8.2.0` (from `manifest.json`)
- **Latest release:** `8.2.0` (see [CHANGELOG](./CHANGELOG.md))
- **Targets:** Chrome (MV3) + Firefox (Gecko `strict_min_version: 142.0`)
- **License:** MIT

> This README is written for three audiences at once: **new users** (what it
> does, how to install), **new developers** (architecture, setup, how to extend),
> and **AI agents** (precise file paths, data flow, and explicit "what is NOT in
> the project" notes so you don't hallucinate functionality).

---

## Project Overview

### What it solves

CDD Vault is a powerful but generic ELN / registration / inventory system.
Day-to-day medicinal-chemistry work on it involves a lot of manual copying,
re-typing of stoichiometry values, and fighting with default UI behaviours. This
extension layers small, targeted helpers directly onto the CDD pages so common
tasks become one click instead of several.

Its flagship feature is a floating **ELN Sample Panel** that reads the
stoichiometry data CDD loads in the background and surfaces the relevant
sample / batch / molecule attributes in one draggable, configurable box with
copy-on-click values and a print view.

### Who it is for

- **Bench chemists / ELN users** on CDD Vault who want faster copy/paste, clearer
  sample data, and printable stoichiometry sheets.
- **Lab data managers** who deal with depleted samples, saved searches, and
  dose-response curve overrides.
- **Developers / AI agents** maintaining or extending the extension.

### Main use cases

- See every sample in an ELN reaction table at a glance, grouped by reaction,
  with low-purity / depleted warnings.
- Copy a **paste-ready, normalised concentration** straight back into CDD.
- Print a per-reaction A4 stoichiometry sheet (with the reaction scheme image).
- Override dose-response curve calculations in bulk from the search results.
- Preview the **molecule structure + synonym** when picking an inventory location.
- Avoid picking depleted samples; collapse consumed batches; copy saved-search
  links; and smooth over a set of CDD DOM/CSS rough edges.

---

## Key Features

Every feature is a content-script module under `src/content/features/`. Features
that need data from CDD's API responses get it from the **inject** script (see
[Architecture](#architecture)).

### Sample Panel

| Feature | What it does | Main files |
| --- | --- | --- |
| **Floating ELN Sample Panel** | Draggable, collapsible panel listing every sample in the ELN reaction/stoichiometry tables, grouped by reaction, with copy-on-click values. | `features/sample-panel.js`, `shared/sample-panel-fields.js` |
| **Configurable fields** | Popup lets you choose which attributes show (Name, Location, Purity, Internal ID, Density, Concentration, Solvent, Molecular/Formula weight, Batch name, Vendor ID, Owner, Amount, Volume). | `shared/sample-panel-fields.js`, `popup/popup.js` |
| **Custom-field discovery** | Vault-specific batch/sample fields (e.g. `*Hygroscopic`) are auto-discovered from CDD's data and offered as checkboxes; unused custom fields expire after a 120-day "last seen" lifecycle. | `shared/sample-panel-fields.js`, `features/sample-panel.js` |
| **Card warnings** | Low-purity badge, depleted badge, and red border, computed independently of the field config. | `features/sample-panel.js` |
| **Panel state persistence** | Position + collapsed state remembered between visits. | `features/sample-panel.js` |
| **Normalised concentration copy** | Clicking a concentration copies a CDD-ready value (µM/nM converted to mmol/L, etc.). | `shared/sample-panel-fields.js` |

### ELN enhancements

| Feature | What it does | Main files |
| --- | --- | --- |
| **ELN tab-title override** | Rewrites the browser tab title on ELN pages. Three modes: original, ELN title only, or `EntryID - ELN title` (default). | `features/eln-title.js` |
| **Depleted-sample marker** | Greys out / strikes through depleted samples in radio-button sample selectors. | `features/depleted-marker.js` |

### Printing

| Feature | What it does | Main files |
| --- | --- | --- |
| **Per-reaction stoichiometry sheet** | Print icon on each reaction block → formatted A4 sheet (FW/exact mass/density, mass/volume, equivalents/mole/yield, scheme image). | `features/print-buttons.js`, `inject/parsers/print-data.js`, `inject/print/dispatcher.js` |
| **Panel print** | Panel's "Print" button builds a table from exactly the enabled columns (skipping empty ones). | `features/panel-print.js` |

### Dose-response tools

| Feature | What it does | Main files |
| --- | --- | --- |
| **Easy Override** | "Easy Override: ON/OFF" toggle in the search-results bar; each plot gets an inline menu (`> Max`, `< Min`, `Do not calculate`, `Do not overwrite`) that PUTs an intercept-override payload back to CDD. | `features/dose-response-override/`, `content/api/cdd-api.js` |

### Saved searches

| Feature | What it does | Main files |
| --- | --- | --- |
| **Copy Link** | Adds a "Copy Link" action to each saved-search row on `/searches`. | `features/savedSearchCopyLinks/savedSearchCopyLinks.js` |

### Inventory

| Feature | What it does | Main files |
| --- | --- | --- |
| **Well structure tooltip** | In the "Pick Location" box view, hovering an occupied well adds the molecule structure image + first synonym to CDD's native tooltip. The molecule/vault id is read from the tooltip's molecule link; the SMILES is pulled from the molecule page and rendered to inline SVG client-side (`smiles-drawer`). Cached per molecule (incl. negatives) with a token race-guard; opening a box pre-warms every well's structure on idle (concurrency-capped). | `features/ui-fixes/inventory-well-structure.js`, `api/molecule-image.js`, `api/structure-render.js`, `inject/main.js` |

### UI fixes (CSS/DOM)

| Module | What it fixes |
| --- | --- |
| `file-dialog-fixes.js` | Wraps long file-preview links; widens the file dialog; pins the "associate file" button bar. |
| `copyable-fields.js` | Makes molecule overview/property/batch field values click-to-copy. |
| `left-ellipsis-locations.js` | Left-truncates long location strings (RTL trick) in sample tables. |
| `filter-default.js` | Auto-selects the second filter operator instead of "Any value" (ELN + Inventory). |
| `location-picker-resize.js` | Draggable resizer on the location-picker tree (width saved in `localStorage`). |
| `molecule-links-fixes.js` | Lays out `#molecule-links` as a responsive multi-column grid. |
| `consumed-batches-collapse.js` | Collapses consumed batches on the molecule batches page. |

---

## Architecture

This is a **two-world** browser extension with **no backend, no service worker,
and no database**. The complexity lives in how the two in-browser worlds
cooperate.

### Frontend

There is no separate "frontend app" — the UI is injected directly into CDD's
pages by the **content script** (isolated world) plus the extension **popup**.

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
├── popup/       extension popup (settings UI) – plain ES module, not bundled
│   └── popup.html / popup.js / popup.css
│
└── shared/      code used by content, inject AND popup
    ├── sample-panel-fields.js  field registry + settings + lifecycle
    ├── event-types.js          EVENT_SOURCE / EVENTS message tags
    ├── plugin-constants.js     PANEL_ID, reaction colors, inject path
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
payloads.

### Database / storage

No database. Persistence uses browser storage only:

| Data | Mechanism |
| --- | --- |
| Field selection, ELN-title mode, discovered custom fields | `chrome.storage.local` (async) |
| Panel position / collapsed state, location-tree width | `localStorage` (page origin) |
| Last captured payload, runtime flags | in-memory `STATE` (lost on reload) |

### Authentication

No custom auth. Dose-response writes reuse **CDD's existing session cookies and
CSRF token** via `cdd-api.js` (`credentials: 'include'`). The extension never
stores credentials; it only acts within an already-authenticated CDD session.

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
npm run build        # builds content + inject into dist/ and copies popup/shared
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
├── popup/                 copied verbatim from src/popup/  (real ES module at runtime)
├── shared/                copied verbatim from src/shared/ (popup imports it)
└── icons/                 copied from icons/
```

Both bundles use `inlineDynamicImports: true` and `minify: false` (readable
output). The popup is **not bundled** — that is why `src/shared/` is copied into
`dist/shared/` so the popup's `import "../shared/sample-panel-fields.js"`
resolves.

> See also: [`docs/LEARNING_GUIDE.md`](./docs/LEARNING_GUIDE.md) for the
> extension concepts, and [`docs/ADDING_NEW_FIELDS.md`](./docs/ADDING_NEW_FIELDS.md)
> for the most common change (adding a panel field).

---

## Configuration

### Runtime settings (user-facing, via the popup)

| Setting | Storage key | Storage area | Used by |
| --- | --- | --- | --- |
| ELN tab title mode | `cddPluginElnTitleMode` | `chrome.storage.local` | `eln-title.js` |
| Sample-panel visible fields | `cddSamplePanelVisibleFields` | `chrome.storage.local` | `sample-panel.js` |
| Discovered custom fields (+`lastSeen`) | `cddSamplePanelCustomFields` | `chrome.storage.local` | popup + `sample-panel.js` |
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
2. Add the control to `src/popup/popup.html`.
3. In `src/popup/popup.js`, load with
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

> **Version note:** `manifest.json` is now `8.0.0` (see
> [`docs/RELEASE_NOTES.md`](./docs/RELEASE_NOTES.md) and the
> [CHANGELOG](./CHANGELOG.md)). `package.json` carries an unrelated `1.0.0` and is
> not used for the extension version. Published store builds may be ahead of or
> behind this source.

---

## Documentation Index

| Document | What it's for |
| --- | --- |
| [`README.md`](./README.md) | This file — overview, features, architecture, setup, deployment. |
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

### Done (in the current `8.2.0` build)

- Floating, draggable, configurable **Sample Panel** with custom-field discovery,
  card warnings, and state persistence.
- Per-reaction **stoichiometry print sheets** and **panel print**.
- **ELN tab-title** override with three modes + popup UI.
- **Dose-response "Easy Override"** writing back through CDD's API.
- **Inventory well structure tooltip** — molecule structure + synonym on hover in
  the Pick Location box, with per-molecule caching and idle prefetch.
- **Depleted-sample** marking; **consumed-batches** collapse.
- **Saved-search Copy Link**; the full bundle of CSS/DOM **UI fixes**.
- Shared field registry, unified clipboard helper, and standardised `EVENTS`
  message names (the `8.0.0` clean-up — see CHANGELOG).

### In progress / follow-ups

- **`8.0.0` is bumped in `manifest.json`** and documented in
  `docs/RELEASE_NOTES.md`; the source is release-ready. A clean git tag should
  still be cut for it.
- The legacy `v7.7.0` tag points at a **non-building** commit (missing
  `shared/sample-panel-fields.js`); re-tag from a building commit (`b1c9f3c` or
  later) before relying on it.

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
- **Version metadata split** — `manifest.json` is `8.0.0` while `package.json`
  remains an unrelated `1.0.0` (build-only metadata), and the legacy
  `7.7.0`/`v7.7.0` tags remain in git history — see
  [`DOCUMENTATION_AUDIT.md`](./DOCUMENTATION_AUDIT.md) §3.
- **Observer sprawl** — ~10 always-on `MutationObserver`s on `document.body`
  (`subtree: true`) across features, with no central manager or teardown — a
  standing CPU cost on a busy SPA.

> Resolved 2026-06-16: the duplicate `isElnEntryPage` (unified on the strict
> regex in `shared/page-detection.js`), the hard-coded panel id in
> `overlay-watcher.js` (now uses `PANEL_ID`), and a redundant file-dialog
> observer in `main.js` (removed).

### Privacy & security

No remote code is executed; all logic is bundled locally with Vite. The manifest
declares `data_collection → none` and requests only the `storage` permission. The
extension acts strictly within the user's existing CDD session.

---

## License

[MIT](./LICENSE).
