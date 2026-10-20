// shared/ai-write-up-settings.js — the Write-up tab's settings: on/off, the
// CERIT API key, the chat model, the dictation language, how long to wait
// for an answer, and the house rules sent with every request. DOM-free; the
// options page uses the async pair, the content script the sync cache.
//
// The KEY is used by background.js only, which makes every request to CERIT.
// The content script's cache below leaves it out: the panel needs to know
// THAT a key is set, never what it is.

export const AI_SETTINGS_STORAGE_KEY = "cddAiWriteUp";

// CERIT-SC AI as a Service, OpenAI-compatible.
export const AI_ORIGIN = "https://llm.ai.e-infra.cz";
export const AI_PERMISSION = { origins: [`${AI_ORIGIN}/*`] };
// What switching AI write-up on asks for. Firefox also asks for the data
// collection the manifest declares as optional — "websiteContent" (the ELN
// text and dictated audio that go to CERIT) and "authenticationInfo" (the
// CERIT API key, sent to CERIT); Chrome has no such key and rejects it.
export function aiPermissionRequest() {
    const firefox = typeof navigator !== "undefined" && /firefox/i.test(navigator.userAgent);
    return firefox ? { ...AI_PERMISSION, data_collection: ["websiteContent", "authenticationInfo"] } : AI_PERMISSION;
}
// "mini" is CERIT's small fast model alias — the one their own docs call.
export const AI_DEFAULT_MODEL = "mini";
export const AI_TRANSCRIBE_MODEL = "whisper-large-v3";
// "auto": whisper detects the language itself — the default. Naming it
// helps when it would guess wrong: Slovak is easily taken for Czech, and a
// dictation that opens on "TLC showed…" for English.
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
    apiKey: "",
    model: AI_DEFAULT_MODEL,
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

function normalize(raw) {
    const value = raw && typeof raw === "object" ? raw : {};
    return {
        enabled: value.enabled === true,
        apiKey: typeof value.apiKey === "string" ? value.apiKey.trim() : "",
        model: typeof value.model === "string" && value.model ? value.model : DEFAULTS.model,
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
        await chrome.storage.local.set({ [AI_SETTINGS_STORAGE_KEY]: normalize({ ...current, ...patch }) });
    } catch {
        // Orphaned content script — nothing useful to do.
    }
}

// ---- content-script cache (no key) ----

let cached = { enabled: false, hasKey: false, language: DEFAULTS.language, rules: [] };
let listenerAttached = false;
const changeListeners = new Set();

function publicView(settings) {
    return {
        enabled: settings.enabled,
        hasKey: !!settings.apiKey,
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
            return "CERIT did not answer in time — try again, or wait longer: Settings → AI write-up.";
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
