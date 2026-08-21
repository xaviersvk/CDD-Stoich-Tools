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
    DENSITY_MEMORY_STORAGE_KEY,
    loadDensityMemory,
    saveDensityMemory,
} from "../shared/density-memory.js";
import {
    getAutoFillEnabled,
    saveAutoFillEnabled,
} from "../shared/auto-fill-flag.js";
import {
    loadPurityThresholds,
    savePurityFillThreshold,
    savePurityWarnThreshold,
} from "../shared/purity-threshold.js";
import {
    loadHplcSettings,
    saveHplcAliquotVolumeUl,
    saveHplcVialVolumeMl,
    saveHplcTargetAmountNmol,
    saveHplcBlockEnabled,
    saveHplcVialLadder,
} from "../shared/hplc-injection.js";
import { formatVialLadder } from "../shared/hplc-optimizer.js";
import {
    getShowProducts,
    saveShowProducts,
} from "../shared/show-products-flag.js";
import {
    getPanelSources,
    savePanelSources,
} from "../shared/panel-sources-flag.js";
import {
    HEAT_MAP_DISCOVERED_KEY,
    SYNONYMS_LABEL,
    getHeatMapFields,
    saveHeatMapFields,
    getDiscoveredHeatMapFields,
    normalizeFieldLabel,
} from "../shared/heat-map-fields.js";
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
import {
    getElnIdCarrySettings,
    saveElnIdCarryEnabled,
    saveElnIdCarryFieldLabel,
    saveElnIdFormat,
} from "../shared/eln-id-carry.js";
import {
    loadRegistrationDefaults,
    saveRegistrationDefaults,
} from "../shared/registration-defaults.js";

const ELN_TITLE_MODE_KEY = "cddPluginElnTitleMode";
const DEFAULT_ELN_TITLE_MODE = "id-title";

/* ================================================================ masthead */

// Read from the manifest rather than hardcoded, so the version next to the
// "What's new" link can never disagree with the build the user is running.
function showVersion() {
    const el = document.getElementById("version");
    if (el) el.textContent = `v${chrome.runtime.getManifest().version}`;
}

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

// Ticked fields first, in the order the registry lists them — that order is the
// reading order of the panel itself, so the top of this list mirrors the card
// the user is looking at. Everything still off is not a layout, it is a menu to
// find something in, so it reads alphabetically.
//
// The order is settled when the list is BUILT, never on a click: reshuffling
// under the cursor would move the next checkbox out from under the hand that is
// ticking them.
function orderFieldsForDisplay(fields, visibleMap) {
    const selected = [];
    const unselected = [];

    for (const field of fields) {
        (visibleMap[field.key] ? selected : unselected).push(field);
    }

    unselected.sort((a, b) => a.label.localeCompare(b.label));

    return [...selected, ...unselected];
}

