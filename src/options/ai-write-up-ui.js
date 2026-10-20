// options/ai-write-up-ui.js
//
// The "AI write-up" settings card: on/off, the CERIT API key, the model.
//
// Turning it on asks for the optional host permission for llm.ai.e-infra.cz
// — the browser shows its own prompt, and a refusal leaves the box unticked.
// Turning it off gives the permission back, so an extension with the feature
// off holds no access to the service at all.
//
// Test connection lists the models the key can see; the model select is
// filled from that list (and keeps the saved choice when it is not in it).

import {
    AI_DEFAULT_MODEL,
    AI_PERMISSION,
    AI_TRANSCRIBE_MODEL,
    aiErrorMessage,
    getAiSettings,
    saveAiSettings,
} from "../shared/ai-write-up-settings.js";
import { AI_MODELS_MESSAGE } from "../shared/event-types.js";

const enabledBox = document.getElementById("aiWriteUpEnabled");
const keyInput = document.getElementById("aiApiKey");
const modelSelect = document.getElementById("aiModel");
const testButton = document.getElementById("aiTest");
const statusLine = document.getElementById("aiStatus");

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

async function testConnection() {
    testButton.disabled = true;
    setStatus("Connecting…");
    try {
        // The key in the box, even if it has not been saved yet.
        const result = await chrome.runtime.sendMessage({ type: AI_MODELS_MESSAGE, apiKey: keyInput.value.trim() });
        if (!result?.ok) {
            setStatus(aiErrorMessage(result));
            return;
        }
        const chatModels = result.models.filter((m) => !/whisper|embed|tts/i.test(m));
        fillModels(chatModels, modelSelect.value || AI_DEFAULT_MODEL);
        const dictation = result.models.includes(AI_TRANSCRIBE_MODEL)
            ? `dictation ready (${AI_TRANSCRIBE_MODEL})`
            : `no ${AI_TRANSCRIBE_MODEL} — dictation unavailable`;
        setStatus(`Connected: ${chatModels.length} models, ${dictation}.`);
    } finally {
        testButton.disabled = false;
    }
}

export async function initAiWriteUpUI() {
    if (!enabledBox) return;
    const settings = await getAiSettings();

    // A permission the user revoked in the browser's own settings turns the
    // feature off here too, rather than leaving a tab that cannot work.
    const granted = await chrome.permissions.contains(AI_PERMISSION).catch(() => false);
    enabledBox.checked = settings.enabled && granted;
    keyInput.value = settings.apiKey;
    fillModels([], settings.model);

    enabledBox.addEventListener("change", async () => {
        if (enabledBox.checked) {
            // Must run inside the click's user gesture — no await before it.
            const ok = await chrome.permissions.request(AI_PERMISSION).catch(() => false);
            if (!ok) {
                enabledBox.checked = false;
                setStatus("Access to llm.ai.e-infra.cz was not allowed, so the Write-up tab stays off.");
                return;
            }
            setStatus("");
        } else {
            await chrome.permissions.remove(AI_PERMISSION).catch(() => false);
        }
        await saveAiSettings({ enabled: enabledBox.checked });
    });

    keyInput.addEventListener("change", () => saveAiSettings({ apiKey: keyInput.value }));
    modelSelect.addEventListener("change", () => saveAiSettings({ model: modelSelect.value }));
    testButton.addEventListener("click", () => void testConnection());
}
