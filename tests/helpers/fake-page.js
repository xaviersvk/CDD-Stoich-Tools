// tests/helpers/fake-page.js — just enough of a browser page for the
// page-world hooks in src/inject/hooks to run under node --test.
//
// Each call replaces the globals, so a test starts on a fresh page. Hooks that
// patch window.fetch or XMLHttpRequest keep their patch for the rest of the
// file's process (node --test runs every file in its own process).

import { EVENT_SOURCE } from "../../src/shared/event-types.js";

// The bridges skip DOM nodes while walking props (`instanceof Element`).
globalThis.Element ??= class Element {};

// A DOM element as the bridges see it: React's fiber hangs off an expando
// whose name starts with `__reactFiber$`.
export function elementWithFiber(fiber, extra = {}) {
    const el = new globalThis.Element();
    el["__reactFiber$test"] = fiber;
    return Object.assign(el, extra);
}

// A fiber chain, innermost first: fiberChain({ a: 1 }, { b: 2 }) is a fiber
// with memoizedProps { a: 1 } whose `return` has memoizedProps { b: 2 }.
export function fiberChain(...propsList) {
    let parent = null;
    for (const props of [...propsList].reverse()) {
        parent = { memoizedProps: props, return: parent };
    }
    return parent;
}

export function installFakePage({ path = "/", query = {} } = {}) {
    const listeners = {};
    const posted = [];

    const win = {
        addEventListener(type, cb) {
            (listeners[type] ||= []).push(cb);
        },
        postMessage(data) {
            posted.push(data);
        },
    };

    globalThis.window = win;
    globalThis.location = { pathname: path, href: `https://cdd.test${path}` };
    // `query` maps a selector to an element or a list of them.
    globalThis.document = {
        documentElement: {},
        querySelector: (selector) => {
            const hit = query[selector];
            return (Array.isArray(hit) ? hit[0] : hit) ?? null;
        },
        querySelectorAll: (selector) => {
            const hit = query[selector];
            return hit == null ? [] : Array.isArray(hit) ? hit : [hit];
        },
    };

    // What the content script would post to the page.
    const send = (type, payload, source = win) => {
        for (const cb of listeners.message || []) {
            cb({ source, data: { source: EVENT_SOURCE, type, payload } });
        }
    };

    return { win, posted, send, listeners };
}

// Lets pending promise callbacks and detached async work run.
export const settle = () => new Promise((resolve) => setImmediate(resolve));
