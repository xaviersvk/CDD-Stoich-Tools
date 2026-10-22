// shared/ai-write-up-settings.js — the Write-up tab's settings: on/off, which
// AI service writes (CERIT-SC, OpenAI or Anthropic) and which one transcribes
// dictation, an API key and a chat model per service, the dictation language,
// how long to wait for an answer, and the house rules sent with every
// request. DOM-free; the options page uses the async pair, the content script
// the sync cache.
//
// The KEYS are used by background.js only, which makes every request. The
// content script's cache below leaves them out: the panel needs to know THAT
// a key is set, never what it is.

export const AI_SETTINGS_STORAGE_KEY = "cddAiWriteUp";

// The services. background.js repeats origin, default model and transcription
// model — keep in step. Anthropic has no speech-to-text, so with Claude
// writing, dictation goes to CERIT or OpenAI (`dictationProvider`).
export const AI_PROVIDERS = {
    cerit: {
        label: "CERIT-SC",
        origin: "https://llm.ai.e-infra.cz",
        // "mini" is CERIT's small fast model alias — the one their own docs call.
        defaultModel: "mini",
        transcribeModel: "whisper-large-v3",
        keyHint: "chat.ai.e-infra.cz → Settings → Account → API keys (MetaCentrum or MUNI account)",
    },
    openai: {
        label: "OpenAI",
        origin: "https://api.openai.com",
        defaultModel: "gpt-5-mini",
        transcribeModel: "gpt-4o-transcribe",
        keyHint: "platform.openai.com → API keys",
    },
    anthropic: {
        label: "Anthropic (Claude)",
        origin: "https://api.anthropic.com",
        defaultModel: "claude-haiku-5-5",
        transcribeModel: null,
        keyHint: "platform.claude.com → API keys",
    },
};
export const AI_PROVIDER_IDS = Object.keys(AI_PROVIDERS);
const TRANSCRIBING_PROVIDER_IDS = AI_PROVIDER_IDS.filter((id) => AI_PROVIDERS[id].transcribeModel);

// The service that transcribes dictation: the writing one when it can.
export function transcribeProviderOf(settings) {
    return AI_PROVIDERS[settings.provider].transcribeModel ? settings.provider : settings.dictationProvider;
}

// The host permissions these settings need — the writing service, and the
// transcribing one once it has a key: someone with only a Claude key is not
// asked for access to a dictation service they cannot use.
export function aiPermissionFor(settings) {
    const transcriber = transcribeProviderOf(settings);
    const ids = [settings.provider];
    if (transcriber !== settings.provider && settings.apiKeys?.[transcriber]) ids.push(transcriber);
    return { origins: ids.map((id) => `${AI_PROVIDERS[id].origin}/*`) };
}
export const AI_ALL_PERMISSIONS = { origins: AI_PROVIDER_IDS.map((id) => `${AI_PROVIDERS[id].origin}/*`) };

// What switching AI write-up on asks for. Firefox also asks for the data
// collection the manifest declares as optional — "websiteContent" (the ELN
// text and dictated audio that go to the service) and "authenticationInfo"
// (the API key, sent to that service); Chrome has no such key and rejects it.
export function aiPermissionRequest(permission) {
    const firefox = typeof navigator !== "undefined" && /firefox/i.test(navigator.userAgent);
    return firefox ? { ...permission, data_collection: ["websiteContent", "authenticationInfo"] } : permission;
}

// "auto": the transcription model detects the language itself — the default.
// Naming it helps when it would guess wrong: Slovak is easily taken for
// Czech, and a dictation that opens on "TLC showed…" for English.
export const AI_LANGUAGES = [
    ["auto", "Auto"],
    ["sk", "Slovenčina"],
    ["cs", "Čeština"],
    ["en", "English"],
];

// How long a request may take before it is given up, in seconds.
export const AI_TIMEOUT_DEFAULT_S = 300;
export const AI_TIMEOUT_MIN_S = 15;
export const AI_TIMEOUT_MAX_S = 1800;

// House rules: instructions added to every prompt, each switched on or off.
// These start the list, all off; people add their own.
export const AI_DEFAULT_RULES = [
    "Write room temperature as rt.",
    "Give temperatures in °C and times in h or min.",
    "Give yields to one decimal place, e.g. 78.4 %.",
    "Use the usual solvent abbreviations: EtOAc, DCM, MeOH, THF, DMF, MeCN.",
    "Write equivalents as equiv.",
    "Never use the first person.",
].map((text, i) => ({ id: `default-${i + 1}`, text, on: false }));

