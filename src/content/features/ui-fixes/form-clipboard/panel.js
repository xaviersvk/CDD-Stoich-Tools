// content/features/ui-fixes/form-clipboard/panel.js
//
// Copy / Paste above the Protocol Forms table, and the card Paste opens.
//
// Copy: the page's own form list plus the names behind the field ids, from
// the bridge; every form is neutralized — names, never ids — and the lot
// goes to the clipboard. A form that carries an id this extension cannot
// translate is left out and named, not shipped half-translated.
//
// Paste: the target's list and names, a plan, and a card with a checkbox per
// form. "Create N forms" POSTs the checked ones one by one through the
// internal API the page uses, stops on the first failure with the server's
// words, and on success reloads the page so the table shows what it made.

import { createForm, listForms, requestFieldMap, vaultIdFromPath, vaultName } from "./api.js";
import { onFormClipboardChanged, readFormClipboard, writeFormClipboard } from "./clipboard.js";
import {
    PLAN_ADD,
    countPlan,
    formFieldNames,
    neutralize,
    planForms,
    resolve,
} from "./form-model.js";

export const BAR_CLASS = "cdd-form-clip-bar";

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

export function buildBar() {
    const vaultId = vaultIdFromPath(location.pathname);
    // The second class is the field clipboard's: same buttons, same card.
    const bar = el("span", `${BAR_CLASS} cdd-fc-bar`);

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
            const forms = await listForms(vaultId);
            copyButton.textContent = `Copy ${plural(forms.length, "form")}`;
            copyButton.disabled = forms.length === 0;
        } catch {
            copyButton.textContent = "Copy forms";
        }
        const entry = await readFormClipboard();
        if (entry) {
            pasteButton.disabled = false;
            pasteButton.title = `${plural(entry.forms.length, "form")} from ${entry.vaultName || "vault " + entry.vaultId}, copied ${when(entry.copiedAt)}`;
        } else {
            pasteButton.disabled = true;
            pasteButton.title = "Nothing copied yet. Copy forms in another vault first.";
        }
    }

    /* ----- copy ----- */
    copyButton.addEventListener("click", async () => {
        status.textContent = "";
        card.hidden = true;
        try {
            const [forms, map] = await Promise.all([listForms(vaultId), requestFieldMap()]);
            if (!map) throw new Error("could not read the field names behind this page");

            const kept = [];
            const refused = [];
            for (const form of forms) {
                const { form: neutral, unknownIds, missingNames } = neutralize(form, map);
                const problems = [...unknownIds, ...missingNames];
                if (problems.length) refused.push(`${form.name} (${problems.join("; ")})`);
                else kept.push(neutral);
            }

            await writeFormClipboard({ vaultId, vaultName: vaultName(), copiedAt: Date.now(), forms: kept });
            status.textContent = `Copied ${plural(kept.length, "form")} from ${vaultName() || "this vault"}. Open Protocol Forms in the other vault and press Paste.`
                + (refused.length ? ` Left out, carrying ids this extension cannot translate: ${refused.join(", ")}.` : "");
        } catch (error) {
            status.textContent = `Copy failed — ${error.message}.`;
        }
    });

    /* ----- paste: the preview ----- */
    pasteButton.addEventListener("click", async () => {
        status.textContent = "";
        const entry = await readFormClipboard();
        if (!entry) return;
        if (String(entry.vaultId) === String(vaultId)) {
            status.textContent = "This is the vault the forms were copied from. Paste them in the other vault.";
        }
        try {
            const [forms, map] = await Promise.all([listForms(vaultId), requestFieldMap()]);
            if (!map) throw new Error("could not read the field names behind this page");
            const plan = planForms(entry.forms, forms.map((form) => form.name), map);
            renderCard(entry, plan, map);
        } catch (error) {
            status.textContent = `Paste failed — ${error.message}.`;
        }
    });

    function renderCard(entry, plan, map) {
        card.textContent = "";
        card.hidden = false;

        const head = el("div", "cdd-fc-head");
        head.append(el("span", "cdd-fc-title", "Paste protocol forms"));
        head.append(el("span", "cdd-fc-note",
            `${plural(entry.forms.length, "form")} from ${entry.vaultName || "vault " + entry.vaultId}, copied ${when(entry.copiedAt)}`));
        card.append(head);

        const list = el("div", "cdd-fc-list");
        const rows = plan.map((item) => {
            const line = el("label", "cdd-fc-row");
            const box = document.createElement("input");
            box.type = "checkbox";
            box.checked = item.status === PLAN_ADD;
            box.disabled = item.status !== PLAN_ADD;
            if (item.status !== PLAN_ADD) line.classList.add("cdd-fc-row--skip");
            line.append(box);
            line.append(el("span", "cdd-fc-name", item.form.name));
            const fields = formFieldNames(item.form);
            line.append(el("span", "cdd-fc-type", plural(fields.length, "field")));
            line.append(el("span", item.status === PLAN_ADD ? "cdd-fc-detail" : "cdd-fc-why", item.note));
            list.append(line);
            box.addEventListener("change", updateCount);
            return { item, line, box };
        });
        card.append(list);

        const foot = el("div", "cdd-fc-foot");
        const createButton = el("button", "cdd-fc-add", "");
        createButton.type = "button";
        const cancel = el("button", "cdd-fc-cancel", "Cancel");
        cancel.type = "button";
        cancel.addEventListener("click", () => { card.hidden = true; });
        foot.append(createButton, cancel);
        card.append(foot);

        function chosen() {
            return rows.filter(({ item, box }) => item.status === PLAN_ADD && box.checked);
        }
        function updateCount() {
            const count = chosen().length;
            createButton.textContent = `Create ${plural(count, "form")}`;
            createButton.disabled = count === 0;
        }
        updateCount();

        createButton.addEventListener("click", () => runPaste(chosen(), map, createButton, cancel, rows));
    }

    /* ----- paste: the run ----- */
    async function runPaste(todo, map, createButton, cancel, rows) {
        createButton.disabled = true;
        cancel.disabled = true;
        for (const { box } of rows) box.disabled = true;
        status.textContent = "";

        let made = 0;
        try {
            for (const { item, line } of todo) {
                const { form, missing } = resolve(item.form, map);
                if (missing.length) {
                    throw new Error(`fields not found here: ${[...new Set(missing.map((entry) => entry.name))].join(", ")}`);
                }
                if (JSON.stringify(form).includes('"$field"')) {
                    throw new Error("a placeholder survived translation; nothing was sent");
                }
                await createForm(vaultId, form);
                line.classList.add("cdd-fc-row--done");
                made += 1;
            }
            status.textContent = `Created ${plural(made, "form")}. Reloading…`;
            setTimeout(() => location.reload(), 1200);
        } catch (error) {
            cancel.disabled = false;
            status.textContent = `Created ${made} of ${todo.length}. Stopped at "${todo[made]?.item.form.name}" — ${error.message}.`
                + (made ? " Reload the page to see the ones that were made." : "");
        }
    }

    refresh();
    onFormClipboardChanged(refresh);
    return bar;
}
