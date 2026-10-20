// shared/ai-write-up-settings.js — the Write-up tab's settings: on/off, the
// CERIT API key, the chat model and the dictation language. DOM-free; the
// options page uses the async pair, the content script the sync cache.
//
// The KEY is used by background.js only, which makes every request to CERIT.
// The content script's cache below leaves it out: the panel needs to know
// THAT a key is set, never what it is.

export const AI_SETTINGS_STORAGE_KEY = "cddAiWriteUp";

// CERIT-SC AI as a Service, OpenAI-compatible.
export const AI_ORIGIN = "https://llm.ai.e-infra.cz";
export const AI_PERMISSION = { origins: [`${AI_ORIGIN}/*`] };
// "mini" is CERIT's small fast model alias — the one their own docs call.
export const AI_DEFAULT_MODEL = "mini";
export const AI_TRANSCRIBE_MODEL = "whisper-large-v3";
export const AI_LANGUAGES = [
    ["sk", "Slovenčina"],
    ["cs", "Čeština"],
    ["en", "English"],
];

const DEFAULTS = { enabled: false, apiKey: "", model: AI_DEFAULT_MODEL, language: "sk" };

function normalize(raw) {
    const value = raw && typeof raw === "object" ? raw : {};
    return {
        enabled: value.enabled === true,
        apiKey: typeof value.apiKey === "string" ? value.apiKey.trim() : "",
        model: typeof value.model === "string" && value.model ? value.model : DEFAULTS.model,
        language: AI_LANGUAGES.some(([code]) => code === value.language) ? value.language : DEFAULTS.language,
    };
}

export async function getAiSettings() {
    try {
        const result = await chrome.storage.local.get(AI_SETTINGS_STORAGE_KEY);
        return normalize(result?.[AI_SETTINGS_STORAGE_KEY]);
    } catch {
        return normalize(null);
    }
}

export async function saveAiSettings(patch) {
    try {
        const current = await getAiSettings();
        await chrome.storage.local.set({ [AI_SETTINGS_STORAGE_KEY]: normalize({ ...current, ...patch }) });
    } catch {
        // Orphaned content script — nothing useful to do.
    }
}

// ---- content-script cache (no key) ----

let cached = { enabled: false, hasKey: false, language: DEFAULTS.language };
let listenerAttached = false;
const changeListeners = new Set();

function publicView(settings) {
    return {
        enabled: settings.enabled,
        hasKey: !!settings.apiKey,
        language: settings.language,
    };
}

function notify() {
    for (const cb of changeListeners) {
        try {
            cb(cached);
        } catch {
            /* a misbehaving listener must not break the others */
        }
    }
}

export function isAiWriteUpEnabled() {
    return cached.enabled;
}

export function getAiWriteUpView() {
    return cached;
}

export function onAiWriteUpChanged(cb) {
    changeListeners.add(cb);
    return () => changeListeners.delete(cb);
}

export async function initAiWriteUp() {
    if (!listenerAttached && chrome?.storage?.onChanged) {
        listenerAttached = true;
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== "local" || !changes[AI_SETTINGS_STORAGE_KEY]) return;
            cached = publicView(normalize(changes[AI_SETTINGS_STORAGE_KEY].newValue));
            notify();
        });
    }
    cached = publicView(await getAiSettings());
    notify();
    return cached;
}

// One wording for a failed request (background.js's `error` codes), shared by
// the panel and the options page.
export function aiErrorMessage(result) {
    switch (result?.error) {
        case "no-key":
            return "Add your API key in Settings → AI write-up.";
        case "permission":
            return "Turn AI write-up on in Settings and allow access to llm.ai.e-infra.cz.";
        case "auth":
            return "Check the API key in Settings → AI write-up — CERIT refused it.";
        case "timeout":
        case "network":
            return "CERIT did not answer — try again.";
        case "cancelled":
            return "Cancelled.";
        case "empty":
            return `${result?.model || "The model"} returned no text — pick another model in Settings → AI write-up.`;
        case "untranslated":
            return `${result?.model || "The model"} did not translate it — pick another model in Settings → AI write-up.`;
        default:
            return `CERIT returned an error${result?.status ? ` (${result.status})` : ""} — try again or pick another model.`;
    }
}
