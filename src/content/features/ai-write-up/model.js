// content/features/ai-write-up/model.js
//
// Everything the Write-up tab does that is not DOM or network: turning the
// entry into text for the LLM, the table into numbered rows, and the LLM's
// answer into checks.
//
// The split of work is deliberate. The LLM reads prose and says which table
// row a quantity in the text belongs to — the part a regex cannot do. It
// does no arithmetic: every comparison and the yield are done here, because
// a model that miscounts a factor of 1000 is worse than no check at all.
//
// Units are CDD's own: `mass` in g, `volume` in L, `mole` in mol, and
// `userInput.msample` is the sample mass as typed ("20 mg"), which differs
// from `mass` when purity is below 1.

import { getReactionFeatures } from "../../../inject/parsers/common.js";

// ---------------------------------------------------------------- entry text

const HEADINGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
const SKIPPED = new Set(["reaction", "hr", "image", "file", "attachment"]);

function inlineText(node) {
    if (!node || typeof node !== "object") return "";
    if (typeof node.text === "string") return node.text;
    return (node.children || []).map(inlineText).join("");
}

// A node whose children are themselves blocks (a list, a quote) rather than
// text and inline links.
const BLOCKS = new Set(["p", "li", "ul", "ol", "blockquote", "table", ...HEADINGS]);

function hasBlockChildren(node) {
    return (node.children || []).some((child) => BLOCKS.has(child?.type));
}

function blockLines(node, lines) {
    if (!node || typeof node !== "object" || SKIPPED.has(node.type)) return;

    if (node.type === "table") {
        for (const tr of node.children || []) {
            const cells = (tr.children || []).map((td) => inlineText(td).trim());
            if (cells.some(Boolean)) lines.push(cells.join(" | "));
        }
        return;
    }

    if (node.type === "li") {
        const text = inlineText(node).trim();
        if (text) lines.push(`- ${text}`);
        return;
    }

    if (hasBlockChildren(node)) {
        for (const child of node.children) blockLines(child, lines);
        return;
    }

    const text = inlineText(node).trim();
    if (!text) return;
    lines.push(HEADINGS.has(node.type) ? `## ${text}` : text);
}

/** Slate nodes (the saved body, or the live editor read back into nodes). */
export function entryTextFromNodes(nodes) {
    if (!Array.isArray(nodes)) return "";
    const lines = [];
    for (const node of nodes) blockLines(node, lines);
    return lines.join("\n");
}

export function entryTextFromBody(body) {
    try {
        return entryTextFromNodes(JSON.parse(body));
    } catch {
        return "";
    }
}

// ---------------------------------------------------------------- table rows

function num(value) {
    const n = typeof value === "number" ? value : parseFloat(value);
    return Number.isFinite(n) ? n : null;
}

// Every name a row goes by, the one the chemist typed in the table first —
// "Tenofovir", not its sample "I34-SM-0037292-008-I34S016471" (the panel
// leads with the sample; prose names the compound).
// The batch name ("008") only names a row nothing else names: as an alias
// it would match every "008" in the text.
//
// Never the IUPAC name: it describes the structure, and these names go to
// the model. It is kept apart (iupacName below) for what stays local.
function rowNames(row) {
    const names = [row?.name, row?.sample?.name, row?.moleculeName]
        .filter((n) => typeof n === "string" && n.trim())
        .map((n) => n.trim());
    // "Unspecified Batch" is CDD's stand-in, not a name.
    const batch = typeof row?.batch?.name === "string" ? row.batch.name.trim() : "";
    if (!names.length && batch && !/^unspecified batch$/i.test(batch)) names.push(batch);
    return [...new Set(names)];
}

