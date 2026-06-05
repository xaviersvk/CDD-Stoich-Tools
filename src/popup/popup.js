import {
    SAMPLE_PANEL_FIELDS,
    SAMPLE_PANEL_CUSTOM_FIELDS_KEY,
    getSamplePanelSettings,
    saveSamplePanelSettings,
    getDiscoveredCustomFields,
    pruneExpiredCustomFields,
} from "../shared/sample-panel-fields.js";

const ELN_TITLE_MODE_KEY = "cddPluginElnTitleMode";
const DEFAULT_ELN_TITLE_MODE = "id-title";

/* ---------------- ELN tab title ---------------- */

const select = document.getElementById("elnTitleMode");

async function loadElnTitleSetting() {
    const result = await chrome.storage.local.get({
        [ELN_TITLE_MODE_KEY]: DEFAULT_ELN_TITLE_MODE,
    });

    select.value = result[ELN_TITLE_MODE_KEY];
}

async function saveElnTitleSetting() {
    await chrome.storage.local.set({
        [ELN_TITLE_MODE_KEY]: select.value,
    });
}

select.addEventListener("change", saveElnTitleSetting);

/* ---------------- Sample panel fields ---------------- */

const fieldListEl = document.getElementById("samplePanelFields");
const customFieldListEl = document.getElementById("samplePanelCustomFields");

function createFieldCheckbox(field, checked, onToggle) {
    const label = document.createElement("label");
    label.className = "field-item";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = checked;
    input.addEventListener("change", () => onToggle(field.key, input.checked));

    const text = document.createElement("span");
    text.textContent = field.label;

    label.appendChild(input);
    label.appendChild(text);
    return label;
}

// Custom fields are vault-specific and only known once an ELN reaction has been
// opened (the content script discovers and persists them).
function renderCustomFieldsSection(customFields, visibleMap, onToggle) {
    customFieldListEl.replaceChildren();
    if (!customFields.length) return;

    const heading = document.createElement("div");
    heading.className = "field-subheading";
    heading.textContent = "Custom fields (from your vault)";
    customFieldListEl.appendChild(heading);

    for (const field of customFields) {
        customFieldListEl.appendChild(
            createFieldCheckbox(field, !!visibleMap[field.key], onToggle)
        );
    }
}

async function initSamplePanelFieldsUI() {
    const visibleMap = await getSamplePanelSettings();
    const storedCustomFields = await getDiscoveredCustomFields();

    // Display-only: hide options unseen past the TTL (enabled ones are kept).
    // The content script does the actual storage cleanup on its next run.
    const customFields = pruneExpiredCustomFields(
        storedCustomFields,
        visibleMap,
        Date.now()
    ).list;

    const onToggle = (key, checked) => {
        visibleMap[key] = checked;
        saveSamplePanelSettings(visibleMap);
    };

    fieldListEl.replaceChildren();
    for (const field of SAMPLE_PANEL_FIELDS) {
        fieldListEl.appendChild(
            createFieldCheckbox(field, !!visibleMap[field.key], onToggle)
        );
    }

    renderCustomFieldsSection(customFields, visibleMap, onToggle);
}

// If the content script discovers new custom fields while the popup is open,
// refresh the list so they appear without reopening the popup.
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes[SAMPLE_PANEL_CUSTOM_FIELDS_KEY]) {
        initSamplePanelFieldsUI();
    }
});

loadElnTitleSetting();
initSamplePanelFieldsUI();