// content/features/ui-fixes/form-clipboard/form-bar.js
//
// Copy / Paste above a forms table, and the cards they open. Shared by the
// Protocol Forms and Registration Forms pages; what differs between them —
// the endpoint, where the field names come from, how ids are translated —
// arrives as an adapter (see protocol-adapter.js).
//
// Copy opens a card listing the page's forms with a checkbox each; the
// chosen ones are neutralized — names, never ids — and go to the clipboard.
// A form that carries an id this extension cannot translate is shown
// disabled with the reason, never shipped half-translated.
//
// Paste opens a card with a checkbox and an editable name per form. The
// name matters twice: a form whose name is already on the page is skipped
// unless it is renamed, and within one vault that is exactly how a form is
// duplicated — Paste beside its original as "X (copy)". "Create N forms"
// POSTs the checked ones one by one through the internal API the page uses,
// stops on the first failure with the server's words, and on success
// reloads the page so the table shows what it made.
//
// Adapter:
//   barClass, copyTitle, pasteTitle, pageName
//   list(vaultId), create(vaultId, form)
//   readMap()                         → the page's id ↔ name map, or null
//   neutralize(form, map)             → { form, unknownIds, missingNames }
//   formFieldNames(neutral)           → [{ component, name }]
//   planForms(neutrals, names, map)   → [{ form, status, note }]
//   resolve(neutral, map)             → { form, missing }
//   describe(neutral, map)            → a note for a form that will be made
//   clipboard: { read(), write(entry), onChanged(callback) }

import { vaultIdFromPath, vaultName } from "./api.js";
import { PLAN_ADD, PLAN_MISSING_FIELDS, PLAN_SAME_NAME, suggestName } from "./form-model.js";

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
    return new Date(timestamp).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function checkbox(checked, disabled) {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = checked;
    box.disabled = disabled;
    return box;
}

