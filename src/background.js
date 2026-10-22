// background.js
//
// The toolbar icon has no popup any more — the settings live on their own page,
// which needs more room than a browser action's 800x600 ceiling allows. The
// background context opens that page from the two places that cannot open it
// themselves:
//
//   - the toolbar icon (action.onClicked fires only with no default_popup)
//   - the "CDD Plugin options" entry this extension adds to CDD's user dropdown
//     (content scripts have no access to runtime.openOptionsPage)
//
// openOptionsPage focuses an already-open settings tab rather than opening a
// second one.
//
// It also makes every request to the AI service for the Write-up tab (see "AI
// write-up" below): the API keys stay here, and the extension's optional host
// permissions apply to this context, not to CDD's page.
//
// This file ships to dist unbundled, so it cannot import shared/event-types.js
// or shared/ai-write-up-settings.js. The literals below are copies — keep in step.

const OPEN_OPTIONS_MESSAGE = "CDD_STOICH_TOOLS_OPEN_OPTIONS";

chrome.action.onClicked.addListener(() => {
    chrome.runtime.openOptionsPage();
});

// ---------------------------------------------------------------- AI write-up

const AI_MODELS_MESSAGE = "CDD_STOICH_TOOLS_AI_MODELS";
const AI_CHAT_MESSAGE = "CDD_STOICH_TOOLS_AI_CHAT";
const AI_TRANSCRIBE_MESSAGE = "CDD_STOICH_TOOLS_AI_TRANSCRIBE";
const AI_CANCEL_MESSAGE = "CDD_STOICH_TOOLS_AI_CANCEL";

const AI_SETTINGS_STORAGE_KEY = "cddAiWriteUp";
// CERIT-SC and OpenAI speak the OpenAI API; Anthropic its own Messages API,
// and has no speech-to-text.
const AI_PROVIDERS = {
    cerit: {
        label: "CERIT-SC",
        base: "https://llm.ai.e-infra.cz/v1",
        defaultModel: "mini",
        transcribeModel: "whisper-large-v3",
    },
    openai: {
        label: "OpenAI",
        base: "https://api.openai.com/v1",
        defaultModel: "gpt-5-mini",
        transcribeModel: "gpt-4o-transcribe",
    },
    anthropic: {
        label: "Anthropic (Claude)",
        base: "https://api.anthropic.com/v1",
        defaultModel: "claude-haiku-5-5",
        transcribeModel: null,
    },
};
const ANTHROPIC_VERSION = "2023-06-01";
// A whole polished entry fits with room to spare.
const ANTHROPIC_MAX_TOKENS = 16000;
// Settings → AI write-up → "Wait for an answer"; same bounds as the settings module.
const AI_TIMEOUT_DEFAULT_S = 300;
const AI_TIMEOUT_MIN_S = 15;
const AI_TIMEOUT_MAX_S = 1800;

// Request id → AbortController, so the panel's Cancel can stop a request.
const inFlight = new Map();

// The default wait went from 180 s to 300 s, so a 5-minute dictation has time
// to transcribe. Settings saved before then hold the old default; lift a
// stored 180 once, and leave alone a 180 someone sets after that.
const AI_TIMEOUT_MIGRATED_KEY = "cddAiWriteUpTimeout300";

async function migrateAiTimeout() {
    const stored = await chrome.storage.local.get([AI_SETTINGS_STORAGE_KEY, AI_TIMEOUT_MIGRATED_KEY]);
    if (stored[AI_TIMEOUT_MIGRATED_KEY]) return;
    const value = stored[AI_SETTINGS_STORAGE_KEY];
    const patch = { [AI_TIMEOUT_MIGRATED_KEY]: true };
    if (value && Number(value.timeoutS) === 180) patch[AI_SETTINGS_STORAGE_KEY] = { ...value, timeoutS: AI_TIMEOUT_DEFAULT_S };
    await chrome.storage.local.set(patch);
}

chrome.runtime.onInstalled.addListener(() => {
    void migrateAiTimeout();
});

function trimmed(value) {
    return typeof value === "string" ? value.trim() : "";
}

// Settings saved before 19.4.0 hold CERIT's key and model as `apiKey`/`model`.
async function aiSettings() {
    const stored = await chrome.storage.local.get(AI_SETTINGS_STORAGE_KEY);
    const value = stored?.[AI_SETTINGS_STORAGE_KEY] || {};
    const provider = AI_PROVIDERS[value.provider] ? value.provider : "cerit";
    const dictationProvider = AI_PROVIDERS[value.dictationProvider]?.transcribeModel ? value.dictationProvider : "cerit";
    return {
        provider,
        transcriber: AI_PROVIDERS[provider].transcribeModel ? provider : dictationProvider,
        keyOf: (id) => trimmed(value.apiKeys?.[id]) || (id === "cerit" ? trimmed(value.apiKey) : ""),
        modelOf: (id) => trimmed(value.models?.[id]) || (id === "cerit" ? trimmed(value.model) : "") || AI_PROVIDERS[id].defaultModel,
        timeoutMs: 1000 * Math.min(AI_TIMEOUT_MAX_S, Math.max(AI_TIMEOUT_MIN_S, Number(value.timeoutS) || AI_TIMEOUT_DEFAULT_S)),
    };
}

function authHeaders(providerId, apiKey) {
    if (providerId === "anthropic") {
        return {
            "x-api-key": apiKey,
            "anthropic-version": ANTHROPIC_VERSION,
            // An extension's request counts as a browser's for Anthropic.
            "anthropic-dangerous-direct-browser-access": "true",
        };
    }
    return { Authorization: `Bearer ${apiKey}` };
}

