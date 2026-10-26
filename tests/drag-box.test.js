import { test } from "node:test";
import assert from "node:assert/strict";

import { dragArea, touches } from "../src/shared/drag-box.js";

test("dragArea orders the corners whichever way the drag went", () => {
    assert.deepEqual(dragArea(50, 40, 10, 100), { left: 10, right: 50, top: 40, bottom: 100, isClick: false });
});

test("dragArea collapses a click-sized move to the end point", () => {
    assert.deepEqual(dragArea(10, 10, 12, 11), { left: 12, right: 12, top: 11, bottom: 11, isClick: true });
});

test("dragArea: a long thin drag is still a drag", () => {
    assert.equal(dragArea(10, 10, 80, 11).isClick, false);
});

test("touches: overlap, shared edge and a miss", () => {
    const area = { left: 10, right: 50, top: 10, bottom: 50 };
    assert.equal(touches(area, { left: 40, right: 70, top: 40, bottom: 70 }), true);
    assert.equal(touches(area, { left: 50, right: 70, top: 0, bottom: 10 }), true);
    assert.equal(touches(area, { left: 51, right: 70, top: 0, bottom: 70 }), false);
});

test("touches: a collapsed click area hits only the rect under it", () => {
    const area = dragArea(20, 20, 20, 20);
    assert.equal(touches(area, { left: 10, right: 30, top: 10, bottom: 30 }), true);
    assert.equal(touches(area, { left: 31, right: 60, top: 10, bottom: 30 }), false);
});
