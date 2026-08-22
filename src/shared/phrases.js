// shared/phrases.js
//
// SINGLE SOURCE OF TRUTH for saved phrases: snippets of ELN text the user
// marked, filed under one or more categories, and copies back out with a
// click from the floating panel.
//
// Imported by BOTH execution contexts, like name-memory.js:
//   - the content script  → saves a selection, lists phrases, copies one
//   - the options page    → renames, re-files, deletes, exports, imports
//
// DOM is used ONLY inside sanitizePhraseHtml (DOMParser — present in both
// contexts). Nothing here imports another module.
//
// A phrase keeps two bodies: `text` (plain) and `html` (formatting kept).
// The clipboard gets both, so pasting into the ELN restores bold / lists /
// tables while pasting into Excel or a plain field gets clean text.
//
// Capped at PHRASE_LIMIT. Over the cap, the phrase that was COPIED least
// recently goes — a phrase never copied counts from the moment it was
// saved. Using = clicking it in the panel (which is what puts it on the
// clipboard); merely looking at it does not count.

export const PHRASES_STORAGE_KEY = "cddPhrasesV1";
export const PHRASE_LIMIT = 50;
export const PHRASE_NAME_MAX = 80;
export const PHRASE_CATEGORY_MAX = 40;
export const PHRASE_TEXT_MAX = 20000;
export const PHRASE_HTML_MAX = 60000;

// ---------------------------------------------------------------------------
// Sanitising
// ---------------------------------------------------------------------------

// Tags that survive in a stored phrase. Everything else is unwrapped (its
// text is kept, the tag is not). Script-like elements are dropped WITH their
// content.
const ALLOWED_TAGS = new Set([
    "p", "br", "h1", "h2", "h3", "h4", "h5", "h6",
    "strong", "b", "em", "i", "u", "s", "sub", "sup", "code", "pre",
    "ul", "ol", "li", "blockquote", "a", "hr",
    "table", "thead", "tbody", "tr", "th", "td",
]);
const DROPPED_TAGS = new Set([
    "script", "style", "iframe", "object", "embed", "template", "svg", "math",
    "noscript", "link", "meta", "input", "button", "select", "textarea",
]);

// Slate's editor DOM keeps zero-width / BOM placeholders in empty leaves.
const INVISIBLE_RE = /[\u200B\u200C\u200D\uFEFF]/g;

function safeHref(value) {
    const href = String(value ?? "").trim();
    if (!/^(https?:|mailto:)/i.test(href)) return null;
    return href;
}

function sanitizeNode(node, out) {
    for (const child of [...node.childNodes]) {
        if (child.nodeType === Node.TEXT_NODE) {
            const text = child.nodeValue.replace(INVISIBLE_RE, "");
            if (text) out.appendChild(out.ownerDocument.createTextNode(text));
            continue;
        }
        if (child.nodeType !== Node.ELEMENT_NODE) continue;

        const tag = child.tagName.toLowerCase();
        if (DROPPED_TAGS.has(tag)) continue;

        if (!ALLOWED_TAGS.has(tag)) {
            // Unwrap: keep the content, lose the element.
            sanitizeNode(child, out);
            continue;
        }

        const clean = out.ownerDocument.createElement(tag);
        if (tag === "a") {
            const href = safeHref(child.getAttribute("href"));
            if (href) clean.setAttribute("href", href);
        }
        if ((tag === "td" || tag === "th")) {
            for (const attr of ["colspan", "rowspan"]) {
                const v = parseInt(child.getAttribute(attr), 10);
                if (v > 1) clean.setAttribute(attr, String(v));
            }
        }
        sanitizeNode(child, clean);
        out.appendChild(clean);
    }
}

// Whitelist-sanitise an HTML string. Returns "" when nothing but whitespace
// survives. Safe to call on untrusted input (imports).
export function sanitizePhraseHtml(html) {
    const source = String(html ?? "");
    if (!source.trim()) return "";
    if (typeof DOMParser === "undefined") return "";

    const doc = new DOMParser().parseFromString(
        `<body>${source.slice(0, PHRASE_HTML_MAX * 2)}</body>`,
        "text/html"
    );
    const out = doc.createElement("div");
    sanitizeNode(doc.body, out);

    if (!out.textContent.trim() && !out.querySelector("br, table")) return "";
    return out.innerHTML.slice(0, PHRASE_HTML_MAX);
}

