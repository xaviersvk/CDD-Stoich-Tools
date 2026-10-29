// content/health-check.js — after a page settles, look for the CDD anchors
// the features stand on, and say in the console which ones are gone.
//
// A CDD markup change does not throw: the feature's querySelector just finds
// nothing, and the button, badge or fill never appears. This makes that
// visible as one warning per page, naming the features affected, instead of
// a user noticing weeks later that something quietly stopped.
//
// Only anchors that MUST be on the page are checked: an ELN entry always has
// its identifier and editor; a stoichiometry table only when the entry's
// payload said it has a reaction. Dialogs and menus are never checked — they
// are absent until the user opens them.

import { SELECTORS } from "./selectors.js";
import { STATE } from "./state.js";

const ELN_ENTRY = /^\/vaults\/\d+\/eln\/entries\/\d+/;
const VAULT_PAGE = /^\/vaults\/\d+(\/|$)/;
const RUN_PAGE = /^\/vaults\/\d+\/runs\/\d+\/?$/;

// First look this long after a page (or in-app navigation) starts; whatever
// is missing then gets one more chance as long again before it is reported,
// so a slow vault is not mistaken for a changed one.
const SETTLE_MS = 10_000;

export const CHECKS = [
    { page: VAULT_PAGE, selector: SELECTORS.username, features: ["Create location link"] },
    { page: ELN_ENTRY, selector: SELECTORS.entryIdentifier, features: ["Sample panel", "Panel print", "ELN tab title", "ELN ID to registration"] },
    { page: ELN_ENTRY, selector: SELECTORS.entryEditor, features: ["AI write-up"] },
    { page: ELN_ENTRY, when: (s) => s.hasReactionFeature, selector: SELECTORS.reaction, features: ["Print buttons", "Next step", "Dictate", "Row fill"] },
    { page: ELN_ENTRY, when: (s) => s.hasReactionFeature, selector: SELECTORS.stoichTable, features: ["ELN ID to registration"] },
    { page: ELN_ENTRY, when: (s) => s.lastPayload?.samples?.length > 0, selector: SELECTORS.stoichRow, features: ["Row names"] },
    // Not every run has a Data Summary; the links are only expected in one.
    { page: RUN_PAGE, when: (s, query) => query("#run-summary"), selector: SELECTORS.runSummaryLinks, features: ["Assay window"] },
];

// The checks that apply to this page and find nothing. Pure, for the tests:
// `query(selector)` answers whether the selector matches.
export function findMissingAnchors(checks, { path, state, query }) {
    return checks.filter((check) => {
        if (!check.page.test(path)) return false;
        if (check.when && !check.when(state, query)) return false;
        const selectors = Array.isArray(check.selector) ? check.selector : [check.selector];
        return !selectors.some((selector) => query(selector));
    });
}

const reported = new Set();
let timer = null;

function missingNow() {
    return findMissingAnchors(CHECKS, {
        path: location.pathname,
        state: STATE,
        query: (selector) => !!document.querySelector(selector),
    });
}

function report(missing) {
    const fresh = missing.filter((check) => {
        const key = `${location.pathname}::${check.selector}`;
        if (reported.has(key)) return false;
        reported.add(key);
        return true;
    });
    if (!fresh.length) return;

    console.warn(
        `[CDD Stoich Tools] health check: ${fresh.length} CDD anchor(s) missing on ${location.pathname} — CDD may have changed its page.\n` +
            fresh.map((c) => `  ${c.selector}  →  ${c.features.join(", ")}`).join("\n"),
    );
}

// Called at startup and on every in-app navigation; a newer call replaces a
// pending one, so only the page the user stays on is checked.
export function scheduleHealthCheck() {
    clearTimeout(timer);
    timer = setTimeout(() => {
        if (!missingNow().length) return;
        timer = setTimeout(() => report(missingNow()), SETTLE_MS);
    }, SETTLE_MS);
}
