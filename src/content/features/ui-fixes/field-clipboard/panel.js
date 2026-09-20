// content/features/ui-fixes/field-clipboard/panel.js
//
// The two buttons beside a "… Fields" table and the cards they open.
//
// Copy reads the definitions through the bridge — no edit mode, no clicks —
// and opens a card with a checkbox per field, all ticked, a filter and
// All / None: the ticked ones go to the clipboard under this page's kind.
// Three fields out of sixty is a real case — Paste adds everything the
// clipboard holds that the target lacks, so what is copied is what decides.
// Paste shows what it
// would do BEFORE touching the page: every clipboard field with add / skip
// and the reason, and a count on the button that is always the number of
// rows that will appear. The run then drives CDD's own edit mode and stops
// short of Update, which stays a human's click.

import { onClipboardChanged, readClipboardEntry, writeClipboardEntry } from "./clipboard.js";
import {
    PLAN_ADD,
    countPlan,
    kindConfig,
    normalizeRows,
    planPaste,
    requiredChoice,
} from "./field-model.js";
import {
    addRow,
    enterEditMode,
    fillRow,
    findTable,
    isEditing,
    namesFromDom,
    requestFieldRows,
    setPickList,
    typeOptions,
    updateButtonText,
    vaultInfo,
} from "./page-dom.js";

export const BAR_CLASS = "cdd-fc-bar";

// The type select's option values per page, measured. Used for the preview,
// which runs before edit mode exists; the run checks the live select again.
const KNOWN_TYPES = {
    molecule: ["Text", "Number", "Date", "PickList", "File"],
    batch: ["Text", "Number", "Date", "PickList", "File", "BatchLink"],
    sample: ["Text", "Number", "Date", "PickList", "File"],
    inventory: ["Text", "Number", "Date", "PickList", "File"],
    protocol: ["Text", "LongText", "PickList", "File", "Number", "BatchLink"],
    run: ["Text", "LongText", "PickList", "File", "Number", "BatchLink"],
    eln: ["Text", "Number", "Date", "PickList", "File"],
};