export function tableRowsFromEntry(elnEntry) {
    const rows = [];
    getReactionFeatures({ eln_entry: elnEntry }).forEach((feature, reactionIndex) => {
        // CDD numbers a reaction's components 1, 2, 3… over its rows in table
        // order, the products AFTER all the others — NOT by the row's uid.
        // Entry 1000017498: pyridine (uid 13) is component 4; entry
        // 1000000814: eight rows, then the product as component 9.
        const tableRows = feature.data.stoichiometryTable.rows || [];
        const others = tableRows.filter((r) => r?.role !== "product").length;
        let component = 0;
        let productComponent = others;
        const reactionRows = [];
        for (const row of tableRows) {
            const sample = parseQuantity(row?.userInput?.msample);
            const [name = "Unnamed", ...aliases] = rowNames(row);
            const iupac = typeof row?.iupacName === "string" ? row.iupacName.trim() : "";
            const isProduct = row?.role === "product";
            reactionRows.push({
                reaction: reactionIndex + 1,
                // What an @-mention of this row points at (mentions.js).
                component: isProduct ? ++productComponent : ++component,
                structureId: feature.data.attachedStructureId ?? null,
                sampleText: typeof row?.userInput?.msample === "string" ? row.userInput.msample.trim() : "",
                // What the prompt calls the row — never its IUPAC name.
                name,
                // Local only — the panel's checks, and finding the compound
                // in the model's English to link it: the IUPAC name may help.
                displayName: name !== "Unnamed" ? name : iupac || name,
                aliases: iupac && !aliases.includes(iupac) ? [...aliases, iupac] : aliases,
                role: String(row?.role || ""),
                massG: num(row?.mass),
                sampleG: sample?.kind === "mass" ? sample.value : null,
                volumeL: num(row?.volume),
                mol: num(row?.mole),
                eq: num(row?.equivalent ?? row?.desiredEq),
                mw: num(row?.molecularWeight ?? row?.formulaWeight ?? row?.mw),
                limiting: !!row?.limitingReagent,
            });
        }
        // In the order CDD numbers them on screen, products last, so the
        // prompt's "Row 4" is the row the chemist sees as 4 ("reactants 1 to 4").
        reactionRows.sort((a, b) => a.component - b.component);
        for (const r of reactionRows) rows.push({ row: rows.length + 1, ...r });
    });
    return rows;
}

// ---------------------------------------------------------------- quantities

// unit → [kind, factor to g / L / mol]
const UNITS = {
    // µ and μ (micro sign, Greek mu) arrive as "u" — parseQuantity folds them.
    ug: ["mass", 1e-6], mg: ["mass", 1e-3], g: ["mass", 1], kg: ["mass", 1e3],
    ul: ["volume", 1e-6], ml: ["volume", 1e-3], l: ["volume", 1],
    nmol: ["amount", 1e-9], umol: ["amount", 1e-6], mmol: ["amount", 1e-3], mol: ["amount", 1],
    eq: ["eq", 1], "eq.": ["eq", 1], equiv: ["eq", 1], "equiv.": ["eq", 1], equivalents: ["eq", 1],
    ekv: ["eq", 1], "ekv.": ["eq", 1],
    "%": ["percent", 1],
};

/**
 * "20 mg" → { kind: "mass", value: 0.02, unit: "mg", factor: 1e-3, step: 5e-4 }.
 * `step` is half the last written digit in base units — what "0.5 mmol"
 * may stand for after rounding.
 */
export function parseQuantity(input) {
    if (input == null) return null;
    // Micro sign and Greek mu both read as "u" ("µmol" → "umol").
    const text = String(input).trim();
    const match = text.replace(/µ/g, "u").replace(/μ/g, "u").match(/^~?\s*(\d+(?:[.,]\d+)?)\s*([a-zA-Z%.]*)$/);
    if (!match) return null;
    const digits = match[1].replace(",", ".");
    const unitKey = (match[2] || "eq").toLowerCase();
    const unit = UNITS[unitKey];
    if (!unit) return null;
    const [kind, factor] = unit;
    const decimals = (digits.split(".")[1] || "").length;
    return {
        kind,
        value: parseFloat(digits) * factor,
        // As written, so a check reads "14.5 µmol", not "umol".
        unit: text.slice(text.length - match[2].length) || "eq",
        factor,
        step: 0.5 * 10 ** -decimals * factor,
    };
}

const TOLERANCE = 0.02;

// The text's rounding counts, but never past 5 %: "1 equiv" stands for
// 0.95–1.05, not 0.5–1.5.
const MAX_ROUNDING = 0.05;

function agrees(textQty, tableValue) {
    if (tableValue == null) return true;
    const rounding = Math.min(textQty.step, MAX_ROUNDING * Math.abs(textQty.value));
    const allowed = Math.max(TOLERANCE * Math.abs(tableValue), rounding);
    return Math.abs(textQty.value - tableValue) <= allowed + 1e-15;
}

