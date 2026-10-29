import { test } from "node:test";
import assert from "node:assert/strict";

import { createBooleanFlag } from "../src/shared/boolean-flag.js";

function fakeStorage(initial = {}) {
    const data = { ...initial };
    const listeners = [];
    globalThis.chrome = {
        storage: {
            local: {
                async get(key) {
                    return key in data ? { [key]: data[key] } : {};
                },
                async set(obj) {
                    for (const [k, v] of Object.entries(obj)) {
                        const oldValue = data[k];
                        data[k] = v;
                        for (const cb of listeners) cb({ [k]: { oldValue, newValue: v } }, "local");
                    }
                },
            },
            onChanged: { addListener: (cb) => listeners.push(cb) },
        },
    };
    return data;
}

test("default-on flag: only an explicit false turns it off", async () => {
    fakeStorage();
    const flag = createBooleanFlag("k", true);
    assert.equal(await flag.init(), true);
    await flag.save(false);
    assert.equal(flag.isEnabled(), false);
    fakeStorage({ k: "junk" });
    assert.equal(await createBooleanFlag("k", true).get(), true);
});

test("default-off flag: only an explicit true turns it on", async () => {
    fakeStorage({ k: "yes" });
    const flag = createBooleanFlag("k", false);
    assert.equal(await flag.init(), false);
    await flag.save(true);
    assert.equal(flag.isEnabled(), true);
});

test("listeners hear every change, and one that throws does not stop the rest", async () => {
    fakeStorage();
    const flag = createBooleanFlag("k", false);
    const heard = [];
    flag.onChanged(() => {
        throw new Error("bad listener");
    });
    const off = flag.onChanged((v) => heard.push(v));
    await flag.init();
    await flag.save(true);
    off();
    await flag.save(false);
    assert.deepEqual(heard, [false, true]);
});

test("storage that throws reads as the default", async () => {
    globalThis.chrome = { storage: { local: { get: async () => { throw new Error("orphaned"); } } } };
    assert.equal(await createBooleanFlag("k", true).get(), true);
    assert.equal(await createBooleanFlag("k", false).get(), false);
});
