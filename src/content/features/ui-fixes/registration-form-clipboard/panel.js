// content/features/ui-fixes/registration-form-clipboard/panel.js
//
// Copy / Paste above the Registration Forms table: the shared form bar with
// the registration endpoint, the page's own props for the map, and the
// registration form model. Each form that will be made says which
// registration system it gets, since that is picked by prefix. A paste that
// lacks molecule, batch, sample or inventory fields lists them per settings
// page and can hand their definitions to that page's field clipboard.

import { writeClipboardEntry } from "../field-clipboard/clipboard.js";
import { buildFormBar } from "../form-clipboard/form-bar.js";
import { createRegistrationForm, listRegistrationForms, readRegistrationMap } from "./api.js";
import {
    onRegistrationFormClipboardChanged,
    readRegistrationFormClipboard,
    writeRegistrationFormClipboard,
} from "./clipboard.js";
import { formFieldNames, missingFields, neutralize, planForms, resolve, usedFieldDefinitions } from "./form-model.js";

export const BAR_CLASS = "cdd-regform-clip-bar";

// Sample and inventory fields are two tables on one page.
const FIELD_PAGES = {
    molecule: { label: "Molecule Fields", path: "vault_molecule_field_definitions" },
    batch: { label: "Batch Fields", path: "vault_batch_field_definitions" },
    sample: { label: "Sample Fields", path: "inventory_field_definitions" },
    inventory: { label: "Inventory Fields", path: "inventory_field_definitions" },
};

// A vault can rename the nouns ("Entity Fields", "Animal Fields"), so the
// settings menu's own link text wins when the page has one.
function pageLabel(kind) {
    const page = FIELD_PAGES[kind];
    if (kind === "sample" || kind === "inventory") return page.label;
    const link = document.querySelector(`a[href$="/${page.path}"]`);
    return link?.textContent.trim() || page.label;
}

function missingGroups(plan, entry, vaultId) {
    return missingFields(plan, entry.fieldDefinitions).map((group) => ({
        ...group,
        label: pageLabel(group.kind),
        href: `/vaults/${vaultId}/${FIELD_PAGES[group.kind].path}`,
    }));
}

// One field clipboard entry per component, from the vault the forms came
// from, so that page's Paste card says where they were copied.
async function copyMissingFields(groups, entry) {
    for (const group of groups) {
        const fields = group.fields.map((field) => field.definition).filter(Boolean);
        if (!fields.length) continue;
        await writeClipboardEntry(group.kind, {
            vaultId: entry.vaultId,
            vaultName: entry.vaultName,
            copiedAt: Date.now(),
            fields,
        });
    }
}

function describe(neutral, map) {
    const { system, droppedDefaults } = resolve(neutral, map);
    const notes = [`system ${system}`];
    if (droppedDefaults.length) notes.push(`no default for ${droppedDefaults.join(", ")}`);
    return notes.join(" · ");
}

export function buildBar() {
    return buildFormBar({
        barClass: BAR_CLASS,
        copyTitle: "Copy registration forms",
        pasteTitle: "Paste registration forms",
        pageName: "Registration",
        list: listRegistrationForms,
        create: createRegistrationForm,
        readMap: readRegistrationMap,
        neutralize,
        formFieldNames,
        planForms,
        resolve,
        describe,
        fieldDefinitions: usedFieldDefinitions,
        missingFields: missingGroups,
        copyMissingFields,
        clipboard: {
            read: readRegistrationFormClipboard,
            write: writeRegistrationFormClipboard,
            onChanged: onRegistrationFormClipboardChanged,
        },
    });
}