function formatIn(value, unit, factor) {
    const n = value / factor;
    const text = n >= 100 ? n.toFixed(0) : Number(n.toPrecision(3)).toString();
    return `${text} ${unit}`;
}

// ---------------------------------------------------------------- prompt

// Every prompt that writes text: quantities stay in digits. The lost-number
// check (lostQuantities) reads digits only, so "thirty minutes" for "30 min"
// was reported as dropped although it was not.
const DIGITS_RULE =
    "Write every quantity in digits with its unit (30 min, 3 h, 9 %, 2.5 mL) — never spelled out in words.";

// Both prompts: where a sentence needs a fact nobody gave, a placeholder the
// chemist fills in the panel (mentions.js) — never a guess.
const PLACEHOLDER_RULE =
    "Where a sentence needs a fact the text does not give (temperature, time, a volume, the yield…), " +
    'write a placeholder [[?short name]] in its place, e.g. "stirred at [[?temperature]] for [[?time]]". ' +
    "Never invent the value. At most 5 placeholders, only where the sentence needs one. " +
    "Never a placeholder for what the STOICHIOMETRY TABLE or the text already gives (a mass, an amount, " +
    "equivalents, the product's mass) — write that value. Notes must not repeat what a placeholder already asks for. " +
    'Where the text refers to table rows by number or role ("reactants 1 to 4"), those are the rows of that number. ' +
    "The product is made, never added; a row named Unnamed is not an ingredient.";

const SYSTEM_PROMPT = `You edit electronic lab notebook (ELN) entries for synthetic chemists.
The entry may be dictated and may mix Slovak, Czech and English.

Do two things and answer with ONE JSON object only, no prose around it:

1. "text": the whole entry rewritten as a clear, factual experimental write-up in English.
   Keep every fact, quantity, observation and section heading. Do not invent anything.
   Keep the "## " heading markers. Past tense, passive voice, standard units (mg, mL, mmol, °C, h).
   ${DIGITS_RULE}
   ${PLACEHOLDER_RULE}

2. Report what the text says about the stoichiometry table rows given below. Do NOT calculate anything:
   copy quantities exactly as written in the text, with their units.
   "amounts": [{"row": <table row number>, "mass": "<e.g. 20 mg>", "volume": "<e.g. 0.5 mL>",
               "amount": "<e.g. 1.2 mmol>", "eq": "<e.g. 1.1 equiv>"}]  (omit fields the text does not give)
   "product": {"row": <product row number>, "mass": "<isolated mass as written>", "yield": "<e.g. 78 %>"} or null
   "notMentioned": [<row numbers of reactants/reagents/solvents the text never mentions>]
   "notes": ["<short imperative advice: missing temperature, time, workup, suspicious unit — at most 5>"]

JSON shape: {"text": "...", "amounts": [...], "product": {...}|null, "notMentioned": [...], "notes": [...]}`;

function tableLine(r) {
    // Nothing about the structure goes to the model — no SMILES, mol file or
    // MW (the yield is calculated here, not by the model): names, amounts,
    // equivalents.
    const parts = [`Row ${r.row}`, r.name, r.role || "row"];
    // Past the first reaction the row numbers run on; say where it sits.
    if (r.row !== r.component) parts.splice(1, 0, `reaction ${r.reaction} no. ${r.component}`);
    if (r.sampleG != null) parts.push(`sample ${formatIn(r.sampleG, "mg", 1e-3)}`);
    if (r.massG != null) parts.push(formatIn(r.massG, "mg", 1e-3));
    if (r.volumeL != null) parts.push(formatIn(r.volumeL, "mL", 1e-3));
    if (r.mol != null) parts.push(formatIn(r.mol, "mmol", 1e-3));
    if (r.eq != null) parts.push(`${r.eq} equiv`);
    if (r.limiting) parts.push("limiting");
    return parts.join(" | ");
}

