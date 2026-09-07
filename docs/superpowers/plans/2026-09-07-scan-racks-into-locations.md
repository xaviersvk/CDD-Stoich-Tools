# Scan racks into a location — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a handheld barcode scanner fill a shelf of SBS racks into CDD's
inventory location tree in one pass — scan the codes into a list, then create
them all as 12 × 8 organized boxes under a chosen location — instead of one
rack per round trip through three screens.

**Architecture:** A new `ui-fixes` feature that adds a `Scan racks` button to
the footer of CDD's own `Edit Locations` dialog. Everything the extension knows
about that dialog's DOM lives in one file (`dialog-dom.js`); everything that is
just data — breadcrumb paths, which nodes may take a box, whether a code is a
duplicate — lives in a DOM-free file (`tree-model.js`) that can be exercised
with `node`. The panel itself is an overlay drawn on top of CDD's right pane,
so CDD's own controls stay mounted and usable: creating a box means clicking
CDD's add-box button and writing into CDD's own inputs through the native value
setter. The extension never presses `Save`.

**Tech Stack:** Plain ES modules, no framework. Vite bundles `src/content` into
`dist/assets/content.js`; the options page loads `src/shared/*` and
`src/options/*` as ES modules from `dist/`. Chrome `storage.local`. Build with
`npm run build`.

**Spec:** `docs/superpowers/specs/2026-09-07-scan-racks-into-locations-design.md`

## Global Constraints

- **The extension never clicks `Save`.** It creates pending nodes and stops.
  Committing them is the user's click, as with every other write this extension
  makes.
- **Duplicates are checked against the whole tree**, not only the target
  location, and case-insensitively. A refused row stays visible and is excluded
  from the count.
- **The scanned code is the box name**, trimmed and inner-whitespace-collapsed.
  No prefix, no suffix, no renaming.
- **Off after installing.** `cddInventoryScanEnabled` defaults to `false` and
  the footer button does not exist until it is on.
- **Grid defaults are defaults.** The panel copies `columns`/`rows`/`organized`
  when it opens and edits its own copy for that batch; it never writes back to
  storage. (The same rule the HPLC block follows — see
  `src/shared/hplc-injection.js`.)
- **The root node is never a target.** CDD hides the add-box button on
  `Locations` with `display: none`; eligibility is read from that style, never
  guessed from an icon. The root's id is negative and changes between mounts —
  it is the node whose `data-parentid` is the string `"undefined"`, and it must
  never be hard-coded.
- **`src/shared/*` stays free of DOM access.** Both the content script and the
  options page import these files.
- **No test runner exists in this repo.** The two DOM-free modules
  (`src/shared/inventory-scan.js`, `.../inventory-location-scan/tree-model.js`)
  have no imports and no top-level `chrome` access, so they are exercised
  directly with `node` from the session scratchpad — that is the automated
  check below. Everything DOM-bound is verified by the user reloading the built
  extension.
- **Scratchpad, not the repo.** Check scripts go to
  `C:/Users/MATUS~1.DRE/AppData/Local/Temp/claude/C--Users-matus-drexler-WebstormProjects-CDD-Stoich-Tools/1d120939-910b-46f5-a19a-90f5467e4c2e/scratchpad/`
  and are never committed. This project commits no test files.
- **Do not push.** Per `CLAUDE.md`: bump, document, build, commit — then stop.

## File Structure

- `src/shared/inventory-scan.js` — *create*. Storage keys, defaults, sanitizers,
  async load/save for the options page, sync cache + change subscription for the
  content script. DOM-free.
- `src/content/features/ui-fixes/inventory-location-scan/tree-model.js` —
  *create*. Pure: `buildNodes`, `boxTargets`, `normalizeScan`, `classifyScan`,
  `acceptedScans`. No DOM, no imports.
- `src/content/features/ui-fixes/inventory-location-scan/dialog-dom.js` —
  *create*. The only file that knows CDD's selectors: find the dialog, read the
  tree, find the footer and the content box, create a box under a location.
- `src/content/features/ui-fixes/inventory-location-scan/scan-panel.js` —
  *create*. The overlay: markup, scan input, list, the create run. Talks to CDD
  only through `dialog-dom.js`.
- `src/content/features/ui-fixes/inventory-location-scan/styles.js` — *create*.
  Injected CSS, once per page.
- `src/content/features/ui-fixes/inventory-location-scan/init.js` — *create*.
  The only export `main.js` imports. Watches for the dialog, mounts and
  unmounts the footer button.
- `src/content/main.js` — *modify*. One import, one `init...()` call.
- `src/options/options.html` — *modify*. One rail item, one card.
- `src/options/options.js` — *modify*. Wiring and one rail chip.
- `docs/FEATURE_CATALOG.md` — *modify*. One entry.
- `manifest.json`, `CHANGELOG.md`, `RELEASES.md` — *modify*, release task.

---

### Task 1: Settings module

**Files:**
- Create: `src/shared/inventory-scan.js`
- Test: `<scratchpad>/check-inventory-scan.mjs` (not committed)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `INVENTORY_SCAN_ENABLED_KEY`, `INVENTORY_SCAN_COLUMNS_KEY`,
    `INVENTORY_SCAN_ROWS_KEY`, `INVENTORY_SCAN_ORGANIZED_KEY` — storage keys.
  - `DEFAULT_INVENTORY_SCAN_ENABLED = false`, `..._COLUMNS = 12`,
    `..._ROWS = 8`, `..._ORGANIZED = true`.
  - `MIN_BOX_SIDE = 1`, `MAX_BOX_SIDE = 100`.
  - `sanitizeBoxSide(raw, fallback) -> number`
  - `sanitizeColumns(raw) -> number`, `sanitizeRows(raw) -> number`
  - `loadInventoryScanSettings() -> Promise<{enabled, columns, rows, organized}>`
  - `saveInventoryScanEnabled(v)`, `saveInventoryScanColumns(v)`,
    `saveInventoryScanRows(v)`, `saveInventoryScanOrganized(v)` — all `Promise<void>`
  - `inventoryScanSettings() -> {enabled, columns, rows, organized}` — sync cache
  - `isInventoryScanEnabled() -> boolean`
  - `onInventoryScanChanged(cb) -> () => void`
  - `initInventoryScan() -> Promise<settings>`

- [ ] **Step 1: Write the failing check**

Create `check-inventory-scan.mjs` in the scratchpad:

```js
import {
    DEFAULT_INVENTORY_SCAN_COLUMNS,
    DEFAULT_INVENTORY_SCAN_ROWS,
    MAX_BOX_SIDE,
    sanitizeBoxSide,
    sanitizeColumns,
    sanitizeRows,
} from "file:///C:/Users/matus.drexler/WebstormProjects/CDD-Stoich-Tools/src/shared/inventory-scan.js";

let failed = 0;
const eq = (got, want, what) => {
    if (got !== want) { failed += 1; console.log(`FAIL ${what}: got ${got}, want ${want}`); }
};

eq(sanitizeColumns(12), 12, "a plain 12");
eq(sanitizeColumns("12"), 12, "the string a number input hands over");
eq(sanitizeColumns("12.7"), 12, "a fraction is truncated, not rounded up");
eq(sanitizeColumns(""), DEFAULT_INVENTORY_SCAN_COLUMNS, "empty falls back");
eq(sanitizeColumns(null), DEFAULT_INVENTORY_SCAN_COLUMNS, "null falls back");
eq(sanitizeColumns("abc"), DEFAULT_INVENTORY_SCAN_COLUMNS, "nonsense falls back");
eq(sanitizeColumns(0), DEFAULT_INVENTORY_SCAN_COLUMNS, "zero is not a box");
eq(sanitizeColumns(-3), DEFAULT_INVENTORY_SCAN_COLUMNS, "negative is not a box");
eq(sanitizeColumns(MAX_BOX_SIDE + 1), DEFAULT_INVENTORY_SCAN_COLUMNS, "past the cap falls back");
eq(sanitizeColumns(MAX_BOX_SIDE), MAX_BOX_SIDE, "the cap itself is allowed");
eq(sanitizeRows(8), 8, "rows keep their own default");
eq(sanitizeRows(""), DEFAULT_INVENTORY_SCAN_ROWS, "rows fall back to 8, not to 12");
eq(sanitizeBoxSide("5", 9), 5, "sanitizeBoxSide takes its fallback");
eq(sanitizeBoxSide("x", 9), 9, "sanitizeBoxSide falls back");

console.log(failed ? `${failed} FAILED` : "all ok");
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node "<scratchpad>/check-inventory-scan.mjs"`
Expected: FAIL — `Cannot find module ... src/shared/inventory-scan.js`.

