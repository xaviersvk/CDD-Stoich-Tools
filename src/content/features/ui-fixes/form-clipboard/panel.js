// content/features/ui-fixes/form-clipboard/panel.js
//
// Copy / Paste above the Protocol Forms table: the shared form bar
// (form-bar.js) with the protocol endpoint, the page store's field map, and
// the protocol form model.

import { createForm, listForms, requestFieldMap } from "./api.js";
import { onFormClipboardChanged, readFormClipboard, writeFormClipboard } from "./clipboard.js";
import { buildFormBar } from "./form-bar.js";
import { formFieldNames, neutralize, planForms, resolve } from "./form-model.js";

export const BAR_CLASS = "cdd-form-clip-bar";

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
        clipboard: { read: readFormClipboard, write: writeFormClipboard, onChanged: onFormClipboardChanged },
    });
}