/** `mentionBlock`: mentions.js's token list, "" for none. */
export function buildMessages(text, rows, mentionBlock = "") {
    const table = rows.length
        ? rows.map(tableLine).join("\n")
        : "(this entry has no stoichiometry table — return empty amounts, product null)";
    return [
        { role: "system", content: SYSTEM_PROMPT },
        {
            role: "user",
            content:
                `STOICHIOMETRY TABLE\n${table}\n\n` +
                (mentionBlock ? `${mentionBlock}\n\n` : "") +
                `ENTRY TEXT\n${text}\n\n` +
                'Answer with the JSON object. The "text" field must be in English, whatever language the entry is in.',
        },
    ];
}

// ---------------------------------------------------------------- dictation

// Like Polish entry, a dictation (or a selection) comes back as JSON: its
// English and what it says about the table, so its card gets Checks too.
// "notMentioned" is asked only when the passage is meant to cover a whole
// reaction (🎤 on a reaction) — one dictated sentence never names everything.
const NOT_MENTIONED_LINE =
    '   "notMentioned": [<row numbers of reactants/reagents/solvents the dictation never mentions>]' + "\n";

function dictationPrompt({ askMissing }) {
    return `You turn a dictated lab notebook passage into English for a synthetic chemist's ELN.
The dictation was transcribed by speech recognition and may be Slovak, Czech or English, with recognition errors.
You may be given CONTEXT — the reaction's stoichiometry table and the entry text the dictation continues.
Use it only to understand the dictation and to match its names, abbreviations and style.
Never translate, repeat or summarise the context itself.

Do two things and answer with ONE JSON object only, no prose around it:

1. "text": the DICTATION only, as clear, factual English experimental prose: past tense, passive voice,
   standard units (mg, mL, mmol, °C, h). Keep every fact and number exactly; do not add anything.
   ${DIGITS_RULE}
   Fix misheard chemical names when the table clearly matches.
   ${PLACEHOLDER_RULE}

2. Report what the DICTATION says about the stoichiometry table rows. Do NOT calculate anything:
   copy quantities exactly as written, with their units.
   "amounts": [{"row": <table row number>, "mass": "<e.g. 20 mg>", "volume": "<e.g. 0.5 mL>",
               "amount": "<e.g. 1.2 mmol>", "eq": "<e.g. 1.1 equiv>"}]  (only rows the dictation gives quantities for)
   "product": {"row": <product row number>, "mass": "<isolated mass as written>", "yield": "<e.g. 78 %>"} or null
${askMissing ? NOT_MENTIONED_LINE : ""}   "notes": ["<short imperative advice: what this passage leaves out — temperature, time, workup, a suspicious unit — at most 5>"]

JSON shape: {"text": "...", "amounts": [...], "product": {...}|null, ${askMissing ? '"notMentioned": [...], ' : ""}"notes": [...]}`;
}

// How much of the entry goes with a dictation: a reaction's section, or
// (the panel's 🎤) a cap on the whole entry.
export const SECTION_CONTEXT_CHARS = 1500;
export const ENTRY_CONTEXT_CHARS = 12000;
const NL = "\n";

/**
 * A section's text for the prompt: from the last "## " heading in `text` to
 * its end, kept to the last `maxChars` with the heading always in front.
 */
export function sectionContext(text, maxChars = SECTION_CONTEXT_CHARS) {
    const lines = String(text || "").split(NL);
    let start = 0;
    for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].startsWith("## ")) {
            start = i;
            break;
        }
    }
    const heading = lines[start].startsWith("## ") ? lines[start] : "";
    const body = lines.slice(heading ? start + 1 : start).join(NL).trim();
    const kept = body.length > maxChars ? "…" + body.slice(-maxChars) : body;
    return [heading, kept].filter(Boolean).join(NL);
}

/**
 * `rows` (the table), `entryText`, `mentionBlock` (mentions.js's token
 * list) and `instruction` (Polish +) are all optional; `askMissing` asks
 * which table rows the passage never mentions. Small models follow the LAST
 * instruction they read, so the order to translate is repeated after the
 * dictation, not only in the system prompt.
 */