function cleanText(value, max) {
    return String(value ?? "").replace(INVISIBLE_RE, "").trim().slice(0, max);
}

// Normalise an arbitrary stored / imported phrase. Returns null when it has
// no usable body.
export function sanitizePhrase(raw) {
    if (!raw || typeof raw !== "object") return null;

    const text = cleanText(raw.text, PHRASE_TEXT_MAX);
    const html = sanitizePhraseHtml(raw.html);
    if (!text && !html) return null;

    const id = typeof raw.id === "string" && /^[\w-]{4,40}$/.test(raw.id)
        ? raw.id
        : makePhraseId();

    return {
        id,
        name: cleanText(raw.name, PHRASE_NAME_MAX) || defaultPhraseName(text),
        categories: sanitizeCategories(raw.categories, raw),
        text: text || "",
        html,
        createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : 0,
        lastUsedAt: Number.isFinite(raw.lastUsedAt) ? raw.lastUsedAt : 0,
    };
}

// Normalise the whole stored list. Used on every read AND write so neither
// context ever trusts raw storage. Pure apart from id generation.
export function sanitizePhrases(raw) {
    const list = Array.isArray(raw) ? raw : Array.isArray(raw?.phrases) ? raw.phrases : [];
    const out = [];
    const seen = new Set();
    for (const item of list) {
        const phrase = sanitizePhrase(item);
        if (!phrase || seen.has(phrase.id)) continue;
        seen.add(phrase.id);
        out.push(phrase);
    }
    return enforceLimit(out);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function makePhraseId() {
    const rand = Math.random().toString(36).slice(2, 10);
    return `ph-${Date.now().toString(36)}-${rand}`;
}

// First line, trimmed to something that fits a panel row.
export function defaultPhraseName(text) {
    const firstLine = String(text ?? "").split(/\r?\n/).find((l) => l.trim()) || "";
    const flat = firstLine.replace(/\s+/g, " ").trim();
    return flat.length > 48 ? `${flat.slice(0, 47)}…` : flat || "Phrase";
}

// When a phrase was last "used" for eviction purposes.
function usedStamp(phrase) {
    return phrase.lastUsedAt || phrase.createdAt || 0;
}

// Drop the least recently used phrases until the list fits the cap.
export function enforceLimit(list, limit = PHRASE_LIMIT) {
    if (list.length <= limit) return list;
    const keep = [...list].sort((a, b) => usedStamp(b) - usedStamp(a)).slice(0, limit);
    const keepIds = new Set(keep.map((p) => p.id));
    return list.filter((p) => keepIds.has(p.id));
}

// ---------------------------------------------------------------------------
// Categories — a phrase can be filed under several. One level only.
// ---------------------------------------------------------------------------

// Distinct, trimmed, capped, in the order given. `legacy` is a phrase from
// before categories became a list (single `category` / `places` fields).
export function sanitizeCategories(raw, legacy = null) {
    const out = [];
    const seen = new Set();
    const push = (value) => {
        const name = cleanText(value, PHRASE_CATEGORY_MAX);
        if (!name) return;
        const key = name.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        out.push(name);
    };
    if (Array.isArray(raw)) raw.forEach(push);
    if (!out.length && legacy) {
        push(legacy.category);
        if (Array.isArray(legacy.places)) legacy.places.forEach((pl) => push(pl?.category));
    }
    return out;
}

// Category → phrases, sorted for display. A phrase in several categories
// appears under each; uncategorised ones come last under "".
export function groupPhrases(list) {
    const byCategory = new Map();
    for (const phrase of list) {
        const cats = phrase.categories.length ? phrase.categories : [""];
        for (const cat of cats) {
            if (!byCategory.has(cat)) byCategory.set(cat, []);
            byCategory.get(cat).push(phrase);
        }
    }
    const byName = (a, b) => a.localeCompare(b, undefined, { sensitivity: "base" });
    const keyOrder = (a, b) => (a === "" ? 1 : b === "" ? -1 : byName(a, b));
    return [...byCategory.keys()].sort(keyOrder).map((category) => ({
        category,
        phrases: byCategory.get(category).slice().sort((a, b) => byName(a.name, b.name)),
    }));
}

// Every category in use, sorted.
export function phraseCategories(list) {
    const byKey = new Map();
    for (const p of list) for (const c of p.categories) byKey.set(c.toLowerCase(), c);
    return [...byKey.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}


// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

export async function loadPhrases() {
    try {
        const result = await chrome.storage.local.get(PHRASES_STORAGE_KEY);
        return sanitizePhrases(result?.[PHRASES_STORAGE_KEY]);
    } catch {
        return [];
    }
}

export async function savePhrases(list) {
    try {
        await chrome.storage.local.set({
            [PHRASES_STORAGE_KEY]: sanitizePhrases(list),
        });
    } catch {
        // An invalidated extension context (the extension reloaded while the
        // page stayed open) has no storage any more — nothing to do.
    }
}

// Add one phrase; evicts the least recently used one when over the cap.
// Returns the stored phrase.
export async function addPhrase(draft) {
    const now = Date.now();
    const phrase = sanitizePhrase({ ...draft, id: makePhraseId(), createdAt: now, lastUsedAt: now });
    if (!phrase) return null;
    const list = await loadPhrases();
    await savePhrases(enforceLimit([...list, phrase]));
    return phrase;
}

export async function updatePhrase(id, patch) {
    const list = await loadPhrases();
    const index = list.findIndex((p) => p.id === id);
    if (index < 0) return null;
    const next = sanitizePhrase({ ...list[index], ...patch, id });
    if (!next) return null;
    list[index] = next;
    await savePhrases(list);
    return next;
}

export async function removePhrase(id) {
    const list = await loadPhrases();
    await savePhrases(list.filter((p) => p.id !== id));
}

// "Used" = copied to the clipboard.
export async function touchPhrase(id) {
    const list = await loadPhrases();
    const phrase = list.find((p) => p.id === id);
    if (!phrase) return;
    phrase.lastUsedAt = Date.now();
    await savePhrases(list);
}

// Rename a category across every phrase. An empty new name removes it.
export async function renamePhraseCategory(category, newCategory) {
    const list = await loadPhrases();
    for (const p of list) {
        p.categories = sanitizeCategories(
            p.categories.map((c) => (c === category ? newCategory : c))
        );
    }
    await savePhrases(list);
}

// Take a category away from every phrase (the phrases stay).
export async function removePhraseCategory(category) {
    return renamePhraseCategory(category, "");
}

// Fires after any change, from either context.
export function onPhrasesChanged(listener) {
    try {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== "local" || !changes[PHRASES_STORAGE_KEY]) return;
            listener(sanitizePhrases(changes[PHRASES_STORAGE_KEY].newValue));
        });
    } catch {
        /* no storage, no notifications */
    }
}

