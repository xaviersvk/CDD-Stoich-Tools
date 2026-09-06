// content/features/ui-fixes/inventory-location-tree/styles.js
//
// All CSS for the collapsed location tree. Kept apart from the view so the view
// file stays about behaviour. Injected once per page.
//
// Two things here are load-bearing rather than decorative:
//   - `.cdd-loc-source-hidden` hides CDD's own <ul> WITHOUT display:none. The
//     list must stay laid out and hit-testable, because selecting a location
//     means clicking the original <li> and letting CDD's own React write the id.
//     display:none would take the option out of the tree we depend on.
//   - the panel is taller than CDD's 320px, which showed nine rows of a 425-row
//     list. With one level at a time there is far less to show, so the height is
//     spent on seeing a whole branch at once instead of scrolling.

let injected = false;

export function injectLocationTreeStyles() {
    if (injected) return;
    injected = true;

    const style = document.createElement("style");
    style.id = "cdd-inventory-location-tree-style";

    style.textContent = `
    /* ===== CDD'S OWN LIST: PRESENT, HIT-TESTABLE, INVISIBLE ===== */
    ul.MuiAutocomplete-listbox.cdd-loc-source-hidden {
        position: absolute !important;
        width: 1px !important;
        height: 1px !important;
        padding: 0 !important;
        margin: -1px !important;
        overflow: hidden !important;
        clip: rect(0 0 0 0) !important;
        white-space: nowrap !important;
    }

    /* ===== PANEL ===== */
    .cdd-loc-tree {
        font-size: 13px;
        line-height: 1.35;
        color: rgba(0, 0, 0, 0.87);
    }

    /* Only the list scrolls, so the search row stays put while you walk the tree. */
    .cdd-loc-list {
        max-height: 380px;
        overflow-y: auto;
        overflow-x: hidden;
        padding: 4px 0;
    }

    /* ===== SEARCH ROW ===== */
    .cdd-loc-search {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 8px 10px;
        border-bottom: 1px solid rgba(0, 0, 0, 0.1);
        cursor: default;
    }

    .cdd-loc-search-icon {
        flex: 0 0 auto;
        width: 14px;
        height: 14px;
        color: rgba(0, 0, 0, 0.45);
    }

    .cdd-loc-search-text {
        flex: 1 1 auto;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .cdd-loc-search-text.cdd-loc-placeholder {
        color: rgba(0, 0, 0, 0.45);
    }

    .cdd-loc-clear {
        flex: 0 0 auto;
        width: 18px;
        height: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 0;
        border-radius: 50%;
        background: rgba(0, 0, 0, 0.08);
        color: rgba(0, 0, 0, 0.6);
        font-size: 14px;
        line-height: 1;
        padding: 0;
        cursor: pointer;
    }

    .cdd-loc-clear:hover {
        background: rgba(0, 0, 0, 0.16);
        color: rgba(0, 0, 0, 0.85);
    }

    /* ===== ROW ===== */
    .cdd-loc-row {
        display: flex;
        align-items: center;
        gap: 2px;
        min-height: 28px;
        padding-right: 10px;
        cursor: pointer;
        user-select: none;
    }

    .cdd-loc-row:hover {
        background: rgba(0, 119, 204, 0.07);
    }

    /* Keyboard cursor: an outline, so it reads apart from hover and selection. */
    .cdd-loc-row.cdd-loc-cursor {
        background: rgba(0, 119, 204, 0.12);
        box-shadow: inset 2px 0 0 #0077cc;
    }

    .cdd-loc-row.cdd-loc-current .cdd-loc-label {
        color: #0077cc;
    }

    /* One text colour throughout. Weight, not colour, says whether a row
       leads further: a branch is bold, a leaf is not. Colour is kept for the
       one thing colour should mean here - which location is currently set. */
    .cdd-loc-row.cdd-loc-branch .cdd-loc-label {
        font-weight: 600;
    }

    /* ===== CARET ===== */
    .cdd-loc-caret {
        flex: 0 0 auto;
        width: 18px;
        height: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 0;
        background: none;
        padding: 0;
        cursor: pointer;
        color: rgba(0, 0, 0, 0.5);
        font-size: 10px;
        line-height: 1;
        transition: transform 0.12s ease;
    }

    .cdd-loc-caret:hover {
        color: #0077cc;
    }

    .cdd-loc-caret.cdd-loc-open {
        transform: rotate(90deg);
    }

    /* A leaf keeps the caret's width so labels down a branch stay aligned. */
    .cdd-loc-caret-spacer {
        flex: 0 0 auto;
        width: 18px;
    }

    /* ===== LABEL ===== */
    .cdd-loc-label {
        flex: 1 1 auto;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }


    /* ===== COUNT ===== */
    .cdd-loc-count {
        flex: 0 0 auto;
        margin-left: 8px;
        font-size: 11px;
        color: rgba(0, 0, 0, 0.4);
        font-variant-numeric: tabular-nums;
    }

    /* ===== SEARCH RESULTS (flat) ===== */
    .cdd-loc-result {
        display: block;
        padding: 5px 12px;
    }

    .cdd-loc-result .cdd-loc-leaf {
        display: block;
        font-weight: 600;
    }

    .cdd-loc-result .cdd-loc-path {
        display: block;
        font-size: 11px;
        color: rgba(0, 0, 0, 0.5);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .cdd-loc-result mark {
        background: rgba(255, 213, 79, 0.6);
        color: inherit;
        padding: 0;
    }

    /* ===== NOTES ===== */
    .cdd-loc-note {
        padding: 8px 12px;
        font-size: 12px;
        color: rgba(0, 0, 0, 0.5);
    }
    `;

    document.head.appendChild(style);
}
