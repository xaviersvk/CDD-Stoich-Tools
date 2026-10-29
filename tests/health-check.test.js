import { test } from "node:test";
import assert from "node:assert/strict";

// health-check.js pulls in content/state.js, which reads location on import.
globalThis.location ??= { href: "https://example.test/", pathname: "/" };
const { CHECKS, findMissingAnchors } = await import("../src/content/health-check.js");
const { SELECTORS } = await import("../src/content/selectors.js");

const ENTRY = "/vaults/6884/eln/entries/2850903";
const present = (...selectors) => (s) => selectors.includes(s);
const missing = (ctx) => findMissingAnchors(CHECKS, ctx).map((c) => c.selector);

test("an entry with everything in place reports nothing", () => {
    const all = Object.values(SELECTORS).flat();
    const state = { hasReactionFeature: true, lastPayload: { samples: [{}] } };
    assert.deepEqual(missing({ path: ENTRY, state, query: present(...all) }), []);
});

test("reaction anchors are only expected when the payload has a reaction", () => {
    const query = present(SELECTORS.username, SELECTORS.entryIdentifier, SELECTORS.entryEditor);
    assert.deepEqual(missing({ path: ENTRY, state: { hasReactionFeature: false }, query }), []);
    assert.deepEqual(missing({ path: ENTRY, state: { hasReactionFeature: true, lastPayload: { samples: [] } }, query }), [
        SELECTORS.reaction,
        SELECTORS.stoichTable,
    ]);
});

test("a changed identifier is named, with the features that stand on it", () => {
    const query = present(SELECTORS.username, SELECTORS.entryEditor);
    const [check] = findMissingAnchors(CHECKS, { path: ENTRY, state: {}, query });
    assert.equal(check.selector, SELECTORS.entryIdentifier);
    assert.ok(check.features.includes("ELN tab title"));
});

test("checks stay on their own pages", () => {
    assert.deepEqual(missing({ path: "/vaults/1/runs/5", state: {}, query: present(SELECTORS.username) }), []);
    assert.deepEqual(missing({ path: "/vaults/1/runs/5", state: {}, query: present(SELECTORS.username, "#run-summary") }), [SELECTORS.runSummaryLinks]);
    assert.deepEqual(missing({ path: "/vaults/1/molecules/5", state: {}, query: present(SELECTORS.username) }), []);
    assert.deepEqual(missing({ path: "/", state: {}, query: present() }), []);
});

test("a list of selectors passes when any one of them matches", () => {
    const checks = [{ page: /.*/, selector: SELECTORS.searchResultsTables, features: ["x"] }];
    const query = present(SELECTORS.searchResultsTables[1]);
    assert.deepEqual(findMissingAnchors(checks, { path: "/", state: {}, query }), []);
});
