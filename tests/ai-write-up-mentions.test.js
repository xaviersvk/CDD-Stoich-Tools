import { test } from "node:test";
import assert from "node:assert/strict";

import { tableRowsFromEntry, buildMessages, buildDictationMessages } from "../src/content/features/ai-write-up/model.js";
import {
    rowMentionLabel,
    entityMentions,
    mentionPromptBlock,
    splitMentions,
    mentionsToPlain,
    mentionsToClipboardHtml,
    unfilledPlaceholders,
    segmentLines,
} from "../src/content/features/ai-write-up/mentions.js";

const ENTRY_URL = "https://eu.collaborativedrug.com/vaults/1/eln/entries/2";

// Trimmed from entry 1000000823: one reaction, an @-mention of its first row
// and a link to a run.
function entry() {
    return {
        body: JSON.stringify([
            { type: "p", children: [
                { text: "Added " },
                { type: "a", data: { feature_id: "78" }, children: [{ text: "ab123 (20 mg, 14.5 µmol)" }] },
                { text: ", see " },
                { type: "a", data: { feature_id: "81" }, children: [{ text: "Dose response" }] },
                { type: "a", data: { feature_id: "82" }, children: [{ text: "Dose response" }] },
            ] },
            { type: "reaction", data: { feature_id: "77" }, children: [{ text: "" }] },
        ]),
        feature_map: {
            77: { type: "reaction", data: { attachedStructureId: 1000149090, stoichiometryTable: { rows: [
                { uid: 1, role: "reactant", name: "ab123", moleculeName: "IXX-DEMO-0000011", mass: 0.002, mole: 0.00001448, userInput: { msample: "20 mg" } },
                { uid: 2, role: "reactant", name: "Acetyl Acetate", mass: 0.001478, mole: 0.00001448, userInput: {} },
                { uid: 3, role: "product", userInput: {} },
            ] } } },
            78: { type: "link", data: { id: "#attached_structures/1000149090%23reaction_components/1", label: "x", defaultLabel: "ab123 (20 mg, 14.5 µmol)", display: "defaultLabel" } },
            81: { type: "link", data: { id: 1000067610, href: "/vaults/1/runs/5#run-summary", label: "Dose response - 2026-05-01", defaultLabel: "Dose response - 2026-05-01", display: "defaultLabel" } },
            82: { type: "link", data: { id: 1000067610, href: "/vaults/1/runs/5#run-summary", label: "Dose response - 2026-05-01", defaultLabel: "Dose response - 2026-05-01", display: "defaultLabel" } },
        },
    };
}

function mentions() {
    const e = entry();
    return entityMentions(tableRowsFromEntry(e), e, ENTRY_URL);
}

test("a row's label is CDD's name (sample or mass, mol)", () => {
    const [ab123, acetate] = tableRowsFromEntry(entry());
    assert.equal(rowMentionLabel(ab123), "ab123 (20 mg, 14.5 µmol)");
    assert.equal(rowMentionLabel(acetate), "Acetyl Acetate (1.48 mg, 14.5 µmol)");
});

test("rows with a name become row mentions; links in the text become link mentions, once", () => {
    const list = mentions();
    assert.deepEqual(list.map((m) => m.token), ["R1", "R2", "L1"]);   // the unnamed product has no mention
    assert.equal(list[0].data.id, "#attached_structures/1000149090%23reaction_components/1");
    assert.equal(list[0].data.href, `${ENTRY_URL}#attached_structures/1000149090%23reaction_components/1`);
    assert.equal(list[0].data.display, "defaultLabel");
    assert.equal(list[2].label, "Dose response - 2026-05-01");
    assert.equal(list[2].data.id, 1000067610);
});

test("the token list reaches both prompts", () => {
    const block = mentionPromptBlock(mentions());
    assert.match(block, /\[\[R2\]\] = Acetyl Acetate \(1\.48 mg, 14\.5 µmol\)/);
    assert.ok(buildMessages("t", tableRowsFromEntry(entry()), block)[1].content.includes(block));
    assert.ok(buildDictationMessages("t", { mentionBlock: block })[1].content.includes(block));
    assert.equal(mentionPromptBlock([]), "");
});

test("tokens split out of the text; unknown ones are dropped", () => {
    const segments = splitMentions("Then [[R2]] was added to [[R9]]the vial.", mentions());
    assert.equal(segments.length, 3);
    assert.equal(segments[1].mention.token, "R2");
    assert.equal(mentionsToPlain(segments), "Then Acetyl Acetate (1.48 mg, 14.5 µmol) was added to the vial.");
});