- [ ] **Step 3: Write the module**

Create `src/shared/inventory-scan.js`:

```js
// shared/inventory-scan.js — the DEFAULTS behind the "Scan racks" panel in
// CDD's Edit Locations dialog:
//
//   columns / rows   the grid a scanned rack gets; 12 x 8 is an SBS rack
//   organized        whether the box has numbered positions at all
//
// Defaults, not values. One shelf is SBS racks and the next is 10 x 10 trays,
// and that is a property of the shelf in front of you, not a setting to flip
// back and forth — so the panel copies these when it opens and edits its OWN
// copy for that batch, never writing back here. Same rule as the HPLC block;
// see shared/hplc-injection.js.
//
// DOM-free: the content script reads the sync cache, the options page uses the
// async pair.

export const INVENTORY_SCAN_ENABLED_KEY = "cddInventoryScanEnabled";
export const INVENTORY_SCAN_COLUMNS_KEY = "cddInventoryScanColumns";
export const INVENTORY_SCAN_ROWS_KEY = "cddInventoryScanRows";
export const INVENTORY_SCAN_ORGANIZED_KEY = "cddInventoryScanOrganized";

// OFF after installing. The button lives in a vault-admin dialog most people
// never open; nobody's dialog should sprout a control because they upgraded.
export const DEFAULT_INVENTORY_SCAN_ENABLED = false;

// An SBS rack is 12 across and 8 down.
export const DEFAULT_INVENTORY_SCAN_COLUMNS = 12;
export const DEFAULT_INVENTORY_SCAN_ROWS = 8;
export const DEFAULT_INVENTORY_SCAN_ORGANIZED = true;

// Our own sanity guard, not a CDD limit. A side outside this range is a typo
// or a stray scan, and 100 x 100 positions is already far past any rack.
export const MIN_BOX_SIDE = 1;
export const MAX_BOX_SIDE = 100;

export function sanitizeBoxSide(raw, fallback) {
    const n = Math.trunc(Number(raw));
    if (!Number.isFinite(n) || n < MIN_BOX_SIDE || n > MAX_BOX_SIDE) return fallback;
    return n;
}

export function sanitizeColumns(raw) {
    return sanitizeBoxSide(raw, DEFAULT_INVENTORY_SCAN_COLUMNS);
}

export function sanitizeRows(raw) {
    return sanitizeBoxSide(raw, DEFAULT_INVENTORY_SCAN_ROWS);
}

const KEYS = [
    INVENTORY_SCAN_ENABLED_KEY,
    INVENTORY_SCAN_COLUMNS_KEY,
    INVENTORY_SCAN_ROWS_KEY,
    INVENTORY_SCAN_ORGANIZED_KEY,
];

function readSettings(stored) {
    return {
        enabled: stored?.[INVENTORY_SCAN_ENABLED_KEY] === true,
        columns: sanitizeColumns(stored?.[INVENTORY_SCAN_COLUMNS_KEY]),
        rows: sanitizeRows(stored?.[INVENTORY_SCAN_ROWS_KEY]),
        // Organized is the default, so only an explicit false turns it off.
        organized: stored?.[INVENTORY_SCAN_ORGANIZED_KEY] !== false,
    };
}

export async function loadInventoryScanSettings() {
    try {
        return readSettings(await chrome.storage.local.get(KEYS));
    } catch {
        return readSettings(null);
    }
}

async function put(key, value) {
    try {
        await chrome.storage.local.set({ [key]: value });
    } catch {
        // Orphaned content script — nothing useful to do.
    }
}

export async function saveInventoryScanEnabled(value) {
    await put(INVENTORY_SCAN_ENABLED_KEY, value === true);
}

export async function saveInventoryScanColumns(value) {
    await put(INVENTORY_SCAN_COLUMNS_KEY, sanitizeColumns(value));
}

export async function saveInventoryScanRows(value) {
    await put(INVENTORY_SCAN_ROWS_KEY, sanitizeRows(value));
}

export async function saveInventoryScanOrganized(value) {
    await put(INVENTORY_SCAN_ORGANIZED_KEY, value === true);
}

let cached = readSettings(null);
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

export function inventoryScanSettings() {
    return { ...cached };
}

export function isInventoryScanEnabled() {
    return cached.enabled;
}

export function onInventoryScanChanged(cb) {
    changeListeners.add(cb);
    return () => changeListeners.delete(cb);
}

export async function initInventoryScan() {
    if (!listenerAttached && chrome?.storage?.onChanged) {
        listenerAttached = true;
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== "local") return;
            if (!KEYS.some((key) => key in changes)) return;
            loadInventoryScanSettings().then((settings) => {
                cached = settings;
                notify();
            });
        });
    }
    cached = await loadInventoryScanSettings();
    notify();
    return inventoryScanSettings();
}
```

- [ ] **Step 4: Run the check again**

Run: `node "<scratchpad>/check-inventory-scan.mjs"`
Expected: `all ok`

- [ ] **Step 5: Commit**

```bash
git add src/shared/inventory-scan.js
git commit -m "scan racks: the settings module"
```

---

### Task 2: Options page — the switch and the three defaults

**Files:**
- Modify: `src/options/options.html` — a rail item after the HPLC one, and a
  card at the end of `#settingsPanes`
- Modify: `src/options/options.js` — imports, wiring, `initInventoryScanUI()`,
  one line in `refreshRailChips()`
- Modify: `src/content/main.js` — one import, one call

**Interfaces:**
- Consumes: everything Task 1 produced.
- Produces: element ids `inventoryScanEnabled`, `inventoryScanColumns`,
  `inventoryScanRows`, `inventoryScanOrganized`; heading id
  `col-inventoryscan-heading`; chip key `inventoryscan`.

- [ ] **Step 1: Add the rail item**

In `src/options/options.html`, immediately after the `col-hplc-heading` rail
button (the one whose label is `HPLC injection`) and before the
`col-phrases-heading` one, insert:

```html
            <button type="button" class="rail__item" data-pane="col-inventoryscan-heading">
                <span class="tile" aria-hidden="true">
                    <span class="tile__no"></span>
                    <span class="tile__sym">Rk</span>
                </span>
                <span class="rail__label">Scan racks</span>
                <span class="rail__chip" data-chip="inventoryscan" hidden></span>
            </button>
```

- [ ] **Step 2: Add the card**

In `src/options/options.html`, add this `<section>` as the LAST child of
`<div class="panes" id="settingsPanes">` (after the phrases card, before the
closing `</div>`):

