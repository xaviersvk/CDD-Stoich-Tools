// content/features/ai-write-up/mentions.js
//
// Entities in the LLM's English come back as CDD @-mentions, the same thing
// typing "@" in the entry makes.
//
// The model is given a token per entity — [[R3]] for the 3rd row of the
// stoichiometry tables, [[L1]] for a record the entry already links to (a
// run, another entry, a batch picked with @) — and writes the token where it
// names one. Small models often don't, so an entity NAMED in the English
// (table name, molecule code, IUPAC name, link label) is linked too, the
// first time it appears. Here both become mentions:
//
//   - in the panel, a link showing the mention's label;
//   - on the clipboard, text/html carrying a Slate fragment in
//     `data-slate-fragment` — what CDD's own Copy writes — so Ctrl+V in the
//     entry makes real mentions; anywhere else the same HTML pastes as
//     ordinary links, and text/plain carries the labels.
//
// The model also marks facts the text needs but does not give — [[?temperature]]
// — as placeholders. In the panel each is a slot to type the value into; one
// left empty is copied as a bold "[temperature?]", easy to spot in the entry.
//
// A mention is a Slate `a` node whose `data` is the mention's feature data;
// CDD creates the feature when the fragment is pasted. A reaction row's
// mention points at "#attached_structures/<structure>%23reaction_components/
// <n>" within the entry — n counts the reaction's rows in table order,
// products left out (model.js) — and it reads as MENTION_STYLES says.

const NL = "\n";
// [[R3]] / [[L1]] — an entity; [[?temperature]] — a fact the text is missing.
const TOKEN = /\[\[(?:([RL])(\d+)|\?([^\][\n]{1,40}))]]/g;
const MAX_PLACEHOLDERS = 8;
// " (10 g, 1.1 equiv, 44.3 mmol)" right after a mention: a bracket with a number in it.
const AMOUNT_BRACKET = /^\s*\([^()\n]*\d[^()\n]*\)/;

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

function volumeText(litres) {
    if (litres == null) return "";
    return litres >= 1e-3 ? `${sig3(litres * 1e3)} mL` : `${sig3(litres * 1e6)} µL`;
}

/**
 * CDD's label for a reaction row: "ab123 (20 mg, 14.5 µmol)", a liquid by
 * its volume ("pyridine (25.6 mL, 318 mmol)"). Only used when the entry has
 * no mention of the row yet — otherwise CDD's own label is reused (and CDD
 * recomputes it from the table when the mention is saved).
 */
export function rowMentionLabel(row) {
    const amount = row.sampleText || (row.volumeL != null ? volumeText(row.volumeL) : massText(row.massG));
    const amounts = [amount, molText(row.mol)].filter(Boolean);
    return amounts.length ? `${row.name} (${amounts.join(", ")})` : row.name;
}

// Link features of the entry by their target id.
function linkFeatures(elnEntry) {
    const byId = new Map();
    for (const feature of Object.values(elnEntry?.feature_map || {})) {
        if (feature?.type === "link" && feature.data?.id != null) byId.set(String(feature.data.id), feature.data);
    }
    return byId;
}

// ---------------------------------------------------------------- the list

/**
 * How a row's mention reads — Settings → AI write-up → "Compound links":
 *   "label" (default) — like an @-mention: CDD's "Tenofovir (36.8 mg, 128 µmol)",
 *                       amounts from the table; the token stands for the name
 *                       AND the amounts after it;
 *   "name"            — the name only; the amounts the text gives stay text.
 */
export const MENTION_STYLES = ["label", "name"];

/**
 * Every entity the model may mention: `[{ token, label, promptLabel, names, data }]`.
 * `entryUrl` is the entry's absolute URL, which a row's mention lives under.
 */