export function buildDictationMessages(
    transcript,
    { rows = [], entryText = "", mentionBlock = "", instruction = "", askMissing = false } = {}
) {
    const context = [];
    if (rows.length) context.push(["STOICHIOMETRY TABLE", ...rows.map(tableLine)].join(NL));
    if (entryText.trim()) context.push(["ENTRY TEXT BEFORE THE DICTATION", entryText.trim()].join(NL));
    const parts = [];
    if (context.length) parts.push("CONTEXT (for understanding only — do not translate or repeat it)", ...context);
    if (mentionBlock) parts.push(mentionBlock);
    parts.push(["DICTATION", transcript].join(NL));
    // Polish + on a selection: what the chemist wants done with it.
    if (instruction.trim()) {
        parts.push(["EXTRA INSTRUCTION FOR THIS TEXT", instruction.trim()].join(NL));
        parts.push(
            'Answer with the JSON object. Its "text" is only the DICTATION above, rewritten in English, ' +
                "following the extra instruction. Reply in English only."
        );
    } else {
        parts.push(
            'Answer with the JSON object. Its "text" is only the DICTATION above, translated into English ' +
                "lab-notebook prose. Reply in English only."
        );
    }
    return [
        { role: "system", content: dictationPrompt({ askMissing: askMissing && rows.length > 0 }) },
        { role: "user", content: parts.join(NL + NL) },
    ];
}

// ---------------------------------------------------------------- ask

// "Ask about this entry": a request about the entry, which goes along whole
// as background. Back comes only what the request asks for — new text to add,
// or an answer — never the entry rewritten. Same JSON as a dictation, so the
// card gets Checks; no notMentioned: a paragraph to add never names everything.
const ASK_PROMPT = `You help a synthetic chemist with an electronic lab notebook (ELN) entry.
You are given the ENTRY (its text and stoichiometry table) as background, and a REQUEST.
The request may be Slovak, Czech or English.

Do what the REQUEST asks, using the entry as background:
- if it asks to write or add something (a workup paragraph, a summary, a conclusion…), write ONLY that new text,
  as clear, factual English experimental prose: past tense, passive voice, standard units (mg, mL, mmol, °C, h);
- if it asks a question, answer it briefly in English.
Never rewrite, repeat or translate the rest of the entry. Take facts from the entry and the request; do not invent any.
${PLACEHOLDER_RULE}

Answer with ONE JSON object only, no prose around it:
"text": the new text or the answer.
"amounts": [{"row": <table row number>, "mass": "...", "volume": "...", "amount": "...", "eq": "..."}]
           (quantities YOUR text states for table rows, copied as written; omit fields you do not state)
"product": {"row": <product row number>, "mass": "<as written>", "yield": "<as written>"} or null
"notes": ["<short imperative advice: what the request or entry leaves out — at most 5>"]

JSON shape: {"text": "...", "amounts": [...], "product": {...}|null, "notes": [...]}`;

/** The request and the whole entry as background — see ASK_PROMPT. */
export function buildAskMessages(request, { rows = [], entryText = "", mentionBlock = "" } = {}) {
    const parts = [];
    if (rows.length) parts.push(["STOICHIOMETRY TABLE", ...rows.map(tableLine)].join(NL));
    parts.push(["ENTRY TEXT", entryText.trim() || "(the entry has no text yet)"].join(NL));
    if (mentionBlock) parts.push(mentionBlock);
    parts.push(["REQUEST", request.trim()].join(NL));
    parts.push(
        'Answer with the JSON object. Its "text" is only what the REQUEST asks for, in English — ' +
            "not the entry. Reply in English only."
    );
    return [
        { role: "system", content: ASK_PROMPT },
        { role: "user", content: parts.join(NL + NL) },
    ];
}

// ---------------------------------------------------------------- revise

