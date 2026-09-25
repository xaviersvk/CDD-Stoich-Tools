# Next Step Reaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A *Copy as next step* button on every ELN reaction that puts a new reaction on the clipboard — this reaction's products as its reactants, arrow kept, product side empty — for the user to paste with Ctrl+V.

**Architecture:** A pure module rewrites the reaction's data (MRV drawing by string surgery, stoichiometry rows, lookup maps) and encodes/decodes CDD's clipboard fragment. A content feature puts a hover button on each reaction (the print-button pattern), fetches the saved entry, picks the reaction by its position in the body, rebuilds the preview image by deflating the new MRV, and writes the clipboard in CDD's format. Spec: `docs/superpowers/specs/2026-09-25-next-step-reaction-design.md`.

**Tech Stack:** Plain ES modules, Vite, throwaway `node` test (Node ≥ 18: `CompressionStream`, `btoa` are global).

## Global Constraints

- Clipboard only. Never insert into the entry. Never write to CDD.
- Clipboard text: `application/x-slate-fragment:` + `btoa(encodeURIComponent(JSON.stringify([node])))`; html item `<br>`.
- Node: `{ type: "reaction", key: <fresh>, children: [{ text: "" }], data }`. CDD assigns feature id, nodeKey and a new structure on paste — do not clear ids.
- New rows: only old `role: "product"` rows → `role: "reactant"`, uid 1…n, order 0…n-1, no `displayIndex`, no `yield`; first row limiting reagent; `mole = mass × purity / formulaWeight` (g, mol); `moleffective` = the limiting reagent's mole on every row; `equivalent = mole / LR mole`.
- `image` = same `/cdd/molecule_image?...` URL with `structure` = base64(zlib-deflate(new MRV)).
- No product, or a parallel reaction (`role` starting `parallel`) → nothing copied; the click flashes `!` with *No product to carry over* / *Not for parallel reactions* (the button does not fetch before a click, so it cannot know up front — a deviation from the spec's "disabled").
- Button: hover-revealed like the print button (`print-buttons.js`: absolute, `top: 8px`, here `right: 104px`). Not inserted into CDD's React toolbar (rendered only on hover and re-rendered by React).
- Commit per task. Do not push.

---

### Task 1: Pure model — `src/shared/next-step-reaction.js` (+ node test)

**Files:**
- Create: `src/shared/next-step-reaction.js`
- Test (throwaway): `<scratchpad>/next-step.test.mjs`

**Interfaces — Produces:**
- `nextStepBlocker(data) → null | "no-product" | "parallel"`
- `buildNextStepData(data) → data'` (throws if blocked)
- `rewriteMrv(mrv) → mrv'`
- `encodeFragment(nodes) → string`, `decodeFragment(text) → nodes | null`
- `withImageStructure(imageUrl, base64) → imageUrl'`

- [ ] **Step 1: Write the failing test** — synthetic MRV in the measured shape: two reactants left of an arrow at x1=13, x2=14.5; one product with a NESTED superatom molecule right of it; one "+" left of the arrow, one right of it (two products case in a second fixture); an `MTextBox`. Rows: 2 reactants, 1 product (mass 1.2, FW 334.8, yield 8.9), 2 agents. Assert:
  - `rewriteMrv`: `<productList/>` empty, `<agentList/>` empty, reactantList holds the product molecule(s) incl. the nested one, every moved `x2` shifted by the same delta, the rightmost moved atom at `x1 − gap` (gap = x1 − old reactants' max x), no "+" left of the arrow, product-side "+" kept and shifted by the same delta, no `MTextBox`, arrow unchanged.
  - `buildNextStepData`: one row, `role: "reactant"`, uid 1, `limitingReagent: true`, `equivalent: 1`, `mole ≈ 1.2/334.8`, no `yield`; `currentRowUid: 2`; `batches/samples/molecules/structureMrv` trimmed to the product's ids.
  - `nextStepBlocker` for no product and for parallel rows.
  - `decodeFragment(encodeFragment(x))` deep-equals `x`; `decodeFragment("hello") === null`.
  - `withImageStructure("/cdd/molecule_image?auto_scale=1&structure=OLD&width=300", "a+b/c=")` keeps the other params and round-trips `structure` through `URLSearchParams`.

- [ ] **Step 2: Run** `node <scratchpad>/next-step.test.mjs` → fails (module missing).

- [ ] **Step 3: Implement**

```js
// shared/next-step-reaction.js
//
// "Copy as next step": this reaction's products become the reactants of a
// new one. Pure — no DOM, no fetch — so it runs in node.
//
// Everything here was measured on entry 1000000814 (2026-09-25); see
// docs/superpowers/specs/2026-09-25-next-step-reaction-design.md.

const FRAGMENT_PREFIX = "application/x-slate-fragment:";

const roleOf = (row) => String(row?.role || "").toLowerCase();

export function nextStepBlocker(data) {
    const rows = data?.stoichiometryTable?.rows || [];
    if (rows.some((r) => roleOf(r).startsWith("parallel"))) return "parallel";
    if (!rows.some((r) => roleOf(r) === "product")) return "no-product";
    return null;
}

/* ---------------- MRV ---------------- */

// MRV is machine-written ChemAxon XML; the lists are flat siblings and a
// superatom (Boc) is a <molecule> nested INSIDE its parent molecule, so a
// list's content is taken whole, never molecule by molecule.
function listBody(mrv, name) {
    const m = mrv.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
    return m ? m[1] : "";
}

function replaceList(mrv, name, body) {
    const re = new RegExp(`<${name}>[\\s\\S]*?</${name}>|<${name}\\s*/>`);
    return mrv.replace(re, body ? `<${name}>${body}</${name}>` : `<${name}/>`);
}

function atomXs(xml) {
    return [...xml.matchAll(/<atom\b[^>]*\bx2="(-?[\d.]+)"/g)].map((m) => parseFloat(m[1]));
}

function shiftAtoms(xml, dx) {
    return xml.replace(/(<atom\b[^>]*\bx2=")(-?[\d.]+)(")/g,
        (_, a, x, b) => `${a}${(parseFloat(x) + dx).toFixed(4)}${b}`);
}

// A "+" sign: <MReactionSign …>…<MPoint x=".." y=".."/>…</MReactionSign>.
function signX(sign) {
    const xs = [...sign.matchAll(/<MPoint\b[^>]*\bx="(-?[\d.]+)"/g)].map((m) => parseFloat(m[1]));
    return xs.length ? Math.min(...xs) : NaN;
}

function shiftSign(sign, dx) {
    return sign.replace(/(<MPoint\b[^>]*\bx=")(-?[\d.]+)(")/g,
        (_, a, x, b) => `${a}${(parseFloat(x) + dx).toFixed(4)}${b}`);
}

export function rewriteMrv(mrv) {
    const arrow = mrv.match(/<arrow\b[^>]*\bx1="(-?[\d.]+)"[^>]*\bx2="(-?[\d.]+)"/);
    if (!arrow) throw new Error("reaction drawing has no arrow");
    const x1 = parseFloat(arrow[1]);
    const x2 = parseFloat(arrow[2]);

    const reactants = listBody(mrv, "reactantList");
    const products = listBody(mrv, "productList");
    const productXs = atomXs(products);
    if (!productXs.length) throw new Error("reaction drawing has no product");

    const reactantXs = atomXs(reactants);
    const gap = reactantXs.length ? Math.max(0.8, x1 - Math.max(...reactantXs)) : 1.5;
    const dx = (x1 - gap) - Math.max(...productXs);

    let out = replaceList(mrv, "reactantList", shiftAtoms(products, dx));
    out = replaceList(out, "agentList", "");
    out = replaceList(out, "productList", "");

    // "+" left of the arrow joined the old reactants: gone. Right of it they
    // joined the products, which move — the sign moves with them.
    out = out.replace(/<MReactionSign\b[\s\S]*?<\/MReactionSign>/g, (sign) => {
        const x = signX(sign);
        return Number.isFinite(x) && x > x2 ? shiftSign(sign, dx) : "";
    });
    out = out.replace(/<MTextBox\b[\s\S]*?<\/MTextBox>/g, "");
    return out;
}

/* ---------------- rows ---------------- */

function keepKeys(map, ids) {
    return Object.fromEntries(
        Object.entries(map || {}).filter(([k]) => ids.has(String(k)))
    );
}

function moleOf(row) {
    const mass = Number(row.mass);
    const fw = Number(row.formulaWeight);
    if (!Number.isFinite(mass) || !Number.isFinite(fw) || fw <= 0) return row.mole ?? null;
    const purity = Number.isFinite(Number(row.purity)) ? Number(row.purity) : 1;
    return (mass * purity) / fw;
}

export function buildNextStepData(data) {
    const blocker = nextStepBlocker(data);
    if (blocker) throw new Error(`next step blocked: ${blocker}`);

    const table = data.stoichiometryTable;
    const rows = table.rows
        .filter((r) => roleOf(r) === "product")
        .map((r, i) => {
            const row = JSON.parse(JSON.stringify(r));
            delete row.yield;
            delete row.displayIndex;
            row.uid = i + 1;
            row.order = i;
            row.role = "reactant";
            row.inDrawing = true;
            row.mole = moleOf(row);
            return row;
        });

    const lrMole = rows[0].mole;
    rows.forEach((row, i) => {
        row.limitingReagent = i === 0;
        row.moleffective = lrMole;
        row.equivalent = i === 0 || !lrMole || row.mole == null ? 1 : row.mole / lrMole;
    });

    const moleculeIds = new Set(rows.map((r) => String(r.moleculeId)));
    const batchIds = new Set(rows.map((r) => String(r.batchId)));
    const structureIds = new Set(rows.map((r) => String(r.rdkitStructureId)));

    return {
        ...data,
        mrv: rewriteMrv(data.mrv),
        structureMrv: keepKeys(data.structureMrv, structureIds),
        stoichiometryTable: {
            ...table,
            rows,
            currentRowUid: rows.length + 1,
            batches: keepKeys(table.batches, moleculeIds),
            samples: keepKeys(table.samples, batchIds),
            molecules: keepKeys(table.molecules, structureIds),
        },
    };
}

/* ---------------- clipboard / image ---------------- */

export function encodeFragment(nodes) {
    return FRAGMENT_PREFIX + btoa(encodeURIComponent(JSON.stringify(nodes)));
}

export function decodeFragment(text) {
    if (typeof text !== "string" || !text.startsWith(FRAGMENT_PREFIX)) return null;
    try {
        return JSON.parse(decodeURIComponent(atob(text.slice(FRAGMENT_PREFIX.length))));
    } catch {
        return null;
    }
}

// `structure` is base64 of the zlib-deflated MRV; the rest of the URL
// (size, format) stays as CDD built it.
export function withImageStructure(imageUrl, base64) {
    const url = new URL(imageUrl, "https://x.invalid");
    url.searchParams.set("structure", base64);
    return url.pathname + "?" + url.searchParams.toString();
}
```

- [ ] **Step 4: Run the test** → PASS.
- [ ] **Step 5: Commit** `next step reaction: pure model`.

### Task 2: Feature — `src/content/features/next-step-reaction.js`, wired in `main.js` and `message-router.js`

**Interfaces — Consumes:** everything Task 1 produces. **Produces:** `ensureNextStepButtons()` (idempotent; call wherever `ensurePrintButtons()` is called).

- [ ] **Step 1: Implement**

```js
// content/features/next-step-reaction.js
//
// "Copy as next step" on every ELN reaction: a new reaction whose reactants
// are this one's products goes on the clipboard, in the exact format CDD's
// own Copy reaction writes, for the user to paste with Ctrl+V (below a
// reaction or into a paragraph — pasting above a reaction inserts nothing).
//
// Built from the SAVED entry, fetched on click: the reaction on screen is a
// Slate node that only names its feature, and the feature data lives in
// the entry. Reactions are matched by position — the n-th reaction in the
// editor is the n-th reaction node of the body.

import {
    nextStepBlocker,
    buildNextStepData,
    encodeFragment,
    withImageStructure,
} from "../../shared/next-step-reaction.js";

const BTN_CLASS = "cdd-stoich-next-step-button";
const STYLE_ID = "cdd-stoich-next-step-styles";

const TITLE = "Copy as next step — products become the reactants";
const BLOCKED_TITLE = {
    "no-product": "No product to carry over",
    parallel: "Not for parallel reactions",
};

function entryPath() {
    const m = location.pathname.match(/^\/vaults\/(\d+)\/eln\/entries\/(\d+)/);
    return m ? `/vaults/${m[1]}/eln/v2/entries/${m[2]}` : null;
}

async function fetchEntry() {
    const path = entryPath();
    if (!path) throw new Error("not an ELN entry");
    const res = await fetch(path, {
        credentials: "include",
        headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

// Feature data of the index-th reaction, in body order.
function reactionData(payload, index) {
    const entry = payload?.eln_entry;
    let body;
    try {
        body = JSON.parse(entry?.body || "null");
    } catch {
        return null;
    }
    const ids = [];
    (function walk(nodes) {
        for (const node of nodes || []) {
            if (node?.type === "reaction" && node?.data?.feature_id != null) {
                ids.push(String(node.data.feature_id));
            }
            walk(node?.children);
        }
    })(body);
    const id = ids[index];
    return id != null ? entry.feature_map?.[id]?.data || null : null;
}

async function deflateBase64(text) {
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("deflate"));
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
}

async function writeClipboard(text) {
    if (typeof ClipboardItem === "function" && navigator.clipboard?.write) {
        await navigator.clipboard.write([
            new ClipboardItem({
                "text/plain": new Blob([text], { type: "text/plain" }),
                "text/html": new Blob(["<br>"], { type: "text/html" }),
            }),
        ]);
        return;
    }
    await navigator.clipboard.writeText(text);
}

async function copyNextStep(index) {
    const data = reactionData(await fetchEntry(), index);
    if (!data) throw new Error("reaction not found — save the entry and try again");

    const blocker = nextStepBlocker(data);
    if (blocker) throw new Error(BLOCKED_TITLE[blocker]);

    const next = buildNextStepData(data);
    next.image = withImageStructure(data.image, await deflateBase64(next.mrv));

    const node = {
        type: "reaction",
        key: `cdd-next-step-${Date.now()}`,
        children: [{ text: "" }],
        data: next,
    };
    await writeClipboard(encodeFragment([node]));
}

function flash(btn, ok, message) {
    btn.textContent = ok ? "✓" : "!";
    btn.title = message;
    setTimeout(() => {
        btn.textContent = "⤳";
        btn.title = TITLE;
    }, ok ? 1500 : 4000);
}

function buildButton(index) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = BTN_CLASS;
    btn.dataset.reactionIndex = String(index);
    btn.textContent = "⤳";
    btn.title = TITLE;
    btn.setAttribute("aria-label", TITLE);

    // Capture phase and stopped: the reaction is a Slate void node that
    // opens its editor and starts drags on pointer events.
    btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        if (btn.disabled) return;
        btn.disabled = true;
        copyNextStep(index)
            .then(() => flash(btn, true, "Copied — paste with Ctrl+V below a reaction"))
            .catch((err) => flash(btn, false, `Copy failed: ${err?.message || err}`))
            .finally(() => { btn.disabled = false; });
    }, true);
    for (const type of ["pointerdown", "mousedown", "dragstart"]) {
        btn.addEventListener(type, (event) => event.stopPropagation(), true);
    }
    return btn;
}

function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        .${BTN_CLASS} {
            position: absolute; top: 8px; right: 104px; z-index: 20;
            width: 28px; height: 25px; padding: 0; margin: 0;
            display: inline-flex; align-items: center; justify-content: center;
            border: 1px solid #d1d5db; border-radius: 8px;
            background: #fff; color: #6b7280; font: 600 15px/1 system-ui, sans-serif;
            box-shadow: 0 1px 2px rgba(0,0,0,0.08); cursor: pointer;
            opacity: 0; pointer-events: none; transition: opacity 0.15s ease;
        }
        [data-autotest-id="reaction"]:hover .${BTN_CLASS},
        [data-autotest-id="reaction"]:focus-within .${BTN_CLASS} {
            opacity: 1; pointer-events: auto;
        }
        .${BTN_CLASS}:hover { background: #f9fafb; border-color: #bfc6cf; color: #374151; }
        .${BTN_CLASS}:disabled { cursor: progress; }
    `;
    document.head.appendChild(style);
}

export function ensureNextStepButtons() {
    const reactions = [...document.querySelectorAll('[data-autotest-id="reaction"]')];
    if (!reactions.length) return;
    ensureStyles();

    reactions.forEach((reactionEl, index) => {
        const existing = reactionEl.querySelector(`.${BTN_CLASS}`);
        if (existing?.dataset.reactionIndex === String(index)) return;
        existing?.remove();

        if (getComputedStyle(reactionEl).position === "static") {
            reactionEl.style.position = "relative";
        }
        reactionEl.appendChild(buildButton(index));
    });
}
```

Blocked reactions (no product / parallel) are reported on click (the `!` flash with the reason) rather than disabled up front: disabling up front needs the entry data, and the button must not fetch until clicked.

- [ ] **Step 2: Wire it** — import `ensureNextStepButtons` next to `ensurePrintButtons` and call it at every place `ensurePrintButtons()` is called: `src/content/main.js` (init and the `watchUrlChanges` callback) and `src/content/message-router.js` (the `PRINT_DATA` timeout).
- [ ] **Step 3: Build** `npm run build` → no errors.
- [ ] **Step 4: Commit** `next step reaction: the button`.

### Task 3: Live check on entry 1000000814, then release 18.1.0

- [ ] User reloads the extension. Hover the reaction → the ⤳ button next to the print button. Click → `✓`. Paste with Ctrl+V below the reaction → a new reaction: products left of the arrow, empty right side, table = the products as reactants with their mass, first one limiting reagent. Also check a reaction with two products if one exists.
- [ ] Bump `manifest.json` to 18.1.0; `CHANGELOG.md` (full detail) and `RELEASES.md` (one sentence + at most 2 bullets, path named: *hover a reaction → ⤳*). Build. Commit. Stop — no push.