const TYPE_LABELS = { PickList: "Pick List", LongText: "Long Text", BatchLink: "Batch Link" };

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function plural(count, noun) {
    return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function when(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function typeLabel(type) {
    return TYPE_LABELS[type] || type;
}

async function currentTypes(kind) {
    if (isEditing(kind)) {
        const row = findTable(kind)?.querySelector('tbody tr input[name="name"]')?.closest("tr");
        const options = row ? typeOptions(row) : [];
        if (options.length) return options;
    }
    return KNOWN_TYPES[kind] || [];
}

async function currentNames(kind) {
    const rows = await requestFieldRows(kind);
    if (rows) return rows.map((row) => String(row.name ?? "").trim()).filter(Boolean);
    return namesFromDom(kind);
}

export function buildBar(kind) {
    const config = kindConfig(kind);
    const bar = el("span", BAR_CLASS);
    bar.dataset.kind = kind;

    const copyButton = el("button", "cdd-fc-button", "Copy fields");
    copyButton.type = "button";
    const pasteButton = el("button", "cdd-fc-button", "Paste");
    pasteButton.type = "button";
    const status = el("span", "cdd-fc-status");
    const card = el("div", "cdd-fc-card");
    card.hidden = true;

    bar.append(copyButton, pasteButton, status, card);

    /* ----- the buttons reflect what is there ----- */
    async function refresh() {
        const rows = await requestFieldRows(kind);
        const count = rows ? normalizeRows(rows).length : null;
        copyButton.textContent = count == null ? "Copy fields" : `Copy ${plural(count, "field")}`;
        copyButton.disabled = count === 0;

        const entry = await readClipboardEntry(kind);
        if (entry) {
            pasteButton.disabled = false;
            pasteButton.title = `${plural(entry.fields.length, "field")} from ${entry.vaultName || "vault " + entry.vaultId}, copied ${when(entry.copiedAt)}`;
        } else {
            pasteButton.disabled = true;
            pasteButton.title = `Nothing copied yet. Copy ${config.label} in another vault first.`;
        }
    }

    /* ----- copy ----- */
    copyButton.addEventListener("click", async () => {
        const rows = await requestFieldRows(kind);
        if (!rows) {
            status.textContent = "Could not read the fields on this page.";
            return;
        }
        status.textContent = "";
        renderCopyCard(normalizeRows(rows));
    });

    function renderCopyCard(fields) {
        const vault = vaultInfo();
        card.textContent = "";
        card.hidden = false;

        const head = el("div", "cdd-fc-head");
        head.append(el("span", "cdd-fc-title", `Copy ${config.label}`));
        head.append(el("span", "cdd-fc-note", `${plural(fields.length, "field")} in ${vault.name || "this vault"}`));
        card.append(head);

        const tools = el("div", "cdd-fc-section");
        const pick = el("span", "cdd-fc-pick");
        const all = el("button", "cdd-fc-button", "All");
        all.type = "button";
        const none = el("button", "cdd-fc-button", "None");
        none.type = "button";
        pick.append(all, none);
        const filter = document.createElement("input");
        filter.type = "search";
        filter.className = "cdd-fc-filter";
        filter.placeholder = "Filter";
        tools.append(pick, filter);
        card.append(tools);

        const list = el("div", "cdd-fc-list");
        const rows = fields.map((field) => {
            const line = el("label", "cdd-fc-row");
            const box = document.createElement("input");
            box.type = "checkbox";
            box.checked = true;
            line.append(box, el("span", "cdd-fc-name", field.name), el("span", "cdd-fc-type", typeLabel(field.type)));
            if (field.type === "PickList") line.append(el("span", "cdd-fc-detail", plural(field.pickList.length, "value")));
            list.append(line);
            box.addEventListener("change", count);
            return { field, line, box };
        });
        card.append(list);

        const foot = el("div", "cdd-fc-foot");
        const action = el("button", "cdd-fc-add", "");
        action.type = "button";
        const cancel = el("button", "cdd-fc-cancel", "Cancel");
        cancel.type = "button";
        cancel.addEventListener("click", () => { card.hidden = true; });
        foot.append(action, cancel);
        card.append(foot);

        function chosen() {
            return rows.filter((row) => row.box.checked).map((row) => row.field);
        }
        function count() {
            const n = chosen().length;
            action.textContent = `Copy ${plural(n, "field")}`;
            action.disabled = n === 0;
        }
        // All / None act on what the filter leaves in view.
        const setAll = (checked) => {
            for (const row of rows) if (!row.line.hidden) row.box.checked = checked;
            count();
        };
        all.addEventListener("click", () => setAll(true));
        none.addEventListener("click", () => setAll(false));
        filter.addEventListener("input", () => {
            const needle = filter.value.trim().toLowerCase();
            for (const row of rows) row.line.hidden = !!needle && !row.field.name.toLowerCase().includes(needle);
        });
        count();

        action.addEventListener("click", async () => {
            const kept = chosen();
            await writeClipboardEntry(kind, {
                vaultId: vault.id,
                vaultName: vault.name,
                copiedAt: Date.now(),
                fields: kept,
            });
            card.hidden = true;
            status.textContent = `Copied ${plural(kept.length, "field")} from ${vault.name || "this vault"}. Open the same page in the other vault and press Paste.`;
        });
    }

    /* ----- paste: the preview ----- */
    pasteButton.addEventListener("click", async () => {
        const entry = await readClipboardEntry(kind);
        if (!entry) return;
        status.textContent = "";

        const names = await currentNames(kind);
        const types = await currentTypes(kind);
        const plan = planPaste(entry.fields, names, types);
        renderCard(entry, plan);
    });

    function renderCard(entry, plan) {
        card.textContent = "";
        card.hidden = false;

        const head = el("div", "cdd-fc-head");
        head.append(el("span", "cdd-fc-title", `Paste ${config.label}`));
        head.append(el("span", "cdd-fc-note",
            `${plural(entry.fields.length, "field")} from ${entry.vaultName || "vault " + entry.vaultId}, copied ${when(entry.copiedAt)}`));
        card.append(head);

        const list = el("div", "cdd-fc-list");
        const lines = plan.map((item) => {
            const line = el("div", "cdd-fc-row");
            if (item.status !== PLAN_ADD) line.classList.add("cdd-fc-row--skip");
            line.append(el("span", "cdd-fc-name", item.field.name));
            line.append(el("span", "cdd-fc-type", typeLabel(item.field.type)));
            const detail = item.status === PLAN_ADD && item.field.type === "PickList" && !item.note
                ? `${plural(item.field.pickList.length, "value")}`
                : item.note;
            line.append(el("span", item.status === PLAN_ADD ? "cdd-fc-detail" : "cdd-fc-why", detail));
            list.append(line);
            return line;
        });
        card.append(list);

        const foot = el("div", "cdd-fc-foot");
        const { add } = countPlan(plan);
        const addButton = el("button", "cdd-fc-add", `Add ${plural(add, "field")}`);
        addButton.type = "button";
        addButton.disabled = add === 0;
        const cancel = el("button", "cdd-fc-cancel", "Cancel");
        cancel.type = "button";
        cancel.addEventListener("click", () => { card.hidden = true; });
        foot.append(addButton, cancel);
        card.append(foot);

        addButton.addEventListener("click", () => runPaste(plan, lines, addButton, cancel));
    }

    /* ----- paste: the run ----- */
    async function runPaste(plan, lines, addButton, cancel) {
        const todo = plan.map((item, index) => ({ item, line: lines[index] })).filter(({ item }) => item.status === PLAN_ADD);
        addButton.disabled = true;
        cancel.disabled = true;
        status.textContent = "";

        // Entering edit mode can redraw the page and take this bar with it;
        // init mounts a fresh one, and the run reports there.
        const say = (text) => {
            status.textContent = text;
            if (bar.isConnected) return;
            const live = document.querySelector(`.${BAR_CLASS}[data-kind="${kind}"] .cdd-fc-status`);
            if (live) live.textContent = text;
        };

        let made = 0;
        try {
            await enterEditMode(kind);
            for (const { item, line } of todo) {
                const field = item.field;
                say(`Adding ${made + 1} of ${todo.length}: ${field.name}…`);
                const tr = await addRow(kind);
                await fillRow(tr, field, requiredChoice(field));
                if (field.type === "PickList") await setPickList(tr, field.pickList);
                line.classList.add("cdd-fc-row--done");
                made += 1;
            }
            card.hidden = true;
            say(`Added ${plural(made, "field")}. Check them, then press "${updateButtonText(kind)}" — or cancel to discard.`);
        } catch (error) {
            // Whatever was added stays as pending rows: visible, removable,
            // and discarded by the page's own cancel.
            cancel.disabled = false;
            say(`Added ${made} of ${todo.length}. Stopped at "${todo[made]?.item.field.name}" — ${error.message}.`);
        }
    }

    refresh();
    onClipboardChanged(refresh);
    return bar;
}
