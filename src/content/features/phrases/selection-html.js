// content/features/phrases/selection-html.js
//
// Turns the current selection inside CDD's ELN editor into the two bodies
// a phrase stores: plain text and semantic HTML.
//
// The editor is Slate. Its DOM is not semantic: every block is a
// `div.slate-<type>` (slate-p, slate-h3, slate-ul, slate-table…) and every
// run of text sits in `span[data-slate-leaf] > span[data-slate-string]`,
// with the marks as real <strong> / <sub> / … INSIDE the leaf. Slate's own
// paste handler deserialises ordinary HTML (<p>, <h3>, <ul>, <strong>…), so
// that is what we produce: block wrappers get renamed by their slate-* class,
// leaves get unwrapped, marks are kept as they are.
//
// Slate-specific blocks that cannot round-trip through HTML — the reaction
// table, attachments, timestamps, structures — keep their visible text only.

const BLOCK_TAGS = {
    p: "p",
    h1: "h1", h2: "h2", h3: "h3", h4: "h4", h5: "h5", h6: "h6",
    ul: "ul", ol: "ol", li: "li",
    blockquote: "blockquote",
    table: "table", tr: "tr", td: "td", th: "th",
    hr: "hr",
    code_block: "pre",
};

const SLATE_CLASS_RE = /^slate-([a-z0-9_]+)$/;

function slateType(element) {
    for (const cls of element.classList) {
        const match = SLATE_CLASS_RE.exec(cls);
        if (match) return match[1];
    }
    return null;
}

function keepElement(out, doc, tag, source) {
    const el = doc.createElement(tag);
    if (tag === "a") {
        const href = source.getAttribute("href");
        if (href) el.setAttribute("href", href);
    }
    out.appendChild(el);
    return el;
}

// Rebuild `node`'s children into `out` as semantic HTML.
//
// What Slate renders, measured on a live entry:
//   div.slate-p      > leaf spans               (no inner <p>)
//   div.slate-h2     > h2 > leaf spans           (real heading inside)
//   div.slate-ul     > ul > div.slate-li > li > div.slate-lic > spans
//   strong.slate-bold, em.slate-italic, sub.slate-subscript … (real marks)
// So: a wrapper DIV whose block already exists inside is unwrapped; one
// that does not get the tag; real tags are kept; other spans/divs unwrap.
function convert(node, out) {
    const doc = out.ownerDocument;

    for (const child of [...node.childNodes]) {
        if (child.nodeType === Node.TEXT_NODE) {
            out.appendChild(doc.createTextNode(child.nodeValue));
            continue;
        }
        if (child.nodeType !== Node.ELEMENT_NODE) continue;

        const tag = child.tagName.toLowerCase();

        if (tag === "br" || tag === "hr") {
            out.appendChild(doc.createElement(tag));
            continue;
        }

        if (tag === "div") {
            const type = slateType(child);
            const blockTag = type ? BLOCK_TAGS[type] : null;

            if (blockTag) {
                if (blockTag === "hr") {
                    out.appendChild(doc.createElement("hr"));
                } else if (child.querySelector(`:scope > ${blockTag}`)) {
                    convert(child, out);
                } else {
                    const el = doc.createElement(blockTag);
                    convert(child, el);
                    out.appendChild(el);
                }
                continue;
            }

            // Slate blocks with no HTML equivalent — reaction table,
            // attachment, timestamp, structure image — keep their text only.
            if (type && type !== "lic") {
                const text = child.innerText ?? child.textContent ?? "";
                if (text.trim()) out.appendChild(doc.createTextNode(text.trim()));
                continue;
            }

            convert(child, out);
            continue;
        }

        if (tag === "span") {
            convert(child, out);
            continue;
        }

        // A real tag: heading, list, table part, link, mark. Kept; the
        // shared sanitiser later drops anything not on its whitelist.
        convert(child, keepElement(out, doc, tag, child));
    }
}

const BLOCK_LEVEL = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "pre", "table", "tr", "div"]);

// Plain text from the semantic tree — blocks on their own lines, table
// cells tab-separated, list items bulleted. Range.toString() runs blocks
// together, which is why it is not used.
function toPlainText(root) {
    let out = "";
    const walk = (node) => {
        for (const child of node.childNodes) {
            if (child.nodeType === Node.TEXT_NODE) {
                out += child.nodeValue;
                continue;
            }
            if (child.nodeType !== Node.ELEMENT_NODE) continue;
            const tag = child.tagName.toLowerCase();
            if (tag === "br") {
                out += "\n";
                continue;
            }
            if (tag === "hr") {
                out += "\n---\n";
                continue;
            }
            if (tag === "td" || tag === "th") {
                if (out && !out.endsWith("\n") && !out.endsWith("\t")) out += "\t";
                walk(child);
                continue;
            }
            if (tag === "li") {
                if (out && !out.endsWith("\n")) out += "\n";
                out += "- ";
                walk(child);
                continue;
            }
            if (BLOCK_LEVEL.has(tag)) {
                if (out && !out.endsWith("\n")) out += "\n";
                walk(child);
                if (!out.endsWith("\n")) out += "\n";
                continue;
            }
            walk(child);
        }
    };
    walk(root);
    return out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

// Is this selection one we offer to save? Non-empty, inside an ELN editor,
// and not inside `excludeRoot` (the plugin's own panel).
export function selectionInEditor(selection, excludeRoot) {
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
    const range = selection.getRangeAt(0);
    if (!String(selection).trim()) return null;

    const anchor = range.commonAncestorContainer;
    const element = anchor.nodeType === Node.ELEMENT_NODE ? anchor : anchor.parentElement;
    if (!element) return null;
    if (excludeRoot && excludeRoot.contains(element)) return null;

    const editor = element.closest(".slate-editor, [data-slate-editor]");
    if (!editor) return null;
    return range;
}

// { text, html } for a range. `html` is semantic, not yet sanitised —
// sanitizePhraseHtml() in shared/phrases.js runs on save.
export function readSelection(range) {
    const fragment = range.cloneContents();
    const out = document.createElement("div");
    convert(fragment, out);
    return { text: toPlainText(out), html: out.innerHTML };
}
