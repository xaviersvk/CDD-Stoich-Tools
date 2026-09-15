// content/features/ui-fixes/form-clipboard/row-actions.js
//
// A "Duplicate" link in every row of the Protocol Forms table: one click,
// one copy beside the original, named "X (copy)" (then "X (copy 2)", …).
// The copy goes through the same names-not-ids model as a paste — the
// vault is the same, so every name resolves — and the same POST, so a
// failure reads the same way. The page reloads afterwards so the table
// shows it.
//
// A row is matched to its form by the name in its first cell. Two forms
// with one name cannot be told apart that way, so their links are disabled
// with a tooltip rather than guessing.

import { createForm, listForms, requestFieldMap, vaultIdFromPath } from "./api.js";
import { neutralize, resolve, suggestName } from "./form-model.js";

const LINK_CLASS = "cdd-form-duplicate";

function rowName(tr) {
    return tr.querySelector("td")?.textContent.trim() || "";
}

async function duplicate(tr, link) {
    const vaultId = vaultIdFromPath(location.pathname);
    const name = rowName(tr);
    link.textContent = "Duplicating…";
    link.classList.add("is-busy");
    try {
        const [forms, map] = await Promise.all([listForms(vaultId), requestFieldMap()]);
        if (!map) throw new Error("could not read the field names behind this page");
        const matches = forms.filter((form) => String(form.name ?? "").trim() === name);
        if (matches.length !== 1) throw new Error(`${matches.length} forms are named "${name}"`);

        const { form: neutral, unknownIds, missingNames } = neutralize(matches[0], map);
        const problems = [...unknownIds, ...missingNames];
        if (problems.length) throw new Error(`carries an id this extension cannot translate: ${problems.join("; ")}`);

        const { form, missing } = resolve(neutral, map);
        if (missing.length) throw new Error(`fields not found: ${missing.map((entry) => entry.name).join(", ")}`);
        form.name = suggestName(name, forms.map((candidate) => String(candidate.name ?? "")));
        if (JSON.stringify(form).includes('"$field"')) throw new Error("a placeholder survived translation; nothing was sent");

        await createForm(vaultId, form);
        link.textContent = `Made "${form.name}" — reloading…`;
        setTimeout(() => location.reload(), 900);
    } catch (error) {
        link.textContent = "Duplicate";
        link.classList.remove("is-busy");
        link.title = `Duplicate failed — ${error.message}`;
        link.classList.add("is-failed");
    }
}

// Idempotent: React and Turbo repaint rows, and the observer calls this on
// every pass. One link per row, in a cell of its own at the end.
export function ensureDuplicateLinks(table) {
    // A header cell of its own, so the new column has a width like the others.
    const headerRow = table.querySelector("thead tr");
    if (headerRow && !headerRow.querySelector(".cdd-form-duplicate-cell")) {
        const th = document.createElement("th");
        th.className = "cdd-form-duplicate-cell";
        th.setAttribute("aria-label", "Duplicate");
        headerRow.append(th);
    }

    const rows = [...table.querySelectorAll("tbody tr")].filter((tr) => rowName(tr));
    const counts = new Map();
    for (const tr of rows) counts.set(rowName(tr), (counts.get(rowName(tr)) || 0) + 1);

    for (const tr of rows) {
        if (tr.querySelector(`.${LINK_CLASS}`)) continue;
        const cell = document.createElement("td");
        cell.className = "cdd-form-duplicate-cell";
        const link = document.createElement("button");
        link.type = "button";
        link.className = `${LINK_CLASS} cdd-fc-button`;
        link.textContent = "Duplicate";
        if (counts.get(rowName(tr)) > 1) {
            link.disabled = true;
            link.title = "Two forms share this name; rename one first.";
        }
        link.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!link.classList.contains("is-busy")) duplicate(tr, link);
        });
        cell.append(link);
        tr.append(cell);
    }
}