```html
        <section class="card" aria-labelledby="col-inventoryscan-heading">
            <header class="card__head">
                <span class="tile" aria-hidden="true">
                    <span class="tile__no"></span>
                    <span class="tile__sym">Rk</span>
                </span>
                <div class="card__titles">
                    <h3 class="card__name" id="col-inventoryscan-heading">Scan racks</h3>
                </div>
            </header>

            <div class="card__body">
                <p class="note">
                    A barcode scanner ends every code with Enter, and Enter in
                    <em>Settings → Sample/Inventory Fields → Add/Edit Inventory
                    Fields → Edit Locations</em> means <em>Save</em>. This adds a
                    <strong>Scan racks</strong> button to that dialog: scan a whole
                    shelf into a list, then create the boxes in one go. The sizes
                    below are <strong>starting points</strong> — a batch can be
                    scanned at another size without changing them.
                </p>

                <label class="field-item auto-fill-toggle">
                    <input type="checkbox" id="inventoryScanEnabled" />
                    <span>Show the <strong>Scan racks</strong> button in the
                    Edit Locations dialog. Off by default.</span>
                </label>

                <label class="field-item purity-threshold-row">
                    <span>
                        <strong>Columns</strong> — positions across a new box.
                    </span>
                    <input type="number" id="inventoryScanColumns"
                           min="1" max="100" step="1" />
                </label>

                <label class="field-item purity-threshold-row">
                    <span>
                        <strong>Rows</strong> — positions down a new box.
                        12 × 8 is an SBS rack.
                    </span>
                    <input type="number" id="inventoryScanRows"
                           min="1" max="100" step="1" />
                </label>

                <label class="field-item auto-fill-toggle">
                    <input type="checkbox" id="inventoryScanOrganized" />
                    <span>Give new boxes <strong>numbered positions</strong>.
                    Off makes unorganized boxes, and the sizes above are
                    ignored.</span>
                </label>
            </div>
        </section>
```

- [ ] **Step 3: Wire it up in `options.js`**

Add to the imports at the top of `src/options/options.js`:

```js
import {
    loadInventoryScanSettings,
    saveInventoryScanColumns,
    saveInventoryScanEnabled,
    saveInventoryScanOrganized,
    saveInventoryScanRows,
} from "../shared/inventory-scan.js";
```

Then, immediately after `initHplcInjectionUI()`'s function body (before
`const showProductsCheckbox = ...`), add:

```js
const inventoryScanEnabledCheckbox = document.getElementById("inventoryScanEnabled");
const inventoryScanColumnsInput = document.getElementById("inventoryScanColumns");
const inventoryScanRowsInput = document.getElementById("inventoryScanRows");
const inventoryScanOrganizedCheckbox = document.getElementById("inventoryScanOrganized");

inventoryScanEnabledCheckbox.addEventListener("change", () => {
    saveInventoryScanEnabled(inventoryScanEnabledCheckbox.checked);
});

// Written back sanitized, then echoed into the box: typing 0 and tabbing away
// should show what was actually stored, not leave a value the panel will not use.
inventoryScanColumnsInput.addEventListener("change", async () => {
    await saveInventoryScanColumns(inventoryScanColumnsInput.value);
    const settings = await loadInventoryScanSettings();
    inventoryScanColumnsInput.value = settings.columns;
});

inventoryScanRowsInput.addEventListener("change", async () => {
    await saveInventoryScanRows(inventoryScanRowsInput.value);
    const settings = await loadInventoryScanSettings();
    inventoryScanRowsInput.value = settings.rows;
});

inventoryScanOrganizedCheckbox.addEventListener("change", () => {
    saveInventoryScanOrganized(inventoryScanOrganizedCheckbox.checked);
});

async function initInventoryScanUI() {
    const settings = await loadInventoryScanSettings();
    inventoryScanEnabledCheckbox.checked = settings.enabled;
    inventoryScanColumnsInput.value = settings.columns;
    inventoryScanRowsInput.value = settings.rows;
    inventoryScanOrganizedCheckbox.checked = settings.organized;
}
```

In `refreshRailChips()`, after the `hplc` chip lines, add:

```js
    const scanOn = document.getElementById("inventoryScanEnabled");
    if (scanOn) setChip("inventoryscan", scanOn.checked ? "on" : "off");
```

And next to the other `init...UI()` calls near the bottom of the file (after
`initHplcInjectionUI();`), add:

```js
initInventoryScanUI();
```

- [ ] **Step 4: Load the cache in the content script**

In `src/content/main.js`, add the import next to the other shared ones:

```js
import {initInventoryScan} from "../shared/inventory-scan.js";
```

and, at the end of `init()` right after `initHeatMapFieldsConfig();`:

```js
  // The "Scan racks" button in CDD's Edit Locations dialog. Fire-and-forget:
  // the dialog watcher (initInventoryLocationScan, wired in Task 5) asks the
  // cache each time a dialog appears, and the cache's own subscription adds or
  // removes the button if the switch is flipped while one is open.
  initInventoryScan();
```

- [ ] **Step 5: Build and verify by hand**

Run: `npm run build`
Expected: both bundles build with no error.

Then ask the user to reload the unpacked extension and open the options page.
Expected: a **Scan racks** entry in the left rail with an `off` chip; the card
shows the switch off, `12`, `8`, and *numbered positions* ticked. Turning the
switch on flips the chip to `on`, and the values survive a reload of the page.

- [ ] **Step 6: Commit**

```bash
git add src/options/options.html src/options/options.js src/content/main.js
git commit -m "scan racks: the options card"
```

---

### Task 3: The tree model (pure)

**Files:**
- Create: `src/content/features/ui-fixes/inventory-location-scan/tree-model.js`
- Test: `<scratchpad>/check-tree-model.mjs` (not committed)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `buildNodes(rows) -> node[]` where a row is
    `{ id, parentId, name, canTakeBox }` as read off the dialog and a node is
    `{ id, parentId, name, canTakeBox, path, depth }`. `parentId` is `null` for
    the root (the raw value is the string `"undefined"`). `path` is the
    breadcrumb, `" > "`-joined, root name included. `depth` is 0 for the root.
  - `boxTargets(nodes) -> node[]` — the nodes a box may be created under.
  - `normalizeScan(raw) -> string` — trimmed, inner whitespace collapsed.
  - `SCAN_OK = "ok"`, `SCAN_IN_TREE = "in-tree"`, `SCAN_IN_LIST = "in-list"`
  - `classifyScan(raw, nodes, scans) -> { name, status, where } | null` —
    `null` for an empty scan; `where` is the offending node's `path` for
    `SCAN_IN_TREE`, otherwise `null`.
  - `acceptedScans(scans) -> scan[]` — the ones with `status === SCAN_OK`.

- [ ] **Step 1: Write the failing check**

Create `check-tree-model.mjs` in the scratchpad:

```js
import {
    SCAN_IN_LIST,
    SCAN_IN_TREE,
    SCAN_OK,
    acceptedScans,
    boxTargets,
    buildNodes,
    classifyScan,
    normalizeScan,
} from "file:///C:/Users/matus.drexler/WebstormProjects/CDD-Stoich-Tools/src/content/features/ui-fixes/inventory-location-scan/tree-model.js";

let failed = 0;
const eq = (got, want, what) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) { failed += 1; console.log(`FAIL ${what}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
};

// The vault this was measured in: root, two locations, four boxes.
const raw = [
    { id: "-4",    parentId: "undefined", name: "Locations", canTakeBox: false },
    { id: "24302", parentId: "-4",        name: "room",      canTakeBox: true  },
    { id: "24303", parentId: "24302",     name: "test",      canTakeBox: false },
    { id: "24304", parentId: "24302",     name: "50",        canTakeBox: false },
    { id: "61103", parentId: "-4",        name: "Racks",     canTakeBox: true  },
    { id: "61104", parentId: "61103",     name: "AAA",       canTakeBox: false },
    { id: "61105", parentId: "61103",     name: "BBB",       canTakeBox: false },
];
const nodes = buildNodes(raw);
const byId = (id) => nodes.find((n) => n.id === id);

