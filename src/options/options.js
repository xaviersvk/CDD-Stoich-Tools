// options/options.js
//
// The settings page. Four independent columns, each persisting to
// chrome.storage.local the moment the user changes something — there is no Save
// button, so every write must be safe on its own.
//
// Columns 1–3 were the old browser-action popup; column 4 (registration form
// order + preselect) is new. All four share the shared/ modules with the
// content script, which is why those modules never touch the DOM.

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
import {
    REG_FORM_NAMES_KEY,
    REG_FORM_LAST_USED_KEY,
    getRegistrationFormSettings,
    saveRegistrationFormOrder,
    saveRegistrationFormMode,
    saveRegistrationFormFixedName,
    clearRegistrationFormLastUsed,
    orderNames,
} from "../shared/registration-form.js";

const ELN_TITLE_MODE_KEY = "cddPluginElnTitleMode";
const DEFAULT_ELN_TITLE_MODE = "id-title";

/* ================================================================ 1 · Tab title */

const titleRadios = [...document.querySelectorAll('input[name="elnTitleMode"]')];

async function initElnTitleUI() {
    const stored = await chrome.storage.local.get({
        [ELN_TITLE_MODE_KEY]: DEFAULT_ELN_TITLE_MODE,
    });

    const mode = stored[ELN_TITLE_MODE_KEY] || DEFAULT_ELN_TITLE_MODE;
    const match = titleRadios.find((radio) => radio.value === mode) || titleRadios[0];
    if (match) match.checked = true;
}

for (const radio of titleRadios) {
    radio.addEventListener("change", () => {
        if (radio.checked) chrome.storage.local.set({ [ELN_TITLE_MODE_KEY]: radio.value });
    });
}

/* ============================================================ 2 · Panel fields */

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

    label.append(input, text);
    return label;
}

function renderCustomFieldsSection(customFields, visibleMap, onToggle) {
    customFieldListEl.replaceChildren();
    if (!customFields.length) return;

    const heading = document.createElement("div");
    heading.className = "field-subheading";
    heading.textContent = "From your vault";
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
        fieldListEl.appendChild(createFieldCheckbox(field, !!visibleMap[field.key], onToggle));
    }

    renderCustomFieldsSection(customFields, visibleMap, onToggle);
}

/* ========================================================= 3 · Prefix colours */

const prefixListEl = document.getElementById("prefixColorList");
const prefixAddBtn = document.getElementById("prefixColorAdd");

const DEFAULT_NEW_COLOR = "#1976d2";

// Working copy the UI edits. Prefix+colour stay an ORDERED array of rows (not a
// Record) while editing, so two rows can briefly share a blank prefix without
// one clobbering the other. We serialise back to a Record — the storage shape —
// on every save. `id` is a stable key for DOM reconciliation.
let prefixRows = [];
let nextRowId = 1;

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

