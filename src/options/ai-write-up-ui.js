// options/ai-write-up-ui.js
//
// The "AI write-up" settings card: on/off, the AI service (CERIT-SC, OpenAI
// or Anthropic) with its API key and model, who transcribes dictation when
// Claude writes, how long to wait for an answer, and the house rules.
//
// Turning it on asks for the optional host permission of the service picked
// (and of the dictation service) — the browser shows its own prompt, and a
// refusal leaves the box unticked. Picking another service while it is on
// asks for that one and gives back the one no longer used; a refusal puts the
// pick back. Turning it off gives every permission back, so an extension with
// the feature off holds no access to any service at all.
//
// Each service keeps its own key and model, so switching back and forth loses
// nothing. Test connection lists the models the key in the box can see; the
// model select is filled from that list (and keeps the saved choice when it
// is not in it).
//
// House rules: one row per rule — tick to send it, edit the text in place,
// ✕ to remove. Every change saves at once, like the rest of the page.

import {
    AI_ALL_PERMISSIONS,
    AI_PROVIDERS,
    AI_TIMEOUT_DEFAULT_S,
    AI_TIMEOUT_MAX_S,
    AI_TIMEOUT_MIN_S,
    aiErrorMessage,
    aiPermissionFor,
    aiPermissionRequest,
    getAiSettings,
    saveAiSettings,
    transcribeProviderOf,
} from "../shared/ai-write-up-settings.js";
import { AI_MODELS_MESSAGE } from "../shared/event-types.js";
import { deleteButton } from "./delete-button.js";

const enabledBox = /** @type {HTMLInputElement} */ (document.getElementById("aiWriteUpEnabled"));
const providerSelect = /** @type {HTMLSelectElement} */ (document.getElementById("aiProvider"));
const keyInput = /** @type {HTMLInputElement} */ (document.getElementById("aiApiKey"));
const keyHint = document.getElementById("aiKeyHint");
const dictationRow = document.getElementById("aiDictationRow");
const dictationSelect = /** @type {HTMLSelectElement} */ (document.getElementById("aiDictationProvider"));
const dictationKeyRow = document.getElementById("aiDictationKeyRow");
const dictationKeyInput = /** @type {HTMLInputElement} */ (document.getElementById("aiDictationKey"));
const dictationKeyHint = document.getElementById("aiDictationKeyHint");
const modelSelect = /** @type {HTMLSelectElement} */ (document.getElementById("aiModel"));
const testButton = /** @type {HTMLButtonElement} */ (document.getElementById("aiTest"));
const statusLine = document.getElementById("aiStatus");
const timeoutInput = /** @type {HTMLInputElement} */ (document.getElementById("aiTimeout"));
const mentionStyleSelect = /** @type {HTMLSelectElement} */ (document.getElementById("aiMentionStyle"));
const rulesList = document.getElementById("aiRules");
const ruleNewInput = /** @type {HTMLInputElement} */ (document.getElementById("aiRuleNew"));
const ruleAddButton = document.getElementById("aiRuleAdd");

// Image, audio, embedding and moderation models are no use for writing.
const NOT_CHAT_RE = /whisper|transcribe|embed|tts|audio|realtime|dall-e|image|moderation|sora|search|davinci|babbage/i;

let rules = [];
// What the card shows: provider, dictationProvider, apiKeys, models.
let current = null;

function saveRules() {
    void saveAiSettings({ rules });
}

function ruleRow(rule) {
    const row = document.createElement("div");
    row.className = "field-item prefix-color-item";

    const on = document.createElement("input");
    on.type = "checkbox";
    on.checked = rule.on;
    on.title = "Send this rule with every request";
    on.addEventListener("change", () => {
        rule.on = on.checked;
        saveRules();
    });

    const text = document.createElement("input");
    text.type = "text";
    text.className = "text-input";
    text.value = rule.text;
    text.addEventListener("change", () => {
        const value = text.value.trim();
        if (!value) {
            text.value = rule.text;   // an emptied rule is undone, not saved blank
            return;
        }
        rule.text = value;
        saveRules();
    });

    const remove = deleteButton({
        className: "prefix-color-delete",
        label: `Delete the rule "${rule.text}"`,
        onClick: () => {
            rules = rules.filter((r) => r !== rule);
            renderRules();
            saveRules();
        },
    });

    row.append(on, text, remove);
    return row;
}

function renderRules() {
    rulesList.replaceChildren(...rules.map(ruleRow));
}

function addRule() {
    const text = ruleNewInput.value.trim();
    if (!text) return;
    rules = [...rules, { id: `rule-${Date.now()}`, text, on: true }];
    ruleNewInput.value = "";
    renderRules();
    saveRules();
}

function setStatus(text) {
    statusLine.textContent = text || "";
    statusLine.hidden = !text;
}

function fillModels(models, selected) {
    const names = [...new Set([selected, ...models].filter(Boolean))];
    modelSelect.textContent = "";
    for (const name of names) {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        modelSelect.appendChild(option);
    }
    modelSelect.value = selected;
}

// The rows that follow the service picked: its key and model, and — for
// Claude — the dictation service and its key.
function renderProvider() {
    const provider = current.provider;
    providerSelect.value = provider;
    keyInput.value = current.apiKeys[provider];
    keyHint.textContent = `get one at ${AI_PROVIDERS[provider].keyHint}.`;
    fillModels([], current.models[provider]);

    const separate = !AI_PROVIDERS[provider].transcribeModel;
    const transcriber = transcribeProviderOf(current);
    dictationRow.hidden = !separate;
    dictationKeyRow.hidden = !separate;
    dictationSelect.value = current.dictationProvider;
    dictationKeyInput.value = current.apiKeys[transcriber];
    dictationKeyHint.textContent = `${AI_PROVIDERS[transcriber].label}, ${AI_PROVIDERS[transcriber].keyHint}.`;
}