// Reply on a card: the chemist answers the open points (or adds what was
// missing) and the draft comes back revised — same JSON as a dictation, so
// the revised card gets Checks again.
function revisePrompt({ askMissing }) {
    return `You revise a draft passage of a synthetic chemist's electronic lab notebook (ELN) entry.
You get the DRAFT (English), the OPEN POINTS raised about it, and the chemist's REPLY
(Slovak, Czech or English) — answers to those points or facts to add.

Do two things and answer with ONE JSON object only, no prose around it:

1. "text": the DRAFT revised with what the REPLY says: work each new fact into the right sentence,
   fill [[?…]] placeholders the reply answers, keep everything else — every other fact, number and token as it is.
   Clear, factual English: past tense, passive voice, standard units. Do not invent anything.
   ${DIGITS_RULE}
   ${PLACEHOLDER_RULE}

2. Report what the revised text says about the stoichiometry table rows. Do NOT calculate anything:
   "amounts": [{"row": <table row number>, "mass": "...", "volume": "...", "amount": "...", "eq": "..."}]
   "product": {"row": <product row number>, "mass": "<as written>", "yield": "<as written>"} or null
${askMissing ? NOT_MENTIONED_LINE : ""}   "notes": ["<short imperative advice: what is still missing — at most 5; nothing the reply already answered>"]

JSON shape: {"text": "...", "amounts": [...], "product": {...}|null, ${askMissing ? '"notMentioned": [...], ' : ""}"notes": [...]}`;
}

/**
 * The card's draft (tokens and placeholders in, as mentions.js writes them
 * back), its open points and the reply → messages. `rows`, `entryText` and
 * `mentionBlock` as the card was made with.
 */
export function buildReviseMessages(
    draft,
    reply,
    { openPoints = [], rows = [], entryText = "", mentionBlock = "", askMissing = false } = {}
) {
    const parts = [];
    const context = [];
    if (rows.length) context.push(["STOICHIOMETRY TABLE", ...rows.map(tableLine)].join(NL));
    if (entryText.trim()) context.push(["ENTRY TEXT AROUND IT", entryText.trim()].join(NL));
    if (context.length) parts.push("CONTEXT (for understanding only — do not translate or repeat it)", ...context);
    if (mentionBlock) parts.push(mentionBlock);
    parts.push(["DRAFT", draft.trim()].join(NL));
    if (openPoints.length) parts.push(["OPEN POINTS", ...openPoints.map((p) => `- ${p}`)].join(NL));
    parts.push(["REPLY", reply.trim()].join(NL));
    parts.push(
        'Answer with the JSON object. Its "text" is the whole DRAFT revised with the REPLY, in English. ' +
            "Reply in English only."
    );
    return [
        { role: "system", content: revisePrompt({ askMissing: askMissing && rows.length > 0 }) },
        { role: "user", content: parts.join(NL + NL) },
    ];
}

/**
 * Settings → AI write-up → House rules: the ones switched on, added to the
 * system prompt of any request built above.
 */
export function withHouseRules(messages, rules = []) {
    const list = rules.map((r) => String(r).trim()).filter(Boolean);
    if (!list.length) return messages;
    return messages.map((m) => (m.role === "system"
        ? { ...m, content: [m.content, "", "HOUSE RULES — always follow these:", ...list.map((r) => `- ${r}`)].join(NL) }
        : m));
}

// Slovak and Czech letters English never uses. An answer that still carries
// them, or that IS the transcript, was not translated.
const SLAVIC_LETTERS = /[áäčďéěíĺľňóôŕřšťúůýž]/i;

// An answer equal to the source is fine — an English dictation may need no
// change. Only Slovak/Czech left in it is refused. (`_source` kept for callers.)
// Short Slovak/Czech words English never uses — a text without diacritics
// ("pridali sme 20 mg a miesali cez noc") still shows its language by them.
const SLAVIC_WORDS = new Set([
    "sme", "som", "sa", "je", "sú", "su", "bol", "bola", "bolo", "boli", "pri", "cez", "pre", "na", "že", "ze",
    "aby", "alebo", "potom", "ešte", "este", "ktorý", "ktorá", "ktoré", "jsme", "jsem", "byl", "byla", "bylo",
    "se", "ve", "až", "az", "pak", "které", "který", "nebo", "keď", "ked", "kde",
]);

export function looksUntranslated(answer, _source) {
    const words = answer.split(/\s+/).filter(Boolean);
    if (!words.length) return false;
    const bare = (w) => w.toLowerCase().replace(/[^\p{L}]/gu, "");
    const slavic = words.filter((w) => SLAVIC_LETTERS.test(w) || SLAVIC_WORDS.has(bare(w))).length;
    return slavic / words.length > 0.15;
}

/** The model's text with any wrapping quotes or fences taken off. */
export function cleanDictationAnswer(content) {
    return String(content || "")
        .replace(/^```\w*\n?|\n?```$/g, "")
        .trim()
        .replace(/^"(.*)"$/s, "$1")
        .trim();
}