function createPrefixRow(row) {
    const wrapper = document.createElement("div");
    wrapper.className = "prefix-color-item";

    const prefixInput = document.createElement("input");
    prefixInput.type = "text";
    prefixInput.className = "prefix-color-prefix";
    prefixInput.placeholder = "IXX-DEMO";
    prefixInput.value = row.prefix;
    prefixInput.setAttribute("aria-label", "Sample ID prefix");
    // Update the working copy + persist live; no re-render, so focus is kept.
    prefixInput.addEventListener("input", () => {
        row.prefix = prefixInput.value;
        savePrefixRows();
    });

    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.className = "prefix-color-swatch";
    colorInput.setAttribute("aria-label", "Colour for this prefix");
    // An auto-discovered prefix has no colour yet (row.color === ""). Show a
    // neutral swatch and do NOT persist a colour until the user picks one —
    // choosing the colour is the user's job.
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
    deleteBtn.setAttribute("aria-label", `Delete prefix ${row.prefix || "(blank)"}`);
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
    for (const row of prefixRows) prefixListEl.appendChild(createPrefixRow(row));
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

/* ====================================================== 4 · Registration form */

const regModeRadios = [...document.querySelectorAll('input[name="regFormMode"]')];
const regFixedSelect = document.getElementById("regFormFixedName");
const regFixedWrap = regFixedSelect.closest(".choice__child");
const regOrderList = document.getElementById("regFormOrderList");
const regOrderReset = document.getElementById("regFormOrderReset");
const regEmpty = document.getElementById("regFormEmpty");
const regMemory = document.getElementById("regFormMemory");
const regMemoryList = document.getElementById("regFormMemoryList");

// Names in the order the user wants them. This IS the setting: what we render
// is what we persist.
let regNames = [];
// The same names in CDD's own order (that is the order the content script
// discovered them in). Kept so "Restore CDD's order" restores rather than
// guesses at an alphabetical sort.
let regNamesAsCddSends = [];
let regFixedName = "";
let regMode = "remember";
let regLastUsed = {};

function persistOrder() {
    saveRegistrationFormOrder(regNames);
}

function moveName(from, to) {
    if (to < 0 || to >= regNames.length) return;
    const [name] = regNames.splice(from, 1);
    regNames.splice(to, 0, name);
    persistOrder();
    renderOrderList();
}

/* ---- drag & drop, with arrow buttons as the keyboard-reachable path ---- */

let dragIndex = null;

function clearDropMarks() {
    for (const el of regOrderList.children) delete el.dataset.drop;
}

function createOrderItem(name, index) {
    const li = document.createElement("li");
    li.className = "order__item";
    li.draggable = true;
    li.dataset.index = String(index);

    const grip = document.createElement("span");
    grip.className = "order__grip";
    grip.textContent = "⠿";
    grip.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.className = "order__name";
    label.textContent = name;

    const moves = document.createElement("span");
    moves.className = "order__moves";

    const up = document.createElement("button");
    up.type = "button";
    up.className = "order__move";
    up.textContent = "▲";
    up.disabled = index === 0;
    up.setAttribute("aria-label", `Move ${name} up`);
    up.addEventListener("click", () => moveName(index, index - 1));

    const down = document.createElement("button");
    down.type = "button";
    down.className = "order__move";
    down.textContent = "▼";
    down.disabled = index === regNames.length - 1;
    down.setAttribute("aria-label", `Move ${name} down`);
    down.addEventListener("click", () => moveName(index, index + 1));

    moves.append(up, down);

    li.addEventListener("dragstart", (event) => {
        dragIndex = index;
        li.dataset.dragging = "true";
        event.dataTransfer.effectAllowed = "move";
        // Firefox refuses to start a drag without payload.
        event.dataTransfer.setData("text/plain", name);
    });

    li.addEventListener("dragend", () => {
        dragIndex = null;
        delete li.dataset.dragging;
        clearDropMarks();
    });

    li.addEventListener("dragover", (event) => {
        if (dragIndex === null || dragIndex === index) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        clearDropMarks();
        li.dataset.drop = "true";
    });

    li.addEventListener("drop", (event) => {
        event.preventDefault();
        if (dragIndex === null || dragIndex === index) return;
        moveName(dragIndex, index);
        dragIndex = null;
    });

    li.append(grip, label, moves);
    return li;
}

function renderOrderList() {
    regOrderList.replaceChildren();
    regNames.forEach((name, i) => regOrderList.appendChild(createOrderItem(name, i)));

    const empty = regNames.length === 0;
    regEmpty.hidden = !empty;
    regOrderList.hidden = empty;
    regOrderReset.hidden = empty;
}

/* ---- the "always use this form" picker ---- */

function renderFixedSelect() {
    regFixedSelect.replaceChildren();

    if (!regNames.length) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "No forms seen yet";
        regFixedSelect.add(option);
        syncModeUI();
        return;
    }

    for (const name of regNames) {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        regFixedSelect.add(option);
    }

    // A pinned form the vault no longer offers would silently become whichever
    // option happens to sit first, so pin nothing rather than the wrong thing.
    regFixedSelect.value = regNames.includes(regFixedName) ? regFixedName : "";

    syncModeUI();
}