function renderCustomFieldsSection(customFields, visibleMap, onToggle) {
    customFieldListEl.replaceChildren();
    if (!customFields.length) return;

    const heading = document.createElement("div");
    heading.className = "field-subheading";
    heading.textContent = "From your vault";
    customFieldListEl.appendChild(heading);

    for (const field of orderFieldsForDisplay(customFields, visibleMap)) {
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
    for (const field of orderFieldsForDisplay(SAMPLE_PANEL_FIELDS, visibleMap)) {
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

/* ============================================ 8 · Registration defaults */

// Working copy the UI edits, mirroring the prefix-colour list above: an
// ORDERED array of rows rather than the Record we persist, so two rows can
// briefly share a blank field name without one clobbering the other.
let regDefaultVaults = [];
let nextRegDefaultId = 1;

const regDefaultsListEl = document.getElementById("registrationDefaultsList");
const regDefaultsAddVaultBtn = document.getElementById("registrationDefaultsAddVault");

function saveRegDefaults() {
    const record = {};
    for (const vault of regDefaultVaults) {
        const id = vault.vaultId.trim();
        if (!/^\d+$/.test(id)) continue; // a vault being typed is not a vault
        record[id] = {
            label: vault.label,
            fields: vault.fields.map((f) => ({ label: f.label, value: f.value })),
        };
    }
    saveRegistrationDefaults(record);
}

function createRegDefaultFieldRow(vault, field) {
    const wrapper = document.createElement("div");
    wrapper.className = "prefix-color-item";

    const labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.className = "text-input";
    labelInput.placeholder = "Origin";
    labelInput.value = field.label;
    labelInput.setAttribute("aria-label", "Registration form field name");
    // Persist live without re-rendering, so the caret stays put.
    labelInput.addEventListener("input", () => {
        field.label = labelInput.value;
        saveRegDefaults();
    });

    const valueInput = document.createElement("input");
    valueInput.type = "text";
    valueInput.className = "text-input";
    valueInput.placeholder = "Synthesized";
    valueInput.value = field.value;
    valueInput.setAttribute("aria-label", "Value to fill in");
    valueInput.addEventListener("input", () => {
        field.value = valueInput.value;
        saveRegDefaults();
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "prefix-color-delete";
    deleteBtn.textContent = "✕";
    deleteBtn.setAttribute("aria-label", `Delete default for ${field.label || "(blank)"}`);
    deleteBtn.addEventListener("click", () => {
        vault.fields = vault.fields.filter((f) => f.id !== field.id);
        renderRegDefaults();
        saveRegDefaults();
    });

    wrapper.append(labelInput, valueInput, deleteBtn);
    return wrapper;
}

function createRegDefaultVault(vault) {
    const box = document.createElement("div");
    box.className = "reg-defaults-vault";

    const head = document.createElement("div");
    head.className = "prefix-color-item";

    const vaultInput = document.createElement("input");
    vaultInput.type = "text";
    vaultInput.className = "text-input";
    vaultInput.placeholder = "8158";
    vaultInput.value = vault.vaultId;
    vaultInput.setAttribute("aria-label", "Vault number");
    vaultInput.addEventListener("input", () => {
        vault.vaultId = vaultInput.value;
        saveRegDefaults();
    });

    const labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.className = "text-input";
    labelInput.placeholder = "a name for this vault (optional)";
    labelInput.value = vault.label;
    labelInput.setAttribute("aria-label", "Your name for this vault");
    labelInput.addEventListener("input", () => {
        vault.label = labelInput.value;
        saveRegDefaults();
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "prefix-color-delete";
    deleteBtn.textContent = "✕";
    deleteBtn.setAttribute("aria-label", `Delete vault ${vault.vaultId || "(blank)"}`);
    deleteBtn.addEventListener("click", () => {
        regDefaultVaults = regDefaultVaults.filter((v) => v.id !== vault.id);
        renderRegDefaults();
        saveRegDefaults();
    });

    head.append(vaultInput, labelInput, deleteBtn);

    const fields = document.createElement("div");
    fields.className = "stack";
    for (const field of vault.fields) {
        fields.appendChild(createRegDefaultFieldRow(vault, field));
    }

    const addFieldBtn = document.createElement("button");
    addFieldBtn.type = "button";
    addFieldBtn.className = "btn btn--quiet";
    addFieldBtn.textContent = "Add a field";
    addFieldBtn.addEventListener("click", () => {
        vault.fields.push({ id: nextRegDefaultId++, label: "", value: "" });
        renderRegDefaults();
        // No save yet: a half-typed row is not a rule.
    });

    box.append(head, fields, addFieldBtn);
    return box;
}

function renderRegDefaults() {
    regDefaultsListEl.replaceChildren();
    for (const vault of regDefaultVaults) {
        regDefaultsListEl.appendChild(createRegDefaultVault(vault));
    }
}

regDefaultsAddVaultBtn.addEventListener("click", () => {
    regDefaultVaults.push({
        id: nextRegDefaultId++,
        vaultId: "",
        label: "",
        fields: [{ id: nextRegDefaultId++, label: "", value: "" }],
    });
    renderRegDefaults();
});

async function initRegistrationDefaultsUI() {
    const record = await loadRegistrationDefaults();
    regDefaultVaults = Object.entries(record).map(([vaultId, entry]) => ({
        id: nextRegDefaultId++,
        vaultId,
        label: entry.label || "",
        fields: (entry.fields || []).map((f) => ({
            id: nextRegDefaultId++,
            label: f.label,
            value: f.value,
        })),
    }));
    renderRegDefaults();
}

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

/* --------------------------------------------- 4b · ELN ID into the new entity */

const elnIdCarryCheckbox = document.getElementById("elnIdCarryEnabled");
const elnIdCarryFieldInput = document.getElementById("elnIdCarryFieldLabel");

elnIdCarryCheckbox.addEventListener("change", () => {
    saveElnIdCarryEnabled(elnIdCarryCheckbox.checked);
});

// Saved as you type, like everything else here. The blank-means-default repair
// waits for blur: rewriting the box mid-word would fight the user.
elnIdCarryFieldInput.addEventListener("input", () => {
    saveElnIdCarryFieldLabel(elnIdCarryFieldInput.value);
});

elnIdCarryFieldInput.addEventListener("blur", async () => {
    if (elnIdCarryFieldInput.value.trim()) return;
    elnIdCarryFieldInput.value = await saveElnIdCarryFieldLabel("");
});

const elnIdFormatRadios = [...document.querySelectorAll('input[name="elnIdFormat"]')];

for (const radio of elnIdFormatRadios) {
    radio.addEventListener("change", () => {
        if (radio.checked) saveElnIdFormat(radio.value);
    });
}

async function initElnIdCarryUI() {
    const settings = await getElnIdCarrySettings();

    elnIdCarryCheckbox.checked = settings.enabled;
    elnIdCarryFieldInput.value = settings.fieldLabel;

    const format = elnIdFormatRadios.find((radio) => radio.value === settings.format);
    if (format) format.checked = true;
}

/* ==================================================== 5 · Remembered densities */

const densityListEl = document.getElementById("densityMemoryList");
const densityCountEl = document.getElementById("densityMemoryCount");
const densityEmptyEl = document.getElementById("densityMemoryEmpty");
const densityClearBtn = document.getElementById("densityMemoryClear");

function createDensityRow(batchId, entry) {
    const wrapper = document.createElement("div");
    wrapper.className = "density-memory-item";

    const name = document.createElement("span");
    name.className = "density-memory-name";
    name.textContent = entry.name || `batch #${batchId}`;
    name.title = `Batch id ${batchId}`;

    const density = document.createElement("span");
    density.className = "density-memory-value";
    density.textContent = entry.density || "—";
    density.title = "Density";

    const purity = document.createElement("span");
    purity.className = "density-memory-value";
    purity.textContent = entry.purity || "—";
    purity.title = "Purity";

    const conc = document.createElement("span");
    conc.className = "density-memory-value";
    conc.textContent = entry.concentration
        ? entry.concentration + (entry.concentrationUnits ? ` ${entry.concentrationUnits}` : "")
        : "—";
    conc.title = "Concentration";

    const solvent = document.createElement("span");
    solvent.className = "density-memory-value";
    solvent.textContent = entry.solvent || "—";
    solvent.title = "Solvent";

    const saved = document.createElement("span");
    saved.className = "density-memory-date";
    saved.textContent = entry.savedAt
        ? new Date(entry.savedAt).toLocaleDateString()
        : "";

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "density-memory-delete";
    deleteBtn.setAttribute("aria-label", `Forget density for ${name.textContent}`);
    deleteBtn.textContent = "✕";
    deleteBtn.addEventListener("click", async () => {
        const map = await loadDensityMemory();
        delete map[batchId];
        await saveDensityMemory(map);
        renderDensityMemory(map);
    });

    wrapper.append(name, density, purity, conc, solvent, saved, deleteBtn);
    return wrapper;
}

function renderDensityMemory(map) {
    // Newest first — the list is a working set, not an archive.
    const entries = Object.entries(map).sort(
        (a, b) => (b[1].savedAt || 0) - (a[1].savedAt || 0)
    );

    densityListEl.replaceChildren();
    for (const [batchId, entry] of entries) {
        densityListEl.appendChild(createDensityRow(batchId, entry));
    }

    densityCountEl.textContent = String(entries.length);
    densityEmptyEl.hidden = entries.length > 0;
    densityClearBtn.hidden = entries.length === 0;
}

densityClearBtn.addEventListener("click", async () => {
    const count = densityListEl.children.length;
    if (!confirm(`Forget all ${count} remembered densities?`)) return;
    await saveDensityMemory({});
    renderDensityMemory({});
});

async function initDensityMemoryUI() {
    renderDensityMemory(await loadDensityMemory());
}

const autoFillCheckbox = document.getElementById("autoFillEnabled");

autoFillCheckbox.addEventListener("change", () => {
    saveAutoFillEnabled(autoFillCheckbox.checked);
});

async function initAutoFillUI() {
    autoFillCheckbox.checked = await getAutoFillEnabled();
}

const purityFillInput = document.getElementById("purityFillThreshold");
const purityWarnInput = document.getElementById("purityWarnThreshold");

purityFillInput.addEventListener("change", () => {
    savePurityFillThreshold(purityFillInput.value);
});
purityWarnInput.addEventListener("change", () => {
    savePurityWarnThreshold(purityWarnInput.value);
});

async function initPurityThresholdUI() {
    const thresholds = await loadPurityThresholds();
    purityFillInput.value = thresholds.fill;
    purityWarnInput.value = thresholds.warn;
}

const hplcEnabledCheckbox = document.getElementById("hplcBlockEnabled");
const hplcAliquotInput = document.getElementById("hplcAliquotVolume");
const hplcVialInput = document.getElementById("hplcVialVolume");
const hplcTargetInput = document.getElementById("hplcTargetAmount");
const hplcLadderInput = document.getElementById("hplcVialLadder");

hplcAliquotInput.addEventListener("change", () => {
    saveHplcAliquotVolumeUl(hplcAliquotInput.value);
});
hplcVialInput.addEventListener("change", () => {
    saveHplcVialVolumeMl(hplcVialInput.value);
});
hplcTargetInput.addEventListener("change", () => {
    saveHplcTargetAmountNmol(hplcTargetInput.value);
});

hplcEnabledCheckbox.addEventListener("change", () => {
    saveHplcBlockEnabled(hplcEnabledCheckbox.checked);
});

hplcLadderInput.addEventListener("input", () => {
    saveHplcVialLadder(hplcLadderInput.value);
});

async function initHplcInjectionUI() {
    const settings = await loadHplcSettings();
    hplcEnabledCheckbox.checked = settings.enabled;
    hplcAliquotInput.value = settings.aliquotUl;
    hplcVialInput.value = settings.vialMl;
    hplcTargetInput.value = settings.targetNmol;
    hplcLadderInput.value = formatVialLadder(settings.vialLadderMl);
}

const showProductsCheckbox = document.getElementById("showProducts");

showProductsCheckbox.addEventListener("change", () => {
    saveShowProducts(showProductsCheckbox.checked);
});

async function initShowProductsUI() {
    showProductsCheckbox.checked = await getShowProducts();
}

const tableRowsCheckbox = document.getElementById("panelSourceTableRows");
const mentionsCheckbox = document.getElementById("panelSourceMentions");

function savePanelSourcesFromUI() {
    savePanelSources({
        tableRows: tableRowsCheckbox.checked,
        mentions: mentionsCheckbox.checked,
    });
}

tableRowsCheckbox.addEventListener("change", savePanelSourcesFromUI);
mentionsCheckbox.addEventListener("change", savePanelSourcesFromUI);

async function initPanelSourcesUI() {
    const sources = await getPanelSources();
    tableRowsCheckbox.checked = sources.tableRows;
    mentionsCheckbox.checked = sources.mentions;
}

/* ==================================================== 5 · Heat map tooltip */

const heatMapFieldListEl = document.getElementById("heatMapFieldList");
const heatMapEmptyEl = document.getElementById("heatMapFieldsEmpty");

// The saved selection (ordered array of labels — that order IS the tooltip
// row order) and the labels the content script has discovered so far.
let heatMapSelection = [];
let heatMapDiscovered = [];

// Discovered fields in the vault's own batch-form order (the "available" pool).
function sortedHeatMapDiscovered() {
    return [...heatMapDiscovered].sort(
        (a, b) => a.order - b.order || a.label.localeCompare(b.label)
    );
}

function heatMapSubheading(text) {
    const heading = document.createElement("div");
    heading.className = "field-subheading";
    heading.textContent = text;
    return heading;
}

function persistHeatMapSelection() {
    saveHeatMapFields(heatMapSelection);
    renderHeatMapFields();
}

function renderHeatMapFields() {
    const selectedKeys = new Set(heatMapSelection.map(normalizeFieldLabel));

    heatMapFieldListEl.replaceChildren();

    // Chosen rows as an ordered list — this order, Synonyms included, is
    // EXACTLY the popup's row order.
    if (heatMapSelection.length) {
        heatMapFieldListEl.appendChild(heatMapSubheading("Shown, in this order"));

        const list = document.createElement("ol");
        list.className = "order__list";

        heatMapSelection.forEach((label, index) => {
            const item = document.createElement("li");
            item.className = "order__item";

            const name = document.createElement("span");
            name.className = "order__name";
            name.textContent = label;

            const moves = document.createElement("span");
            moves.className = "order__moves";

            const move = (to) => {
                if (to < 0 || to >= heatMapSelection.length) return;
                const [moved] = heatMapSelection.splice(index, 1);
                heatMapSelection.splice(to, 0, moved);
                persistHeatMapSelection();
            };

            const up = document.createElement("button");
            up.type = "button";
            up.className = "order__move";
            up.textContent = "▲";
            up.disabled = index === 0;
            up.setAttribute("aria-label", `Move ${label} up`);
            up.addEventListener("click", () => move(index - 1));

            const down = document.createElement("button");
            down.type = "button";
            down.className = "order__move";
            down.textContent = "▼";
            down.disabled = index === heatMapSelection.length - 1;
            down.setAttribute("aria-label", `Move ${label} down`);
            down.addEventListener("click", () => move(index + 1));

            moves.append(up, down);

            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "prefix-color-delete";
            remove.textContent = "✕";
            remove.setAttribute("aria-label", `Remove ${label}`);
            remove.addEventListener("click", () => {
                heatMapSelection.splice(index, 1);
                persistHeatMapSelection();
            });

            item.append(name, moves, remove);
            list.appendChild(item);
        });

        heatMapFieldListEl.appendChild(list);
    }

    // Everything not yet chosen: the built-in Synonyms row plus the vault's
    // remaining batch fields. Ticking one appends it to the end of the list.
    const available = [
        ...(selectedKeys.has(normalizeFieldLabel(SYNONYMS_LABEL))
            ? []
            : [{ label: SYNONYMS_LABEL }]),
        ...sortedHeatMapDiscovered().filter(
            (f) => !selectedKeys.has(normalizeFieldLabel(f.label))
        ),
    ];
    if (available.length) {
        heatMapFieldListEl.appendChild(heatMapSubheading("Available"));
        for (const field of available) {
            heatMapFieldListEl.appendChild(
                createFieldCheckbox({ key: field.label, label: field.label }, false, () => {
                    heatMapSelection.push(field.label);
                    persistHeatMapSelection();
                })
            );
        }
    }

    heatMapEmptyEl.hidden = heatMapDiscovered.length > 0 || heatMapSelection.length > 0;
}

// Guards the storage.onChanged re-render: a discovery write arriving before
// the initial load finishes must not paint (and thus expose for editing) an
// empty selection.
let heatMapUiReady = false;

async function initHeatMapFieldsUI() {
    heatMapSelection = await getHeatMapFields();
    heatMapDiscovered = await getDiscoveredHeatMapFields();
    heatMapUiReady = true;
    renderHeatMapFields();
}

/* ================================================================== live sync */

// The content script discovers things while this page is open: new custom
// fields, new prefixes, new registration forms, a freshly used form. Fold each
// in without stealing focus from whatever the user is editing.
chrome.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName !== "local") return;

    if (changes[SAMPLE_PANEL_CUSTOM_FIELDS_KEY]) {
        await initSamplePanelFieldsUI();
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

    if (changes[DENSITY_MEMORY_STORAGE_KEY]) {
        renderDensityMemory(await loadDensityMemory());
    }

    if (changes[HEAT_MAP_DISCOVERED_KEY] && heatMapUiReady) {
        heatMapDiscovered = await getDiscoveredHeatMapFields();
        renderHeatMapFields();
    }
});

// A number input that has focus steps on the wheel, and every setting here
// saves the moment it changes — so scrolling the page past a threshold you
// clicked a moment ago silently rewrites it, with no Save button and no undo.
// The rows are click-to-focus and live inside scroll containers, which makes
// it easy to do by accident. Scrolling still works; only the stepping stops.
for (const input of document.querySelectorAll('input[type="number"]')) {
    input.addEventListener(
        "wheel",
        (event) => {
            if (document.activeElement === input) event.preventDefault();
        },
        { passive: false }
    );
}

/* ================================================================ rail */

// One card at a time, chosen from the rail on the left.
//
// The card sections are all in the DOM; only one is not `hidden`. That keeps
// every existing getElementById working — options.js reaches into cards that
// are not on screen all the time, and a rail that destroyed the others would
// have meant rewriting all eight sections.

const RAIL_LAST_PANE_KEY = "cddOptionsLastPane";

const railEl = document.getElementById("settingsRail");
const panesEl = document.getElementById("settingsPanes");

function showPane(paneId, { remember = true } = {}) {
    const items = [...railEl.querySelectorAll(".rail__item")];
    const target = items.find((i) => i.dataset.pane === paneId) || items[0];
    if (!target) return;

    for (const item of items) {
        item.setAttribute("aria-current", String(item === target));
    }
    for (const card of panesEl.querySelectorAll(".card")) {
        card.hidden = card.getAttribute("aria-labelledby") !== target.dataset.pane;
    }

    if (remember) {
        // Fire and forget: which pane you were last on is a convenience, and
        // losing it is not worth an await on every click.
        try {
            chrome.storage.local.set({ [RAIL_LAST_PANE_KEY]: target.dataset.pane });
        } catch {
            /* orphaned page — nothing to do */
        }
    }
}

railEl.addEventListener("click", (event) => {
    const item = event.target.closest(".rail__item");
    if (item) showPane(item.dataset.pane);
});

// Left/right (or up/down) walk the rail, the way a settings sidebar is
// expected to. Home and End jump to the ends.
railEl.addEventListener("keydown", (event) => {
    const items = [...railEl.querySelectorAll(".rail__item")];
    const here = items.indexOf(document.activeElement);
    if (here < 0) return;

    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
    let next = null;
    if (step) next = items[(here + step + items.length) % items.length];
    else if (event.key === "Home") next = items[0];
    else if (event.key === "End") next = items[items.length - 1];
    if (!next) return;

    event.preventDefault();
    next.focus();
    showPane(next.dataset.pane);
});

// A rail hides what a card contains, so anything the plugin DISCOVERED while
// you were working — a new prefix, a custom field, another vault — would be
// invisible until you happened to open that card. These counts are the whole
// mitigation, which is why they are wired to the same state the cards render
// from rather than being decorative.
function setChip(key, text) {
    const chip = railEl.querySelector(`.rail__chip[data-chip="${key}"]`);
    if (!chip) return;
    const value = text == null ? "" : String(text);
    chip.textContent = value;
    chip.hidden = !value;
}

function refreshRailChips() {
    const enabled = (nodes) => [...nodes].filter((i) => i.checked).length;

    const fieldBoxes = document.querySelectorAll(
        "#samplePanelFields input[type=checkbox], #samplePanelCustomFields input[type=checkbox]"
    );
    if (fieldBoxes.length) setChip("fields", `${enabled(fieldBoxes)}/${fieldBoxes.length}`);

    setChip("prefixes", prefixRows.length || null);
    setChip("regdefaults", regDefaultVaults.length || null);

    const remembered = document.getElementById("densityMemoryCount");
    setChip("densities", remembered ? remembered.textContent.trim() : null);

    // Heat map keeps its chosen rows as an ORDERED list, not checkboxes, so
    // the count comes from the same array the card renders from.
    setChip("heatmap", heatMapSelection.length || null);

    const hplcOn = document.getElementById("hplcBlockEnabled");
    if (hplcOn) setChip("hplc", hplcOn.checked ? "on" : "off");

    const mode = titleRadios.find((r) => r.checked);
    setChip("title", mode ? { "id-title": "ID + title", "id-only": "ID", "title-only": "title", original: "CDD" }[mode.value] : null);
}

// The cards rewrite themselves constantly — discovery, storage changes, the
// user clicking. Rather than hooking each of those, watch the panes.
new MutationObserver(refreshRailChips).observe(panesEl, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["checked", "value"],
});
panesEl.addEventListener("change", refreshRailChips);

async function initRailUI() {
    let last = null;
    try {
        const stored = await chrome.storage.local.get(RAIL_LAST_PANE_KEY);
        last = stored?.[RAIL_LAST_PANE_KEY] || null;
    } catch {
        /* fall through to the first pane */
    }
    showPane(last, { remember: false });
    refreshRailChips();
}

showVersion();
initElnTitleUI();
initSamplePanelFieldsUI();
initPrefixColorsUI();
initRegistrationFormUI();
initElnIdCarryUI();
initDensityMemoryUI();
initAutoFillUI();
initPurityThresholdUI();
initShowProductsUI();
initPanelSourcesUI();
initHeatMapFieldsUI();
initHplcInjectionUI();
initRegistrationDefaultsUI();
initRailUI();
