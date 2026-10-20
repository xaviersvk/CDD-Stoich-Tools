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
                { uid: 1, role: "reactant", name: "ab123", mass: 0.002, mole: 0.00001448, userInput: { msample: "20 mg" } },
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
