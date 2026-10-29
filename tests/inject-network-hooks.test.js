import { test } from "node:test";
import assert from "node:assert/strict";

import { installFakePage, settle } from "./helpers/fake-page.js";
import { isSurelyNotJson } from "../src/inject/hooks/content-type.js";
import { installFetchHook } from "../src/inject/hooks/fetch-hook.js";
import { installXhrHook } from "../src/inject/hooks/xhr-hook.js";

test("bodies that cannot hold JSON are skipped; loose types are still read", () => {
    for (const type of ["text/html; charset=utf-8", "text/css", "text/javascript", "application/javascript",
        "text/vnd.turbo-stream.html", "image/png", "font/woff2", "audio/ogg", "video/mp4"]) {
        assert.equal(isSurelyNotJson(type), true, type);
    }
    for (const type of ["application/json", "text/plain", "", null, undefined, "application/octet-stream"]) {
        assert.equal(isSurelyNotJson(type), false, String(type));
    }
});

// ---- fetch ----

installFakePage();
const parsed = [];
let nextResponse;
window.fetch = async () => nextResponse();
installFetchHook((text, url) => parsed.push([text, url]));

test("fetch: CDD gets its own response object back, before the extension has read it", async () => {
    parsed.length = 0;
    const original = new Response('{"a":1}', { headers: { "content-type": "application/json" } });
    nextResponse = () => original;

    const res = await window.fetch("/vaults/1/eln/v2/entries/2");
    assert.equal(res, original);
    assert.deepEqual(parsed, [], "nothing parsed yet when CDD gets the response");
    assert.deepEqual(await res.json(), { a: 1 }, "CDD can still read the body");

    await settle();
    assert.deepEqual(parsed, [['{"a":1}', "/vaults/1/eln/v2/entries/2"]]);
});

test("fetch: the URL comes from a Request object when the response has none", async () => {
    parsed.length = 0;
    nextResponse = () => new Response("{}", { headers: { "content-type": "application/json" } });
    await window.fetch({ url: "/vaults/1/inventory_search" });
    await settle();
    assert.equal(parsed[0][1], "/vaults/1/inventory_search");
});

test("fetch: HTML is never read", async () => {
    parsed.length = 0;
    nextResponse = () => new Response("<html></html>", { headers: { "content-type": "text/html" } });
    await window.fetch("/vaults/1");
    await settle();
    assert.deepEqual(parsed, []);
});

test("fetch: a parser that throws is logged, and CDD's call is unaffected", async () => {
    const warnings = [];
    const warn = console.warn;
    console.warn = (...args) => warnings.push(args);
    try {
        installFakePage();
        window.fetch = async () => new Response("{}", { headers: { "content-type": "application/json" } });
        installFetchHook(() => {
            throw new Error("payload changed");
        });
        const res = await window.fetch("/x.json");
        assert.equal(res.status, 200);
        await settle();
        assert.match(String(warnings[0]?.[0]), /fetch parse failed/);
    } finally {
        console.warn = warn;
    }
});

// ---- XMLHttpRequest ----

class FakeXhr {
    constructor() {
        this.listeners = {};
        this.responseType = "";
        this.responseText = "";
        this.contentType = "application/json";
    }
    open() {}
    send() {}
    addEventListener(type, cb) {
        (this.listeners[type] ||= []).push(cb);
    }
    getResponseHeader() {
        return this.contentType;
    }
    finish(text) {
        this.responseText = text;
        for (const cb of this.listeners.load || []) cb.call(this);
    }
}
globalThis.XMLHttpRequest = FakeXhr;
const xhrParsed = [];
installXhrHook((text, url) => xhrParsed.push([text, url]));

test("xhr: a loaded text response is parsed with the URL it was opened with", () => {
    xhrParsed.length = 0;
    const xhr = new XMLHttpRequest();
    xhr.open("GET", "/vaults/1/inventory_search?q=x");
    xhr.send();
    xhr.finish('{"rows":[]}');
    assert.deepEqual(xhrParsed, [['{"rows":[]}', "/vaults/1/inventory_search?q=x"]]);
});

test("xhr: binary response types and HTML are left alone", () => {
    xhrParsed.length = 0;
    const blob = new XMLHttpRequest();
    blob.responseType = "blob";
    blob.open("GET", "/a");
    blob.send();
    blob.finish("{}");

    const html = new XMLHttpRequest();
    html.contentType = "text/html";
    html.open("GET", "/b");
    html.send();
    html.finish("{}");

    assert.deepEqual(xhrParsed, []);
});