test("the clipboard HTML carries a Slate fragment with mention nodes", () => {
    const segments = splitMentions("## Procedure\n[[R1]] was dissolved.", mentions());
    const html = mentionsToClipboardHtml(segments);
    const encoded = html.match(/data-slate-fragment="([^"]+)"/)[1];
    const nodes = JSON.parse(decodeURIComponent(atob(encoded)));
    assert.deepEqual(nodes.map((n) => n.type), ["h1", "p"]);
    const [lead, link, rest] = nodes[1].children;
    assert.deepEqual(lead, { text: "" });
    assert.equal(link.type, "a");
    assert.equal(link.data.id, "#attached_structures/1000149090%23reaction_components/1");
    assert.deepEqual(link.children, [{ text: "ab123 (20 mg, 14.5 µmol)" }]);
    assert.deepEqual(rest, { text: " was dissolved." });
    assert.match(html, /<h2>Procedure<\/h2><p><a href="[^"]+">ab123 \(20 mg, 14\.5 µmol\)<\/a> was dissolved\.<\/p>/);
});

test("names written without a token are linked, first time only, as written", () => {
    const segments = splitMentions("The acetyl acetate (1.48 mg, 14.5 µmol) was added, then more acetyl acetate.", mentions());
    const linked = segments.filter((s) => s.mention);
    assert.equal(linked.length, 1);
    assert.equal(linked[0].mention.label, "acetyl acetate (1.48 mg, 14.5 µmol)");
    assert.equal(linked[0].mention.data.defaultLabel, "acetyl acetate (1.48 mg, 14.5 µmol)");
    assert.equal(linked[0].mention.data.id, "#attached_structures/1000149090%23reaction_components/2");
    assert.equal(mentionsToPlain(segments), "The acetyl acetate (1.48 mg, 14.5 µmol) was added, then more acetyl acetate.");
});

test("a name already linked by its token is not linked again; parts of words are not names", () => {
    const segments = splitMentions("[[R1]] in ab1234 and ab123 again; see Dose response - 2026-05-01.", mentions());
    const tokens = segments.filter((s) => s.mention).map((s) => s.mention.token);
    assert.deepEqual(tokens, ["R1", "L1"]);
});

test("a bare name keeps the sentence as it was", () => {
    const segments = splitMentions("It was dissolved in ab123.", mentions());
    assert.equal(segments[1].mention.label, "ab123");
    assert.equal(mentionsToPlain(segments), "It was dissolved in ab123.");
});

test("a row is also found by its molecule code", () => {
    const segments = splitMentions("IXX-DEMO-0000011 was weighed out.", mentions());
    assert.equal(segments[0].mention.token, "R1");
    assert.equal(segments[0].mention.label, "IXX-DEMO-0000011");
});

// Entry 1000017498 (vault 8158), trimmed: the row is named "Tenofovir" but
// its sample is I34-SM-…; components count rows in table order without the
// product, not by uid (pyridine, uid 13, is component 4).
function tenofovirEntry() {
    return {
        body: JSON.stringify([{ type: "p", children: [{ text: "x" }] }]),
        feature_map: {
            15: { type: "reaction", data: { attachedStructureId: 1000518590, stoichiometryTable: { rows: [
                { uid: 1, role: "reactant", name: "Tenofovir", sample: { name: "I34-SM-0037292-008-I34S016471" },
                  moleculeName: "I34-SM-0037292", batch: { name: "008" }, mass: 0.0368, mole: 0.000128, userInput: { msample: "36.8 mg" } },
                { uid: 8, role: "product", moleculeName: "I34-SM-0000082", batch: { name: "Unspecified Batch" }, userInput: {} },
                { uid: 10, role: "agent", sample: { name: "I34-SM-0037102-001-I34S001676" }, iupacName: "phenol", userInput: {} },
                { uid: 11, role: "agent", name: "DIPEA", userInput: {} },
                { uid: 13, role: "agent", name: "pyridine", volume: 0.0256, mole: 0.318, userInput: {} },
            ] } } },
            20: { type: "link", data: { id: "#attached_structures/1000518590%23reaction_components/3", href: "/x", display: "defaultLabel",
                  defaultLabel: "DIPEA (22.3 µL, 1 eq., 128 µmol)", label: "DIPEA (22.3 µL, 1 eq., 128 µmol)" } },
        },
    };
}

test("the row's own name is the one prose uses; components skip the product", () => {
    const e = tenofovirEntry();
    const rows = tableRowsFromEntry(e);
    assert.equal(rows[0].name, "Tenofovir");
    assert.deepEqual(rows.map((r) => r.component), [1, null, 2, 3, 4]);

    const list = entityMentions(rows, e, ENTRY_URL);
    const byName = Object.fromEntries(list.map((m) => [m.names[0], m]));
    assert.equal(byName.Tenofovir.data.id, "#attached_structures/1000518590%23reaction_components/1");
    assert.equal(byName.pyridine.data.id, "#attached_structures/1000518590%23reaction_components/4");
    assert.equal(byName.pyridine.label, "pyridine (25.6 mL, 318 mmol)");
    // An existing mention of the row: CDD's own label and data.
    assert.equal(byName.DIPEA.label, "DIPEA (22.3 µL, 1 eq., 128 µmol)");

    const segments = splitMentions("Tenofovir (36.8 mg, 128 µmol) was suspended in pyridine.", list);
    assert.deepEqual(segments.filter((s) => s.mention).map((s) => s.mention.label), [
        "Tenofovir (36.8 mg, 128 µmol)",
        "pyridine",
    ]);
});