// ---------------------------------------------------------------- answer

/**
 * The English out of an answer: the JSON's "text"; failing that, the "text"
 * string dug out of JSON that does not parse (cut off, a stray quote); and
 * only for an answer that is not JSON at all, the answer itself. A raw "{…"
 * is never shown as if it were the English.
 */
export function answerText(content, parsed = parseLlmJson(content)) {
    if (typeof parsed?.text === "string") return parsed.text;
    if (parsed) return "";
    const raw = String(content || "");
    const m = raw.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)/);
    if (m) {
        // A cut-off string may end inside an escape: drop a lone trailing "\".
        const body = m[1].replace(/\\$/, "");
        try {
            return JSON.parse(`"${body}"`);
        } catch {
            return body.replace(/\\n/g, NL).replace(/\\"/g, '"');
        }
    }
    return raw.trim().startsWith("{") ? "" : raw;
}

/** The first balanced {…} in the answer, fences and chatter ignored. */
export function parseLlmJson(content) {
    if (typeof content !== "string") return null;
    const start = content.indexOf("{");
    if (start < 0) return null;
    let depth = 0;
    let inString = false;
    for (let i = start; i < content.length; i++) {
        const ch = content[i];
        if (inString) {
            if (ch === "\\") i++;
            else if (ch === '"') inString = false;
        } else if (ch === '"') inString = true;
        else if (ch === "{") depth++;
        else if (ch === "}" && --depth === 0) {
            try {
                return JSON.parse(content.slice(start, i + 1));
            } catch {
                return null;
            }
        }
    }
    return null;
}

const FIELD_TO_ROW = { mass: "massG", volume: "volumeL", amount: "mol", eq: "eq" };
const DISPLAY = { mass: ["mg", 1e-3], volume: ["mL", 1e-3], amount: ["mmol", 1e-3], eq: ["equiv", 1] };

function amountChecks(item, row) {
    const checks = [];
    for (const field of Object.keys(FIELD_TO_ROW)) {
        const qty = parseQuantity(item?.[field]);
        if (!qty || qty.kind !== field) continue;
        const tableValue = row[FIELD_TO_ROW[field]];
        // A mass in the text may be the sample as weighed, purity included.
        if (field === "mass" && row.sampleG != null && agrees(qty, row.sampleG)) continue;
        if (agrees(qty, tableValue)) continue;
        checks.push({
            kind: "mismatch",
            label: row.displayName,
            text: String(item[field]).trim(),
            table: formatIn(tableValue, qty.unit === "eq" ? DISPLAY.eq[0] : qty.unit, qty.factor),
        });
    }
    return checks;
}

// The yield is the product's own reaction's: its row marked limiting in the
// table (reactant or reagent), scaled by the equivalents of both. No row
// marked limiting — no yield; a guess here is a red dot nobody trusts.
function yieldCheck(product, rows) {
    const row = rows.find((r) => r.row === product?.row && r.role === "product")
        || rows.find((r) => r.role === "product");
    const mass = parseQuantity(product?.mass);
    if (!row?.mw || mass?.kind !== "mass") return [];
    const limiting = rows.find((r) => r.reaction === row.reaction && r.limiting && r.role !== "product" && r.mol);
    if (!limiting) return [];

    const theoreticalMol = (limiting.mol * (row.eq || 1)) / (limiting.eq || 1);
    const calculated = (mass.value / row.mw / theoreticalMol) * 100;
    const calcText = `${Math.round(calculated)} %`;
    const stated = parseQuantity(product?.yield);
    if (!stated || stated.kind !== "percent") {
        return [{ kind: "yield", label: "Yield", text: null, table: calcText }];
    }
    // Percentage points, not relative: 78 vs 77 is fine, 90 vs 77 is not.
    if (Math.abs(stated.value - calculated) <= 2) return [];
    return [{ kind: "yield", label: "Yield", text: String(product.yield).trim(), table: calcText }];
}

// ---------------------------------------------------------------- lost numbers

