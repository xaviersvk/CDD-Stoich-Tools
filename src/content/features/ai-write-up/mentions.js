// content/features/ai-write-up/mentions.js
//
// Entities in the LLM's English come back as CDD @-mentions, the same thing
// typing "@" in the entry makes.
//
// The model is given a token per entity — [[R3]] for the 3rd row of the
// stoichiometry tables, [[L1]] for a record the entry already links to (a
// run, another entry, a batch picked with @) — and writes the token where it
// names one. Here the tokens become mentions:
//
//   - in the panel, a link showing the mention's label;
//   - on the clipboard, text/html carrying a Slate fragment in
//     `data-slate-fragment` — what CDD's own Copy writes — so Ctrl+V in the
//     entry makes real mentions; anywhere else the same HTML pastes as
//     ordinary links, and text/plain carries the labels.
//
// A mention is a Slate `a` node whose `data` is the mention's feature data;
// CDD creates the feature when the fragment is pasted. A reaction row's
// mention points at "#attached_structures/<structure>%23reaction_components/
// <row uid>" within the entry, and its label is CDD's "name (amount, mol)".

const NL = "\n";
const TOKEN = /\[\[([RL])(\d+)\]\]/g;

// ---------------------------------------------------------------- labels

function sig3(n) {
    return n >= 100 ? n.toFixed(0) : Number(n.toPrecision(3)).toString();
}

function massText(grams) {
    if (grams == null) return "";
    return grams >= 1 ? `${sig3(grams)} g` : `${sig3(grams * 1e3)} mg`;
}

function molText(mol) {
    if (mol == null) return "";
    if (mol >= 1) return `${sig3(mol)} mol`;
    if (mol >= 1e-3) return `${sig3(mol * 1e3)} mmol`;
    return `${sig3(mol * 1e6)} µmol`;
}

/** CDD's label for a reaction row: "ab123 (20 mg, 14.5 µmol)". */
export function rowMentionLabel(row) {
    const amounts = [row.sampleText || massText(row.massG), molText(row.mol)].filter(Boolean);
    return amounts.length ? `${row.name} (${amounts.join(", ")})` : row.name;
}

// ---------------------------------------------------------------- the list

/**
 * Every entity the model may mention: `[{ token, label, data }]`.
 * `entryUrl` is the entry's absolute URL, which a row's mention lives under.
 */
export function entityMentions(rows, elnEntry, entryUrl) {
    const mentions = [];

    for (const row of rows) {
        if (row.uid == null || row.structureId == null || row.name === "Unnamed") continue;
        const id = `#attached_structures/${row.structureId}%23reaction_components/${row.uid}`;
        const label = rowMentionLabel(row);
        mentions.push({
            token: `R${row.row}`,
            label,
            data: {
                dataVersion: 1,
                id,
                href: `${entryUrl}${id}`,
                display: "defaultLabel",
                defaultLabel: label,
                label,
                synonyms: [],
                sampleWasDeleted: false,
            },
        });
    }

    // Links already in the entry text, each once. Mentions of a table row
    // are covered by the rows above.
    let body = [];
    try {
        body = JSON.parse(elnEntry?.body || "[]");
    } catch {
        /* no links then */
    }
    const featureMap = elnEntry?.feature_map || {};
    const seen = new Set();
    (function walk(nodes) {
        for (const node of Array.isArray(nodes) ? nodes : []) {
            const feature = node?.type === "a" ? featureMap[node?.data?.feature_id] : null;
            const data = feature?.type === "link" ? feature.data : null;
            if (data && !String(data.id).includes("reaction_components") && !seen.has(String(data.id))) {
                seen.add(String(data.id));
                const label = (data.display === "label" ? data.label : data.defaultLabel) || data.label || "";
                if (label) mentions.push({ token: `L${seen.size}`, label, data: { ...data } });
            }
            walk(node?.children);
        }
    })(body);

    return mentions;
}

/** The lines that tell the model which tokens exist (empty when none do). */
export function mentionPromptBlock(mentions) {
    if (!mentions.length) return "";
    return [
        "ENTITY TOKENS — where your English names one of these, write its token instead of the name",
        "(and instead of the amounts in brackets after it: the token prints as the label shown). Use only these tokens.",
        ...mentions.map((m) => `[[${m.token}]] = ${m.label}`),
    ].join(NL);
}

// ---------------------------------------------------------------- text → segments

