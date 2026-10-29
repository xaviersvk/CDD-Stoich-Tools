// content/selectors.js — the CDD page anchors several features stand on.
//
// One place for them, for two reasons: a CDD markup change is fixed once
// instead of in every feature that copied the selector, and the startup
// health check (health-check.js) looks for exactly what the features look
// for. Selectors only one feature uses, and only inside a dialog it opened,
// stay in that feature.

export const SELECTORS = {
    // ELN entry
    entryIdentifier: '[data-autotest-id="entry-identifier"]',
    entryEditor: '[data-slate-editor="true"]',
    reaction: '[data-autotest-id="reaction"]',
    stoichTable: '[data-autotest-id="stoichiometry"]',
    stoichRow: '[data-autotest-id="stoichiometry-row"]',
    tocSidebar: '[data-autotest-id="toc-sidebar-content"]',
    commentsSidebar: '[data-autotest-id="comments-sidebar-header"]',

    // Every vault page: the header's user name.
    username: ".username-text",

    // Run page
    runSummaryLinks: "#run-summary > #run-summary-links",

    // Explore's Rails search results, and the Inventory search's MUI grid.
    searchResultsTables: ["table.search_results_table", "table.NestedExpandableDataTable"],
};