eq(byId("-4").parentId, null, 'the root\'s "undefined" parent becomes null');
eq(byId("-4").path, "Locations", "the root is its own path");
eq(byId("-4").depth, 0, "the root is depth 0");
eq(byId("61103").path, "Locations > Racks", "a location's breadcrumb");
eq(byId("61104").path, "Locations > Racks > AAA", "a box's breadcrumb");
eq(byId("61104").depth, 2, "depth counts edges from the root");

eq(boxTargets(nodes).map((n) => n.path),
   ["Locations > room", "Locations > Racks"],
   "only the two locations can take a box - not the root, not the boxes");

// A tree that came back malformed must not spin forever.
const cyclic = buildNodes([
    { id: "a", parentId: "b", name: "A", canTakeBox: true },
    { id: "b", parentId: "a", name: "B", canTakeBox: true },
]);
eq(cyclic.length, 2, "a cycle still yields both nodes");

eq(normalizeScan("  SBS-00123  "), "SBS-00123", "a scan is trimmed");
eq(normalizeScan("SBS  00123"), "SBS 00123", "inner whitespace collapses");
eq(normalizeScan(null), "", "nothing scans to nothing");

eq(classifyScan("   ", nodes, []), null, "an empty scan is not a row");
eq(classifyScan("SBS-00123", nodes, []),
   { name: "SBS-00123", status: SCAN_OK, where: null },
   "a fresh code is accepted");
eq(classifyScan("AAA", nodes, []),
   { name: "AAA", status: SCAN_IN_TREE, where: "Locations > Racks > AAA" },
   "a box already in the tree is refused, and says where");
eq(classifyScan("aaa", nodes, []).status, SCAN_IN_TREE, "case does not rescue it");
eq(classifyScan("Racks", nodes, []).status, SCAN_IN_TREE,
   "a LOCATION name counts too - the check is the whole tree");

const scans = [{ name: "SBS-00123", status: SCAN_OK, where: null }];
eq(classifyScan("SBS-00123", nodes, scans),
   { name: "SBS-00123", status: SCAN_IN_LIST, where: null },
   "the same rack scanned twice");
eq(classifyScan("sbs-00123", nodes, scans).status, SCAN_IN_LIST, "case-insensitive there too");

const mixed = [
    { name: "SBS-00123", status: SCAN_OK, where: null },
    { name: "AAA", status: SCAN_IN_TREE, where: "Locations > Racks > AAA" },
    { name: "SBS-00124", status: SCAN_OK, where: null },
];
eq(acceptedScans(mixed).map((s) => s.name), ["SBS-00123", "SBS-00124"],
   "refused rows do not count");
eq(acceptedScans(null), [], "no list, nothing accepted");

console.log(failed ? `${failed} FAILED` : "all ok");
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node "<scratchpad>/check-tree-model.mjs"`
Expected: FAIL — `Cannot find module ... tree-model.js`.

- [ ] **Step 3: Write the module**

Create `src/content/features/ui-fixes/inventory-location-scan/tree-model.js`:

```js
// content/features/ui-fixes/inventory-location-scan/tree-model.js
//
// The parts of the scan panel that are only data: what the location tree looks
// like once dialog-dom.js has read it, which nodes may take a box, and whether
// a scanned code is one we already have. No DOM and no imports here — that is
// what lets the duplicate rule be checked with `node` instead of a vault.

export const SCAN_OK = "ok";
export const SCAN_IN_TREE = "in-tree";
export const SCAN_IN_LIST = "in-list";

// CDD gives the ROOT a parent of the literal string "undefined". Everything
// else carries a real id.
function parentOf(raw) {
    if (raw == null || raw === "undefined" || raw === "") return null;
    return String(raw);
}

export function normalizeScan(raw) {
    return String(raw ?? "").replace(/\s+/g, " ").trim();
}

function key(name) {
    return normalizeScan(name).toLowerCase();
}

export function buildNodes(rows) {
    const nodes = (rows || []).map((row) => ({
        id: String(row.id),
        parentId: parentOf(row.parentId),
        name: String(row.name ?? "").trim(),
        canTakeBox: row.canTakeBox === true,
        path: "",
        depth: 0,
    }));

    const byId = new Map(nodes.map((node) => [node.id, node]));

    for (const node of nodes) {
        const parts = [];
        // A tree that came back malformed is a bug, not a reason to hang the
        // dialog — the guard bounds the walk at one visit per node.
        const seen = new Set();
        let cursor = node;
        while (cursor && !seen.has(cursor.id)) {
            seen.add(cursor.id);
            parts.unshift(cursor.name);
            cursor = cursor.parentId ? byId.get(cursor.parentId) : null;
        }
        node.path = parts.join(" > ");
        node.depth = parts.length - 1;
    }

    return nodes;
}

export function boxTargets(nodes) {
    return (nodes || []).filter((node) => node.canTakeBox);
}

// The whole tree, not just the target location. A rack barcode belongs to one
// rack; the same code twice means a double scan or a rack already shelved
// somewhere else, and neither should quietly become a second box.
export function classifyScan(raw, nodes, scans) {
    const name = normalizeScan(raw);
    if (!name) return null;

    const k = key(name);

    const inTree = (nodes || []).find((node) => key(node.name) === k);
    if (inTree) return { name, status: SCAN_IN_TREE, where: inTree.path };

    if ((scans || []).some((scan) => key(scan.name) === k)) {
        return { name, status: SCAN_IN_LIST, where: null };
    }

    return { name, status: SCAN_OK, where: null };
}

export function acceptedScans(scans) {
    return (scans || []).filter((scan) => scan.status === SCAN_OK);
}
```

- [ ] **Step 4: Run the check again**

Run: `node "<scratchpad>/check-tree-model.mjs"`
Expected: `all ok`

- [ ] **Step 5: Commit**

```bash
git add src/content/features/ui-fixes/inventory-location-scan/tree-model.js
git commit -m "scan racks: the tree model"
```

---

### Task 4: The dialog's DOM

**Files:**
- Create: `src/content/features/ui-fixes/inventory-location-scan/dialog-dom.js`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `DIALOG_SELECTOR = ".edit-locations-dialog-paper"`,
    `NAME_INPUT_ID = "location-box-node-name"`,
    `PANEL_CLASS = "cdd-scan-panel"`
  - `findDialog() -> Element|null`
  - `findContent(dialog) -> Element|null` — `.MuiDialogContent-root`
  - `findLeftColumn(dialog) -> Element|null`
  - `findFooter(dialog) -> Element|null`
  - `footerAnchor(dialog, footer) -> Element|null` — the footer child holding
    *Print Labels*, or `null`
  - `readTreeRows(dialog) -> { id, parentId, name, canTakeBox }[]`
  - `selectedNodeId(dialog) -> string|null`
  - `setNativeValue(element, value)`
  - `createBoxUnder(dialog, { parentId, name, columns, rows, organized }) -> Promise<string>`
    — resolves with the new node's id, throws an `Error` whose message names
    what went wrong.

- [ ] **Step 1: Write the module**

Create `src/content/features/ui-fixes/inventory-location-scan/dialog-dom.js`:

```js
// content/features/ui-fixes/inventory-location-scan/dialog-dom.js
//
// Everything that knows what CDD's Edit Locations dialog looks like, so that
// when CDD renames a class there is exactly one file to fix.
//
// Three facts this file is built on, all measured rather than assumed:
//
//   - Every row carries all four action buttons and CDD hides the ones that do
//     not apply with `display: none`. So "can this node take a box?" is a style
//     question, not a guess about which icon is drawn — and it is the honest
//     one, because it also excludes the root, under which CDD allows no box.
//   - The add-box button creates an organized 9 x 9 box named "Box N" OUTRIGHT
//     and selects it. There is no type chooser in the way; the two large cards
//     are the location editor, which is a different thing.
//   - Selection is `.Mui-selected` on the row's content div. `aria-selected` is
//     not set, so it cannot be used to tell which node the right pane belongs
//     to.
//
// The panel is drawn as an overlay ON TOP of CDD's right pane rather than
// replacing it: the inputs below have to stay mounted, because writing a box's
// name means writing into them.

