# Learning Guide: Browser-Extension Architecture (taught with a real project)

> **Goal:** teach you how browser extensions are built. This project
> (CDD Stoich Tools) is the *teaching aid* — every concept is illustrated with
> real code from it. This is **not** documentation of the project; it is a
> concepts course that happens to use working examples.
>
> Read it top to bottom. Each subsystem follows the same shape:
> **Problem → Why this way → This project's example → Alternatives → Pros & cons.**

---

## The big picture first: what *is* a browser extension?

A browser extension is a small bundle of web technologies (HTML/CSS/JS) plus a
**manifest** that the browser loads with **extra privileges** a normal web page
doesn't have. The browser runs your code in several **separate contexts**, each
with different powers:

```
┌─────────────────────────────────────────────────────────────┐
│  The browser                                                 │
│                                                              │
│   ┌──────────────┐   ┌───────────────────────────────────┐  │
│   │  Popup page  │   │  A web tab (e.g. a CDD page)        │  │
│   │ (your HTML)  │   │  ┌─────────────┐  ┌──────────────┐  │  │
│   └──────────────┘   │  │ Page's own  │  │ Your content │  │  │
│                      │  │ JS (MAIN    │  │ script       │  │  │
│   ┌──────────────┐   │  │ world)      │  │ (ISOLATED    │  │  │
│   │ Service      │   │  └─────────────┘  │ world)       │  │  │
│   │ worker (bg)  │   │                   └──────────────┘  │  │
│   └──────────────┘   └───────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

The central skill in extension development is knowing **which context has which
power**, and **how to move data between them**. Almost every design decision in
this project is an answer to that question.

> This project deliberately uses **no service worker / background page** — it
> doesn't need one. We'll cover the contexts it *does* use: content script, page
> script, popup, plus the glue (`postMessage`, `MutationObserver`,
> `chrome.storage`), the `manifest.json` that declares them, and the Vite build
> that produces them.

---

## 1. Content scripts

### Problem
You want to add UI and behaviour to **someone else's website** (here, CDD Vault).
You don't control that site's code. How do you run *your* JavaScript on *their*
pages, with access to the DOM **and** to extension APIs?

### Why this way
The browser injects a **content script** into matching pages. It runs in an
**isolated world**: it shares the page's DOM, but it gets its **own** JavaScript
global scope, and — crucially — access to a subset of `chrome.*` extension APIs.
The isolation is a security feature: the page can't reach into your script's
variables, and your script can't accidentally collide with the page's globals.

### This project's example
`manifest.json` declares where and when the content script runs:

```jsonc
"content_scripts": [{
  "matches": ["*://*.collaborativedrug.com/*"],
  "js": ["assets/content.js"],
  "run_at": "document_idle"
}]
```

`src/content/main.js` is the entry point. Its `init()` is the whole extension's
wiring, guarded so it only runs on the right host and only once:

```js
function init() {
  if (!isSupportedHost()) return;
  if (window.__CDD_STOICH_TOOLS_CONTENT__) return;   // double-init guard
  window.__CDD_STOICH_TOOLS_CONTENT__ = true;

  injectPageScript();           // load the page script (subsystem 2)
  window.addEventListener("message", handleMessage);  // listen for its data
  ensurePanel();                // build UI
  // … wire up every feature …
}
init();
```

The content script can build DOM (`ensurePanel` creates the floating box) **and**
use `chrome.storage` — both powers in one place.

### Alternatives
- **A userscript (Tampermonkey/Greasemonkey):** similar injection, but no
  `chrome.*` APIs (no `chrome.storage`, no popup, no web-store distribution).
- **A bookmarklet / devtools snippet:** manual, per-session, no persistence.
- **Asking the site owner to add your feature:** not possible for third-party
  tooling.

### Pros & cons
| Pros | Cons |
| --- | --- |
| Runs automatically on matching pages | Cannot see the page's own JS objects/`fetch` (that's subsystem 2's job) |
| Has DOM access **and** extension APIs | Lives as long as the page; you must survive SPA re-renders yourself (subsystem 4) |
| Isolated → no global collisions with the host site | Limited subset of `chrome.*` (e.g. no `chrome.tabs`) |
| Easy to distribute via the web store | `run_at` timing matters — too early and the DOM isn't ready |

---

## 2. Page scripts (a.k.a. "inject" scripts / MAIN world)

### Problem
The content script's isolation has a cost: it **cannot** see the page's own
JavaScript. In this project we need to read the JSON that CDD downloads via its
own `fetch`/`XHR`. But the content script's `window.fetch` is a *different
object* than the page's `window.fetch` — patching it does nothing. How do you run
code in the **page's** world?

### Why this way
You inject a `<script src=...>` tag pointing at a bundle the browser is allowed
to serve. A script loaded that way executes in the **MAIN world** — the same
world as the site's code — so it *can* monkey-patch the page's `fetch`/`XHR`. This
is the standard "page script" / "injected script" pattern. It's the **only** way
to observe the host page's network calls or JS objects.

### This project's example
The bundle must be declared web-accessible in `manifest.json`:

```jsonc
"web_accessible_resources": [{
  "resources": ["assets/inject.js"],
  "matches": ["*://*.collaborativedrug.com/*"]
}]
```

The content script injects it (`src/content/inject-loader.js`):

```js
const script = document.createElement("script");
script.src = chrome.runtime.getURL("assets/inject.js");  // becomes a page-world script
script.onload = () => script.remove();
(document.head || document.documentElement).appendChild(script);
```

Now in the MAIN world, `src/inject/hooks/fetch-hook.js` can wrap the *real*
`fetch`:

```js
const origFetch = window.fetch;
window.fetch = async function (...args) {
  const res = await origFetch.apply(this, args);
  const clone = res.clone();                 // read the body without consuming it
  processJsonPayload(await clone.json());    // ← we can see CDD's data now
  return res;                                // give the page its untouched response
};
```

Note the discipline: it **clones** the response so the page still receives its
original body, and it never blocks the page's request.

### Alternatives
- **`world: "MAIN"` in the manifest content-script entry (MV3):** declares a
  content script that runs directly in the MAIN world — no manual `<script>`
  injection. Newer, cleaner, but it can't use `chrome.*` and browser support /
  timing differs; this project uses the classic inject pattern for control and
  Firefox compatibility.
- **`chrome.debugger` / DevTools protocol:** can observe network globally, but
  it's heavyweight, shows a warning bar, and is not for production UX.
- **Polling the DOM** for already-rendered values instead of the network: brittle
  and incomplete (the panel needs structured data CDD never fully renders).

### Pros & cons
| Pros | Cons |
| --- | --- |
| The only way to read the page's own `fetch`/JS | No `chrome.*` access — can't read `chrome.storage` |
| Runs with the site's privileges/context | Must communicate back via `postMessage` (subsystem 3) |
| Keeps brittle "page-shape" code in one place | Monkey-patching is invasive — be careful not to change behaviour |
| Lets you keep window-level side effects (printing) in the page | Loads as a separate bundle you must ship + declare web-accessible |

> **Design takeaway from this project:** the split is *responsibility-driven*.
> The page script does only what *requires* the page world (sniff network, print
> via `window.print`); everything else stays in the content script. See
> `ARCHITECTURE_REVIEW.md` §3.

---

## 3. window.postMessage (cross-world communication)

### Problem
The content script (isolated) and the page script (MAIN) share a DOM but **cannot
call each other's functions**. You need a channel to pass the parsed data from
the page world back to the content world (and print requests the other way).

### Why this way
Both worlds share the same `window`, and `window.postMessage` delivers a message
event that *both* can listen to. It's the canonical bridge between worlds. Because
*any* script (including the host page or other extensions) can post messages, you
must **tag and validate** every message so you only react to your own.

### This project's example
A single source tag (`src/shared/event-types.js`):

```js
export const EVENT_SOURCE = "CDD_STOICH_TOOLS";
export const EVENTS = { REACTION_VISIBILITY:"…", SAMPLE_DATA:"…", PRINT_DATA:"…", PRINT_REQUEST:"…" };
```

Page world posts (`src/inject/bus.js`):

```js
export function post(type, payload) {
  window.postMessage({ source: EVENT_SOURCE, type, payload }, "*");
}
```

Content world receives and **validates** (`src/content/message-router.js`):

```js
export function handleMessage(event) {
  if (event.source !== window) return;                 // not from this window
  const data = event.data;
  if (!data || data.source !== EVENT_SOURCE) return;   // not ours → ignore
  switch (data.type) {
    case EVENTS.SAMPLE_DATA: STATE.lastPayload = data.payload; renderFromState(); break;
    // …
  }
}
```

The reverse direction (content → page) uses the same pattern for printing:
`panel-print.js` posts `PRINT_REQUEST`, and `inject/print/dispatcher.js` listens
for it in the page world.

### Alternatives
- **`CustomEvent` on `document`:** also works cross-world; similar tagging needs.
- **`chrome.runtime.sendMessage` / ports:** for content ↔ background/popup, **not**
  for content ↔ page (the page world has no `chrome.runtime`).
- **Shared DOM (a hidden element's attribute/text):** hacky, racy, discouraged.
- **`MessageChannel` ports:** more structured, but overkill for one-directional
  broadcasts.

### Pros & cons
| Pros | Cons |
| --- | --- |
| Works across the world boundary, no shared scope needed | Global broadcast — *anyone* can post/listen, so you must tag + validate |
| Simple, serializable JSON messages | Data is structured-cloned (no functions/DOM nodes) |
| Decouples producer and consumer | No built-in request/response (you design your own message types) |
| One tag (`EVENT_SOURCE`) cleanly ignores noise | Easy to leak listeners if you're not careful |

> **Common beginner bug this project avoids:** forgetting `event.source !==
> window` / the source tag, then reacting to the host page's own messages.

---

## 4. MutationObserver (surviving a single-page app)

### Problem
Modern sites (CDD included) are **single-page apps**: they swap DOM in and out
without a full page reload, and they change the URL via the History API. A content
script that paints **once** will be wiped or left stale the moment the user
navigates or the page re-renders. How do you keep your UI applied?

### Why this way
`MutationObserver` lets you react to DOM changes (nodes added/removed, attributes
changed) efficiently and asynchronously, instead of polling on a timer. The
pattern is: observe a container, and **re-apply** your enhancement whenever
relevant mutations happen — usually **debounced** so a burst of mutations triggers
one re-apply, not hundreds.

### This project's example
The depleted-sample marker re-applies on every DOM change, debounced with
`requestAnimationFrame` (`src/content/features/depleted-marker.js`):

```js
export function startDepletedMarkerObserver() {
  if (window[OBSERVER_KEY]) return;           // start once
  let scheduled = false;
  const rerun = () => {
    if (scheduled) return;                     // debounce: collapse a burst…
    scheduled = true;
    requestAnimationFrame(() => {              // …into one run next frame
      scheduled = false;
      markDepletedSamplesInSelector();
    });
  };
  const observer = new MutationObserver(rerun);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window[OBSERVER_KEY] = observer;
  rerun();
}
```

Some features narrow the scope with an `attributeFilter` to cut noise
(`consumed-batches-collapse.js`):

```js
observer.observe(document.body, {
  childList: true, subtree: true,
  attributes: true, attributeFilter: ["class"],   // only react to class changes
});
```

For **URL** changes specifically, `url-watcher.js` combines an observer with a
700 ms `setInterval` fallback — a pragmatic belt-and-braces for History-API
navigation that doesn't always mutate the DOM observably.

### Alternatives
- **`setInterval` polling:** simple, but wastes CPU and is laggy; this project
  uses it only as a *fallback* for URL detection.
- **Hooking the History API** (`pushState`/`replaceState` + `popstate`): precise
  for navigation, but doesn't catch in-place re-renders.
- **Framework lifecycle hooks:** unavailable — you don't own the host app.

### Pros & cons
| Pros | Cons |
| --- | --- |
| Event-driven, far cheaper than polling | Fires *a lot* — you must debounce or you'll thrash |
| Granular (`childList`/`attributes`/`subtree`/filters) | Broad `document.body` + `subtree:true` observers add constant cost |
| The reliable way to survive SPA re-renders | No automatic teardown — observers live forever unless you `disconnect()` |
| Lets each feature be self-healing | Easy to start duplicates; guard with a "started" flag |

> **Trade-off this project shows (and pays for):** ~12 observers run at once with
> no central manager or teardown. It works, but it's the project's main
> performance debt — see `ARCHITECTURE_REVIEW.md` §8 and the recommended
> "observer registry" in §10. As a learner, notice both the pattern *and* its
> cost.

---

## 5. chrome.storage (persisting settings)

### Problem
Settings chosen in the popup (which fields to show, the tab-title mode) must
**persist** across sessions and be **shared** between the popup and the content
script — which are different contexts that can't share variables.

### Why this way
`chrome.storage.local` is an **async**, extension-wide key/value store available
in content scripts and the popup (but **not** the page/MAIN world). It also emits
`onChanged` events, so one context can **react live** when another writes — perfect
for "popup writes a setting, content script re-renders."

### This project's example
The shared registry reads/writes the visible-field map
(`src/shared/sample-panel-fields.js`):

```js
export async function getSamplePanelSettings() {
  const defaults = getDefaultVisibleFields();
  const result = await chrome.storage.local.get(SAMPLE_PANEL_SETTINGS_KEY);
  const stored = result?.[SAMPLE_PANEL_SETTINGS_KEY];
  if (!stored) return defaults;
  return { ...defaults, .../* merge only booleans */ };   // new fields appear automatically
}
```

The content panel subscribes to changes and re-renders
(`sample-panel.js initSamplePanelFields`):

```js
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[SAMPLE_PANEL_SETTINGS_KEY]) {
    getSamplePanelSettings().then((map) => { visibleFields = map; renderFromState(); });
  }
});
```

Two subtle, instructive choices in this project:
- **Defaults are merged over stored values** so adding a new field doesn't require
  a data migration — it just shows up with its `defaultEnabled`.
- **Discovered custom fields use a *different* key** than the on/off settings, so
  saving discoveries doesn't trigger the settings `onChanged` listener (which
  would cause a render loop). A great example of *why* you partition storage keys.

Contrast: panel **position** is stored in plain `localStorage`
(`"cdd-stoich-panel-state"`), because it's content-only and synchronous and never
needs to reach the popup. Choosing the right store is part of the skill.

### Alternatives
- **`localStorage`:** synchronous, simple, but **per-origin** (not shared with the
  popup's extension origin) and content-only. Good for content-only UI state.
- **`chrome.storage.sync`:** like `.local` but synced across the user's browsers
  (small quota). Use for portable preferences.
- **`IndexedDB`:** for large/structured data; overkill for a few flags.
- **A background service worker holding state:** unnecessary here (no background
  page).

### Pros & cons
| Pros | Cons |
| --- | --- |
| Shared across popup + content; survives sessions | **Async** (Promise/callback) — easy to forget |
| `onChanged` enables live cross-context updates | **Not** available in the page/MAIN world |
| Bigger quota than `localStorage`; structured values | Slightly more ceremony than `localStorage` |
| `.sync` variant for cross-device | A careless shared key can cause update loops (this project avoids it deliberately) |

---

## 6. Popup pages (the toolbar UI)

### Problem
You need a small settings UI the user opens from the toolbar icon — separate from
any web page, with its own HTML/CSS/JS.

### Why this way
The manifest's `action.default_popup` points at an HTML file. The browser renders
it as a tiny, self-contained page in the **extension's own origin** with access to
`chrome.*`. It's just a web page — you build it with normal DOM APIs.

### This project's example
Declared in `manifest.json`:

```jsonc
"action": { "default_title": "CDD Stoich Tools", "default_popup": "popup/popup.html" }
```

`popup.html` loads its logic as an **ES module** and renders checkboxes from the
shared registry (`popup.js`):

```js
import { SAMPLE_PANEL_FIELDS, getSamplePanelSettings, saveSamplePanelSettings }
  from "../shared/sample-panel-fields.js";

