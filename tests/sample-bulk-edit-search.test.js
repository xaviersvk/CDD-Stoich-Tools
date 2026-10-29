import { test } from "node:test";
import assert from "node:assert/strict";

import { noteInventorySearch, searchEntry } from "../src/content/features/sample-bulk-edit/search.js";

test("noteInventorySearch learns the first load's initial_entries and later inventory_entries", () => {
    noteInventorySearch({
        initial_entries: [{ id: 1000166265, name: "RGT-0000537-005-I004974", batch: { molecule_id: 146151076 } }],
    });
    noteInventorySearch({
        inventory_entries: [
            { id: 1000162492, name: " RGT-0001968-001-I004889 ", batch: { molecule_id: 166626302 } },
            { id: 7, name: "no molecule" },
        ],
    });
    assert.deepEqual(searchEntry("RGT-0000537-005-I004974"), { id: 1000166265, moleculeId: "146151076" });
    assert.deepEqual(searchEntry("RGT-0001968-001-I004889"), { id: 1000162492, moleculeId: "166626302" });
    assert.equal(searchEntry("no molecule"), null);
    noteInventorySearch(null);
});
