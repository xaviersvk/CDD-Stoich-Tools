import { test, mock } from "node:test";
import assert from "node:assert/strict";

import { installFakePage } from "./helpers/fake-page.js";
import { installEntryPayloadFallback } from "../src/inject/hooks/entry-payload-fallback.js";

// The hook keeps its own "already asked" set and patches history for good, so
// it is installed once and the tests walk one page session forward in time.

mock.timers.enable({ apis: ["setTimeout"] });

installFakePage({ path: "/vaults/6884/eln/entries/100" });
const requests = [];
globalThis.fetch = async (url, init) => {
    requests.push([url, init]);
    return new Response("{}");
};
globalThis.history = {
    pushState(_state, _title, url) {
        location.pathname = url;
        location.href = `https://cdd.test${url}`;
    },
    replaceState() {},
};

const seen = new Set();
installEntryPayloadFallback((entryId) => seen.has(entryId));

const navigate = (path) => {
    history.pushState(null, "", path);
    mock.timers.tick(0); // the hook re-reads the URL on the next turn
};

test("no request before the grace period ends", () => {
    mock.timers.tick(2000);
    assert.equal(requests.length, 0);
});

test("after it, the entry's payload is asked for once, as JSON", () => {
    mock.timers.tick(600);
    assert.deepEqual(requests.map(([url]) => url), ["/vaults/6884/eln/v2/entries/100"]);
    assert.equal(requests[0][1].headers.Accept, "application/json");
    assert.equal(requests[0][1].credentials, "include");
});

test("an entry whose payload arrived on its own costs no request", () => {
    requests.length = 0;
    navigate("/vaults/6884/eln/entries/200");
    seen.add("200");
    mock.timers.tick(3000);
    assert.equal(requests.length, 0);
});

test("leaving the entry during the wait cancels its request", () => {
    navigate("/vaults/6884/eln/entries/300");
    mock.timers.tick(1000);
    navigate("/vaults/6884/molecules/1");
    mock.timers.tick(3000);
    assert.equal(requests.length, 0);
});

test("coming back to an entry already asked for does not ask again", () => {
    navigate("/vaults/6884/eln/entries/100");
    mock.timers.tick(3000);
    assert.equal(requests.length, 0);
});

test("a failed request is swallowed", async () => {
    const debug = console.debug;
    const logged = [];
    console.debug = (...args) => logged.push(args);
    try {
        globalThis.fetch = async () => {
            throw new TypeError("offline");
        };
        navigate("/vaults/6884/eln/entries/400");
        mock.timers.tick(3000);
        await new Promise((resolve) => setImmediate(resolve));
        assert.match(String(logged[0]?.[0]), /entry payload request failed/);
    } finally {
        console.debug = debug;
    }
});
