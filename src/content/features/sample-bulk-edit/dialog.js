// content/features/sample-bulk-edit/dialog.js
//
// The Bulk edit dialog: set one sample field to one value (or clear it) on
// every ticked sample. Opened from a molecule's Samples tab (init.js) and
// from Inventory search (search.js); the two differ only in which samples
// `load` brings. Spec: docs/superpowers/specs/2026-10-29-sample-bulk-edit-design.md
//
// Nothing is written until the user clicks Write. Each sample is then saved
// with the PUT CDD's own Edit dialog sends (model.js builds the form), one at
// a time, from the samples as CDD serves them right before the write. A
// failure stays on its row and the rest carry on.
//
// Every sample `load` returns carries `__moleculeId`: the PUT goes to the
// sample's molecule, and on Inventory search they come from many.

import { loadFieldDefinitions } from "../../api/field-definitions.js";
import { createInventorySample } from "../../api/inventory-samples.js";
import {
    buildSampleEntries,
    editableFields,
    previewRows,
    sampleUrl,
    valueText,
} from "./model.js";

const LOG_PREFIX = "[CDD stoich plugin]";
// The "with value" option for samples where the field is empty.
const EMPTY_VALUE = "__empty__";

export function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
        if (value == null || value === false) continue;
        if (key === "className") node.className = value;
        else if (key === "text") node.textContent = value;
        else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
        else node.setAttribute(key, value === true ? "" : String(value));
    }
    for (const child of children) if (child != null) node.append(child);
    return node;
}

// A molecule's samples, depleted ones included, each tagged with the molecule.
export async function fetchMoleculeSamples(vaultId, moleculeId) {
    const url = `/vaults/${vaultId}/molecules/${moleculeId}/inventory_samples.json?include_depleted=true`;
    const res = await fetch(url, {
        credentials: "include",
        headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
    });
    if (!res.ok) throw new Error(`samples: HTTP ${res.status}`);
    const json = await res.json();
    return (json?.inventory_samples || []).map((s) => ({ ...s, __moleculeId: String(moleculeId) }));
}

export function byName(a, b) {
    return String(a.name || "").localeCompare(String(b.name || ""), undefined, { numeric: true });
}

// "PharmTheon > BIO Lab > … > FB20A1 > 58/G4" → "FB20A1 > 58/G4"
function shortLocation(sample) {
    const parts = String(sample?.location?.value || "").split(">").map((p) => p.trim()).filter(Boolean);
    return parts.slice(-2).join(" > ");
}

// CDD answers a failed PUT with JSON errors or an HTML page; keep it short.
function errorLine(result) {
    const raw = result?.raw;
    const errors = raw?.errors || raw?.error || raw?.messages;
    let text = "";
    if (Array.isArray(errors)) text = errors.map(valueText).join("; ");
    else if (errors && typeof errors === "object") text = Object.values(errors).flat().map(valueText).join("; ");
    else if (errors) text = String(errors);
    if (!text) text = /<html/i.test(result?.errorText || "") ? "" : String(result?.errorText || "");
    return `${result?.status ? `HTTP ${result.status}` : "Failed"}${text ? ` — ${text.slice(0, 200)}` : ""}`;
}

