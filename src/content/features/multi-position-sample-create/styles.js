// content/features/multi-position-sample-create/styles.js
//
// CSS injection only for the multi-position panel (dry-run + guarded live-test
// buttons + result line). The live-test button is visually distinct (amber) to
// signal that it writes a real record. One <style>, injected once.

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
        margin: 6px 0 10px;
        font-size: 13px;
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
