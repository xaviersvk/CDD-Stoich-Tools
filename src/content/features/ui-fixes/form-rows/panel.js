// content/features/ui-fixes/form-rows/panel.js
//
// "Add fields to forms" above a forms table — Registration Forms or Protocol
// Forms — and the card it opens. What differs between the two pages is in
// `page` (pages.js).
//
// The card opens with a switch of the tables a form has (Entity · Batch ·
// Sample · Inventory, or Run · Protocol), on the one used last. Under it two
// lists. The first is the vault's fields of that kind: tick the ones to add,
// in the order they should stand in the row, and give a Pick List its
// default. The choice is remembered by name, per kind, so the next vault
// opens with the same fields ticked — and says which of them it does not
// have yet. The second list is the vault's forms with what would happen to
// each: a row added to that table — above the file rows it ends in, if it
// does — a row moved up from below them, a missing Pick List default set,
// nothing (it has them), or never (it has no layout of its own, or one this
// extension does not recognise).
//
// The run is written for forms that are in use:
//   - a JSON file of the forms as they were is downloaded before anything is
//     sent;
//   - each form is listed again right before its PUT, and the run stops if it
//     is no longer the form that was previewed;
//   - each form is listed again right after, and the run stops unless the
//     server holds exactly the document that was sent;
//   - the first failure stops everything, with the server's words.

import { buildButtonBar, cardFoot, checkbox, el, filterInput, openCard, plural } from "../../../utils/settings-card.js";
import { vaultIdFromPath, vaultName } from "../form-clipboard/api.js";
import { PLAN_ADD, PLAN_DEFAULT, PLAN_MOVE, fileFieldIds, planForm, putBody, resolveChosen, sameDocument, verifySaved, withRows } from "./row-model.js";
import { readFormRowSelection, writeFormRowSelection } from "./selection.js";

export const BAR_CLASS = "cdd-form-rows-bar";

function cleanName(name) {
    return String(name ?? "").trim();
}