// ---------------------------------------------------------------------------
// Export / import
// ---------------------------------------------------------------------------

export function exportPhrasesJson(list) {
    return JSON.stringify(
        { format: "cdd-stoich-tools-phrases", version: 1, exportedAt: new Date().toISOString(), phrases: list },
        null,
        2
    );
}

// Parse an export file. Returns { phrases, error }.
export function parsePhrasesJson(text) {
    let parsed;
    try {
        parsed = JSON.parse(String(text ?? ""));
    } catch {
        return { phrases: [], error: "Not a JSON file." };
    }
    const phrases = sanitizePhrases(parsed);
    if (!phrases.length) return { phrases: [], error: "No phrases found in this file." };
    return { phrases, error: null };
}

// Merge imported phrases into the stored list. A phrase with the same id
// replaces the stored one; the cap evicts by last use as usual.
// `mode`: "merge" (default) or "replace".
export async function importPhrases(imported, mode = "merge") {
    const incoming = sanitizePhrases(imported);
    if (mode === "replace") {
        await savePhrases(incoming);
        return incoming.length;
    }
    const current = await loadPhrases();
    const byId = new Map(current.map((p) => [p.id, p]));
    for (const p of incoming) byId.set(p.id, p);
    await savePhrases(enforceLimit([...byId.values()]));
    return incoming.length;
}
