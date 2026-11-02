import { test } from "node:test";
import assert from "node:assert/strict";

import {
    flipOffset,
    nearViewport,
    scrollToKeep,
} from "../src/content/features/ui-fixes/steady-stoich-edit/model.js";

test("a cell that moved is drawn back at its old place first", () => {
    // Amounts column: 719 → 653, the row 120px lower after the scroll fix.
    assert.deepEqual(flipOffset({ left: 719, top: 300 }, { left: 653, top: 420 }), { dx: 66, dy: -120 });
});

test("a cell that stayed put is not animated", () => {
    assert.equal(flipOffset({ left: 10, top: 20 }, { left: 10.4, top: 19.6 }), null);
});

test("the page scrolls by how far the clicked spot moved", () => {
    assert.equal(scrollToKeep(336, 665), 329);
    assert.equal(scrollToKeep(1120, 618), -502);
});

test("sub-pixel drift does not scroll", () => {
    assert.equal(scrollToKeep(336, 336.6), 0);
});

test("only blocks on or near the screen are animated", () => {
    assert.equal(nearViewport({ top: 100, bottom: 300 }, 900), true);
    assert.equal(nearViewport({ top: -800, bottom: -10 }, 900), true);
    assert.equal(nearViewport({ top: 2000, bottom: 2400 }, 900), false);
    assert.equal(nearViewport({ top: -3000, bottom: -1000 }, 900), false);
});
