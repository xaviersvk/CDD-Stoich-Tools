import { test } from "node:test";
import assert from "node:assert/strict";

import { installFakePage, elementWithFiber, fiberChain } from "./helpers/fake-page.js";
import { EVENTS, EVENT_SOURCE } from "../src/shared/event-types.js";
import { installFormStoreBridge } from "../src/inject/hooks/form-store-bridge.js";
import { installFieldRowsBridge } from "../src/inject/hooks/field-rows-bridge.js";
import { installSelectBoxBridge } from "../src/inject/hooks/selectbox-bridge.js";
import { installLocationTreeBridge } from "../src/inject/hooks/location-tree-bridge.js";
import { installBatchLinkIdBridge } from "../src/inject/hooks/batch-link-id-bridge.js";

// Every bridge answers on window.postMessage with the same source tag.
const answer = (posted, type) => {
    const hit = posted.find((m) => m.type === type);
    assert.ok(hit, `no ${type} posted`);
    assert.equal(hit.source, EVENT_SOURCE);
    return hit.payload;
};

// ---- form store (Protocol Forms page) ----

test("form store: the field map is found above the forms table and reduced", () => {
    const store = {
        fieldDefinitionsMap: {
            protocol: [{ id: 1, name: "Target", data_type_name: "PickList", pick_list_values: [{ id: 9, value: "EGFR", hidden: 0 }, { value: "no id" }], extra: () => {} }],
            run: [{ id: 2, name: "Temp", data_type_name: "Number", unique_value: true }, { name: "no id" }],
        },
    };
    const table = elementWithFiber(fiberChain({ children: [] }, { other: 1 }, { store }));
    const page = installFakePage({ query: { table } });
    installFormStoreBridge();
    page.send(EVENTS.FORM_FIELD_MAP_REQUEST, { requestId: "r1" });

    const { requestId, map } = answer(page.posted, EVENTS.FORM_FIELD_MAP);
    assert.equal(requestId, "r1");
    assert.deepEqual(map.protocol, [{
        id: 1, name: "Target", data_type_name: "PickList",
        pick_list_values: [{ id: 9, value: "EGFR", hidden: false }],
        disabled: false, required_group_number: null, unique_value: false, overwritable: false, is_single_use: false,
    }]);
    assert.equal(map.run.length, 1);
    assert.equal(map.run[0].unique_value, true);
});

test("form store: no table, or a store of another shape, answers null", () => {
    let page = installFakePage();
    installFormStoreBridge();
    page.send(EVENTS.FORM_FIELD_MAP_REQUEST, { requestId: "r2" });
    assert.equal(answer(page.posted, EVENTS.FORM_FIELD_MAP).map, null);

    const table = elementWithFiber(fiberChain({ store: { fieldDefinitionsMap: { protocol: [] } } }));
    page = installFakePage({ query: { table } });
    installFormStoreBridge();
    page.send(EVENTS.FORM_FIELD_MAP_REQUEST, { requestId: "r3" });
    assert.equal(answer(page.posted, EVENTS.FORM_FIELD_MAP).map, null);
});

test("bridges ignore messages from other windows and other sources", () => {
    const table = elementWithFiber(fiberChain({ store: { fieldDefinitionsMap: { protocol: [], run: [] } } }));
    const page = installFakePage({ query: { table } });
    installFormStoreBridge();
    page.send(EVENTS.FORM_FIELD_MAP_REQUEST, { requestId: "x" }, /* source */ {});
    for (const cb of page.listeners.message) {
        cb({ source: page.win, data: { source: "SOMEONE_ELSE", type: EVENTS.FORM_FIELD_MAP_REQUEST } });
    }
    assert.deepEqual(page.posted, []);
});

// ---- field rows (… Fields settings pages) ----

test("field rows: rows from state or props, made JSON-safe", () => {
    const rows = [
        { name: "Purity", data_type_name: "Number", disabled: false, onEdit: () => {}, nested: { a: 1 }, pick_list_values: [] },
        { name: "Solvent", data_type_name: "PickList", pick_list_values: [{ value: "DMSO", hidden: true }, "Water"] },
    ];
    const second = elementWithFiber({ memoizedProps: {}, memoizedState: { rows }, return: null });
    const page = installFakePage({ query: { table: [elementWithFiber(fiberChain({})), second] } });
    installFieldRowsBridge();
    page.send(EVENTS.FIELD_ROWS_REQUEST, { requestId: "f1", tableIndex: 1 });

    const payload = answer(page.posted, EVENTS.FIELD_ROWS);
    assert.equal(payload.requestId, "f1");
    assert.deepEqual(payload.rows, [
        { name: "Purity", data_type_name: "Number", disabled: false, pick_list_values: [] },
        { name: "Solvent", data_type_name: "PickList", pick_list_values: [{ value: "DMSO", hidden: true }, { value: "Water", hidden: false }] },
    ]);
});

test("field rows: a table without rows answers null", () => {
    const page = installFakePage({ query: { table: elementWithFiber(fiberChain({ rows: [] })) } });
    installFieldRowsBridge();
    page.send(EVENTS.FIELD_ROWS_REQUEST, { requestId: "f2" });
    assert.equal(answer(page.posted, EVENTS.FIELD_ROWS).rows, null);
});

// ---- SelectBox (ELN entries filter picker) ----