// Every number with a unit in what was written must still be in the English:
// "keep every fact" is only a request to the model, this is the check.
// Units are compared by value, so 0.5 g → 500 mg is the same number, and
// as written: a compound link carries the table's "3.01 mmol", which keeps
// the "3.0 mmol" that was said.
const QUANTITY_IN_TEXT =
    /(\d+(?:[.,]\d+)?)\s*(mol\s?%|µg|μg|ug|mg|kg|g|µl|μl|ul|ml|l|nmol|µmol|μmol|umol|mmol|mol|equiv\.?|eq\.?|ekv\.?|%|°\s?c|hours?|hrs?|h|minutes?|mins?|min)(?!\p{L})/giu;
const TIME_UNITS = { hour: "h", hours: "h", hr: "h", hrs: "h", h: "h", minute: "min", minutes: "min", mins: "min", min: "min" };

function quantitiesIn(text) {
    const found = new Map();
    for (const m of String(text || "").matchAll(QUANTITY_IN_TEXT)) {
        const number = parseFloat(m[1].replace(",", "."));
        const unit = m[2].toLowerCase().replace(/\s/g, "");
        const q = parseQuantity(`${m[1]} ${m[2]}`);
        const key = q
            ? `${q.kind}:${Number(q.value.toPrecision(6))}`
            : `${TIME_UNITS[unit] || unit}:${number}`;
        if (!found.has(key)) found.set(key, { key, q, text: m[0].trim() });
    }
    return [...found.values()];
}

/** The quantities written in `source` that `english` no longer has: [{ kind: "lost", text }]. */
export function lostQuantities(source, english) {
    const kept = quantitiesIn(english);
    const keeps = (s) => kept.some((k) => k.key === s.key || (s.q && k.q?.kind === s.q.kind && agrees(s.q, k.q.value)));
    return quantitiesIn(source)
        .filter((s) => !keeps(s))
        .map(({ text }) => ({ kind: "lost", text }));
}

// ---------------------------------------------------------------- slots the table answers

/** The product's mass from the table, as a slot would read it — "" unless exactly one product has one. */
export function productMassText(rows) {
    const products = rows.filter((r) => r.role === "product" && (r.sampleText || r.massG != null));
    if (products.length !== 1) return "";
    const [p] = products;
    return p.sampleText || (p.massG >= 1 ? formatIn(p.massG, "g", 1) : formatIn(p.massG, "mg", 1e-3));
}

/** The yield the table gives (product mass, limiting row), "" when it gives none. */
export function tableYieldText(rows) {
    const mass = productMassText(rows);
    const product = rows.find((r) => r.role === "product" && (r.sampleText || r.massG != null));
    if (!mass || !product) return "";
    return yieldCheck({ row: product.row, mass }, rows)[0]?.table || "";
}

/** The LLM's answer + the table → what the Checks card lists. */
/**
 * `texts`: what was written and what came back. A row the model calls
 * "not mentioned" while one of its names is right there in them is not
 * reported — a small model's "never mentions" is a guess; products are
 * never asked for.
 */
export function buildChecks(result, rows, { texts = [] } = {}) {
    const byRow = new Map(rows.map((r) => [r.row, r]));
    const checks = [];
    const written = texts.join(" ").toLowerCase();
    const named = (row) => [row.name, row.displayName, ...(row.aliases || [])]
        .some((n) => n && n !== "Unnamed" && n.length >= 3 && written.includes(n.toLowerCase()));

    for (const item of Array.isArray(result?.amounts) ? result.amounts : []) {
        const row = byRow.get(Number(item?.row));
        if (row) checks.push(...amountChecks(item, row));
    }

    if (result?.product) checks.push(...yieldCheck(result.product, rows));

    for (const n of Array.isArray(result?.notMentioned) ? result.notMentioned : []) {
        const row = byRow.get(Number(n));
        if (row && row.role !== "product" && !named(row)) checks.push({ kind: "missing", label: row.displayName });
    }

    for (const note of Array.isArray(result?.notes) ? result.notes : []) {
        // "row 1" is the prompt's numbering, not the chemist's: the row's name.
        const message = (typeof note === "string" ? note.trim() : "")
            .replace(/\brow (\d+)\b/gi, (m, n) => byRow.get(Number(n))?.displayName || m);
        if (message) checks.push({ kind: "note", message });
    }

    return checks;
}
