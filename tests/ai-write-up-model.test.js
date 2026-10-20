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
    cleanDictationAnswer,
    looksUntranslated,
    sectionContext,
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
