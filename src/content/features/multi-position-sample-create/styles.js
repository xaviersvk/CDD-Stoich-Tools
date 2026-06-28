// content/features/multi-position-sample-create/styles.js
//
// CSS injection only for the multi-position action bar (counter + Dry-run +
// guarded Live-test + result line), inserted into the Create Sample dialog
// footer (above Cancel/Save). The live-test button is amber to signal it writes
// a real record. One <style>, injected once.

const STYLE_ID = "cdd-mp-style";

export function injectMultiPositionStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
    .cdd-mp-panel {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        /* Sit as a full-width strip above the dialog's action row. */
        flex-basis: 100%;
        width: 100%;
        box-sizing: border-box;
        margin: 4px 0 8px;
        padding: 8px 10px;
        border: 1px solid rgba(10, 98, 230, 0.35);
        border-radius: 6px;
        background: rgba(10, 98, 230, 0.06);
        font-size: 13px;
    }
    .cdd-mp-count {
        font-weight: 600;
        margin-right: 4px;
    }
    .cdd-mp-btn {
        border-radius: 4px;
        padding: 5px 11px;
        font-size: 13px;
        cursor: pointer;
        border: 1px solid #0a62e6;
        background: #0a62e6;
        color: #fff;
    }
    .cdd-mp-btn[disabled] {
        opacity: 0.45;
        cursor: default;
    }
    /* Live test writes a record — amber to set it apart from the safe dry-run. */
    .cdd-mp-live {
        border-color: #b26a00;
        background: #f59e0b;
        color: #1a1a1a;
    }
    .cdd-mp-clear {
        border-radius: 4px;
        padding: 5px 9px;
        font-size: 12px;
        cursor: pointer;
        border: 1px solid #888;
        background: none;
        color: #444;
    }
    .cdd-mp-result {
        flex-basis: 100%;
        font-size: 12px;
        opacity: 0.9;
    }
    .cdd-mp-result.cdd-mp-error {
        color: #b00020;
        opacity: 1;
    }
    `;

    document.head.appendChild(style);
}