function saveKey(provider, value) {
    current.apiKeys = { ...current.apiKeys, [provider]: value.trim() };
    void saveAiSettings({ apiKeys: current.apiKeys });
}

// The dictation key with Claude writing: a key added asks for its service's
// host, a key emptied gives it back. A refusal keeps the key, and says so.
async function saveDictationKey(value) {
    const provider = transcribeProviderOf(current);
    const next = { ...current, apiKeys: { ...current.apiKeys, [provider]: value.trim() } };
    if (!(await regrant(next))) {
        setStatus(`Access to ${AI_PROVIDERS[provider].label} was not allowed, so dictation will not work.`);
    }
    saveKey(provider, value);
}

// A change of service while the feature is on: ask for what the new pick
// needs (inside the change's user gesture — no await before the request),
// then give back what it no longer does. False when the browser refused.
async function regrant(next) {
    if (!enabledBox.checked) return true;
    const needed = aiPermissionFor(next);
    const ok = await chrome.permissions.request(aiPermissionRequest(needed)).catch(() => false);
    if (!ok) return false;
    const unused = AI_ALL_PERMISSIONS.origins.filter((o) => !needed.origins.includes(o));
    if (unused.length) await chrome.permissions.remove({ origins: unused }).catch(() => false);
    return true;
}

async function changeProvider(field, value) {
    const next = { ...current, [field]: value };
    if (!(await regrant(next))) {
        renderProvider();
        setStatus(`Access to ${AI_PROVIDERS[value].label} was not allowed, so the service stays as it was.`);
        return;
    }
    current = next;
    renderProvider();
    setStatus("");
    await saveAiSettings({ [field]: value });
}

async function testConnection() {
    testButton.disabled = true;
    setStatus("Connecting…");
    const provider = current.provider;
    try {
        // The service and key in the card, even if the key has not been saved yet.
        const result = await chrome.runtime.sendMessage({
            type: AI_MODELS_MESSAGE,
            provider,
            apiKey: keyInput.value.trim(),
        });
        if (!result?.ok) {
            setStatus(aiErrorMessage(result));
            return;
        }
        const chatModels = result.models.filter((m) => !NOT_CHAT_RE.test(m));
        fillModels(chatModels, modelSelect.value || AI_PROVIDERS[provider].defaultModel);
        const transcribeModel = AI_PROVIDERS[provider].transcribeModel;
        let dictation;
        if (!transcribeModel) {
            const transcriber = AI_PROVIDERS[transcribeProviderOf(current)].label;
            dictation = dictationKeyInput.value.trim()
                ? `dictation by ${transcriber}`
                : `add a ${transcriber} key for dictation`;
        } else {
            dictation = result.models.includes(transcribeModel)
                ? `dictation ready (${transcribeModel})`
                : `no ${transcribeModel} — dictation unavailable`;
        }
        setStatus(`Connected to ${result.provider}: ${chatModels.length} models, ${dictation}.`);
    } finally {
        testButton.disabled = false;
    }
}

export async function initAiWriteUpUI() {
    if (!enabledBox) return;
    const settings = await getAiSettings();
    current = {
        provider: settings.provider,
        dictationProvider: settings.dictationProvider,
        apiKeys: settings.apiKeys,
        models: settings.models,
    };

    // A permission the user revoked in the browser's own settings turns the
    // feature off here too, rather than leaving a tab that cannot work.
    const granted = await chrome.permissions.contains(aiPermissionFor(current)).catch(() => false);
    enabledBox.checked = settings.enabled && granted;
    renderProvider();

    mentionStyleSelect.value = settings.mentionStyle;
    mentionStyleSelect.addEventListener("change", () => void saveAiSettings({ mentionStyle: mentionStyleSelect.value }));

    timeoutInput.value = String(settings.timeoutS);
    timeoutInput.addEventListener("change", () => {
        const n = Math.round(Number(timeoutInput.value));
        const value = Number.isFinite(n) && n > 0
            ? Math.min(AI_TIMEOUT_MAX_S, Math.max(AI_TIMEOUT_MIN_S, n))
            : AI_TIMEOUT_DEFAULT_S;
        timeoutInput.value = String(value);
        void saveAiSettings({ timeoutS: value });
    });

    rules = settings.rules.map((r) => ({ ...r }));
    renderRules();
    ruleAddButton.addEventListener("click", addRule);
    ruleNewInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") addRule();
    });

    enabledBox.addEventListener("change", async () => {
        if (enabledBox.checked) {
            // Must run inside the click's user gesture — no await before it.
            const ok = await chrome.permissions.request(aiPermissionRequest(aiPermissionFor(current))).catch(() => false);
            if (!ok) {
                enabledBox.checked = false;
                setStatus(`Access to ${AI_PROVIDERS[current.provider].label} was not allowed, so the Write-up tab stays off.`);
                return;
            }
            setStatus("");
        } else {
            await chrome.permissions.remove(aiPermissionRequest(AI_ALL_PERMISSIONS)).catch(() => false);
        }
        await saveAiSettings({ enabled: enabledBox.checked });
    });

    providerSelect.addEventListener("change", () => void changeProvider("provider", providerSelect.value));
    dictationSelect.addEventListener("change", () => void changeProvider("dictationProvider", dictationSelect.value));
    keyInput.addEventListener("change", () => saveKey(current.provider, keyInput.value));
    dictationKeyInput.addEventListener("change", () => void saveDictationKey(dictationKeyInput.value));
    modelSelect.addEventListener("change", () => {
        current.models = { ...current.models, [current.provider]: modelSelect.value };
        void saveAiSettings({ models: current.models });
    });
    testButton.addEventListener("click", () => void testConnection());
}
