import { test } from "node:test";
import assert from "node:assert/strict";

import { createTextParser } from "../src/inject/parsers/common.js";

test("JSON text reaches the processor with its URL", () => {
    const seen = [];
    const parse = createTextParser((data, url) => seen.push([data, url]));
    parse('{"a":1}', "/x.json");
    assert.deepEqual(seen, [[{ a: 1 }, "/x.json"]]);
});

test("non-JSON and empty text are ignored", () => {
    let calls = 0;
    const parse = createTextParser(() => calls++);
    parse("<html></html>", "/");
    parse("", "/");
    parse(undefined, "/");
    assert.equal(calls, 0);
});

test("a processor that throws is not mistaken for non-JSON", () => {
    const parse = createTextParser(() => {
        throw new Error("payload changed");
    });
    assert.throws(() => parse('{"a":1}', "/x.json"), /payload changed/);
});