export function buildFormBar(adapter) {
    const vaultId = vaultIdFromPath(location.pathname);
    // The second class is the field clipboard's: same buttons, same card.
    const bar = el("span", `${adapter.barClass} cdd-fc-bar`);

    const copyButton = el("button", "cdd-fc-button", "Copy forms");
    copyButton.type = "button";
    const pasteButton = el("button", "cdd-fc-button", "Paste");
    pasteButton.type = "button";
    const status = el("span", "cdd-fc-status");
    const card = el("div", "cdd-fc-card");
    card.hidden = true;
    bar.append(copyButton, pasteButton, status, card);

    async function refresh() {
        try {
            const forms = await adapter.list(vaultId);
            copyButton.textContent = `Copy ${plural(forms.length, "form")}`;
            copyButton.disabled = forms.length === 0;
        } catch {
            copyButton.textContent = "Copy forms";
        }
        const entry = await adapter.clipboard.read();
        if (entry) {
            pasteButton.disabled = false;
            pasteButton.title = `${plural(entry.forms.length, "form")} from ${entry.vaultName || "vault " + entry.vaultId}, copied ${when(entry.copiedAt)}`;
        } else {
            pasteButton.disabled = true;
            pasteButton.title = "Nothing copied yet. Copy forms first.";
        }
    }

    function openCard(title, note) {
        card.textContent = "";
        card.hidden = false;
        const head = el("div", "cdd-fc-head");
        head.append(el("span", "cdd-fc-title", title));
        head.append(el("span", "cdd-fc-note", note));
        card.append(head);
        const list = el("div", "cdd-fc-list");
        card.append(list);
        const foot = el("div", "cdd-fc-foot");
        const action = el("button", "cdd-fc-add", "");
        action.type = "button";
        const cancel = el("button", "cdd-fc-cancel", "Cancel");
        cancel.type = "button";
        cancel.addEventListener("click", () => { card.hidden = true; });
        foot.append(action, cancel);
        card.append(foot);
        return { list, action, cancel };
    }

    async function load() {
        const [forms, map] = await Promise.all([adapter.list(vaultId), adapter.readMap()]);
        if (!map) throw new Error("could not read the field names behind this page");
        return { forms, map };
    }

    /* ----- copy ----- */
    copyButton.addEventListener("click", async () => {
        status.textContent = "";
        card.hidden = true;
        let forms;
        let map;
        try {
            ({ forms, map } = await load());
        } catch (error) {
            status.textContent = `Copy failed — ${error.message}.`;
            return;
        }

        const { list, action } = openCard(adapter.copyTitle, `${plural(forms.length, "form")} in ${vaultName() || "this vault"}`);
        const rows = forms.map((form) => {
            const { form: neutral, unknownIds, missingNames } = adapter.neutralize(form, map);
            const problems = [...unknownIds, ...missingNames];
            const line = el("label", "cdd-fc-row");
            const box = checkbox(problems.length === 0, problems.length > 0);
            if (problems.length) line.classList.add("cdd-fc-row--skip");
            line.append(box, el("span", "cdd-fc-name", form.name));
            line.append(el("span", "cdd-fc-type", plural(adapter.formFieldNames(neutral).length, "field")));
            line.append(el("span", problems.length ? "cdd-fc-why" : "cdd-fc-detail",
                problems.length ? `carries an id this extension cannot translate: ${problems.join("; ")}` : ""));
            list.append(line);
            box.addEventListener("change", updateCount);
            return { neutral, box };
        });

        function chosen() {
            return rows.filter(({ box }) => box.checked && !box.disabled).map(({ neutral }) => neutral);
        }
        function updateCount() {
            const count = chosen().length;
            action.textContent = `Copy ${plural(count, "form")}`;
            action.disabled = count === 0;
        }
        updateCount();

        action.addEventListener("click", async () => {
            const kept = chosen();
            await adapter.clipboard.write({ vaultId, vaultName: vaultName(), copiedAt: Date.now(), forms: kept });
            card.hidden = true;
            status.textContent = `Copied ${plural(kept.length, "form")} from ${vaultName() || "this vault"}. Press Paste here to duplicate them, or on ${adapter.pageName} in another vault.`;
        });
    });

    /* ----- paste: the preview ----- */
    pasteButton.addEventListener("click", async () => {
        status.textContent = "";
        const entry = await adapter.clipboard.read();
        if (!entry) return;
        let forms;
        let map;
        try {
            ({ forms, map } = await load());
        } catch (error) {
            status.textContent = `Paste failed — ${error.message}.`;
            return;
        }

        const targetNames = forms.map((form) => String(form.name ?? "").trim());
        const plan = adapter.planForms(entry.forms, targetNames, map);
        const sameVault = String(entry.vaultId) === String(vaultId);
        const { list, action, cancel } = openCard(adapter.pasteTitle,
            `${plural(entry.forms.length, "form")} from ${entry.vaultName || "vault " + entry.vaultId}, copied ${when(entry.copiedAt)}`
            + (sameVault ? " — the same vault, so each copy needs its own name" : ""));

        const rows = plan.map((item) => {
            const line = el("div", "cdd-fc-row");
            const blocked = item.status === PLAN_MISSING_FIELDS;
            const box = checkbox(item.status === PLAN_ADD, blocked);
            const name = document.createElement("input");
            name.type = "text";
            name.className = "cdd-fc-rename";
            // A clash gets a free name proposed; a plain add keeps its own.
            name.value = item.status === PLAN_SAME_NAME ? suggestName(item.form.name, targetNames) : item.form.name;
            name.disabled = blocked;
            name.title = `Copied as "${item.form.name}"`;
            const why = el("span", blocked ? "cdd-fc-why" : "cdd-fc-detail", blocked ? item.note : "");
            if (blocked) line.classList.add("cdd-fc-row--skip");
            line.append(box, name, el("span", "cdd-fc-type", plural(adapter.formFieldNames(item.form).length, "field")), why);
            list.append(line);
            box.addEventListener("change", judge);
            name.addEventListener("input", judge);
            const detail = blocked || !adapter.describe ? "" : adapter.describe(item.form, map);
            return { item, line, box, name, why, blocked, detail };
        });

        // A row is addable when its name is free — on the page and among the
        // other checked rows. Judged on every keystroke, so the count on the
        // button is always the number of forms that will appear.
        function judge() {
            const taken = new Set(targetNames);
            for (const row of rows) {
                if (row.blocked) continue;
                const value = row.name.value.trim();
                const clash = !value || taken.has(value);
                row.why.textContent = !value ? "needs a name" : (clash ? "same name here" : row.detail);
                row.why.className = clash ? "cdd-fc-why" : "cdd-fc-detail";
                row.line.classList.toggle("cdd-fc-row--skip", clash);
                if (clash) row.box.checked = false;
                row.box.disabled = clash;
                if (!clash && row.box.checked) taken.add(value);
            }
            const count = chosen().length;
            action.textContent = `Create ${plural(count, "form")}`;
            action.disabled = count === 0;
        }
        function chosen() {
            return rows.filter((row) => !row.blocked && row.box.checked && !row.box.disabled);
        }
        judge();

        action.addEventListener("click", () => runPaste(chosen(), map, action, cancel, rows));
    });

    /* ----- paste: the run ----- */
    async function runPaste(todo, map, action, cancel, rows) {
        action.disabled = true;
        cancel.disabled = true;
        for (const row of rows) {
            row.box.disabled = true;
            row.name.disabled = true;
        }
        status.textContent = "";

        let made = 0;
        try {
            for (const row of todo) {
                const { form, missing } = adapter.resolve(row.item.form, map);
                if (missing.length) {
                    throw new Error(`fields not found here: ${[...new Set(missing.map((entry) => entry.name))].join(", ")}`);
                }
                form.name = row.name.value.trim();
                if (/"\$(field|default|system|component)"/.test(JSON.stringify(form))) {
                    throw new Error("a placeholder survived translation; nothing was sent");
                }
                await adapter.create(vaultId, form);
                row.line.classList.add("cdd-fc-row--done");
                made += 1;
            }
            status.textContent = `Created ${plural(made, "form")}. Reloading…`;
            setTimeout(() => location.reload(), 1200);
        } catch (error) {
            cancel.disabled = false;
            status.textContent = `Created ${made} of ${todo.length}. Stopped at "${todo[made]?.name.value}" — ${error.message}.`
                + (made ? " Reload the page to see the ones that were made." : "");
        }
    }

    refresh();
    adapter.clipboard.onChanged(refresh);
    return bar;
}
