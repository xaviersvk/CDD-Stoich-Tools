import { test } from "node:test";
import assert from "node:assert/strict";

import {
    entryTextFromBody,
    tableRowsFromEntry,
    buildMessages,
    parseLlmJson,
    parseQuantity,
    buildChecks,
    buildDictationMessages,
    buildAskMessages,
    cleanDictationAnswer,
    looksUntranslated,
    sectionContext,
    withHouseRules,
} from "../src/content/features/ai-write-up/model.js";

// The shape of /vaults/<v>/eln/v2/entries/<id> → eln_entry, trimmed to what
// the model reads. Units as CDD stores them: mass g, volume L, mole mol.
function entry() {
    return {
        body: JSON.stringify([
            { type: "h1", children: [{ text: "Procedure" }] },
            { type: "p", children: [{ text: "" }] },
            { type: "reaction", data: { feature_id: "77" }, children: [{ text: "" }] },
            { type: "p", children: [{ text: "Do vialky sme dali " }, { type: "a", children: [{ text: "ab123" }] }, { text: " (20 mg)." }] },
            { type: "table", children: [
                { type: "tr", children: [{ type: "td", children: [{ text: "t" }] }, { type: "td", children: [{ text: "conv" }] }] },
                { type: "tr", children: [{ type: "td", children: [{ text: "1 h" }] }, { type: "td", children: [{ text: "50 %" }] }] },
            ] },
            { type: "hr", children: [{ text: "" }] },
            { type: "ul", children: [{ type: "li", children: [{ type: "p", children: [{ text: "TLC ok" }] }] }] },
        ]),
        feature_map: {
            77: {
                type: "reaction",
                data: {
                    stoichiometryTable: {
                        rows: [
                            { role: "reactant", name: "ab123", mass: 0.002, mole: 0.00001448, equivalent: 1,
                              molecularWeight: 138.122, limitingReagent: true, userInput: { msample: "20 mg" } },
                            { role: "reactant", name: "Acetyl Acetate", mass: 0.001478, mole: 0.00001448, equivalent: 1,
                              molecularWeight: 102.089, limitingReagent: false, userInput: {} },
                            { role: "product", name: "aspirin", equivalent: 1, molecularWeight: 180.159, userInput: {} },
                            { role: "agent", name: "toluene", mass: 12.554, volume: 0.01448, mole: 0.13625,
                              equivalent: 1, molecularWeight: 92.14, userInput: {} },
                        ],
                    },
                },
            },
        },
    };
}

test("entry text keeps headings, inline links and tables, skips the reaction", () => {
    assert.equal(
        entryTextFromBody(entry().body),
        "## Procedure\nDo vialky sme dali ab123 (20 mg).\nt | conv\n1 h | 50 %\n- TLC ok"
    );
});

test("entry text survives a body that is not JSON", () => {
    assert.equal(entryTextFromBody("not json"), "");
});

test("table rows are numbered from 1 with SI values", () => {
    const rows = tableRowsFromEntry(entry());
    assert.equal(rows.length, 4);
    assert.deepEqual(
        { row: rows[0].row, name: rows[0].name, massG: rows[0].massG, sampleG: rows[0].sampleG, limiting: rows[0].limiting },
        { row: 1, name: "ab123", massG: 0.002, sampleG: 0.02, limiting: true }
    );
    assert.equal(rows[3].volumeL, 0.01448);
});

test("messages carry the text and one line per row", () => {
    const [system, user] = buildMessages("text here", tableRowsFromEntry(entry()));
    assert.equal(system.role, "system");
    assert.match(system.content, /English/);
    assert.match(user.content, /text here/);
    assert.match(user.content, /Row 1 \| ab123 \| reactant/);
    assert.match(user.content, /Row 4 \| toluene/);
});

test("parseLlmJson reads fenced and prose-wrapped JSON", () => {
    assert.deepEqual(parseLlmJson('```json\n{"text":"a"}\n```'), { text: "a" });
    assert.deepEqual(parseLlmJson('Here you go: {"text":"a {b}"} hope it helps'), { text: "a {b}" });
    assert.equal(parseLlmJson("no json at all"), null);
});

test("parseQuantity converts to g, L, mol", () => {
    assert.equal(parseQuantity("20 mg").kind, "mass");
    assert.equal(parseQuantity("20 mg").value, 0.02);
    assert.equal(parseQuantity("0,5 mL").value, 0.0005);
    assert.equal(parseQuantity("14.5 µmol").kind, "amount");
    assert.ok(Math.abs(parseQuantity("14.5 umol").value - 0.0000145) < 1e-12);
    assert.equal(parseQuantity("1.1 equiv").kind, "eq");
    assert.equal(parseQuantity("78 %").kind, "percent");
    assert.equal(parseQuantity("a lot"), null);
});

