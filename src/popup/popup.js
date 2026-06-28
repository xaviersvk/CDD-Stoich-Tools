import {
    SAMPLE_PANEL_FIELDS,
    SAMPLE_PANEL_CUSTOM_FIELDS_KEY,
    getSamplePanelSettings,
    saveSamplePanelSettings,
    getDiscoveredCustomFields,
    pruneExpiredCustomFields,
} from "../shared/sample-panel-fields.js";
import {
    PREFIX_COLORS_STORAGE_KEY,
    getPrefixColorMap,
    savePrefixColorMap,
    sanitizePrefixColorMap,
    isValidHexColor,
} from "../shared/prefix-colors.js";

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

/* ---------------- Visualization: Prefix colours ---------------- */

const prefixListEl = document.getElementById("prefixColorList");
const prefixAddBtn = document.getElementById("prefixColorAdd");

const DEFAULT_NEW_COLOR = "#1976d2";

// Working copy the UI edits. We keep prefix+colour as an ORDERED array of rows
// (not a Record) only while editing, so two rows can briefly share a blank
// prefix without one clobbering the other. We serialise back to a Record —
// the storage shape — on every save. `id` is a stable key for DOM reconciliation.
let prefixRows = [];
let nextRowId = 1;

// Serialise the editable rows to the stored Record<prefix, hexColor> and persist.
// Empty prefixes are skipped; on duplicate prefixes the last row wins. The
// content script picks the change up via chrome.storage.onChanged.
function savePrefixRows() {
    const map = {};
    for (const row of prefixRows) {
        const prefix = row.prefix.trim();
        if (!prefix) continue; // a blank prefix is never stored
        // Keep prefixes even with no colour ("") so discovered ones persist and
        // stay listed; the content side renders "" as "no tint".
        map[prefix] = isValidHexColor(row.color) ? row.color : "";
    }
    savePrefixColorMap(map);
}

// Build one editable row: [ prefix text input | colour picker | delete ].
// Pure DOM construction (no innerHTML), matching the rest of the popup.
function createPrefixRow(row) {
    const wrapper = document.createElement("div");
    wrapper.className = "prefix-color-item";

    const prefixInput = document.createElement("input");
    prefixInput.type = "text";
    prefixInput.className = "prefix-color-prefix";
    prefixInput.placeholder = "IXX-DEMO";
    prefixInput.value = row.prefix;
    // Update the working copy + persist live; no re-render, so focus is kept.
    prefixInput.addEventListener("input", () => {
        row.prefix = prefixInput.value;
        savePrefixRows();
    });

    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.className = "prefix-color-swatch";
    // An auto-discovered prefix has no colour yet (row.color === ""). We show a
    // neutral swatch + "unset" styling and do NOT persist a colour until the
    // user actually picks one — assigning the colour is the user's job.
    const hasColor = isValidHexColor(row.color);
    colorInput.value = hasColor ? row.color : "#d1d5db";
    if (!hasColor) colorInput.classList.add("prefix-color-swatch--unset");
    colorInput.addEventListener("input", () => {
        row.color = colorInput.value;
        colorInput.classList.remove("prefix-color-swatch--unset");
        savePrefixRows();
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "prefix-color-delete";
    deleteBtn.setAttribute("aria-label", "Delete prefix");
    deleteBtn.textContent = "✕";
    deleteBtn.addEventListener("click", () => {
        prefixRows = prefixRows.filter((r) => r.id !== row.id);
        renderPrefixRows();
        savePrefixRows();
    });

    wrapper.append(prefixInput, colorInput, deleteBtn);
    return wrapper;
}

function renderPrefixRows() {
    prefixListEl.replaceChildren();
    for (const row of prefixRows) {
        prefixListEl.appendChild(createPrefixRow(row));
    }
}

async function initPrefixColorsUI() {
    const map = await getPrefixColorMap();
    prefixRows = Object.entries(map).map(([prefix, color]) => ({
        id: nextRowId++,
        prefix,
        color,
    }));
    renderPrefixRows();
}

prefixAddBtn.addEventListener("click", () => {
    prefixRows.push({ id: nextRowId++, prefix: "", color: DEFAULT_NEW_COLOR });
    renderPrefixRows();
    // No save yet: a blank prefix is not persisted until the user types one.
});

// While the popup is open the content script may DISCOVER new prefixes (the
// user hovered a new compound). Append those rows live, without rebuilding the
// list, so we never steal focus from a field the user is editing. We only ADD
// rows we don't have; we never overwrite a colour the user is currently editing.
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[PREFIX_COLORS_STORAGE_KEY]) return;

    const map = sanitizePrefixColorMap(changes[PREFIX_COLORS_STORAGE_KEY].newValue);
    const known = new Set(prefixRows.map((r) => r.prefix.trim()));

    for (const [prefix, color] of Object.entries(map)) {
        if (known.has(prefix)) continue;
        const row = { id: nextRowId++, prefix, color };
        prefixRows.push(row);
        prefixListEl.appendChild(createPrefixRow(row));
    }
});

loadElnTitleSetting();
initSamplePanelFieldsUI();
initPrefixColorsUI();