for (const field of SAMPLE_PANEL_FIELDS) {
  fieldListEl.appendChild(createFieldCheckbox(field, !!visibleMap[field.key], onToggle));
}
```

A neat detail with a real consequence: the popup is **not bundled** by Vite — it
is copied verbatim and imports `../shared/...` at runtime. That's *why* the build
also copies `src/shared/` into `dist/shared/` (see subsystem 8). The popup shares
the **exact same** field registry as the content panel, so the checkboxes and the
rendered rows can never drift apart.

### Alternatives
- **An options page** (`options_ui`): a full-tab settings page for bigger UIs.
- **In-page settings UI** (inside the content script): keeps everything on the
  page, but clutters the host site and can't be opened without visiting it.
- **A bundled popup** (run it through the build): also fine; this project chose
  verbatim copy to keep a single shared module at runtime.

### Pros & cons
| Pros | Cons |
| --- | --- |
| Familiar: it's just HTML/CSS/JS | Ephemeral — closes on blur; no long-lived state of its own |
| Has `chrome.*` (e.g. `chrome.storage`) | Separate context from content — communicate via storage/messaging |
| Clean place for settings, away from the host page | Tiny viewport; not for complex UIs (use an options page) |
| Can share modules with content (as here) | Changes apply to the page only after it re-renders/refreshes |

---

## 7. manifest.json (the contract with the browser)

### Problem
The browser needs to know, before running anything: what is this extension, what
pages may it touch, what files run where, what permissions does it need, and which
files may the page load. Code alone can't declare that safely.

### Why this way
The `manifest.json` is a **declarative contract**. The browser reads it, shows the
user the requested permissions, and wires up the contexts accordingly. **Manifest
V3** (current) tightened security: remote code is disallowed, background pages
became service workers, etc.

### This project's example (annotated)
```jsonc
{
  "manifest_version": 3,
  "name": "CDD Stoichiometric Table Tools",
  "version": "7.7.0",
  "permissions": ["storage"],                       // only what it needs → chrome.storage
  "action": { "default_popup": "popup/popup.html" },// subsystem 6
  "content_scripts": [{                              // subsystem 1
    "matches": ["*://*.collaborativedrug.com/*"],    // where it runs
    "js": ["assets/content.js"],
    "run_at": "document_idle"                         // when it runs
  }],
  "web_accessible_resources": [{                      // subsystem 2
    "resources": ["assets/inject.js"],               // the page can load this
    "matches": ["*://*.collaborativedrug.com/*"]
  }],
  "browser_specific_settings": { "gecko": { /* … */ } } // Firefox compatibility
}
```

Notice the **least-privilege** mindset: it requests only `storage`, and scopes
both the content script and the web-accessible inject bundle to the CDD host only.
The `gecko` block lets the *same* `dist/` load in Firefox.

### Alternatives
- **Manifest V2:** older; background pages, looser CSP, remote code. Being phased
  out — don't start new projects on it.
- **`world: "MAIN"` content scripts** (MV3) instead of `web_accessible_resources`
  + manual injection (see subsystem 2's alternatives).

### Pros & cons
| Pros | Cons |
| --- | --- |
| Declarative, auditable, user-visible permissions | Rigid — capabilities you didn't declare simply don't exist |
| Enforces least privilege + clear host scoping | MV3 constraints (no remote code, SW background) can surprise you |
| One file wires every context together | Version/field drift is easy (this repo's manifest/`package.json` disagree — see Architecture Review §8) |
| `browser_specific_settings` enables cross-browser | Cross-browser quirks still leak through |

---

## 8. The Vite build process

### Problem
The source is written as clean **ES modules** across many files
(`import`/`export`). But the browser loads a content script and an injected script
as **single files**, and the popup must find its imports at runtime. You need a
build that turns the source tree into a loadable `dist/`.

### Why this way
[Vite](https://vitejs.dev/) (via Rollup) **bundles** each entry point into one
file and can run plugins to copy static assets. This project runs **two separate
builds** because it has two independent entry points that must become two separate
bundles, plus assets to copy.

### This project's example
Two configs, two bundles:

```js
// vite.content.config.js → dist/assets/content.js (entry: src/content/main.js)
build: {
  outDir: "dist", emptyOutDir: true, minify: false,   // readable output for debugging
  rollupOptions: {
    input: "src/content/main.js",
    output: { entryFileNames: "assets/content.js", inlineDynamicImports: true }
  }
}
```

```js
// vite.inject.config.js → dist/assets/inject.js (entry: src/inject/main.js)
build: { outDir: "dist", emptyOutDir: false, /* don't wipe content build */ … }
```

`package.json` orders them — and **order matters**:

```json
"build": "npm run build:content && npm run build:inject"
```

`build:content` runs first with `emptyOutDir: true` (it cleans `dist/` and, via a
small plugin, copies `manifest.json`, `icons/`, `popup/`, and **`shared/`**).
`build:inject` runs second with `emptyOutDir: false` so it **adds** `inject.js`
without wiping the rest. The plugin copies `src/shared/` into `dist/shared/`
specifically because the **popup is not bundled** and imports it at runtime
(subsystem 6) — a concrete example of the build serving an architectural choice:

```js
// the content build's copy plugin (paraphrased)
cpSync("src/popup",  "dist/popup");    // popup shipped verbatim
cpSync("src/shared", "dist/shared");   // …so its runtime import resolves
```

### Alternatives
- **No build (plain files):** load source directly. Simple, but then *everything*
  (including the popup-shared modules and the content tree) must be hand-arranged
  and import paths must match `dist/` exactly — fragile as the project grows.
- **webpack / esbuild / Rollup directly:** all viable; Vite wraps Rollup with a
  friendlier config and dev server.
- **A single build with multiple entries / `output.dir`:** possible, but the
  two-config split keeps the "content wipes, inject appends" sequencing explicit.

### Pros & cons
| Pros | Cons |
| --- | --- |
| Clean ES-module source → single loadable bundles | Two configs + ordering is a sharp edge (`emptyOutDir` must be right) |
| Plugin copies manifest/popup/shared/icons automatically | No `dev`/watch script here — you rebuild + reload manually |
| `minify:false` keeps `dist/` debuggable | The unbundled popup means `shared/` *must* be copied or the popup breaks |
| Same `dist/` works in Chrome and Firefox | Build correctness isn't tested (a past tag shipped a non-building state) |

> **Reload loop to internalise:** edit source → `npm run build` → in
> `chrome://extensions` click *reload* on the extension card → refresh the CDD
> page. There's no hot reload here.

