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
    if (!names.length && typeof row?.batch?.name === "string" && row.batch.name.trim()) names.push(row.batch.name.trim());
    return [...new Set(names)];
}

export function tableRowsFromEntry(elnEntry) {
    const rows = [];
    getReactionFeatures({ eln_entry: elnEntry }).forEach((feature, reactionIndex) => {
        // CDD numbers a reaction's mentionable components 1, 2, 3… over its
        // rows in table order, products left out — NOT by the row's uid
        // (entry 1000017498: pyridine, uid 13, is component 4).
        let component = 0;
        for (const row of feature.data.stoichiometryTable.rows || []) {
            const sample = parseQuantity(row?.userInput?.msample);
            const [name = "Unnamed", ...aliases] = rowNames(row);
            const iupac = typeof row?.iupacName === "string" ? row.iupacName.trim() : "";
            const isProduct = row?.role === "product";
            rows.push({
                row: rows.length + 1,
                reaction: reactionIndex + 1,
                // What an @-mention of this row points at (mentions.js).
                component: isProduct ? null : ++component,
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
    });
    return rows;
}

// ---------------------------------------------------------------- quantities

// unit → [kind, factor to g / L / mol]
const UNITS = {
    ug: ["mass", 1e-6], "µg": ["mass", 1e-6], "μg": ["mass", 1e-6], mg: ["mass", 1e-3], g: ["mass", 1], kg: ["mass", 1e3],
    ul: ["volume", 1e-6], "µl": ["volume", 1e-6], "μl": ["volume", 1e-6], ml: ["volume", 1e-3], l: ["volume", 1],
    nmol: ["amount", 1e-9], umol: ["amount", 1e-6], "µmol": ["amount", 1e-6], "μmol": ["amount", 1e-6],
    mmol: ["amount", 1e-3], mol: ["amount", 1],
    eq: ["eq", 1], "eq.": ["eq", 1], equiv: ["eq", 1], "equiv.": ["eq", 1], equivalents: ["eq", 1],
    "%": ["percent", 1],
};

/**
 * "20 mg" → { kind: "mass", value: 0.02, unit: "mg", factor: 1e-3, step: 5e-4 }.
 * `step` is half the last written digit in base units — what "0.5 mmol"
 * may stand for after rounding.
 */
export function parseQuantity(input) {
    if (input == null) return null;
    const match = String(input).trim().match(/^~?\s*(\d+(?:[.,]\d+)?)\s*([a-zA-Zµμ%.]*)$/);
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
        unit: match[2] || "eq",
        factor,
        step: 0.5 * 10 ** -decimals * factor,
    };
}

const TOLERANCE = 0.02;

function agrees(textQty, tableValue) {
    if (tableValue == null) return true;
    const allowed = Math.max(TOLERANCE * Math.abs(tableValue), textQty.step);
    return Math.abs(textQty.value - tableValue) <= allowed + 1e-15;
}

function formatIn(value, unit, factor) {
    const n = value / factor;
    const text = n >= 100 ? n.toFixed(0) : Number(n.toPrecision(3)).toString();
    return `${text} ${unit}`;
}

// ---------------------------------------------------------------- prompt

// Both prompts: where a sentence needs a fact nobody gave, a placeholder the
// chemist fills in the panel (mentions.js) — never a guess.
const PLACEHOLDER_RULE =
    "Where a sentence needs a fact the text does not give (temperature, time, a volume, the yield…), " +
    'write a placeholder [[?short name]] in its place, e.g. "stirred at [[?temperature]] for [[?time]]". ' +
    "Never invent the value. At most 5 placeholders, only where the sentence needs one.";

const SYSTEM_PROMPT = `You edit electronic lab notebook (ELN) entries for synthetic chemists.
The entry may be dictated and may mix Slovak, Czech and English.

Do two things and answer with ONE JSON object only, no prose around it:

1. "text": the whole entry rewritten as a clear, factual experimental write-up in English.
   Keep every fact, quantity, observation and section heading. Do not invent anything.
   Keep the "## " heading markers. Past tense, passive voice, standard units (mg, mL, mmol, °C, h).
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

const DICTATION_PROMPT = `You turn a dictated lab notebook passage into English for a synthetic chemist's ELN.
The dictation was transcribed by speech recognition and may be Slovak, Czech or English, with recognition errors.
Rewrite it as clear, factual English experimental prose: past tense, passive voice, standard units (mg, mL, mmol, °C, h).
Keep every fact and number exactly; do not add anything. Fix misheard chemical names when the table clearly matches.
${PLACEHOLDER_RULE}
You may be given CONTEXT — the reaction's stoichiometry table and the entry text the dictation continues.
Use it only to understand the dictation and to match its names, abbreviations and style.
Never translate, repeat or summarise the context itself.
Answer with the English text of the DICTATION only — no quotes, no comments.`;

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
 * `rows` (the table), `entryText` and `mentionBlock` (mentions.js's token
 * list) are all optional. Small models follow the LAST instruction they
 * read, so the order to translate is repeated after the dictation, not only
 * in the system prompt.
 */
export function buildDictationMessages(transcript, { rows = [], entryText = "", mentionBlock = "", instruction = "" } = {}) {
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
        parts.push("Rewrite only the DICTATION above in English, following the extra instruction. Reply in English only.");
    } else {
        parts.push("Translate only the DICTATION above into English lab-notebook prose. Reply in English only.");
    }
    return [
        { role: "system", content: DICTATION_PROMPT },
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

export function looksUntranslated(answer, transcript) {
    const squash = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
    if (squash(answer) === squash(transcript)) return true;
    const words = answer.split(/\s+/).filter(Boolean);
    const slavic = words.filter((w) => SLAVIC_LETTERS.test(w)).length;
    return words.length > 0 && slavic / words.length > 0.15;
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

function limitingMol(rows) {
    const reactants = rows.filter((r) => r.role === "reactant" && r.mol);
    const flagged = reactants.find((r) => r.limiting);
    if (flagged) return flagged.mol;
    const oneEq = reactants.find((r) => r.eq === 1);
    if (oneEq) return oneEq.mol;
    return reactants.length ? Math.min(...reactants.map((r) => r.mol)) : null;
}

function yieldCheck(product, rows) {
    const row = rows.find((r) => r.row === product?.row) || rows.find((r) => r.role === "product");
    const mass = parseQuantity(product?.mass);
    const limiting = limitingMol(rows);
    if (!row?.mw || mass?.kind !== "mass" || !limiting) return [];

    const calculated = (mass.value / row.mw / limiting) * 100;
    const calcText = `${Math.round(calculated)} %`;
    const stated = parseQuantity(product?.yield);
    if (!stated || stated.kind !== "percent") {
        return [{ kind: "yield", label: "Yield", text: null, table: calcText }];
    }
    // Percentage points, not relative: 78 vs 77 is fine, 90 vs 77 is not.
    if (Math.abs(stated.value - calculated) <= 2) return [];
    return [{ kind: "yield", label: "Yield", text: String(product.yield).trim(), table: calcText }];
}

/** The LLM's answer + the table → what the Checks card lists. */
export function buildChecks(result, rows) {
    const byRow = new Map(rows.map((r) => [r.row, r]));
    const checks = [];

    for (const item of Array.isArray(result?.amounts) ? result.amounts : []) {
        const row = byRow.get(Number(item?.row));
        if (row) checks.push(...amountChecks(item, row));
    }

    if (result?.product) checks.push(...yieldCheck(result.product, rows));

    for (const n of Array.isArray(result?.notMentioned) ? result.notMentioned : []) {
        const row = byRow.get(Number(n));
        if (row) checks.push({ kind: "missing", label: row.displayName });
    }

    for (const note of Array.isArray(result?.notes) ? result.notes : []) {
        const message = typeof note === "string" ? note.trim() : "";
        if (message) checks.push({ kind: "note", message });
    }

    return checks;
}