test("matching amounts give no check; a real mismatch shows both numbers", () => {
    const rows = tableRowsFromEntry(entry());
    const checks = buildChecks(
        { amounts: [
            { row: 1, mass: "20 mg", amount: "14.5 µmol" },      // sample mass, rounded mol — fine
            { row: 2, amount: "29 µmol" },                       // twice the table
        ] },
        rows
    );
    assert.deepEqual(checks, [
        { kind: "mismatch", label: "Acetyl Acetate", text: "29 µmol", table: "14.5 µmol" },
    ]);
});

test("rounding in the text is tolerated", () => {
    const rows = tableRowsFromEntry(entry());
    // 0.5 mmol stands for 0.45–0.55 mmol; the table's 0.48 is inside it.
    rows[0].mol = 0.00048;
    assert.deepEqual(buildChecks({ amounts: [{ row: 1, amount: "0.5 mmol" }] }, rows), []);
});

test("yield is calculated from the product mass and the limiting reactant", () => {
    const rows = tableRowsFromEntry(entry());
    // 1.448e-5 mol × 180.159 = 2.609 mg at 100 %; 2.0 mg is 76.7 %.
    const checks = buildChecks({ product: { row: 3, mass: "2.0 mg", yield: "90 %" } }, rows);
    assert.deepEqual(checks, [{ kind: "yield", label: "Yield", text: "90 %", table: "77 %" }]);
    assert.deepEqual(buildChecks({ product: { row: 3, mass: "2.0 mg", yield: "77%" } }, rows), []);
});

test("a product mass without a stated yield reports the calculated one", () => {
    const rows = tableRowsFromEntry(entry());
    assert.deepEqual(buildChecks({ product: { row: 3, mass: "2.0 mg" } }, rows), [
        { kind: "yield", label: "Yield", text: null, table: "77 %" },
    ]);
});

test("rows not in the text and LLM notes are listed", () => {
    const rows = tableRowsFromEntry(entry());
    assert.deepEqual(buildChecks({ notMentioned: [4, 99], notes: ["Add the reaction temperature", ""] }, rows), [
        { kind: "missing", label: "toluene" },
        { kind: "note", message: "Add the reaction temperature" },
    ]);
});

test("dictation messages carry the table and entry text as context, the dictation last", () => {
    const [system, user] = buildDictationMessages("pridali sme acetyl acetát", {
        rows: tableRowsFromEntry(entry()),
        entryText: ["## Procedure", "The vial was charged."].join("\n"),
    });
    assert.match(system.content, /English/);
    assert.ok(user.content.startsWith("CONTEXT (for understanding only"));
    assert.ok(user.content.includes("Row 2 | Acetyl Acetate"));
    assert.ok(user.content.includes(["ENTRY TEXT BEFORE THE DICTATION", "## Procedure"].join("\n")));
    assert.ok(user.content.includes(["DICTATION", "pridali sme acetyl acetát", ""].join("\n")));
});

test("a dictation without context sends the dictation alone", () => {
    const [, user] = buildDictationMessages("text");
    assert.ok(user.content.startsWith(["DICTATION", "text"].join("\n")));
});

test("section context keeps its heading and the end of a long section", () => {
    assert.equal(sectionContext(["## A", "x", "## B", "y"].join("\n")), ["## B", "y"].join("\n"));
    assert.equal(sectionContext(["## B", "a".repeat(20) + "END"].join("\n"), 5), ["## B", "…aaEND"].join("\n"));
});

test("dictation answers lose fences and quotes", () => {
    assert.equal(cleanDictationAnswer('```\n"Acetyl acetate was added."\n```'), "Acetyl acetate was added.");
    assert.equal(cleanDictationAnswer("  The mixture was stirred.  "), "The mixture was stirred.");
});

test("an echoed or still-Slovak answer counts as untranslated", () => {
    const heard = "Do banky sme pridali 20 mg zlúčeniny a miešali cez noc pri izbovej teplote.";
    assert.equal(looksUntranslated(heard, heard), true);
    assert.equal(looksUntranslated("Do banky sme pridali 20 mg zlúčeniny, miešali cez noc.", heard), true);
    assert.equal(looksUntranslated("The compound (20 mg) was added to the flask and stirred overnight at room temperature.", heard), false);
});

test("both prompts end with the order to answer in English", () => {
    const rows = tableRowsFromEntry(entry());
    assert.match(buildMessages("text", rows)[1].content, /must be in English[^\n]*$/);
    assert.match(buildDictationMessages("text", rows)[1].content, /Reply in English only\.$/);
});

test("nothing about the structure reaches the prompt — no MW", () => {
    const content = buildMessages("t", tableRowsFromEntry(entry()))[1].content;
    assert.ok(!/MW|138\.122/.test(content));
});