const DEFAULTS = {
    enabled: false,
    provider: "cerit",
    dictationProvider: "cerit",
    language: "auto",
    timeoutS: AI_TIMEOUT_DEFAULT_S,
    rules: AI_DEFAULT_RULES,
    // How a compound link reads: "label" like an @-mention, "Tenofovir
    // (36.8 mg, 128 µmol)"; "name" — the name only, the text keeps its amounts.
    mentionStyle: "label",
};

function normalizeTimeout(value) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return DEFAULTS.timeoutS;
    return Math.min(AI_TIMEOUT_MAX_S, Math.max(AI_TIMEOUT_MIN_S, n));
}

function normalizeRules(value) {
    if (!Array.isArray(value)) return DEFAULTS.rules.map((r) => ({ ...r }));
    return value
        .filter((r) => r && typeof r.text === "string" && r.text.trim())
        .map((r, i) => ({ id: String(r.id || `rule-${i + 1}`), text: r.text.trim(), on: r.on === true }));
}

// Settings saved before 19.4.0 hold one CERIT key and model as `apiKey` and
// `model`; they become CERIT's entries.
function perProvider(map, legacy, fallback) {
    const source = map && typeof map === "object" ? map : {};
    const out = {};
    for (const id of AI_PROVIDER_IDS) {
        const value = typeof source[id] === "string" ? source[id].trim() : "";
        out[id] = value || (id === "cerit" && typeof legacy === "string" ? legacy.trim() : "") || fallback(id);
    }
    return out;
}

export function normalize(raw) {
    const value = raw && typeof raw === "object" ? raw : {};
    return {
        enabled: value.enabled === true,
        provider: AI_PROVIDER_IDS.includes(value.provider) ? value.provider : DEFAULTS.provider,
        dictationProvider: TRANSCRIBING_PROVIDER_IDS.includes(value.dictationProvider)
            ? value.dictationProvider
            : DEFAULTS.dictationProvider,
        apiKeys: perProvider(value.apiKeys, value.apiKey, () => ""),
        models: perProvider(value.models, value.model, (id) => AI_PROVIDERS[id].defaultModel),
        language: AI_LANGUAGES.some(([code]) => code === value.language) ? value.language : DEFAULTS.language,
        timeoutS: value.timeoutS == null ? DEFAULTS.timeoutS : normalizeTimeout(value.timeoutS),
        rules: normalizeRules(value.rules),
        mentionStyle: value.mentionStyle === "name" ? "name" : "label",
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
        // normalize leaves the pre-19.4.0 `apiKey`/`model` out, so they go.
        await chrome.storage.local.set({ [AI_SETTINGS_STORAGE_KEY]: normalize({ ...current, ...patch }) });
    } catch {
        // Orphaned content script — nothing useful to do.
    }
}

// ---- content-script cache (no key) ----

let cached = publicView(normalize(null));
let listenerAttached = false;
const changeListeners = new Set();

function publicView(settings) {
    const transcriber = transcribeProviderOf(settings);
    return {
        enabled: settings.enabled,
        provider: AI_PROVIDERS[settings.provider].label,
        hasKey: !!settings.apiKeys[settings.provider],
        dictationProvider: AI_PROVIDERS[transcriber].label,
        hasDictationKey: !!settings.apiKeys[transcriber],
        language: settings.language,
        // Only the texts of the rules that are on — what the prompts add.
        rules: settings.rules.filter((r) => r.on).map((r) => r.text),
        mentionStyle: settings.mentionStyle,
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
// the panel and the options page. background.js names the service in
// `provider`; a check made in the panel names the one the view says.
export function aiErrorMessage(result) {
    const service = result?.provider || cached.provider;
    switch (result?.error) {
        case "no-key":
            return `Add your ${service} API key in Settings → AI write-up.`;
        case "permission":
            return `Turn AI write-up on in Settings and allow access to ${service}.`;
        case "auth":
            return `Check the ${service} API key in Settings → AI write-up — ${service} refused it.`;
        case "timeout":
            return `${service} did not answer in time — try again, or wait longer: Settings → AI write-up.`;
        case "network":
            return `${service} did not answer — try again.`;
        case "cancelled":
            return "Cancelled.";
        case "empty":
            return `${result?.model || "The model"} returned no text — pick another model in Settings → AI write-up.`;
        case "untranslated":
            return `${result?.model || "The model"} did not translate it — pick another model in Settings → AI write-up.`;
        default:
            return `${service} returned an error${result?.status ? ` (${result.status})` : ""} — try again or pick another model.`;
    }
}