export const DIALOG_SELECTOR = ".edit-locations-dialog-paper";
export const NAME_INPUT_ID = "location-box-node-name";
export const PANEL_CLASS = "cdd-scan-panel";

const ADD_BOX_LABEL = "Create new organized or unorganized box";
const PRINT_LABELS_TEXT = "Print Labels";

export function findDialog() {
    return document.querySelector(DIALOG_SELECTOR);
}

export function findContent(dialog) {
    return dialog?.querySelector(".MuiDialogContent-root") || null;
}

export function findLeftColumn(dialog) {
    return dialog?.querySelector(".left-column") || null;
}

export function findFooter(dialog) {
    if (!dialog) return null;
    const actions = dialog.querySelector(".MuiDialogActions-root");
    if (actions) return actions;
    // A footer is defined by the buttons in it, not by a class we happened to
    // see once. Save is always there.
    const save = [...dialog.querySelectorAll("button")]
        .find((button) => button.textContent.trim() === "Save");
    return save ? save.parentElement : null;
}

export function footerAnchor(dialog, footer) {
    if (!dialog || !footer) return null;
    const label = [...dialog.querySelectorAll("a, button, span, div")]
        .find((el) => el.children.length === 0
            && el.textContent.trim() === PRINT_LABELS_TEXT);
    if (!label) return null;

    let cursor = label;
    while (cursor && cursor.parentElement !== footer) cursor = cursor.parentElement;
    return cursor;
}

function contentOf(item) {
    return item.querySelector(":scope > .MuiTreeItem-content");
}

function addBoxButton(item) {
    const content = contentOf(item);
    if (!content) return null;
    for (const button of content.querySelectorAll("button")) {
        if (button.getAttribute("aria-label") === ADD_BOX_LABEL) return button;
    }
    return null;
}

function isShown(element) {
    if (!element) return false;
    return getComputedStyle(element).display !== "none";
}

function labelOf(item) {
    const label = contentOf(item)?.querySelector(".MuiTreeItem-label");
    return label ? label.textContent.trim() : "";
}

export function treeItems(dialog) {
    if (!dialog) return [];
    return [...dialog.querySelectorAll('li[role="treeitem"]')];
}

export function readTreeRows(dialog) {
    return treeItems(dialog).map((item) => ({
        id: item.dataset.nodeid,
        parentId: item.dataset.parentid,
        name: labelOf(item),
        canTakeBox: isShown(addBoxButton(item)),
    }));
}

export function selectedNodeId(dialog) {
    const item = treeItems(dialog)
        .find((node) => contentOf(node)?.classList.contains("Mui-selected"));
    return item ? item.dataset.nodeid : null;
}

// React tracks an input's value on the DOM node itself; assigning `.value`
// hides the change from it. Go through the prototype setter so the framework
// sees a real edit — the same trick run-form-templates/form-model.js uses.
export function setNativeValue(element, value) {
    const prototype = element instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;

    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (setter) setter.call(element, value);
    else element.value = value;

    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
}

// Our own panel lives inside the dialog, so a bare querySelectorAll for
// `input[type=number]` would find the panel's grid boxes as well as CDD's.
function cddElements(dialog, selector) {
    return [...dialog.querySelectorAll(selector)]
        .filter((element) => !element.closest(`.${PANEL_CLASS}`));
}

function frame() {
    return new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
}

async function waitFor(predicate, tries = 40) {
    for (let attempt = 0; attempt < tries; attempt += 1) {
        const value = predicate();
        if (value) return value;
        await frame();
    }
    return null;
}

export async function createBoxUnder(dialog, { parentId, name, columns, rows, organized }) {
    const parent = treeItems(dialog)
        .find((item) => item.dataset.nodeid === String(parentId));
    if (!parent) throw new Error("that location is no longer in the tree");

    const button = addBoxButton(parent);
    if (!isShown(button)) throw new Error("that location cannot take a box");

    const before = new Set(treeItems(dialog).map((item) => item.dataset.nodeid));
    button.click();

    const created = await waitFor(() =>
        treeItems(dialog).find((item) => !before.has(item.dataset.nodeid)) || null);
    if (!created) throw new Error("CDD did not add a box");

    // The right pane belongs to whatever is selected. If the new box is not it,
    // writing the name would rename something else.
    if (!contentOf(created)?.classList.contains("Mui-selected")) {
        throw new Error("CDD is not editing the box it just added");
    }

    const nameInput = document.getElementById(NAME_INPUT_ID);
    if (!nameInput) throw new Error("the name field did not appear");
    setNativeValue(nameInput, name);
    await frame();

    if (organized) {
        const [columnsInput, rowsInput] = cddElements(dialog, 'input[type="number"]');
        if (!columnsInput || !rowsInput) throw new Error("the grid size fields did not appear");
        setNativeValue(columnsInput, String(columns));
        await frame();
        setNativeValue(rowsInput, String(rows));
    } else {
        const organizedBox = cddElements(dialog, 'input[type="checkbox"]')[0];
        if (organizedBox?.checked) organizedBox.click();
    }

    await frame();

    const painted = labelOf(created);
    if (painted !== name) {
        throw new Error(`the row reads "${painted}" instead of "${name}"`);
    }

    return created.dataset.nodeid;
}
```

- [ ] **Step 2: Check it parses and bundles**

Run: `npm run build`
Expected: both bundles build. (Nothing imports the file yet, so this only
proves it is syntactically sound — Task 5 exercises it.)

- [ ] **Step 3: Commit**

```bash
git add src/content/features/ui-fixes/inventory-location-scan/dialog-dom.js
git commit -m "scan racks: reading and driving the Edit Locations dialog"
```

---

### Task 5: The panel

**Files:**
- Create: `src/content/features/ui-fixes/inventory-location-scan/styles.js`
- Create: `src/content/features/ui-fixes/inventory-location-scan/scan-panel.js`
- Create: `src/content/features/ui-fixes/inventory-location-scan/init.js`
- Modify: `src/content/main.js` — one import, one call

**Interfaces:**
- Consumes: Task 1 (`inventoryScanSettings`, `isInventoryScanEnabled`,
  `onInventoryScanChanged`), Task 3 (all of `tree-model.js`), Task 4 (all of
  `dialog-dom.js`).
- Produces:
  - `injectScanStyles()` from `styles.js`
  - `openScanPanel(dialog)`, `closeScanPanel()` from `scan-panel.js`
  - `initInventoryLocationScan()` from `init.js` — the only export `main.js`
    imports.

- [ ] **Step 1: Write the styles**

Create `src/content/features/ui-fixes/inventory-location-scan/styles.js`:

```js
// content/features/ui-fixes/inventory-location-scan/styles.js
//
// All CSS for the scan panel, kept apart from the view so the view file stays
// about behaviour. Injected once per page.
//
// The panel is positioned ABSOLUTE over CDD's right pane rather than replacing
// it. CDD's name and grid inputs have to stay mounted, because creating a box
// means writing into them — hiding that pane would be asking React to keep
// rendering something we told the browser to stop drawing.