export function entityMentions(rows, elnEntry, entryUrl, { style = "label" } = {}) {
    const mentions = [];
    const existing = linkFeatures(elnEntry);

    for (const row of rows) {
        if (row.component == null || row.structureId == null || row.displayName === "Unnamed") continue;
        const id = `#attached_structures/${row.structureId}%23reaction_components/${row.component}`;
        const known = existing.get(id);
        // `label` (pasted) may be the IUPAC name, which is local;
        // `promptLabel` (sent) never is. A mention already in the entry is in
        // the entry's text anyway.
        const named = { ...row, name: row.name !== "Unnamed" ? row.name : `row ${row.row}` };
        const label = style === "name"
            ? row.displayName
            : known?.defaultLabel || rowMentionLabel({ ...row, name: row.displayName });
        const promptLabel = style === "name" ? named.name : known?.defaultLabel || rowMentionLabel(named);
        mentions.push({
            token: `R${row.row}`,
            style,
            label,
            promptLabel,
            names: [...(row.name !== "Unnamed" ? [row.name] : []), ...(row.aliases || [])],
            data: known
                ? {
                    ...known,
                    href: known.href || `${entryUrl}${id}`,
                    ...(style === "name" ? { display: "defaultLabel", defaultLabel: label, label } : {}),
                }
                : {
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
            // A link to a paper or a patent has no id — its href tells it apart.
            const key = String(data?.id ?? data?.href ?? data?.label ?? "");
            if (data && !key.includes("reaction_components") && !seen.has(key)) {
                seen.add(key);
                const label = (data.display === "label" ? data.label : data.defaultLabel) || data.label || "";
                if (label) mentions.push({ token: `L${seen.size}`, label, names: [label], data: { ...data } });
            }
            walk(node?.children);
        }
    })(body);

    return mentions;
}

/** The lines that tell the model which tokens exist (empty when none do). */
export function mentionPromptBlock(mentions, { style = "label" } = {}) {
    if (!mentions.length) return "";
    return [
        "ENTITY TOKENS — where your English names one of these, write its token instead of the name.",
        style === "name"
            ? "Keep any amounts the text gives after the name, as written. Use only these tokens."
            : "The token prints as the label shown, amounts included: write it instead of the name AND the amounts in brackets after it. Use only these tokens.",
        "Use a token only where the text means that very row of the table — not, e.g., water or a solvent used later in the workup.",
        ...mentions.map((m) => `[[${m.token}]] = ${m.promptLabel ?? m.label}`),
    ].join(NL);
}

// ---------------------------------------------------------------- text → segments

const isText = (seg) => typeof seg?.text === "string";

function pushText(segments, s) {
    if (!s) return;
    const prev = segments[segments.length - 1];
    if (isText(prev)) prev.text += s;
    else segments.push({ text: s });
}

function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Shorter names hit too much ("Et", "A").
const MIN_NAME_LENGTH = 3;

/**
 * The model does not always write the tokens, so names are linked here too:
 * the FIRST time an entity not already linked by a token is named in the
 * text, that name — with the "(20 mg, 14.5 µmol)" after it, if any — becomes
 * its mention, showing exactly the words the model wrote.
 */
function linkNames(segments, mentions) {
    const linked = new Set(segments.filter((s) => s.mention).map((s) => s.mention.token));
    // Every name of every entity — a row is also known by its molecule code
    // and IUPAC name — longest first: "ethyl acetate" before "acetate".
    const candidates = mentions
        .flatMap((m) => (m.names || []).map((name) => ({ m, name: String(name).trim() })))
        .filter(({ name }) => name.length >= MIN_NAME_LENGTH)
        .sort((a, b) => b.name.length - a.name.length);

    let out = segments;
    for (const { m, name } of candidates) {
        if (linked.has(m.token)) continue;
        const pattern = new RegExp(
            `(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])(?:\\s*\\([^()\\n]*\\d[^()\\n]*\\))?`,
            "iu"
        );
        const next = [];
        let done = false;
        for (const seg of out) {
            const match = !done && isText(seg) ? seg.text.match(pattern) : null;
            if (!match) {
                next.push(seg);
                continue;
            }
            done = true;
            linked.add(m.token);
            const written = match[0];
            pushText(next, seg.text.slice(0, match.index));
            // Like an @-mention (the default): CDD's own label in place of
            // the words — a sample ID becomes "N-methyl… (10 g, 40.2 mmol)".
            // Name only: the words as the model wrote them.
            next.push({
                mention: m.style === "label" && m.token.startsWith("R")
                    ? m
                    : { ...m, label: written, data: { ...m.data, defaultLabel: written, label: written } },
            });
            pushText(next, seg.text.slice(match.index + written.length));
        }
        out = next;
    }
    return out;
}

/**
 * "Then [[R2]] was added." → [{ text: "Then " }, { mention }, { text: " was added." }].
 * An unknown token is dropped rather than shown as brackets. Entities named
 * without a token are linked as well (linkNames). "[[?time]]" becomes
 * { placeholder: { what: "time", value: "" } } — `value` is filled in the
 * panel, and every rendering reads it when it runs.
 */
export function splitMentions(text, mentions) {
    const byToken = new Map(mentions.map((m) => [m.token, m]));
    const source = String(text || "");
    const segments = [];
    let placeholders = 0;
    let last = 0;
    // A label mention already carries "(10 g, 40.2 mmol)": the bracket of
    // amounts the model still wrote after its token would say it twice.
    let afterLabel = false;
    const textAt = (from, to) => {
        const piece = source.slice(from, to);
        return afterLabel ? piece.replace(AMOUNT_BRACKET, "") : piece;
    };
    for (const match of source.matchAll(TOKEN)) {
        pushText(segments, textAt(last, match.index));
        afterLabel = false;
        if (match[3] != null) {
            const what = match[3].trim();
            // Past the cap a placeholder reads as its plain words.
            if (what && placeholders++ < MAX_PLACEHOLDERS) segments.push({ placeholder: { what, value: "" } });
            else pushText(segments, what);
        } else {
            const mention = byToken.get(`${match[1]}${match[2]}`);
            if (mention) segments.push({ mention });
            afterLabel = mention?.style === "label" && mention.token.startsWith("R");
        }
        last = match.index + match[0].length;
    }
    pushText(segments, textAt(last));
    return linkNames(segments, mentions);
}

/** Splits segments at line breaks: one array of segments per line. */
function lines(segments) {
    const out = [[]];
    for (const seg of segments) {
        if (!isText(seg)) {
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

/** The placeholders still empty, in order — for "Fill in: …". */
export function unfilledPlaceholders(segments) {
    return segments.filter((s) => s.placeholder && !s.placeholder.value.trim()).map((s) => s.placeholder.what);
}

// What a placeholder prints as: its value, or "[what?]" while empty.
function placeholderText(p) {
    return p.value.trim() || `[${p.what}?]`;
}

/**
 * The card's English as the model wrote it — mentions back as their tokens,
 * placeholders as their value or "[[?what]]" — for a Reply to revise.
 */
export function mentionsToTokens(segments) {
    return segments
        .map((s) => {
            if (s.mention) return `[[${s.mention.token}]]`;
            if (s.placeholder) return s.placeholder.value.trim() || `[[?${s.placeholder.what}]]`;
            return s.text;
        })
        .join("");
}

export function mentionsToPlain(segments) {
    return lines(segments)
        .map((line) => {
            const text = line
                .map((s) => (s.mention ? s.mention.label : s.placeholder ? placeholderText(s.placeholder) : s.text))
                .join("");
            return text.replace(/^#{1,6}\s+/, "");
        })
        .join(NL);
}

function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function inlineHtml(line) {
    return line
        .map((s) => {
            if (s.mention) return `<a href="${escapeHtml(s.mention.data.href || "")}">${escapeHtml(s.mention.label)}</a>`;
            if (s.placeholder) {
                const text = escapeHtml(placeholderText(s.placeholder));
                return s.placeholder.value.trim() ? text : `<strong>${text}</strong>`;
            }
            return escapeHtml(s.text);
        })
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
            } else if (s.placeholder && !s.placeholder.value.trim()) {
                // CDD's bold mark, so an empty slot stands out in the entry.
                children.push({ text: placeholderText(s.placeholder), bold: true });
            } else {
                children.push({ text: s.placeholder ? placeholderText(s.placeholder) : s.text });
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

// A placeholder in the panel: a slot showing "temperature?" (empty) or its
// value; a click turns it into an input, Enter or leaving it keeps what was
// typed, Escape keeps what was there. `onChange` runs after every change.
function slotNode(p, doc, onChange) {
    const slot = doc.createElement("button");
    slot.type = "button";
    const paint = () => {
        const filled = !!p.value.trim();
        slot.className = `cdd-wu-slot${filled ? " cdd-wu-slot--filled" : ""}`;
        slot.textContent = filled ? p.value.trim() : `${p.what}?`;
        slot.title = filled ? `${p.what} — click to change` : `Fill in the ${p.what}`;
    };
    slot.addEventListener("mousedown", (event) => event.stopPropagation());
    slot.addEventListener("click", (event) => {
        // Ctrl+click copies the paragraph the slot is in (copy-button.js).
        if (event.ctrlKey || event.metaKey) return;
        event.stopPropagation();
        const input = doc.createElement("input");
        input.type = "text";
        input.className = "cdd-wu-slot-input";
        input.value = p.value;
        input.placeholder = p.what;
        input.size = Math.max(p.what.length, p.value.length, 6);
        let done = false;
        const finish = (keep) => {
            if (done) return;
            done = true;
            if (keep) p.value = input.value;
            paint();
            input.replaceWith(slot);
            onChange?.();
        };
        input.addEventListener("mousedown", (e) => e.stopPropagation());
        input.addEventListener("keydown", (e) => {
            e.stopPropagation();
            if (e.key === "Enter") finish(true);
            else if (e.key === "Escape") finish(false);
        });
        input.addEventListener("blur", () => finish(true));
        slot.replaceWith(input);
        input.focus();
        input.select();
    });
    paint();
    return slot;
}

/**
 * The segments of each paragraph (line), in order — what Ctrl+click on one
 * paragraph copies. Placeholders are the same objects as in `segments`, so a
 * value filled in later is in here too.
 */
export function segmentLines(segments) {
    return lines(segments);
}

/**
 * The panel's view: one block per paragraph (`data-line` = its index in
 * segmentLines), with text, links and placeholder slots; "## " lines in
 * bold. `onChange` runs when a placeholder is filled in.
 */
export function mentionsToDom(segments, { doc = document, onChange } = {}) {
    const fragment = doc.createDocumentFragment();
    lines(segments).forEach((line, i) => {
        const block = doc.createElement("div");
        block.className = line.length ? "cdd-wu-line" : "cdd-wu-line cdd-wu-line--blank";
        block.dataset.line = String(i);
        fragment.append(block);
        const heading = headingOf(line);
        const target = heading ? doc.createElement("strong") : block;
        for (const s of heading || line) {
            if (s.placeholder) {
                target.append(slotNode(s.placeholder, doc, onChange));
            } else if (s.mention) {
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
        if (heading) block.append(target);
    });
    return fragment;
}