function selectBoxPage(onChange) {
    const props = {
        value: "b",
        onChange,
        options: [
            { value: "h", label: "Fields", optionType: "header" },
            { value: "a", label: "Title", selected: "Title" },
            { value: "b", label: { props: { title: "Status" } }, disabled: true },
            { value: 3, label: { props: { children: "Owner " } } },
        ],
    };
    // The SelectBox sits below the element the content side points at.
    const root = { memoizedProps: {}, child: { memoizedProps: { other: 1 }, child: null, sibling: { memoizedProps: props } } };
    return installFakePage({ query: { "#picker": elementWithFiber(root) } });
}

test("SelectBox: every option, with selected computed from the current value", () => {
    const page = selectBoxPage(() => {});
    installSelectBoxBridge();
    page.send(EVENTS.SELECTBOX_OPTIONS_REQUEST, { requestId: "s1", selector: "#picker" });

    assert.deepEqual(answer(page.posted, EVENTS.SELECTBOX_OPTIONS).options, [
        { value: "h", label: "Fields", header: true, disabled: false, selected: false },
        { value: "a", label: "Title", header: false, disabled: false, selected: false },
        { value: "b", label: "Status", header: false, disabled: true, selected: true },
        { value: "3", label: "Owner", header: false, disabled: false, selected: false },
    ]);
});

test("SelectBox: a selection goes through the component's own onChange", () => {
    const picked = [];
    const page = selectBoxPage((value, option) => picked.push([value, option.value]));
    installSelectBoxBridge();
    page.send(EVENTS.SELECTBOX_SELECT, { selector: "#picker", value: "3" });
    page.send(EVENTS.SELECTBOX_SELECT, { selector: "#picker", value: "missing" });
    assert.deepEqual(picked, [[3, 3]]);
    assert.deepEqual(page.posted, [], "a selection posts no answer");
});

test("SelectBox: an unknown selector answers null", () => {
    const page = installFakePage();
    installSelectBoxBridge();
    page.send(EVENTS.SELECTBOX_OPTIONS_REQUEST, { requestId: "s2", selector: "#nope" });
    assert.equal(answer(page.posted, EVENTS.SELECTBOX_OPTIONS).options, null);
});

// ---- location tree (Edit Locations dialog) ----

const TREE = '.edit-locations-dialog-paper ul[role="tree"]';

test("location tree: the whole tree flattened, collapsed nodes included", () => {
    const nodes = [{
        id: 1, value: " Lab ", children: [
            { id: 2, value: "Box A", num_columns: 9, num_rows: 9, children: [] },
            { id: 3, value: "Bag", organized: false, capacity: 100 },
            { id: 4, value: "Plate 1", plate_id: 77 },
            { id: 2, value: "duplicate id is dropped" },
        ],
    }];
    const page = installFakePage({ query: { [TREE]: elementWithFiber(fiberChain({}, { nodes, expandedItems: [1] })) } });
    installLocationTreeBridge();
    page.send(EVENTS.LOCATION_TREE_REQUEST, { requestId: "t1" });

    const payload = answer(page.posted, EVENTS.LOCATION_TREE);
    assert.equal(payload.requestId, "t1");
    assert.deepEqual(payload.expanded, ["1"]);
    assert.deepEqual(payload.nodes.map((n) => [n.id, n.parentId, n.name, n.isBox, n.isPlate, n.columns, n.capacity]), [
        ["1", null, "Lab", false, false, 0, 0],
        ["2", "1", "Box A", true, false, 9, 0],
        ["3", "1", "Bag", true, false, 0, 100],
        ["4", "1", "Plate 1", false, true, 0, 0],
    ]);
});

test("location tree: expanding calls the tree's own handler with string ids", () => {
    const calls = [];
    const props = { nodes: [], onExpandedItemsChange: (event, ids) => calls.push([event.type, ids]) };
    const page = installFakePage({ query: { [TREE]: elementWithFiber(fiberChain(props)) } });
    installLocationTreeBridge();
    page.send(EVENTS.LOCATION_TREE_EXPAND, { ids: [5, "6"] });
    assert.deepEqual(calls, [["cdd-tree-filter", ["5", "6"]]]);
});

test("location tree: no dialog answers null nodes", () => {
    const page = installFakePage();
    installLocationTreeBridge();
    page.send(EVENTS.LOCATION_TREE_REQUEST, { requestId: "t2" });
    assert.deepEqual(answer(page.posted, EVENTS.LOCATION_TREE), { requestId: "t2", nodes: null, expanded: [] });
});

// ---- batch link ids (run page) ----

test("batch link: the id from the field props is stamped on the link", () => {
    const attrs = new Map();
    const link = (fiber) => {
        const el = elementWithFiber(fiber);
        el.setAttribute = (name, value) => attrs.set(el, [name, value]);
        return el;
    };
    const withId = link(fiberChain({}, {}, { field: { definition: { data_type_name: "BatchLink" }, value: { batch_link_id: 42 } } }));
    const otherField = link(fiberChain({ field: { definition: { data_type_name: "Text" } } }));

    installFakePage({ query: { '.ProtocolAnnotator-table a:not([href]):not([data-cdd-batch-link-id])': [withId, otherField] } });
    globalThis.MutationObserver = class {
        observe() {}
    };
    globalThis.requestAnimationFrame = (cb) => cb();
    installBatchLinkIdBridge();

    assert.deepEqual(attrs.get(withId), ["data-cdd-batch-link-id", "42"]);
    assert.deepEqual(attrs.get(otherField), ["data-cdd-batch-link-id", ""], "stamped empty, so it is not walked again");
});