test("a batch name is never matched as a compound name", () => {
    const e = tenofovirEntry();
    const list = entityMentions(tableRowsFromEntry(e), e, ENTRY_URL);
    assert.ok(!list.some((m) => m.names.includes("008")));
});

test("placeholders become slots; empty ones copy as bold [what?], filled ones as their value", () => {
    const segments = splitMentions("The mixture was stirred at [[?temperature]] for [[? time ]].", mentions());
    const slots = segments.filter((s) => s.placeholder);
    assert.deepEqual(slots.map((s) => s.placeholder.what), ["temperature", "time"]);
    assert.deepEqual(unfilledPlaceholders(segments), ["temperature", "time"]);
    assert.equal(mentionsToPlain(segments), "The mixture was stirred at [temperature?] for [time?].");

    slots[0].placeholder.value = "80 °C";
    assert.deepEqual(unfilledPlaceholders(segments), ["time"]);
    assert.equal(mentionsToPlain(segments), "The mixture was stirred at 80 °C for [time?].");

    const html = mentionsToClipboardHtml(segments);
    assert.match(html, /stirred at 80 °C for <strong>\[time\?\]<\/strong>\./);
    const nodes = JSON.parse(decodeURIComponent(atob(html.match(/data-slate-fragment="([^"]+)"/)[1])));
    assert.deepEqual(nodes[0].children, [
        { text: "The mixture was stirred at " },
        { text: "80 °C" },
        { text: " for " },
        { text: "[time?]", bold: true },
        { text: "." },
    ]);
});

test("placeholders do not stop names from being linked, and are capped", () => {
    const segments = splitMentions("[[?amount]] ab123 was added.", mentions());
    assert.ok(segments[0].placeholder);
    assert.equal(segments.find((s) => s.mention)?.mention.token, "R1");

    const many = splitMentions(Array.from({ length: 10 }, (_, i) => `[[?x${i}]]`).join(" "), []);
    assert.equal(many.filter((s) => s.placeholder).length, 8);
    assert.match(mentionsToPlain(many), /x8 x9$/);
});

test("one paragraph copies alone, with its mentions and the placeholder's value", () => {
    const segments = splitMentions("## Procedure\n[[R1]] was dissolved at [[?temperature]].\nThe mixture was stirred.", mentions());
    const paragraphs = segmentLines(segments);
    assert.equal(paragraphs.length, 3);
    segments.find((s) => s.placeholder).placeholder.value = "0 °C";
    const second = segmentLines(segments)[1];
    assert.equal(mentionsToPlain(second), "ab123 (20 mg, 14.5 µmol) was dissolved at 0 °C.");
    const nodes = JSON.parse(decodeURIComponent(atob(mentionsToClipboardHtml(second).match(/data-slate-fragment="([^"]+)"/)[1])));
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].children[1].type, "a");
});

test("an IUPAC name never reaches a prompt, but still links the compound locally", () => {
    const e = {
        body: JSON.stringify([{ type: "p", children: [{ text: "x" }] }]),
        feature_map: {
            9: { type: "reaction", data: { attachedStructureId: 7, stoichiometryTable: { rows: [
                // Only an IUPAC name — the phenol row of entry 1000017498, sample left out.
                { uid: 10, role: "agent", iupacName: "ZZIUPAC-phenol", mass: 0.012, mole: 0.000128, userInput: {} },
                { uid: 11, role: "agent", name: "DIPEA", iupacName: "N-ethyl-ZZIUPAC-diisopropylamine", userInput: {} },
            ] } } },
        },
    };
    const rows = tableRowsFromEntry(e);
    assert.equal(rows[0].name, "Unnamed");
    assert.equal(rows[0].displayName, "ZZIUPAC-phenol");

    const list = entityMentions(rows, e, ENTRY_URL);
    const sent = JSON.stringify([
        buildMessages("text", rows, mentionPromptBlock(list)),
        buildDictationMessages("text", { rows, mentionBlock: mentionPromptBlock(list) }),
    ]);
    assert.ok(!sent.includes("ZZIUPAC"), "an IUPAC name went to the model");

    // Locally the compound is still found and linked by it.
    const segments = splitMentions("It was quenched with zziupac-phenol.", list);
    assert.equal(segments.find((s) => s.mention)?.mention.token, "R1");
});