let injected = false;

export function injectScanStyles() {
    if (injected) return;
    injected = true;

    const style = document.createElement("style");
    style.id = "cdd-inventory-location-scan-style";

    style.textContent = `
    /* ===== THE FOOTER BUTTON ===== */
    .cdd-scan-open {
        appearance: none;
        border: 0;
        background: none;
        margin: 0 18px 0 0;
        padding: 0;
        font: inherit;
        font-size: 13px;
        color: #1565c0;
        cursor: pointer;
    }
    .cdd-scan-open:hover { text-decoration: underline; }
    .cdd-scan-open[disabled] { color: rgba(0, 0, 0, 0.38); cursor: default; }

    /* ===== THE PANEL ===== */
    .cdd-scan-panel {
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        z-index: 5;
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 16px 20px;
        overflow-y: auto;
        background: #fff;
        font-size: 13px;
        line-height: 1.4;
        color: rgba(0, 0, 0, 0.87);
    }

    .cdd-scan-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
        padding-bottom: 10px;
        border-bottom: 1px solid rgba(0, 0, 0, 0.12);
    }
    .cdd-scan-title { font-size: 15px; font-weight: 600; }
    .cdd-scan-note { color: rgba(0, 0, 0, 0.6); }

    .cdd-scan-controls {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px 16px;
    }
    .cdd-scan-controls label {
        display: inline-flex;
        align-items: center;
        gap: 6px;
    }
    .cdd-scan-controls select,
    .cdd-scan-controls input[type="number"] {
        font: inherit;
        padding: 4px 6px;
        border: 1px solid rgba(0, 0, 0, 0.3);
        border-radius: 4px;
        background: #fff;
    }
    .cdd-scan-controls select { max-width: 320px; }
    .cdd-scan-controls input[type="number"] { width: 60px; }

    /* The scan box is the one thing on this panel that matters, so it is the
       one thing that looks like it. */
    .cdd-scan-input {
        font: inherit;
        font-size: 15px;
        width: 100%;
        padding: 9px 11px;
        border: 2px solid #1565c0;
        border-radius: 5px;
        background: #fff;
    }
    .cdd-scan-input:disabled { border-color: rgba(0, 0, 0, 0.2); background: #f5f5f5; }

    /* ===== THE LIST ===== */
    .cdd-scan-list {
        flex: 1 1 auto;
        min-height: 80px;
        overflow-y: auto;
        border: 1px solid rgba(0, 0, 0, 0.12);
        border-radius: 4px;
    }
    .cdd-scan-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 5px 10px;
        border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    }
    .cdd-scan-row:last-child { border-bottom: 0; }
    .cdd-scan-ordinal {
        min-width: 22px;
        text-align: right;
        color: rgba(0, 0, 0, 0.45);
        font-variant-numeric: tabular-nums;
    }
    .cdd-scan-name { flex: 1 1 auto; font-weight: 600; }
    .cdd-scan-why { color: #b3261e; }
    .cdd-scan-row--refused .cdd-scan-name {
        font-weight: 400;
        text-decoration: line-through;
        color: rgba(0, 0, 0, 0.5);
    }
    .cdd-scan-row--created .cdd-scan-name { color: rgba(0, 0, 0, 0.5); }
    .cdd-scan-row--created .cdd-scan-why { color: #2e7d32; }
    .cdd-scan-drop {
        appearance: none;
        border: 0;
        background: none;
        padding: 0 4px;
        font: inherit;
        color: rgba(0, 0, 0, 0.45);
        cursor: pointer;
    }
    .cdd-scan-drop:hover { color: #b3261e; }

    .cdd-scan-empty { padding: 14px 12px; color: rgba(0, 0, 0, 0.5); }

    /* ===== FOOT ===== */
    .cdd-scan-foot {
        display: flex;
        align-items: center;
        gap: 14px;
        padding-top: 4px;
    }
    .cdd-scan-create {
        appearance: none;
        border: 0;
        border-radius: 4px;
        padding: 8px 16px;
        font: inherit;
        font-weight: 600;
        color: #fff;
        background: #43a047;
        cursor: pointer;
    }
    .cdd-scan-create[disabled] { background: rgba(0, 0, 0, 0.18); cursor: default; }
    .cdd-scan-close {
        appearance: none;
        border: 0;
        background: none;
        padding: 0;
        font: inherit;
        color: #1565c0;
        cursor: pointer;
    }
    .cdd-scan-status { color: #b3261e; }
    .cdd-scan-status--ok { color: rgba(0, 0, 0, 0.6); }
    `;

    (document.head || document.documentElement).appendChild(style);
}
```

- [ ] **Step 2: Write the panel**

Create `src/content/features/ui-fixes/inventory-location-scan/scan-panel.js`:

```js
// content/features/ui-fixes/inventory-location-scan/scan-panel.js
//
// The overlay that turns a scanner into a shelf of boxes.
//
// The whole point of this feature is one keystroke: a handheld scanner ends
// every barcode with Enter, and Enter in this dialog is Save. So while the
// panel is open, Enter ANYWHERE inside the dialog is ours — claimed on
// `window` in the capture phase, which runs before anything CDD could have
// registered on `document` or below, in either phase. In the scan box it
// commits a row; anywhere else it puts the cursor back in the scan box, which
// is where a scan should have landed in the first place.
//
// Nothing here presses Save. The run creates pending nodes and steps aside.

import { inventoryScanSettings } from "../../../../shared/inventory-scan.js";
import {
    PANEL_CLASS,
    createBoxUnder,
    findContent,
    findLeftColumn,
    readTreeRows,
    selectedNodeId,
} from "./dialog-dom.js";
import {
    SCAN_IN_LIST,
    SCAN_IN_TREE,
    SCAN_OK,
    acceptedScans,
    boxTargets,
    buildNodes,
    classifyScan,
} from "./tree-model.js";

const SCAN_CREATED = "created";

let open = null;

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

// A box's nearest home: itself if it can take one, otherwise the closest
// ancestor that can. Opening the panel with the wrong location preselected is
// how a shelf ends up in the wrong room.
function defaultTarget(nodes, selectedId) {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    let cursor = byId.get(String(selectedId));
    const seen = new Set();
    while (cursor && !seen.has(cursor.id)) {
        seen.add(cursor.id);
        if (cursor.canTakeBox) return cursor.id;
        cursor = cursor.parentId ? byId.get(cursor.parentId) : null;
    }
    const targets = boxTargets(nodes);
    return targets.length ? targets[0].id : null;
}

export function closeScanPanel() {
    if (!open) return;
    window.removeEventListener("keydown", open.onKeyDown, true);
    open.panel.remove();
    if (open.content) open.content.style.position = open.contentPosition;
    open = null;
}

