import { test } from "node:test";
import assert from "node:assert/strict";

import {
    enforceLimit,
    findDuplicatePhrase,
    mergeImportedPhrases,
    phraseBodyKey,
    sanitizePhrase,
} from "../src/shared/phrases.js";

const phrase = (id, text, extra = {}) => ({
    id,
    name: id,
    categories: [],
    text,
    html: "",
    pinned: false,
    createdAt: 1,
    lastUsedAt: 1,
    ...extra,
});

test("pinned survives sanitising and defaults to false", () => {
    assert.equal(sanitizePhrase({ text: "a", pinned: true }).pinned, true);
    assert.equal(sanitizePhrase({ text: "a" }).pinned, false);
    assert.equal(sanitizePhrase({ text: "a", pinned: "yes" }).pinned, false);
});

test("the cap drops the least recently used phrase", () => {
    const list = [phrase("old", "a", { lastUsedAt: 1 }), phrase("mid", "b", { lastUsedAt: 2 }), phrase("new", "c", { lastUsedAt: 3 })];
    assert.deepEqual(enforceLimit(list, 2).map((p) => p.id), ["mid", "new"]);
});

test("a pinned phrase is not dropped, however long ago it was used", () => {
    const list = [
        phrase("old-pinned", "a", { lastUsedAt: 1, pinned: true }),
        phrase("mid", "b", { lastUsedAt: 2 }),
        phrase("new", "c", { lastUsedAt: 3 }),
    ];
    assert.deepEqual(enforceLimit(list, 2).map((p) => p.id), ["old-pinned", "new"]);
});

test("when the pinned ones alone are over the cap, the oldest pinned goes", () => {
    const list = [
        phrase("p1", "a", { lastUsedAt: 1, pinned: true }),
        phrase("p2", "b", { lastUsedAt: 2, pinned: true }),
        phrase("p3", "c", { lastUsedAt: 3, pinned: true }),
        phrase("fresh", "d", { lastUsedAt: 9 }),
    ];
    assert.deepEqual(enforceLimit(list, 2).map((p) => p.id), ["p2", "p3"]);
});

test("the body key ignores whitespace and invisible characters, not case", () => {
    assert.equal(phraseBodyKey("  Washed  with\n\tbrine​. "), "Washed with brine.");
    assert.notEqual(phraseBodyKey("5 mL"), phraseBodyKey("5 ML"));
});

test("a duplicate is found by body, whatever its name", () => {
    const list = [phrase("a", "Dried over Na2SO4,\nfiltered."), phrase("b", "Something else")];
    assert.equal(findDuplicatePhrase(list, "Dried over  Na2SO4, filtered.").id, "a");
    assert.equal(findDuplicatePhrase(list, "Dried over MgSO4, filtered."), null);
    assert.equal(findDuplicatePhrase(list, "   "), null);
    assert.equal(findDuplicatePhrase(list, "Dried over Na2SO4, filtered.", "a"), null);
});

test("a merge import skips bodies already stored and replaces by id", () => {
    const current = [phrase("a", "Washed with brine."), phrase("b", "Old wording")];
    const incoming = [
        phrase("x", "Washed  with brine."),     // same body, new id → skipped
        phrase("b", "New wording"),             // same id → replaces
        phrase("y", "Concentrated in vacuo."),  // new
    ];
    const merged = mergeImportedPhrases(current, incoming);
    assert.equal(merged.imported, 2);
    assert.equal(merged.skipped, 1);
    assert.deepEqual(merged.phrases.map((p) => p.id), ["a", "b", "y"]);
    assert.equal(merged.phrases.find((p) => p.id === "b").text, "New wording");
});

test("a merge import does not compare the file's phrases with each other", () => {
    const incoming = [phrase("x", "Same text"), phrase("y", "Same text")];
    const merged = mergeImportedPhrases([], incoming);
    assert.equal(merged.imported, 2);
    assert.equal(merged.skipped, 0);
});