---

## How it all fits together (one trace)

Watch all eight subsystems cooperate for a single user action — opening an ELN
page and seeing the panel:

1. **manifest.json** tells the browser to run **content.js** on the CDD page.
2. The **content script** boots (`init()`), and injects the **page script** via a
   web-accessible bundle.
3. CDD fetches its data; the **page script's** `fetch` hook reads it.
4. The page script parses it and sends it across with **`window.postMessage`**
   (tagged `CDD_STOICH_TOOLS`).
5. The content script's router stores it and renders the panel.
6. A **`MutationObserver`** keeps the panel alive as CDD re-renders / navigates.
7. The user opens the **popup**, toggles a field; it's saved to
   **`chrome.storage`**; the content script's `onChanged` listener re-renders.
8. All of these files were produced by the **Vite build** into `dist/`.

If you understand *why each step happens in the context it does*, you understand
browser-extension architecture — not just this project.

## Where to go next

- See these concepts assembled and critiqued in
  [`ARCHITECTURE_REVIEW.md`](./ARCHITECTURE_REVIEW.md).
- Watch the data move, with payload shapes, in
  [`DATA_FLOW_DIAGRAMS.md`](./DATA_FLOW_DIAGRAMS.md).
- Do a hands-on change (add a panel field) with
  [`ADDING_NEW_FIELDS.md`](./ADDING_NEW_FIELDS.md).

### A short glossary

| Term | Meaning |
| --- | --- |
| **Isolated world** | The content script's private JS scope; shares DOM, not JS, with the page. |
| **MAIN world** | The page's own JS scope; where the inject script runs to see the page's `fetch`. |
| **Web-accessible resource** | A file in your extension the *page* is allowed to load (needed to inject a page script). |
| **Structured clone** | The copy `postMessage` makes — JSON-like data only, no functions/DOM nodes. |
| **Debounce** | Collapse a burst of events into one delayed handler run (here via `requestAnimationFrame`). |
| **Least privilege** | Request only the permissions/host scope you actually need (`["storage"]`, CDD host only). |
| **Manifest V3** | The current extension platform version (service-worker background, no remote code). |
</content>