function downloadBackup(page, vaultId, forms) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const blob = new Blob([JSON.stringify({ vaultId, vaultName: vaultName(), savedAt: new Date().toISOString(), forms }, null, 2)],
        { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `cdd-${page.page}-forms-${vaultId}-${stamp}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
    return link.download;
}

export function buildBar(page) {
    const vaultId = vaultIdFromPath(location.pathname);
    // The second class is the field clipboard's: same buttons, same card.
    const { bar, buttons: [openButton], status, card } = buildButtonBar(`${BAR_CLASS} cdd-fc-bar`, ["Add fields to forms"]);

    openButton.addEventListener("click", async () => {
        status.textContent = "";
        card.hidden = true;
        let forms;
        let defs;
        let remembered;
        try {
            [forms, defs, remembered] = await Promise.all([page.listForms(vaultId), page.readDefs(), readFormRowSelection()]);
            if (!defs) throw new Error("could not read the field names behind this page");
        } catch (error) {
            status.textContent = `Could not open — ${error.message}.`;
            return;
        }
        const last = remembered.lastKind[page.page];
        const kind = page.kinds.find((entry) => entry.key === last) || page.kinds[0];
        openFieldsCard(forms, defs, remembered, kind);
    });

    function openFieldsCard(forms, allDefs, remembered, kind) {
        const kindDefs = Array.isArray(allDefs[kind.key]) ? allDefs[kind.key] : [];
        // A disabled File field still makes its row a file row.
        const defs = kindDefs.filter((def) => def && !def.disabled);
        const fileIds = fileFieldIds(kindDefs);
        const fieldsPage = `${kind.label} Fields`;

        openCard(card, `Add ${kind.label.toLowerCase()} fields to forms`, `${plural(forms.length, "form")} in ${vaultName() || "this vault"}`);

        /* ----- the switch ----- */
        const switchRow = el("div", "cdd-fc-pick");
        const switchButtons = page.kinds.map((other) => {
            const button = el("button", "cdd-fc-kind", other.label);
            button.type = "button";
            if (other.key === kind.key) button.classList.add("is-current");
            else button.addEventListener("click", () => openFieldsCard(forms, allDefs, remembered, other));
            return button;
        });
        switchRow.append(...switchButtons);
        card.append(switchRow);

        /* ----- the fields ----- */
        const fieldsHead = el("div", "cdd-fc-section");
        fieldsHead.append(el("span", null, "Fields, in the order they go into the row"));
        const filter = filterInput();
        fieldsHead.append(filter);
        const fieldList = el("div", "cdd-fc-list");
        card.append(fieldsHead, fieldList);

        // Ordered: the row is built in this order.
        const chosen = [];
        const fieldRows = [];

        function addFieldRow(name, def, rememberedDefault, checked) {
            const line = el("label", "cdd-fc-row");
            const box = checkbox(checked);
            const order = el("span", "cdd-fc-order");
            line.append(box, order, el("span", "cdd-fc-name", name));
            let select = null;
            if (!def) {
                line.classList.add("cdd-fc-row--skip");
                line.append(el("span", "cdd-fc-why", `not in this vault — paste it on ${fieldsPage} first`));
            } else {
                line.append(el("span", "cdd-fc-type", def.data_type_name));
                if (def.data_type_name === "PickList") {
                    select = document.createElement("select");
                    select.className = "cdd-fc-select";
                    select.append(new Option("no default", ""));
                    for (const value of (def.pick_list_values || []).filter((entry) => !entry.hidden)) {
                        select.append(new Option(`default: ${cleanName(value.value)}`, cleanName(value.value)));
                    }
                    const wanted = cleanName(rememberedDefault);
                    if (wanted && [...select.options].some((option) => option.value === wanted)) select.value = wanted;
                    else if (wanted) line.append(el("span", "cdd-fc-why", `no "${wanted}" in this list`));
                    select.addEventListener("change", judge);
                    line.append(select);
                }
            }
            const entry = { name, def, box, order, select, line };
            if (box.checked && def) chosen.push(entry);
            box.addEventListener("change", () => {
                // A remembered field this vault lacks: unticking it lets the
                // run go ahead without it, and forgets it.
                if (!def) {
                    line.classList.toggle("cdd-fc-row--skip", box.checked);
                    judge();
                    return;
                }
                const index = chosen.indexOf(entry);
                if (box.checked && index < 0) {
                    chosen.push(entry);
                    // Up under the fields ticked before it: a vault's newest
                    // fields are at the bottom of a long list, and the row
                    // order should be readable at a glance.
                    const firstFree = [...fieldList.children].find((other) => other !== line && !other.querySelector("input").checked);
                    if (firstFree) fieldList.insertBefore(line, firstFree);
                }
                if (!box.checked && index >= 0) chosen.splice(index, 1);
                judge();
            });
            fieldRows.push(entry);
            fieldList.append(line);
        }

        // Remembered fields first, in their order; then the rest of the vault's.
        const rememberedNames = new Set();
        for (const pick of remembered.picks[kind.key] || []) {
            const name = cleanName(pick.name);
            if (!name || rememberedNames.has(name)) continue;
            rememberedNames.add(name);
            addFieldRow(name, defs.find((def) => cleanName(def.name) === name) || null, pick.default, true);
        }
        for (const def of defs) {
            if (!rememberedNames.has(cleanName(def.name))) addFieldRow(cleanName(def.name), def, null, false);
        }
        const missingHere = () => fieldRows.filter((row) => !row.def && row.box.checked).map((row) => row.name);

        filter.addEventListener("input", () => {
            const needle = filter.value.trim().toLowerCase();
            for (const row of fieldRows) row.line.hidden = !!needle && !row.name.toLowerCase().includes(needle) && !row.box.checked;
        });

        /* ----- the forms ----- */
        card.append(el("div", "cdd-fc-section", "Forms"));
        const formList = el("div", "cdd-fc-list");
        card.append(formList);
        const formRows = forms.map((form) => {
            const line = el("label", "cdd-fc-row");
            const box = checkbox(false);
            const why = el("span", "cdd-fc-detail");
            line.append(box, el("span", "cdd-fc-name", form.name), el("span", "cdd-fc-type", page.formTag(form)), why);
            formList.append(line);
            box.addEventListener("change", count);
            // Ticked by default once; after that the user's own choice stands.
            return { form, line, box, why, touched: false };
        });
        for (const row of formRows) row.box.addEventListener("change", () => { row.touched = true; });

        const footNote = el("span", "cdd-fc-note", "A backup of the forms is downloaded first.");
        const { action, cancel } = cardFoot(card, { extra: [footNote] });

        let cells = [];

        function picks() {
            return chosen.map((entry) => ({ name: entry.name, default: entry.select?.value || null }));
        }

        function judge() {
            fieldRows.forEach((row) => { row.order.textContent = ""; });
            chosen.forEach((entry, index) => { entry.order.textContent = String(index + 1); });
            ({ cells } = resolveChosen(picks(), defs));
            for (const row of formRows) {
                const plan = cells.length ? planForm(row.form, cells, fileIds, kind.key) : { status: null, note: "" };
                const can = plan.status === PLAN_ADD || plan.status === PLAN_MOVE || plan.status === PLAN_DEFAULT;
                row.plan = plan;
                row.box.disabled = !can;
                if (!can) row.box.checked = false;
                else if (!row.touched) row.box.checked = true;
                row.why.textContent = plan.note;
                row.line.classList.toggle("cdd-fc-row--skip", !!plan.status && !can);
            }
            count();
        }

        function todo() {
            return formRows.filter((row) => row.box.checked && !row.box.disabled);
        }

        function count() {
            const n = todo().length;
            const missing = missingHere();
            action.textContent = `Apply to ${plural(n, "form")}`;
            action.disabled = n === 0 || missing.length > 0;
            footNote.textContent = missing.length
                ? `Not in this vault: ${missing.join(", ")}. Paste the fields on ${fieldsPage} first, or untick them.`
                : "A backup of the forms is downloaded first.";
            footNote.className = missing.length ? "cdd-fc-why" : "cdd-fc-note";
        }

        judge();

        action.addEventListener("click", async () => {
            const rows = todo();
            action.disabled = true;
            cancel.disabled = true;
            filter.disabled = true;
            for (const button of switchButtons) button.disabled = true;
            for (const row of fieldRows) {
                row.box.disabled = true;
                if (row.select) row.select.disabled = true;
            }
            for (const row of formRows) row.box.disabled = true;
            status.textContent = "";

            let made = 0;
            let current = null;
            try {
                await writeFormRowSelection(page.page, kind.key, picks());
                const file = downloadBackup(page, vaultId, rows.map((row) => row.form));
                footNote.textContent = `Backup: ${file}`;
                for (const row of rows) {
                    current = row;
                    const fresh = (await page.listForms(vaultId)).find((form) => String(form.id) === String(row.form.id));
                    if (!fresh || !sameDocument(putBody(fresh, page.sent), putBody(row.form, page.sent))) {
                        throw new Error("it was changed since the preview; nothing was sent for it");
                    }
                    const expected = withRows(fresh, cells, fileIds, kind.key);
                    await page.updateForm(vaultId, fresh.id, putBody(expected, page.sent));
                    const saved = (await page.listForms(vaultId)).find((form) => String(form.id) === String(fresh.id));
                    const problems = verifySaved(expected, saved, page.sent);
                    if (problems.length) throw new Error(`it was saved, but ${problems.join("; ")} — compare it with the backup`);
                    row.line.classList.add("cdd-fc-row--done");
                    row.why.textContent = { [PLAN_MOVE]: "moved", [PLAN_DEFAULT]: "default set" }[row.plan.status] || "added";
                    made += 1;
                }
                status.textContent = `Changed ${plural(made, "form")}. Reloading…`;
                setTimeout(() => location.reload(), 1200);
            } catch (error) {
                cancel.disabled = false;
                status.textContent = `Changed ${made} of ${rows.length}. Stopped at "${current?.form.name ?? ""}" — ${error.message}.`;
            }
        });
    }

    return bar;
}
