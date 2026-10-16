import { test } from "node:test";
import assert from "node:assert/strict";

import {
    parseProtocolRequirement,
    readoutPicklists,
    selectedColumnId,
} from "../src/content/features/ui-fixes/slurp-protocol-picklist-defaults.js";

test("parseProtocolRequirement reads readout and protocol from CDD's error line", () => {
    assert.deepEqual(
        parseProtocolRequirement("\n  You must map Buffer when importing protocol data for MTAP FP DR Assay.\n"),
        { readout: "Buffer", protocol: "MTAP FP DR Assay" }
    );
    assert.deepEqual(
        parseProtocolRequirement("You must map Cell line when importing protocol data for Assay v2.1."),
        { readout: "Cell line", protocol: "Assay v2.1" }
    );
});

test("parseProtocolRequirement ignores other error lines", () => {
    assert.equal(
        parseProtocolRequirement(
            "If you map Anisotropy for run 2026-10-08, you must also map Buffer for this run."
        ),
        null
    );
    assert.equal(parseProtocolRequirement("You must map Origin when registering new entities."), null);
    assert.equal(parseProtocolRequirement(""), null);
});

test("readoutPicklists keeps pick-list readouts with visible values, by name", () => {
    const map = readoutPicklists([
        {
            id: 1000037942,
            name: "Buffer",
            data_type_name: "PickList",
            pick_list_values: [{ value: "PBS" }, { value: "Old", hidden: true }, { value: " " }, { value: "TRIS" }],
        },
        { id: 2, name: "Anisotropy", data_type_name: "Number" },
        { id: 3, name: "Empty", data_type_name: "PickList", pick_list_values: [{ value: "x", hidden: true }] },
    ]);

    assert.deepEqual([...map.keys()], ["Buffer"]);
    assert.deepEqual(map.get("Buffer"), { id: "1000037942", values: ["PBS", "TRIS"] });
});

test("readoutPicklists tolerates a missing list", () => {
    assert.equal(readoutPicklists(undefined).size, 0);
});

test("selectedColumnId reads the new column from CDD's Turbo stream", () => {
    const stream =
        '<turbo-stream action="replace" target="mapper-columns-inner"><template></template></turbo-stream>' +
        '<turbo-stream action="select_column" target="column_virtual_header_1000618210"></turbo-stream>';
    assert.equal(selectedColumnId(stream), "1000618210");
    assert.equal(selectedColumnId('<turbo-stream target="column_header_5" action="select_column">'), "5");
    assert.equal(selectedColumnId("<html></html>"), null);
});
