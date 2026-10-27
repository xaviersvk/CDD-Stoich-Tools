// content/features/ui-fixes/form-clipboard/panel.js
//
// Copy / Paste above the Protocol Forms table: the shared form bar
// (form-bar.js) with the protocol endpoint, the page store's field map, and
// the protocol form model. A protocol form points at the vault's protocol
// and run fields, so a paste that lacks some can hand their definitions to
// the field clipboard of the Protocol Fields and Run Fields pages.

import { writeClipboardEntry } from "../field-clipboard/clipboard.js";
import { createForm, listForms, requestFieldMap } from "./api.js";
import { onFormClipboardChanged, readFormClipboard, writeFormClipboard } from "./clipboard.js";
import { buildFormBar } from "./form-bar.js";
import { formFieldNames, missingFields, neutralize, planForms, resolve, usedFieldDefinitions } from "./form-model.js";

export const BAR_CLASS = "cdd-form-clip-bar";

const FIELD_PAGES = {
    protocol: { label: "Protocol Fields", path: "vault_protocol_field_definitions" },
    run: { label: "Run Fields", path: "vault_run_field_definitions" },
};

function missingGroups(plan, entry, vaultId) {
    return missingFields(plan, entry.fieldDefinitions).map((group) => ({
        ...group,
        label: FIELD_PAGES[group.kind].label,
        href: `/vaults/${vaultId}/${FIELD_PAGES[group.kind].path}`,
    }));
}

// One field clipboard entry per kind, from the vault the forms came from,
// so that page's Paste card says where they were copied.
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

export function buildBar() {
    return buildFormBar({
        barClass: BAR_CLASS,
        copyTitle: "Copy protocol forms",
        pasteTitle: "Paste protocol forms",
        pageName: "Protocol Forms",
        list: listForms,
        create: createForm,
        readMap: requestFieldMap,
        neutralize,
        formFieldNames,
        planForms,
        resolve,
        fieldDefinitions: usedFieldDefinitions,
        missingFields: missingGroups,
        copyMissingFields,
        clipboard: { read: readFormClipboard, write: writeFormClipboard, onChanged: onFormClipboardChanged },
    });
}
