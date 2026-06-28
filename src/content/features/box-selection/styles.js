// content/features/box-selection/styles.js
//
// CSS injection ONLY for the Box Selection Framework. One <style> tag, injected
// once. We add our own classes to cells and never overwrite CDD's own styling
// beyond a subtle accent, so removing the framework (or CDD restyling) leaves
// the native grid intact.
//
// Class contract (set by overlay.js, styled here):
//   .cdd-box-pos-selectable  - an empty, clickable well (cursor affordance)
//   .cdd-box-pos-occupied    - a filled well: visibly not selectable
//   .cdd-box-pos-selected    - a well currently in the selection set
//   .cdd-box-pos-denied      - brief flash when a blocked well is clicked
//   .cdd-box-selection-bar   - the counter / action bar rendered under the grid
//
// What it must NOT do: no behaviour, no DOM queries. Pure stylesheet.

const STYLE_ID = "cdd-box-selection-style";

export function injectBoxSelectionStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
    /* Empty, selectable well: pointer + faint hover so the user learns it's
       clickable, without fighting CDD's own well colours. */
    .${"cdd-box-pos-selectable"} {
        cursor: pointer !important;
    }
    .cdd-box-pos-selectable:hover {
        outline: 2px solid rgba(0, 119, 204, 0.45) !important;
        outline-offset: -2px;
    }

    /* Occupied well: explicitly not selectable. Subtle, not a full repaint —
       inventory-grid-colors.js may also be tinting these by prefix colour. */
    .cdd-box-pos-occupied {
        cursor: not-allowed !important;
    }

    /* Selected well: clear accent ring + tint so a 12-well selection reads at a
       glance. box-shadow (not background) so it composes with any prefix tint. */
    .cdd-box-pos-selected {
        outline: 2px solid #0a62e6 !important;
        outline-offset: -2px;
        box-shadow: inset 0 0 0 9999px rgba(10, 98, 230, 0.28) !important;
    }

    /* Blocked-click feedback: a short flash, auto-removed by the overlay. */
    .cdd-box-pos-denied {
        animation: cddBoxDeny 0.3s ease;
    }
    @keyframes cddBoxDeny {
        0%, 100% { box-shadow: none; }
        50% { box-shadow: inset 0 0 0 9999px rgba(204, 0, 0, 0.35); }
    }

    /* Counter / action bar under the grid. */
    .cdd-box-selection-bar {
        display: flex;
        align-items: center;
        gap: 10px;
        margin: 8px 0 4px;
        font-size: 13px;
    }
    .cdd-box-selection-bar__count {
        font-weight: 600;
    }
    .cdd-box-selection-bar__action {
        border: 1px solid #0a62e6;
        background: #0a62e6;
        color: #fff;
        border-radius: 4px;
        padding: 4px 10px;
        font-size: 13px;
        cursor: pointer;
    }
    .cdd-box-selection-bar__action[disabled] {
        opacity: 0.5;
        cursor: default;
    }
    .cdd-box-selection-bar__clear {
        background: none;
        border: none;
        color: #0a62e6;
        cursor: pointer;
        text-decoration: underline;
        font-size: 12px;
    }
    `;

    document.head.appendChild(style);
}