/**
 * "Then [[R2]] was added." → [{ text: "Then " }, { mention }, { text: " was added." }].
 * An unknown token is dropped rather than shown as brackets.
 */
export function splitMentions(text, mentions) {
    const byToken = new Map(mentions.map((m) => [m.token, m]));
    const source = String(text || "");
    const segments = [];
    const pushText = (s) => {
        if (!s) return;
        const prev = segments[segments.length - 1];
        if (prev && !prev.mention) prev.text += s;
        else segments.push({ text: s });
    };
    let last = 0;
    for (const match of source.matchAll(TOKEN)) {
        pushText(source.slice(last, match.index));
        const mention = byToken.get(`${match[1]}${match[2]}`);
        if (mention) segments.push({ mention });
        last = match.index + match[0].length;
    }
    pushText(source.slice(last));
    return segments;
}

/** Splits segments at line breaks: one array of segments per line. */
function lines(segments) {
    const out = [[]];
    for (const seg of segments) {
        if (seg.mention) {
            out[out.length - 1].push(seg);
            continue;
        }
        const parts = seg.text.split(NL);
        parts.forEach((part, i) => {
            if (i > 0) out.push([]);
            if (part) out[out.length - 1].push({ text: part });
        });
    }
    return out;
}

function headingOf(line) {
    const first = line[0];
    const m = first?.text?.match(/^#{1,6}\s+/);
    return m ? [{ text: first.text.slice(m[0].length) }, ...line.slice(1)] : null;
}

// ---------------------------------------------------------------- renderings

export function mentionsToPlain(segments) {
    return lines(segments)
        .map((line) => {
            const text = line.map((s) => (s.mention ? s.mention.label : s.text)).join("");
            return text.replace(/^#{1,6}\s+/, "");
        })
        .join(NL);
}

function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function inlineHtml(line) {
    return line
        .map((s) => (s.mention
            ? `<a href="${escapeHtml(s.mention.data.href || "")}">${escapeHtml(s.mention.label)}</a>`
            : escapeHtml(s.text)))
        .join("");
}

function slateNodes(segments) {
    let key = 0;
    const inline = (line) => {
        const children = [];
        for (const s of line) {
            if (s.mention) {
                // Slate keeps a text leaf on both sides of an inline.
                if (!children.length || children[children.length - 1].type) children.push({ text: "" });
                children.push({
                    type: "a",
                    key: `link-node-key-${++key}`,
                    data: { ...s.mention.data },
                    children: [{ text: s.mention.label }],
                });
            } else {
                children.push({ text: s.text });
            }
        }
        if (!children.length || children[children.length - 1].type) children.push({ text: "" });
        return children;
    };
    return lines(segments)
        .filter((line) => line.length)
        .map((line) => {
            const heading = headingOf(line);
            return heading ? { type: "h1", children: inline(heading) } : { type: "p", children: inline(line) };
        });
}

// Slate's own fragment encoding: base64 of the URI-encoded JSON.
function encodeFragment(nodes) {
    return btoa(encodeURIComponent(JSON.stringify(nodes)));
}

/** text/html for the clipboard: visible HTML wrapped in CDD's Slate fragment. */
export function mentionsToClipboardHtml(segments) {
    const visible = lines(segments)
        .filter((line) => line.length)
        .map((line) => {
            const heading = headingOf(line);
            return heading ? `<h2>${inlineHtml(heading)}</h2>` : `<p>${inlineHtml(line)}</p>`;
        })
        .join("");
    return `<span data-slate-fragment="${encodeFragment(slateNodes(segments))}">${visible}</span>`;
}

/** The panel's view: text nodes and links, "## " lines in bold. */
export function mentionsToDom(segments, doc = document) {
    const fragment = doc.createDocumentFragment();
    lines(segments).forEach((line, i) => {
        if (i > 0) fragment.append(doc.createTextNode(NL));
        const heading = headingOf(line);
        const target = heading ? doc.createElement("strong") : fragment;
        for (const s of heading || line) {
            if (s.mention) {
                const a = doc.createElement("a");
                a.href = s.mention.data.href || "#";
                a.target = "_blank";
                a.rel = "noopener";
                a.className = "cdd-wu-mention";
                a.textContent = s.mention.label;
                target.append(a);
            } else {
                target.append(doc.createTextNode(s.text));
            }
        }
        if (heading) fragment.append(target);
    });
    return fragment;
}
