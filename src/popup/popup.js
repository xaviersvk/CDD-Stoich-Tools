const ELN_TITLE_MODE_KEY = "cddPluginElnTitleMode";
const DEFAULT_ELN_TITLE_MODE = "id-title";

const select = document.getElementById("elnTitleMode");

async function loadSettings() {
    const result = await chrome.storage.local.get({
        [ELN_TITLE_MODE_KEY]: DEFAULT_ELN_TITLE_MODE,
    });

    select.value = result[ELN_TITLE_MODE_KEY];
}

async function saveSettings() {
    await chrome.storage.local.set({
        [ELN_TITLE_MODE_KEY]: select.value,
    });
}

select.addEventListener("change", saveSettings);

loadSettings();