function syncModeUI() {
    regFixedWrap.dataset.disabled = String(regMode !== "fixed");
    regFixedSelect.disabled = regMode !== "fixed" || !regNames.length;
    regMemory.hidden = regMode !== "remember" || !Object.keys(regLastUsed).length;
}

/* ---- what we remember, per vault ---- */

function renderMemory() {
    regMemoryList.replaceChildren();

    for (const [vaultId, name] of Object.entries(regLastUsed)) {
        const row = document.createElement("div");
        row.className = "memory__row";

        const vault = document.createElement("span");
        vault.className = "memory__vault";
        vault.textContent = `Vault ${vaultId}`;

        const formName = document.createElement("span");
        formName.className = "memory__name";
        formName.textContent = name;

        const forget = document.createElement("button");
        forget.type = "button";
        forget.className = "prefix-color-delete";
        forget.textContent = "✕";
        forget.setAttribute("aria-label", `Forget ${name} for vault ${vaultId}`);
        forget.addEventListener("click", async () => {
            await clearRegistrationFormLastUsed(vaultId);
            delete regLastUsed[vaultId];
            renderMemory();
            syncModeUI();
        });

        row.append(vault, formName, forget);
        regMemoryList.appendChild(row);
    }

    syncModeUI();
}

for (const radio of regModeRadios) {
    radio.addEventListener("change", () => {
        if (!radio.checked) return;
        regMode = radio.value;
        saveRegistrationFormMode(regMode);
        syncModeUI();
    });
}

regFixedSelect.addEventListener("change", () => {
    regFixedName = regFixedSelect.value;
    saveRegistrationFormFixedName(regFixedName);
});

regOrderReset.addEventListener("click", () => {
    // An empty saved order means "don't reorder", so the picklist falls back to
    // whatever CDD sends — which is exactly the order we discovered the names in.
    regNames = [...regNamesAsCddSends];
    saveRegistrationFormOrder([]);
    renderOrderList();
    renderFixedSelect();
});

async function initRegistrationFormUI() {
    const settings = await getRegistrationFormSettings();

    regMode = settings.mode;
    regLastUsed = settings.lastUsed;
    regFixedName = settings.fixedName;
    regNamesAsCddSends = settings.names;
    regNames = orderNames(settings.names, settings.order);

    const match = regModeRadios.find((radio) => radio.value === regMode);
    if (match) match.checked = true;

    renderOrderList();
    renderFixedSelect();
    renderMemory();
}

/* ================================================================== live sync */

// The content script discovers things while this page is open: new custom
// fields, new prefixes, new registration forms, a freshly used form. Fold each
// in without stealing focus from whatever the user is editing.
chrome.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName !== "local") return;

    if (changes[SAMPLE_PANEL_CUSTOM_FIELDS_KEY]) {
        initSamplePanelFieldsUI();
    }

    if (changes[PREFIX_COLORS_STORAGE_KEY]) {
        // Append only the prefixes we don't have. Never overwrite a colour the
        // user may be editing right now.
        const map = sanitizePrefixColorMap(changes[PREFIX_COLORS_STORAGE_KEY].newValue);
        const known = new Set(prefixRows.map((r) => r.prefix.trim()));

        for (const [prefix, color] of Object.entries(map)) {
            if (known.has(prefix)) continue;
            const row = { id: nextRowId++, prefix, color };
            prefixRows.push(row);
            prefixListEl.appendChild(createPrefixRow(row));
        }
    }

    if (changes[REG_FORM_NAMES_KEY]) {
        const settings = await getRegistrationFormSettings();
        regNamesAsCddSends = settings.names;
        regNames = orderNames(settings.names, settings.order);
        renderOrderList();
        renderFixedSelect();
    }

    if (changes[REG_FORM_LAST_USED_KEY]) {
        const settings = await getRegistrationFormSettings();
        regLastUsed = settings.lastUsed;
        renderMemory();
    }
});

initElnTitleUI();
initSamplePanelFieldsUI();
initPrefixColorsUI();
initRegistrationFormUI();
