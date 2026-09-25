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
