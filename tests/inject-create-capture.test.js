import { test } from "node:test";
import assert from "node:assert/strict";

import { installFakePage, settle } from "./helpers/fake-page.js";
import { installCreateRequestCapture } from "../src/inject/hooks/create-request-capture.js";

class FakeXhr {
    constructor() {
        this.listeners = {};
        this.status = 0;
        this.responseText = "";
    }
    open() {}
    send() {}
    addEventListener(type, cb) {
        (this.listeners[type] ||= []).push(cb);
    }
    finish(status, text) {
        this.status = status;
        this.responseText = text;
        for (const cb of this.listeners.loadend || []) cb();
    }
}
globalThis.XMLHttpRequest = FakeXhr;

installFakePage();
const captures = [];
const responses = [];
let reply = () => new Response('{"id":7}', { status: 201 });
const calls = [];
window.fetch = async function (...args) {
    calls.push(args);
    return reply();
};
installCreateRequestCapture((c) => captures.push(c), (r) => responses.push(r));

const reset = () => {
    captures.length = 0;
    responses.length = 0;
    calls.length = 0;
};

test("a create POST is snapshotted, forwarded untouched, and its response tapped", async () => {
    reset();
    const body = new FormData();
    body.append("inventory_sample[name]", "S-1");
    body.append("file", new Blob(["x"]));

    const res = await window.fetch("/vaults/1/inventory_samples", { method: "post", body });

    assert.equal(calls.length, 1);
    assert.equal(calls[0][1].body, body, "CDD's own body object is sent");
    assert.equal(captures.length, 1);
    const [capture] = captures;
    assert.equal(capture.via, "fetch");
    assert.equal(capture.method, "POST");
    assert.equal(capture.body.kind, "formdata");
    assert.equal(capture.body.hadNonString, true);
    assert.deepEqual(capture.body.entries[0], ["inventory_sample[name]", "S-1"]);
    assert.match(capture.body.entries[1][1], /^\[.+\]$/);

    assert.deepEqual(await res.json(), { id: 7 }, "CDD can still read the body");
    await settle();
    assert.deepEqual(responses, [{ correlationId: capture.correlationId, ok: true, status: 201, bodyText: '{"id":7}' }]);
});

test("the create-from-debit PUT counts; other requests are not captured", async () => {
    reset();
    await window.fetch("/vaults/1/molecules/2/inventory_samples/3/create_sample_from_debit", { method: "PUT", body: "a=1" });
    await window.fetch("/vaults/1/inventory_samples");
    await window.fetch("/vaults/1/inventory_samples/3", { method: "PUT", body: "a=1" });
    await window.fetch("/vaults/1/specified_batches?x=1", { method: "POST", body: new URLSearchParams({ b: "2" }) });
    await settle();

    assert.deepEqual(captures.map((c) => [c.method, c.body.kind]), [["PUT", "string"], ["POST", "urlencoded"]]);
    assert.equal(captures[1].body.text, "b=2");
    assert.equal(calls.length, 4, "every request still goes out");
});

test("a network failure reaches CDD unchanged and is reported as one", async () => {
    reset();
    reply = () => Promise.reject(new TypeError("Failed to fetch"));
    await assert.rejects(window.fetch("/vaults/1/inventory_samples", { method: "POST", body: "x" }), /Failed to fetch/);
    await settle();
    assert.equal(responses.length, 1);
    assert.equal(responses[0].networkError, true);
    assert.equal(responses[0].ok, false);
    reply = () => new Response('{"id":7}', { status: 201 });
});

test("a capture callback that throws does not break the create", async () => {
    reset();
    installFakePage();
    window.fetch = async () => new Response("{}", { status: 201 });
    installCreateRequestCapture(() => {
        throw new Error("boom");
    });
    const res = await window.fetch("/vaults/1/inventory_samples", { method: "POST", body: "x" });
    assert.equal(res.status, 201);
});

test("xhr: a create is snapshotted and its loadend reported", () => {
    reset();
    const xhr = new XMLHttpRequest();
    xhr.open("post", "/vaults/1/inventory_samples");
    xhr.send("name=S-2");
    xhr.finish(422, '{"errors":["x"]}');

    const xhrCaptures = captures.filter((c) => c.via === "xhr");
    assert.equal(xhrCaptures.length, 1);
    assert.deepEqual(xhrCaptures[0].body, { kind: "string", text: "name=S-2" });
    assert.deepEqual(responses.at(-1), {
        correlationId: xhrCaptures[0].correlationId,
        ok: false,
        status: 422,
        bodyText: '{"errors":["x"]}',
    });
});
