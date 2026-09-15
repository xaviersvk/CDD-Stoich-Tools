// content/features/ui-fixes/field-clipboard/init.js
//
// Discovery + wiring. The only thing content/main.js imports from this feature.
//
// One observer on <html> (Turbo swaps <body>), debounced. Each pass looks at
// the kinds this path carries — one, or two on the Sample/Inventory page —
// and mounts a bar above the table for each kind whose "Add/Edit" link is
// on the page, which is CDD's own way of saying the user is an
// administrator. Once mounted the bar stays through edit mode, where that
// link is gone; it dies with the page.

import { kindsForPath } from "./field-model.js";
import { findEditLink, findTable, isEditing } from "./page-dom.js";
import { BAR_CLASS, buildBar } from "./panel.js";
import { injectFieldClipboardStyles } from "./styles.js";

let started = false;

function mount() {
    for (const { kind } of kindsForPath(location.pathname)) {
        const table = findTable(kind);
        if (!table) continue;
        if (document.querySelector(`.${BAR_CLASS}[data-kind="${kind}"]`)) continue;
        if (!findEditLink(kind) && !isEditing(kind)) continue;
        table.parentElement.insertBefore(buildBar(kind), table);
    }
}

export function initFieldClipboard() {
    injectFieldClipboardStyles();
    if (started) return;
    started = true;

    let scheduled = false;
    const schedule = () => {
        if (scheduled) return;
        scheduled = true;
        setTimeout(() => {
            scheduled = false;
            try {
                mount();
            } catch (error) {
                // A missing button must never cost the user the page.
                console.warn("[CDD field-clipboard] mount failed", error);
            }
        }, 48);
    };

    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
    schedule();
}
