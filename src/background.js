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
// It also makes every request to the CERIT LLM service for the Write-up tab
// (see "AI write-up" below): the API key stays here, and the extension's
// optional host permission applies to this context, not to CDD's page.
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
const AI_BASE = "https://llm.ai.e-infra.cz/v1";
const AI_DEFAULT_MODEL = "mini";
const AI_TRANSCRIBE_MODEL = "whisper-large-v3";
const AI_TIMEOUT_MS = 180_000;

// Request id → AbortController, so the panel's Cancel can stop a request.
const inFlight = new Map();

async function aiSettings() {
    const stored = await chrome.storage.local.get(AI_SETTINGS_STORAGE_KEY);
    const value = stored?.[AI_SETTINGS_STORAGE_KEY] || {};
    return {
        apiKey: typeof value.apiKey === "string" ? value.apiKey.trim() : "",
        model: value.model || AI_DEFAULT_MODEL,
    };
}

// One shape for every failure, so the panel and the options page word them
// the same way: no-key | permission | auth | timeout | cancelled | network | http.
async function aiRequest(id, path, init, apiKeyOverride) {
    const { apiKey: storedKey } = await aiSettings();
    const apiKey = apiKeyOverride || storedKey;
    if (!apiKey) return { ok: false, error: "no-key" };

    const granted = await chrome.permissions.contains({ origins: [`${new URL(AI_BASE).origin}/*`] });
    if (!granted) return { ok: false, error: "permission" };

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, AI_TIMEOUT_MS);
    if (id) inFlight.set(id, controller);

    try {
        const response = await fetch(`${AI_BASE}${path}`, {
            ...init,
            headers: { ...(init.headers || {}), Authorization: `Bearer ${apiKey}` },
            signal: controller.signal,
        });
        const text = await response.text();
        if (response.status === 401 || response.status === 403) {
            return { ok: false, error: "auth", status: response.status };
        }
        if (!response.ok) {
            return { ok: false, error: "http", status: response.status, detail: text.slice(0, 300) };
        }
        try {
            return { ok: true, data: JSON.parse(text) };
        } catch {
            return { ok: false, error: "http", status: response.status, detail: "Not JSON" };
        }
    } catch (err) {
        if (controller.signal.aborted) return { ok: false, error: timedOut ? "timeout" : "cancelled" };
        return { ok: false, error: "network", detail: String(err?.message || err) };
    } finally {
        clearTimeout(timer);
        if (id) inFlight.delete(id);
    }
}

async function listModels(apiKey) {
    const result = await aiRequest(null, "/models", { method: "GET" }, apiKey);
    if (!result.ok) return result;
    const models = (result.data?.data || []).map((m) => m?.id).filter(Boolean).sort();
    return { ok: true, models };
}

async function chat(id, messages) {
    const { model } = await aiSettings();
    const result = await aiRequest(id, "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages, temperature: 0.2 }),
    });
    if (!result.ok) return result;
    const content = result.data?.choices?.[0]?.message?.content;
    // Reasoning models can spend the whole answer thinking and return no text.
    return typeof content === "string" && content.trim() ? { ok: true, content, model } : { ok: false, error: "empty", model };
}

// The audio crosses the message channel as base64 — runtime messages are
// JSON, a Blob would arrive as {}.
async function transcribe(id, audioBase64, mimeType, language) {
    const bytes = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));
    const extension = /ogg/.test(mimeType) ? "ogg" : /mp4/.test(mimeType) ? "m4a" : "webm";
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: mimeType }), `dictation.${extension}`);
    form.append("model", AI_TRANSCRIBE_MODEL);
    if (language) form.append("language", language);
    const result = await aiRequest(id, "/audio/transcriptions", { method: "POST", body: form });
    if (!result.ok) return result;
    return { ok: true, text: String(result.data?.text || "").trim() };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    switch (message?.type) {
        case OPEN_OPTIONS_MESSAGE:
            chrome.runtime.openOptionsPage();
            return false;
        case AI_MODELS_MESSAGE:
            listModels(message.apiKey).then(sendResponse);
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