export function openScanPanel(dialog) {
    closeScanPanel();

    const content = findContent(dialog);
    if (!content) return;

    const nodes = buildNodes(readTreeRows(dialog));
    const targets = boxTargets(nodes);
    const settings = inventoryScanSettings();

    const state = {
        // The scanned codes, in the order they arrived.
        scans: [],
        targetId: defaultTarget(nodes, selectedNodeId(dialog)),
        // The panel's OWN copy of the grid. Settings hold the default; a batch
        // of 10 x 10 trays must not redefine what the next batch starts from.
        gridColumns: settings.columns,
        gridRows: settings.rows,
        organized: settings.organized,
        busy: false,
        status: "",
        statusOk: false,
    };

    const panel = el("div", PANEL_CLASS);

    /* ----- head ----- */
    const head = el("div", "cdd-scan-head");
    head.append(el("span", "cdd-scan-title", "Scan racks"));
    head.append(el("span", "cdd-scan-note", "Enter adds a row. Nothing is saved until you press Save."));
    panel.append(head);

    /* ----- controls ----- */
    const controls = el("div", "cdd-scan-controls");

    const intoLabel = el("label", null);
    intoLabel.append(el("span", null, "Into"));
    const intoSelect = document.createElement("select");
    for (const target of targets) {
        const option = document.createElement("option");
        option.value = target.id;
        option.textContent = target.path;
        intoSelect.append(option);
    }
    if (state.targetId) intoSelect.value = state.targetId;
    intoSelect.addEventListener("change", () => {
        state.targetId = intoSelect.value;
    });
    intoLabel.append(intoSelect);
    controls.append(intoLabel);

    const columnsLabel = el("label", null);
    columnsLabel.append(el("span", null, "Columns"));
    const columnsInput = document.createElement("input");
    columnsInput.type = "number";
    columnsInput.min = "1";
    columnsInput.max = "100";
    columnsInput.value = String(state.gridColumns);
    columnsInput.addEventListener("change", () => {
        state.gridColumns = Number(columnsInput.value);
    });
    columnsLabel.append(columnsInput);
    controls.append(columnsLabel);

    const rowsLabel = el("label", null);
    rowsLabel.append(el("span", null, "Rows"));
    const rowsInput = document.createElement("input");
    rowsInput.type = "number";
    rowsInput.min = "1";
    rowsInput.max = "100";
    rowsInput.value = String(state.gridRows);
    rowsInput.addEventListener("change", () => {
        state.gridRows = Number(rowsInput.value);
    });
    rowsLabel.append(rowsInput);
    controls.append(rowsLabel);

    const organizedLabel = el("label", null);
    const organizedInput = document.createElement("input");
    organizedInput.type = "checkbox";
    organizedInput.checked = state.organized;
    organizedInput.addEventListener("change", () => {
        state.organized = organizedInput.checked;
        render();
    });
    organizedLabel.append(organizedInput);
    organizedLabel.append(el("span", null, "Organized"));
    controls.append(organizedLabel);

    panel.append(controls);

    /* ----- scan box ----- */
    const scanInput = document.createElement("input");
    scanInput.type = "text";
    scanInput.className = "cdd-scan-input";
    scanInput.placeholder = "Scan a rack barcode";
    scanInput.autocomplete = "off";
    scanInput.spellcheck = false;
    panel.append(scanInput);

    /* ----- list ----- */
    const list = el("div", "cdd-scan-list");
    panel.append(list);

    /* ----- foot ----- */
    const foot = el("div", "cdd-scan-foot");
    const createButton = el("button", "cdd-scan-create", "Create 0 boxes");
    createButton.type = "button";
    const closeButton = el("button", "cdd-scan-close", "Cancel");
    closeButton.type = "button";
    closeButton.addEventListener("click", () => closeScanPanel());
    const status = el("span", "cdd-scan-status");
    foot.append(createButton, closeButton, status);
    panel.append(foot);

    /* ----- rendering ----- */
    function render() {
        columnsInput.disabled = !state.organized || state.busy;
        rowsInput.disabled = !state.organized || state.busy;
        organizedInput.disabled = state.busy;
        intoSelect.disabled = state.busy;
        scanInput.disabled = state.busy;

        list.textContent = "";
        if (!state.scans.length) {
            list.append(el("p", "cdd-scan-empty", "Nothing scanned yet."));
        }

        state.scans.forEach((scan, index) => {
            const row = el("div", "cdd-scan-row");
            if (scan.status === SCAN_IN_TREE || scan.status === SCAN_IN_LIST) {
                row.classList.add("cdd-scan-row--refused");
            }
            if (scan.status === SCAN_CREATED) row.classList.add("cdd-scan-row--created");

            row.append(el("span", "cdd-scan-ordinal", String(index + 1)));
            row.append(el("span", "cdd-scan-name", scan.name));

            if (scan.status === SCAN_IN_TREE) {
                row.append(el("span", "cdd-scan-why", `already in ${scan.where}`));
            } else if (scan.status === SCAN_IN_LIST) {
                row.append(el("span", "cdd-scan-why", "already in the list"));
            } else if (scan.status === SCAN_CREATED) {
                row.append(el("span", "cdd-scan-why", "created"));
            }

            if (scan.status !== SCAN_CREATED && !state.busy) {
                const drop = el("button", "cdd-scan-drop", "\u2715");
                drop.type = "button";
                drop.title = "Remove";
                drop.addEventListener("click", () => {
                    state.scans.splice(index, 1);
                    render();
                    scanInput.focus();
                });
                row.append(drop);
            }

            list.append(row);
        });

        const count = acceptedScans(state.scans).length;
        createButton.textContent = count === 1 ? "Create 1 box" : `Create ${count} boxes`;
        createButton.disabled = state.busy || count === 0 || !state.targetId;

        status.textContent = state.status;
        status.classList.toggle("cdd-scan-status--ok", state.statusOk);

        list.scrollTop = list.scrollHeight;
    }

    function commitScan() {
        const scan = classifyScan(scanInput.value, nodes, state.scans);
        scanInput.value = "";
        if (!scan) return;
        state.scans.push(scan);
        state.status = "";
        render();
    }

    /* ----- the create run ----- */
    async function createAll() {
        const pending = acceptedScans(state.scans);
        if (state.busy || !pending.length || !state.targetId) return;

        state.busy = true;
        state.status = "";
        state.statusOk = false;
        render();

        let made = 0;
        try {
            for (const scan of pending) {
                await createBoxUnder(dialog, {
                    parentId: state.targetId,
                    name: scan.name,
                    columns: state.gridColumns,
                    rows: state.gridRows,
                    organized: state.organized,
                });
                scan.status = SCAN_CREATED;
                made += 1;
                render();
            }
            closeScanPanel();
        } catch (error) {
            // Whatever was created stays: those rows are in the tree, they are
            // visible, and discarding them is what CDD's own Cancel is for.
            state.busy = false;
            state.status = `Created ${made} of ${pending.length}. `
                + `Stopped at "${pending[made]?.name}" — ${error.message}.`;
            state.statusOk = false;
            render();
        }
    }

    createButton.addEventListener("click", createAll);

    /* ----- Enter ----- */
    function onKeyDown(event) {
        if (event.key !== "Enter") return;
        if (!dialog.contains(event.target) && event.target !== scanInput) return;

        event.preventDefault();
        event.stopImmediatePropagation();

        if (state.busy) return;
        if (event.target === scanInput) commitScan();
        else scanInput.focus();
    }

    window.addEventListener("keydown", onKeyDown, true);

    /* ----- mount ----- */
    const contentPosition = content.style.position;
    if (!contentPosition) content.style.position = "relative";

    const left = findLeftColumn(dialog);
    panel.style.left = `${left ? left.offsetWidth : 320}px`;

    content.append(panel);
    open = { panel, content, contentPosition, onKeyDown };

    if (!targets.length) {
        state.status = "There is no location that can hold a box. Create one first.";
        scanInput.disabled = true;
    }

    render();
    scanInput.focus();
}

