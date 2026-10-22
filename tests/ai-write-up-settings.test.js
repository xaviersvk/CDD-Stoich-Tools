import { test } from "node:test";
import assert from "node:assert/strict";

import {
    aiPermissionFor,
    normalize,
    transcribeProviderOf,
} from "../src/shared/ai-write-up-settings.js";

test("settings from before 19.4.0 keep their CERIT key and model", () => {
    const s = normalize({ enabled: true, apiKey: " sk-cerit ", model: "gpt-oss-120b" });
    assert.equal(s.provider, "cerit");
    assert.deepEqual(s.apiKeys, { cerit: "sk-cerit", openai: "", anthropic: "" });
    assert.equal(s.models.cerit, "gpt-oss-120b");
    assert.equal(s.models.openai, "gpt-5-mini");
    assert.equal(s.models.anthropic, "claude-haiku-5-5");
    assert.equal("apiKey" in s, false);
});

test("an unknown service falls back to CERIT", () => {
    assert.equal(normalize({ provider: "gemini" }).provider, "cerit");
    assert.equal(normalize({ dictationProvider: "anthropic" }).dictationProvider, "cerit");
});

test("Claude writes, the dictation service transcribes", () => {
    const s = normalize({ provider: "anthropic", dictationProvider: "openai", apiKeys: { openai: "sk-o" } });
    assert.equal(transcribeProviderOf(s), "openai");
    assert.deepEqual(aiPermissionFor(s).origins, ["https://api.anthropic.com/*", "https://api.openai.com/*"]);
});

test("with only a Claude key, no dictation host is asked for", () => {
    const s = normalize({ provider: "anthropic", apiKeys: { anthropic: "sk-a" } });
    assert.equal(transcribeProviderOf(s), "cerit");
    assert.deepEqual(aiPermissionFor(s).origins, ["https://api.anthropic.com/*"]);
});

test("a service that transcribes does both, and needs one permission", () => {
    const s = normalize({ provider: "openai", dictationProvider: "cerit" });
    assert.equal(transcribeProviderOf(s), "openai");
    assert.deepEqual(aiPermissionFor(s).origins, ["https://api.openai.com/*"]);
});