test("house rules that are on join the system prompt; none leaves it as it was", () => {
    const messages = buildDictationMessages("text");
    assert.equal(withHouseRules(messages, []), messages);
    const [system, user] = withHouseRules(messages, ["Write room temperature as rt.", " "]);
    assert.match(system.content, /HOUSE RULES — always follow these:\n- Write room temperature as rt\.$/);
    assert.equal(user, messages[1]);
});

test("a Polish + instruction comes after the text, and the last line says to follow it", () => {
    const [, user] = buildDictationMessages("text", { instruction: "make it a bullet list" });
    assert.ok(user.content.includes(["EXTRA INSTRUCTION FOR THIS TEXT", "make it a bullet list"].join("\n")));
    assert.match(user.content, /following the extra instruction\. Reply in English only\.$/);
});

test("no structure in any form reaches any prompt, however much of it the table carries", () => {
    const e = entry();
    const STRUCTURE = {
        mrv: "<cml><MDocument>ZZMRV</MDocument></cml>",
        structureMrv: "ZZSTRUCTUREMRV",
        smiles: "ZZSMILES c1ccccc1",
        molfile: "ZZMOLFILE\n  -ISIS-",
        originalMolfile: "ZZORIGINALMOLFILE",
        image: "data:image/png;base64,ZZIMAGE",
        molecularWeight: 999.111,
        formulaWeight: 999.111,
        exactMass: 998.222,
        formula: "C99H99ZZ",
    };
    const feature = e.feature_map[77].data;
    Object.assign(feature, { mrv: "ZZREACTIONMRV", image: "ZZREACTIONIMAGE", structureMrv: { a: "ZZSTRUCTMAP" } });
    for (const row of feature.stoichiometryTable.rows) Object.assign(row, STRUCTURE);

    const rows = tableRowsFromEntry(e);
    const sent = JSON.stringify([
        buildMessages(entryTextFromBody(e.body), rows),
        buildDictationMessages("text", { rows, entryText: entryTextFromBody(e.body) }),
        buildAskMessages("text", { rows, entryText: entryTextFromBody(e.body) }),
    ]);
    assert.ok(!/ZZ|<cml|999\.111|998\.222|base64/.test(sent), "a structure field leaked into a prompt");
});

test("a dictation asks for JSON like Polish entry; notMentioned only for a reaction's dictation", () => {
    const rows = tableRowsFromEntry(entry());
    const [plain] = buildDictationMessages("text", { rows });
    assert.match(plain.content, /"amounts"/);
    assert.match(plain.content, /"notes"/);
    assert.ok(!plain.content.includes("notMentioned"));

    const [reaction] = buildDictationMessages("text", { rows, askMissing: true });
    assert.match(reaction.content, /"notMentioned": \[<row numbers/);

    // Without a table there is nothing to be missing from.
    const [noTable] = buildDictationMessages("text", { askMissing: true });
    assert.ok(!noTable.content.includes("notMentioned"));
});

test("a dictation's JSON answer gives checks against its table", () => {
    const rows = tableRowsFromEntry(entry());
    const answer = parseLlmJson('{"text":"Acetyl acetate (29 µmol) was added.","amounts":[{"row":2,"amount":"29 µmol"}],"product":null,"notes":["Add the reaction time"]}');
    const checks = buildChecks({ ...answer, notMentioned: [] }, rows);
    assert.deepEqual(checks.map((c) => c.kind), ["mismatch", "note"]);
});

test("Ask sends the whole entry as background and asks only for what the request wants", () => {
    const rows = tableRowsFromEntry(entry());
    const [system, user] = buildAskMessages("dopíš workup: 3× EtOAc", {
        rows,
        entryText: ["## Procedure", "The vial was charged."].join("\n"),
        mentionBlock: "ENTITY TOKENS\n[[R1]] = ab123",
    });
    assert.match(system.content, /write ONLY that new text/);
    assert.match(system.content, /Never rewrite, repeat or translate the rest of the entry/);
    assert.ok(!system.content.includes("notMentioned"));
    assert.ok(user.content.includes(["ENTRY TEXT", "## Procedure"].join("\n")));
    assert.ok(user.content.includes("Row 1 | ab123"));
    assert.ok(user.content.includes(["REQUEST", "dopíš workup: 3× EtOAc"].join("\n")));
    assert.match(user.content, /Reply in English only\.$/);
    // The request comes after the background, the last order after the request.
    assert.ok(user.content.indexOf("REQUEST") > user.content.indexOf("ENTRY TEXT"));
});

test("Ask on an empty entry says so instead of sending nothing", () => {
    const [, user] = buildAskMessages("write a summary");
    assert.ok(user.content.includes("(the entry has no text yet)"));
});