// One shape for every failure, so the panel and the options page word them
// the same way: no-key | permission | auth | timeout | cancelled | network | http.
// Every failure names the service in `provider`.
async function aiRequest(id, providerId, path, init, apiKeyOverride) {
    const settings = await aiSettings();
    const service = AI_PROVIDERS[providerId];
    const fail = (fields) => ({ ok: false, provider: service.label, ...fields });
    const apiKey = trimmed(apiKeyOverride) || settings.keyOf(providerId);
    if (!apiKey) return fail({ error: "no-key" });

    const granted = await chrome.permissions.contains({ origins: [`${new URL(service.base).origin}/*`] });
    if (!granted) return fail({ error: "permission" });

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, settings.timeoutMs);
    if (id) inFlight.set(id, controller);

    try {
        const response = await fetch(`${service.base}${path}`, {
            ...init,
            headers: { ...(init.headers || {}), ...authHeaders(providerId, apiKey) },
            signal: controller.signal,
        });
        const text = await response.text();
        if (response.status === 401 || response.status === 403) {
            return fail({ error: "auth", status: response.status });
        }
        if (!response.ok) {
            return fail({ error: "http", status: response.status, detail: text.slice(0, 300) });
        }
        try {
            return { ok: true, data: JSON.parse(text) };
        } catch {
            return fail({ error: "http", status: response.status, detail: "Not JSON" });
        }
    } catch (err) {
        if (controller.signal.aborted) return fail({ error: timedOut ? "timeout" : "cancelled" });
        return fail({ error: "network", detail: String(err?.message || err) });
    } finally {
        clearTimeout(timer);
        if (id) inFlight.delete(id);
    }
}

// Test connection: the models the key can see. The service and key are the
// ones in the settings page, which need not be saved yet.
async function listModels(providerId, apiKey) {
    const id = AI_PROVIDERS[providerId] ? providerId : (await aiSettings()).provider;
    const path = id === "anthropic" ? "/models?limit=1000" : "/models";
    const result = await aiRequest(null, id, path, { method: "GET" }, apiKey);
    if (!result.ok) return result;
    const models = (result.data?.data || []).map((m) => m?.id).filter(Boolean).sort();
    return { ok: true, provider: AI_PROVIDERS[id].label, models };
}

// CERIT and OpenAI. Every Write-up prompt asks for JSON, so the request says
// so too; a model that does not take response_format answers 400, and is
// asked again without. OpenAI's GPT-5 models take no temperature at all.
// Returns the answer's text, or a failure.
async function chatOpenAiCompatible(id, providerId, model, messages) {
    const ask = (json) => aiRequest(id, providerId, "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model,
            messages,
            ...(providerId === "cerit" ? { temperature: 0.2 } : {}),
            ...(json ? { response_format: { type: "json_object" } } : {}),
        }),
    });
    let result = await ask(true);
    if (!result.ok && result.error === "http" && result.status === 400) result = await ask(false);
    if (!result.ok) return result;
    const content = result.data?.choices?.[0]?.message?.content;
    return typeof content === "string" ? content : "";
}

// Anthropic's Messages API: the system prompt goes on its own, not as a
// message. Current Claude models take no temperature; the prompts' "answer in
// JSON" is enough, and the panel reads JSON out of fences and chatter.
async function chatAnthropic(id, model, messages) {
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const result = await aiRequest(id, "anthropic", "/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model,
            max_tokens: ANTHROPIC_MAX_TOKENS,
            ...(system ? { system } : {}),
            messages: messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content })),
        }),
    });
    if (!result.ok) return result;
    return (result.data?.content || []).filter((b) => b?.type === "text").map((b) => b.text).join("");
}

async function chat(id, messages) {
    const { provider, modelOf } = await aiSettings();
    const model = modelOf(provider);
    const content = provider === "anthropic"
        ? await chatAnthropic(id, model, messages)
        : await chatOpenAiCompatible(id, provider, model, messages);
    if (typeof content !== "string") return content;
    // Reasoning models can spend the whole answer thinking and return no text.
    return content.trim()
        ? { ok: true, content, model }
        : { ok: false, error: "empty", provider: AI_PROVIDERS[provider].label, model };
}

// The audio crosses the message channel as base64 — runtime messages are
// JSON, a Blob would arrive as {}. With Claude writing, the dictation service
// picked in the settings transcribes.
async function transcribe(id, audioBase64, mimeType, language) {
    const { transcriber } = await aiSettings();
    const bytes = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));
    const extension = /ogg/.test(mimeType) ? "ogg" : /mp4/.test(mimeType) ? "m4a" : "webm";
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: mimeType }), `dictation.${extension}`);
    form.append("model", AI_PROVIDERS[transcriber].transcribeModel);
    // "auto" (the default): no language, the model detects it.
    if (language && language !== "auto") form.append("language", language);
    const result = await aiRequest(id, transcriber, "/audio/transcriptions", { method: "POST", body: form });
    if (!result.ok) return result;
    return { ok: true, text: String(result.data?.text || "").trim() };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    switch (message?.type) {
        case OPEN_OPTIONS_MESSAGE:
            chrome.runtime.openOptionsPage();
            return false;
        case AI_MODELS_MESSAGE:
            listModels(message.provider, message.apiKey).then(sendResponse);
            return true;
        case AI_CHAT_MESSAGE:
            chat(message.id, message.messages).then(sendResponse);
            return true;
        case AI_TRANSCRIBE_MESSAGE:
            transcribe(message.id, message.audio, message.mimeType, message.language).then(sendResponse);
            return true;
        case AI_CANCEL_MESSAGE:
            inFlight.get(message.id)?.abort();
            return false;
        default:
            return false;
    }
});
