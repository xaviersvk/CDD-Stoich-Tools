// content/features/ui-fixes/form-clipboard/form-bar.js
//
// Copy / Paste above a forms table, and the cards they open. Shared by the
// Protocol Forms and Registration Forms pages; what differs between them —
// the endpoint, where the field names come from, how ids are translated —
// arrives as an adapter (see protocol-adapter.js).
//
// Copy opens a card listing the page's forms with a checkbox each; the
// chosen ones are neutralized — names, never ids — and go to the clipboard.
// A form that carries an id this extension cannot translate — or points at a
// field the vault no longer has — is shown disabled with the reason, never
// shipped half-translated.
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
// Optional, for a page whose forms point at fields of its own settings pages:
//   fieldDefinitions(neutrals, map)   → stored on the copy as entry.fieldDefinitions
//   missingFields(plan, entry, vaultId) → [{ kind, label, href, fields: [{ name, definition }] }]
//   copyMissingFields(groups, entry)  → puts the definitions on the field clipboard
//
// When a form needs fields the target lacks, Paste lists them under the
// forms, one linked line per settings page, and offers to put them on the
// field clipboard; making them stays a Paste and an Update on that page.

import {
    buildButtonBar,
    cardFoot,
    checkbox,
    el,
    openCard,
    plural,
    when,
} from "../../../utils/settings-card.js";
import { describeField } from "../field-clipboard/field-model.js";
import { vaultIdFromPath, vaultName } from "./api.js";
import { PLAN_ADD, PLAN_MISSING_FIELDS, PLAN_SAME_NAME, explainProblems, suggestName } from "./form-model.js";

export function buildFormBar(adapter) {
    const vaultId = vaultIdFromPath(location.pathname);
    // The second class is the field clipboard's: same buttons, same card.
    const { bar, buttons: [copyButton, pasteButton], status, card } =
        buildButtonBar(`${adapter.barClass} cdd-fc-bar`, ["Copy forms", "Paste"]);

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

    function openListCard(title, note) {
        openCard(card, title, note);
        const list = el("div", "cdd-fc-list");
        card.append(list);
        const { action, cancel } = cardFoot(card);
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

        const { list, action } = openListCard(adapter.copyTitle, `${plural(forms.length, "form")} in ${vaultName() || "this vault"}`);
        const rows = forms.map((form) => {
            const { form: neutral, unknownIds, missingNames } = adapter.neutralize(form, map);
            const problems = [...unknownIds, ...missingNames];
            const line = el("label", "cdd-fc-row");
            const box = checkbox(problems.length === 0, problems.length > 0);
            if (problems.length) line.classList.add("cdd-fc-row--skip");
            line.append(box, el("span", "cdd-fc-name", form.name));
            line.append(el("span", "cdd-fc-type", plural(adapter.formFieldNames(neutral).length, "field")));
            line.append(el("span", problems.length ? "cdd-fc-why" : "cdd-fc-detail",
                explainProblems(unknownIds, missingNames)));
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
            const clip = { vaultId, vaultName: vaultName(), copiedAt: Date.now(), forms: kept };
            if (adapter.fieldDefinitions) clip.fieldDefinitions = adapter.fieldDefinitions(kept, map);
            await adapter.clipboard.write(clip);
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
        const { list, action, cancel } = openListCard(adapter.pasteTitle,
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

        const missing = adapter.missingFields ? adapter.missingFields(plan, entry, vaultId) : [];
        if (missing.length) action.parentElement.before(missingBlock(missing, entry));

        action.addEventListener("click", () => runPaste(chosen(), map, action, cancel, rows));
    });

    /* ----- paste: what to make first ----- */
    // One line per settings page, linked: "Run Fields: Temperature (Number),
    // Solvent (Pick List, 4 values)". The button hands the definitions to
    // the field clipboard, where that page's own Paste picks them up.
    function missingBlock(groups, entry) {
        const source = entry.vaultName || `vault ${entry.vaultId}`;
        const block = el("div", "cdd-fc-missing");
        block.append(el("div", "cdd-fc-missing-head", "Missing in this vault. Make these first:"));
        for (const group of groups) {
            const line = el("div", "cdd-fc-missing-line");
            const link = el("a", "", group.label);
            link.href = group.href;
            const words = group.fields.map(({ name, definition }) =>
                (definition ? `${name} (${describeField(definition)})` : name));
            line.append(link, document.createTextNode(`: ${words.join(", ")}`));
            block.append(line);
        }

        const unknown = groups.flatMap((group) => group.fields).filter((field) => !field.definition);
        if (unknown.length) {
            block.append(el("div", "cdd-fc-why",
                `No definition for ${unknown.map((field) => field.name).join(", ")}: copy the forms again in ${source}.`));
        }

        const copyable = groups.filter((group) => group.fields.some((field) => field.definition));
        if (!copyable.length) return block;
        const pages = copyable.map((group) => group.label).join(" and ");
        const count = copyable.flatMap((group) => group.fields).filter((field) => field.definition).length;
        const foot = el("div", "cdd-fc-missing-foot");
        const button = el("button", "cdd-fc-button", `Copy ${plural(count, "missing field")}`);
        button.type = "button";
        foot.append(button, el("span", "cdd-fc-detail", `Replaces what the field clipboard holds for ${pages}.`));
        block.append(foot);

        button.addEventListener("click", async () => {
            try {
                await adapter.copyMissingFields(copyable, entry);
            } catch (error) {
                status.textContent = `Copy failed — ${error.message}.`;
                return;
            }
            button.disabled = true;
            status.textContent = `Copied ${plural(count, "field")}. On ${pages}: press Paste, then Update. Then come back here and press Paste again.`;
        });
        return block;
    }

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

    void refresh();
    adapter.clipboard.onChanged(refresh);
    return bar;
}
