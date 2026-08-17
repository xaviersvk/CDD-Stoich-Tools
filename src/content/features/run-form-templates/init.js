// content/features/run-form-templates/init.js
//
// Discovery for the run-form template bar. Attaches one bar in front of every
// `div.protocolAnnotator` whose payload says it is a RUN's definition — the
// payload's own `resourceType`, never a URL, because the same component
// renders for other resources too.
//
// Why the scan sweeps before it attaches
// --------------------------------------
// The annotator is a React root: entering and leaving edit mode replaces it.
// Our bar is its previous SIBLING, so it survives that swap — but if CDD
// re-renders the card into a NEW node, the old bar is left pointing at
// nothing and the fresh annotator would get a second one. So every scan first
// removes bars that no longer sit in front of a live annotator, then adds one
// wherever an annotator has none. (Same shape as control-layout/init.js.)
//
// There is no WeakSet and no "already attached" flag: the DOM is the only
// bookkeeping, so nothing can go stale, and a SECOND copy of the extension
// sees the first copy's bar and leaves it be — isolated worlds cannot read
// each other's expandos, but they can both read a class name.
//
// Costs nothing on pages without a run definition: the scan is two
// querySelectorAll calls for selectors most pages do not have.

import {
    attachRunFormTemplates,
    destroyToolbar,
    isStaleToolbar,
    refreshToolbarState,
} from "./toolbar.js";
import { ANNOTATOR_SELECTOR, isRunDefinition, readProps } from "./form-model.js";
import { scanProtocolRunTables } from "./protocol-runs.js";
import { ROOT_CLASS } from "./styles.js";

let started = false;

export function initRunFormTemplates() {
    if (started) return;
    started = true;

    let scheduled = false;

    function scan() {
        scheduled = false;

        for (const root of document.querySelectorAll(`.${ROOT_CLASS}`)) {
            if (isStaleToolbar(root)) {
                try {
                    destroyToolbar(root);
                } catch (err) {
                    console.warn("[CDD Stoich Tools] run form template bar cleanup failed", err);
                }
                continue;
            }

            // The writing buttons follow the form in and out of edit mode.
            // Doing it here means this feature keeps no state of its own —
            // the scan already runs on every mutation batch.
            try {
                refreshToolbarState(root);
            } catch (err) {
                console.warn("[CDD Stoich Tools] run form template bar refresh failed", err);
            }
        }

        for (const annotator of document.querySelectorAll(ANNOTATOR_SELECTOR)) {
            // Cheap check FIRST: react_props is a ~400 kB JSON string and the
            // scan runs on every mutation batch, so it is parsed only when
            // there is no bar yet — never just to confirm one is there.
            const previous = annotator.previousElementSibling;
            if (previous && previous.classList?.contains(ROOT_CLASS)) continue;

            const props = readProps(annotator);
            if (!isRunDefinition(props)) continue;

            try {
                attachRunFormTemplates(annotator, props);
            } catch (err) {
                console.warn("[CDD Stoich Tools] run form template bar attach failed", err);
            }
        }

        // A protocol page shows every run of the protocol as a table row —
        // each one gets a Copy of its own, producing exactly what the run
        // page's Copy produces.
        try {
            scanProtocolRunTables();
        } catch (err) {
            console.warn("[CDD Stoich Tools] protocol run table scan failed", err);
        }
    }

    function schedule() {
        if (scheduled) return;
        scheduled = true;
        setTimeout(scan, 120);
    }

    schedule();

    // <html>, not <body>: Turbo swaps <body> on in-app navigation, which
    // would silently kill an observer attached to the old body.
    new MutationObserver(schedule).observe(document.documentElement, {
        childList: true,
        subtree: true,
    });
}