export function isScanPanelOpen() {
    return open !== null;
}
```

- [ ] **Step 3: Write the discovery**

Create `src/content/features/ui-fixes/inventory-location-scan/init.js`:

```js
// content/features/ui-fixes/inventory-location-scan/init.js
//
// Discovery + wiring. The only thing content/main.js imports from this feature.
//
// CDD is a Turbo SPA and MUI mounts the Edit Locations dialog fresh every time,
// so the watcher sits on `document.documentElement` (which survives <body>
// swaps) and rescans, rAF-debounced. The button is a child of the dialog's own
// footer, so React removing the dialog removes the button with it — and the
// panel too, which is a child of the dialog's content box.
//
// The switch is read from the sync cache on every scan rather than once at
// start-up, so flipping it in the options page adds or removes the button on a
// dialog that is already open.

import {
    isInventoryScanEnabled,
    onInventoryScanChanged,
} from "../../../../shared/inventory-scan.js";
import { findDialog, findFooter, footerAnchor } from "./dialog-dom.js";
import { closeScanPanel, openScanPanel } from "./scan-panel.js";
import { injectScanStyles } from "./styles.js";

const BUTTON_CLASS = "cdd-scan-open";

let started = false;

function mount(dialog) {
    const footer = findFooter(dialog);
    if (!footer) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = BUTTON_CLASS;
    button.textContent = "Scan racks";
    button.addEventListener("click", () => openScanPanel(dialog));

    const anchor = footerAnchor(dialog, footer);
    if (anchor) footer.insertBefore(button, anchor);
    else footer.prepend(button);
}

function sync() {
    const dialog = findDialog();
    if (!dialog) {
        closeScanPanel();
        return;
    }

    const existing = dialog.querySelector(`.${BUTTON_CLASS}`);
    if (isInventoryScanEnabled()) {
        if (!existing) mount(dialog);
    } else if (existing) {
        existing.remove();
        closeScanPanel();
    }
}

export function initInventoryLocationScan() {
    injectScanStyles();

    if (started) return;
    started = true;

    let scheduled = false;

    function schedule() {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            try {
                sync();
            } catch (error) {
                // A broken button must never cost the user the dialog.
                console.warn("[CDD scan-racks] mount failed", error);
            }
        });
    }

    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
    });

    onInventoryScanChanged(schedule);
    schedule(); // the dialog could already be open
}
```

- [ ] **Step 4: Wire it into `main.js`**

In `src/content/main.js`, add the import next to `initInventoryLocationTree`:

```js
import {initInventoryLocationScan} from "./features/ui-fixes/inventory-location-scan/init";
```

and the call immediately after `initInventoryLocationTree();`:

```js
  // "Scan racks" in the Edit Locations dialog: a barcode scanner's Enter is
  // Save there, which made adding a shelf of racks one round trip per rack.
  // Off unless switched on in the options page.
  initInventoryLocationScan();
```

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: both bundles build with no error.

- [ ] **Step 6: Verify by hand**

Ask the user to reload the unpacked extension, refresh a vault, switch
**Scan racks** on in the options page, then open *Settings → Sample/Inventory
Fields → Add/Edit Inventory Fields → Edit Locations*.

Expected:
1. `Scan racks` sits to the left of `Print Labels`.
2. Clicking it opens the panel over the right pane, cursor in the scan box,
   `Into` preselected to the location selected in the tree (or its nearest
   eligible ancestor), `12 × 8`, `Organized` ticked.
3. `Into` lists locations only — no boxes, and not the root `Locations`.
4. Typing a code and pressing Enter adds a row and **the dialog stays open**.
5. Scanning the same code again, or the name of a box already in the tree, adds
   a struck-through row that says why, and the button's count does not move.
6. `✕` removes a row. `Cancel` closes the panel and leaves the dialog alone.
7. Switching the option off while the dialog is open removes the button.

- [ ] **Step 7: Commit**

```bash
git add src/content/features/ui-fixes/inventory-location-scan/ src/content/main.js
git commit -m "scan racks: the panel"
```

---

### Task 6: The create run, end to end

**Files:**
- Verify only: `scan-panel.js` and `dialog-dom.js` from Tasks 4-5

**Interfaces:**
- Consumes: everything above. Produces nothing new — this task is the live
  proof that `createBoxUnder` drives CDD correctly, which no `node` check can
  give.

- [ ] **Step 1: Verify the happy path**

Ask the user to scan (or type) three codes into the panel and press
`Create 3 boxes`.

Expected: the panel closes; three new rows appear under the chosen location in
the tree, named exactly as scanned; selecting one shows `12` columns, `8` rows,
`Organized` ticked, and a 12 × 8 grid preview. **The dialog is still open and
nothing has been saved.**

- [ ] **Step 2: Verify that Cancel really discards**

Ask the user to press CDD's `Cancel`, then reopen `Edit Locations`.
Expected: the three boxes are gone.

- [ ] **Step 3: Verify the commit path**

Ask the user to repeat the scan and press CDD's `Save`.
Expected: the dialog closes and the boxes persist. Opening an inventory sample's
location picker then offers them.

- [ ] **Step 4: Verify the unorganized path**

Ask the user to untick `Organized`, scan one code, and create it.
Expected: one box with the hatched icon, no grid, and the columns/rows boxes in
the panel were greyed out while it was unticked.

- [ ] **Step 5: If anything failed, fix it and re-run**

Any failure here is a `dialog-dom.js` bug — the timing of `waitFor`, the
`Mui-selected` check, or the number-input order. Fix, `npm run build`, and ask
for the reload again. Commit the fix on its own:

```bash
git add src/content/features/ui-fixes/inventory-location-scan/
git commit -m "scan racks: fix the create run"
```

---

### Task 7: Docs and release

**Files:**
- Modify: `docs/FEATURE_CATALOG.md`
- Modify: `manifest.json`, `CHANGELOG.md`, `RELEASES.md`

- [ ] **Step 1: Add the catalog entry**

Open `docs/FEATURE_CATALOG.md`, find the section the other inventory/location
features are listed in, and add an entry in that section's existing format,
covering: what it does (scan a shelf of racks into one location in a single
pass), where it lives (`src/content/features/ui-fixes/inventory-location-scan/`),
where the user finds it (the `Edit Locations` dialog footer), and that it is off
by default behind `cddInventoryScanEnabled`.

- [ ] **Step 2: Bump the version**

In `manifest.json`, `15.8.0` → `15.9.0`. A new feature behind a new setting is
a minor.

- [ ] **Step 3: Write the CHANGELOG entry**

At the top of `CHANGELOG.md`, in the file's existing format, under
`## 15.9.0 — 2026-09-07`. This is the record, so it may explain why: the
scanner's Enter is Save in that dialog; the name arrives pre-filled and
selected, which is why the scan lands in it and why the Enter is fatal; the box
arrives 9 × 9 and an SBS rack is 12 × 8. Then what was built — the footer
button, the collecting panel, whole-tree duplicate refusal, the create run
through CDD's own controls — and the one line that matters most: **the
extension never presses Save.** Note the measured DOM facts that the code
depends on (the `display: none` eligibility rule, the add-box button creating
the box outright, `.Mui-selected` rather than `aria-selected`).

- [ ] **Step 4: Write the RELEASES entry**

At the top of `RELEASES.md`, under `## 15.9.0 — 2026-09-07`. This is the
*What's new* page — one opening sentence plus at most two or three short
bullets, in the words a chemist would use, naming the path to the switch.
Write it, then cut it roughly in half. Do not explain why it was built.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: both bundles build with no error.

- [ ] **Step 6: Commit everything and STOP**

```bash
git add -A
git commit -m "15.9.0 — scan a shelf of racks into one location"
```

Then say the commit is ready and **wait**. Per `CLAUDE.md`: do not
`git push`, do not tag. The user tests from `dist/` and decides when it ships.