// options:
//   vaultId
//   load()          → Promise<sample[]> (with __moleculeId), called on open
//                     and again right before Write
//   preselect       tick every loaded sample (Inventory search: the user
//                   has already chosen them)
//   emptyText       shown when `load` brings nothing
//   reloadOnClose   reload the page after a write (molecule page); otherwise
//                   the closing note asks to run the search again
export async function openBulkEditDialog({ vaultId, load, preselect = false, emptyText = "No samples.", reloadOnClose = true }) {
    if (document.querySelector(".cdd-sbe-backdrop")) return;

    const state = {
        fields: [],
        allDefinitions: [],
        samples: [],
        field: null,
        value: "",
        clear: false,
        showDepleted: false,
        ticked: new Set(),     // sample ids
        status: new Map(),     // sample id → { ok, text }
        writing: false,
        wrote: false,
    };

    const body = el("div", { className: "cdd-sbe__body" }, el("div", { className: "cdd-sbe__msg", text: "Loading samples…" }));
    const fieldSelect = el("select", { "aria-label": "Field" });
    const valueSlot = el("span");
    const clearBox = el("input", { type: "checkbox" });
    const depletedBox = el("input", { type: "checkbox" });
    const byValue = el("select", { "aria-label": "Select samples by current value" });
    const summary = el("span", { className: "cdd-sbe__summary" });
    const writeButton = el("button", { type: "button", className: "cdd-sbe__write", text: "Write", disabled: true });
    const closeButton = el("button", { type: "button", className: "cdd-sbe__close", text: "Close" });

    const dialog = el("div", { className: "cdd-sbe", role: "dialog", "aria-label": "Bulk edit samples" },
        el("div", { className: "cdd-sbe__head" },
            el("span", { className: "cdd-sbe__title", text: "Bulk edit samples" }),
            el("button", { type: "button", className: "cdd-sbe__x", "aria-label": "Close", text: "×", onclick: close })),
        el("div", { className: "cdd-sbe__controls" },
            el("label", {}, el("span", { className: "cdd-sbe__label", text: "Field" }), fieldSelect),
            el("label", {}, el("span", { className: "cdd-sbe__label", text: "New value" }), valueSlot),
            el("label", {}, clearBox, "Clear the field")),
        el("div", { className: "cdd-sbe__picks" },
            el("span", { text: "Select:" }),
            el("button", { type: "button", text: "All", onclick: () => pick(() => true) }),
            el("button", { type: "button", text: "None", onclick: () => pick(() => false) }),
            el("label", {}, "with value", byValue),
            el("span", { className: "cdd-sbe__spacer" }),
            el("label", {}, depletedBox, "Show depleted")),
        body,
        el("div", { className: "cdd-sbe__foot" }, summary, writeButton, closeButton));

    const backdrop = el("div", { className: "cdd-sbe-backdrop" }, dialog);
    backdrop.addEventListener("mousedown", (event) => { if (event.target === backdrop) close(); });
    document.addEventListener("keydown", onKey, true);
    closeButton.addEventListener("click", close);
    writeButton.addEventListener("click", () => void write());
    document.body.appendChild(backdrop);

    function onKey(event) {
        if (event.key === "Escape") { event.stopPropagation(); close(); }
    }

    function close() {
        if (state.writing) return;
        document.removeEventListener("keydown", onKey, true);
        backdrop.remove();
        if (state.wrote && reloadOnClose) location.reload();
    }

    function visibleSamples() {
        return state.samples.filter((s) => state.showDepleted || !s.depleted || state.ticked.has(s.id));
    }

    function newValue() {
        return state.clear ? "" : state.value;
    }

    function rows() {
        return state.field ? previewRows(visibleSamples(), state.field, newValue()) : [];
    }

    function pending() {
        const ready = state.field && (state.clear || String(state.value).trim() !== "");
        return ready ? rows().filter((r) => state.ticked.has(r.sample.id) && !r.unchanged) : [];
    }

    function pick(predicate) {
        state.ticked = new Set(visibleSamples().filter(predicate).map((s) => s.id));
        render();
    }

    function renderValueInput() {
        valueSlot.replaceChildren();
        const field = state.field;
        let input;
        if (!field) {
            input = el("input", { type: "text", disabled: true });
        } else if (field.type === "PickList") {
            input = el("select", {},
                el("option", { value: "", text: "— choose —" }),
                ...field.options.map((o) => el("option", { value: o, text: o })));
        } else if (field.type === "Date") {
            input = el("input", { type: "date" });
        } else if (["Number", "Integer", "Float"].includes(field.type)) {
            input = el("input", { type: "number", step: "any" });
        } else {
            input = el("input", { type: "text" });
        }
        input.value = state.value;
        input.disabled = !field || state.clear || state.writing;
        input.addEventListener("input", () => { state.value = input.value; render(false); });
        input.addEventListener("change", () => { state.value = input.value; render(false); });
        valueSlot.append(input);
    }

    function renderByValue() {
        const values = state.field
            ? [...new Set(visibleSamples().map((s) => previewRows([s], state.field, "")[0].from))]
            : [];
        byValue.replaceChildren(el("option", { value: "", text: "—" }),
            ...values.map((v) => el("option", { value: v === "" ? EMPTY_VALUE : v, text: v === "" ? "(empty)" : v })));
        byValue.disabled = !state.field || state.writing;
    }

    function renderTable() {
        if (!state.samples.length) {
            body.replaceChildren(el("div", { className: "cdd-sbe__msg", text: emptyText }));
            return;
        }
        const preview = new Map(rows().map((r) => [r.sample.id, r]));
        const tbody = el("tbody");
        for (const sample of visibleSamples()) {
            const row = preview.get(sample.id);
            const box = el("input", { type: "checkbox", "aria-label": `Select ${sample.name}` });
            box.checked = state.ticked.has(sample.id);
            box.disabled = state.writing;
            box.addEventListener("change", () => {
                if (box.checked) state.ticked.add(sample.id);
                else state.ticked.delete(sample.id);
                render();
            });

            let change = "";
            let changeClass = "";
            if (row && state.ticked.has(sample.id) && (state.clear || String(state.value).trim() !== "")) {
                if (row.unchanged) { change = "no change"; changeClass = "cdd-sbe__same"; }
                else { change = row.to === "" ? "(cleared)" : row.to; changeClass = "cdd-sbe__new"; }
            }
            const status = state.status.get(sample.id);

            tbody.append(el("tr", { className: sample.depleted ? "cdd-sbe__depleted" : null },
                el("td", {}, box),
                el("td", { text: sample.name || sample.sample_identifier || String(sample.id) }),
                el("td", { title: sample?.location?.value || null, text: shortLocation(sample) }),
                el("td", { text: row ? row.from : "" }),
                el("td", { className: changeClass, text: change }),
                el("td", { className: status ? (status.ok ? "cdd-sbe__ok" : "cdd-sbe__err") : null,
                    text: status ? status.text : "" })));
        }
        const fieldName = state.field ? state.field.name : "Value";
        body.replaceChildren(el("table", {},
            el("thead", {}, el("tr", {},
                el("th", {}), el("th", { text: "Sample" }), el("th", { text: "Location" }),
                el("th", { text: `${fieldName} now` }), el("th", { text: "New" }), el("th", {}))),
            tbody));
    }

    function render(full = true) {
        if (full) renderValueInput();
        renderByValue();
        renderTable();
        const count = pending().length;
        writeButton.disabled = state.writing || count === 0;
        writeButton.textContent = state.writing ? "Writing…" : count ? `Write ${count} sample${count === 1 ? "" : "s"}` : "Write";
        fieldSelect.disabled = state.writing;
        clearBox.disabled = !state.field || state.writing;
        depletedBox.disabled = state.writing;
        closeButton.disabled = state.writing;
        const done = [...state.status.values()];
        const failed = done.filter((s) => !s.ok).length;
        const after = reloadOnClose ? "Close to reload the page." : "Run the search again to see the new values.";
        summary.textContent = done.length
            ? `${done.length - failed} written${failed ? `, ${failed} failed` : ""}. ${after}`
            : state.ticked.size ? `${state.ticked.size} selected, ${count} will change.` : "";
    }

    fieldSelect.addEventListener("change", () => {
        state.field = state.fields.find((f) => String(f.id) === fieldSelect.value) || null;
        state.value = "";
        state.clear = false;
        clearBox.checked = false;
        render();
    });
    clearBox.addEventListener("change", () => { state.clear = clearBox.checked; render(); });
    depletedBox.addEventListener("change", () => {
        state.showDepleted = depletedBox.checked;
        render();
    });
    byValue.addEventListener("change", () => {
        if (!byValue.value || !state.field) return;
        const wanted = byValue.value === EMPTY_VALUE ? "" : byValue.value;
        pick((s) => previewRows([s], state.field, "")[0].from === wanted);
        byValue.value = "";
    });

    async function write() {
        const todo = pending();
        if (!todo.length || state.writing) return;
        state.writing = true;
        state.status.clear();
        render();

        const field = state.field;
        const value = newValue();
        let fresh = new Map();
        try {
            fresh = new Map((await load()).map((s) => [s.id, s]));
        } catch (error) {
            console.warn(LOG_PREFIX, "bulk edit: reload before write failed", error);
            for (const { sample } of todo) state.status.set(sample.id, { ok: false, text: "Could not reload the sample" });
        }

        for (const { sample } of todo) {
            if (!fresh.size) break;
            const current = fresh.get(sample.id);
            if (!current) {
                state.status.set(sample.id, { ok: false, text: "Sample no longer exists" });
                render();
                continue;
            }
            const built = buildSampleEntries(current, state.allDefinitions, field, value);
            if (built.error) {
                state.status.set(sample.id, { ok: false, text: `Not written: ${built.error}` });
                render();
                continue;
            }
            const form = new FormData();
            for (const [key, v] of built.entries) form.append(key, v);
            const url = sampleUrl(vaultId, current.__moleculeId, sample.id);
            const result = await createInventorySample(url, form, "PUT");
            if (result.ok) {
                state.wrote = true;
                if (result.raw && typeof result.raw === "object" && result.raw.id === sample.id) {
                    const saved = { ...result.raw, __moleculeId: current.__moleculeId };
                    state.samples = state.samples.map((s) => (s.id === sample.id ? saved : s));
                }
                state.status.set(sample.id, { ok: true, text: "✓" });
            } else {
                console.warn(LOG_PREFIX, "bulk edit: write failed", sample.name, result.status, result.errorText);
                state.status.set(sample.id, { ok: false, text: errorLine(result) });
            }
            render();
        }

        state.writing = false;
        render();
    }

    try {
        const [definitions, samples] = await Promise.all([loadFieldDefinitions(vaultId), load()]);
        if (!definitions) throw new Error("field definitions could not be loaded");
        state.allDefinitions = Array.isArray(definitions.inventory_sample_field_definitions)
            ? definitions.inventory_sample_field_definitions
            : [];
        state.fields = editableFields(definitions);
        state.samples = samples.slice().sort(byName);
        if (preselect) state.ticked = new Set(state.samples.map((s) => s.id));
    } catch (error) {
        console.warn(LOG_PREFIX, "bulk edit:", error);
        body.replaceChildren(el("div", { className: "cdd-sbe__msg cdd-sbe__err", text: `Could not load: ${error.message}` }));
        return;
    }

    fieldSelect.replaceChildren(el("option", { value: "", text: "— choose field —" }),
        ...state.fields.map((f) => el("option", { value: String(f.id), text: f.name })));
    render();
}
