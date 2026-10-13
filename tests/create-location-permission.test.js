import { test } from "node:test";
import assert from "node:assert/strict";

import {
    readCachedAnswer,
    settingsPath,
    vaultIdFromPath,
} from "../src/content/features/ui-fixes/create-location-link/permission.js";

const user = "Testan Testič someone@example.com";
const now = 10 * 60 * 1000;
const entry = (fields) => JSON.stringify({ user, at: now, ...fields });

test("a yes holds for the session", () => {
    assert.equal(readCachedAnswer(entry({ allowed: true, at: 0 }), user, now), true);
});

test("a no holds for five minutes only", () => {
    assert.equal(readCachedAnswer(entry({ allowed: false, at: now - 60 * 1000 }), user, now), false);
    assert.equal(readCachedAnswer(entry({ allowed: false, at: now - 5 * 60 * 1000 }), user, now), null);
    // a clock that jumped backwards does not pin a no
    assert.equal(readCachedAnswer(entry({ allowed: false, at: now + 1000 }), user, now), null);
});

test("an answer recorded for another login is not used", () => {
    assert.equal(readCachedAnswer(entry({ allowed: true }), "Someone Else", now), null);
});

test("old plain values and junk are probed again", () => {
    for (const raw of ["0", "1", null, "", "{", "[]"]) {
        assert.equal(readCachedAnswer(raw, user, now), null, `raw ${JSON.stringify(raw)}`);
    }
});

test("vault id and settings path", () => {
    assert.equal(vaultIdFromPath("/vaults/1000000109/searches/new"), "1000000109");
    assert.equal(vaultIdFromPath("/vaults/6772"), "6772");
    assert.equal(vaultIdFromPath("/user/preferences"), null);
    assert.equal(settingsPath("6772"), "/vaults/6772/inventory_field_definitions");
});
