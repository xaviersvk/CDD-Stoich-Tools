// content/features/multi-position-sample-create/styles.js
//
// CSS for the multi-position feature:
//   - the action bar (counter + "Create N Samples" + Clear) inserted into the
//     Create Sample dialog footer, above Cancel/Save, and
//   - the floating results panel that survives the dialog closing on native Save.
// One <style>, injected once.

const STYLE_ID = "cdd-mp-style";

export function injectMultiPositionStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
    /* ---------- action bar (inside the Create Sample dialog) ---------- */
    .cdd-mp-panel {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
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
        padding: 6px 14px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        border: 1px solid #0a62e6;
        background: #0a62e6;
        color: #fff;
    }
    .cdd-mp-btn:hover:not([disabled]) {
        background: #0950bd;
        border-color: #0950bd;
    }
    .cdd-mp-btn[disabled] {
        opacity: 0.45;
        cursor: default;
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
    .cdd-mp-clear[disabled] {
        opacity: 0.45;
        cursor: default;
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

    /* ---------- floating results panel (independent of the dialog) ---------- */
    .cdd-mp-float {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 2147483600;
        width: 320px;
        max-height: 70vh;
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
        background: #fff;
        border: 1px solid rgba(0, 0, 0, 0.18);
        border-radius: 8px;
        box-shadow: 0 8px 28px rgba(0, 0, 0, 0.22);
        font-size: 13px;
        color: #1a1a1a;
        overflow: hidden;
    }
    .cdd-mp-float__header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 9px 12px;
        background: #0a62e6;
        color: #fff;
    }
    .cdd-mp-float__title {
        font-weight: 600;
        flex: 1 1 auto;
    }
    .cdd-mp-float__progress {
        font-variant-numeric: tabular-nums;
        font-size: 12px;
        opacity: 0.92;
    }
    .cdd-mp-float__close {
        border: none;
        background: none;
        color: #fff;
        font-size: 18px;
        line-height: 1;
        cursor: pointer;
        padding: 0 2px;
        opacity: 0.85;
    }
    .cdd-mp-float__close:hover { opacity: 1; }
    .cdd-mp-float__status {
        padding: 8px 12px 2px;
        font-size: 12px;
        min-height: 16px;
    }
    .cdd-mp-float--busy .cdd-mp-float__status::after {
        content: " …";
    }
    .cdd-mp-float__error {
        margin: 4px 12px 0;
        padding: 6px 8px;
        border-radius: 4px;
        background: rgba(176, 0, 32, 0.08);
        color: #b00020;
        font-size: 12px;
    }
    .cdd-mp-float__rows {
        margin-top: 6px;
        padding: 0 6px 4px;
        overflow-y: auto;
        flex: 1 1 auto;
    }
    .cdd-mp-float__row {
        display: flex;
        align-items: baseline;
        gap: 7px;
        padding: 3px 6px;
        border-radius: 4px;
        font-size: 12px;
    }
    .cdd-mp-float__row.cdd-mp-ok { background: rgba(22, 130, 60, 0.07); }
    .cdd-mp-float__row.cdd-mp-err { background: rgba(176, 0, 32, 0.07); }
    .cdd-mp-float__mark {
        font-weight: 700;
        width: 12px;
        flex: 0 0 auto;
    }
    .cdd-mp-ok .cdd-mp-float__mark { color: #16823c; }
    .cdd-mp-err .cdd-mp-float__mark { color: #b00020; }
    .cdd-mp-float__pos {
        font-weight: 600;
        flex: 0 0 auto;
        font-variant-numeric: tabular-nums;
    }
    .cdd-mp-float__label {
        flex: 1 1 auto;
        opacity: 0.85;
        word-break: break-word;
    }
    .cdd-mp-float__footer:empty { display: none; }
    .cdd-mp-float__footer {
        padding: 8px 12px;
        border-top: 1px solid rgba(0, 0, 0, 0.1);
    }
    .cdd-mp-float__retry {
        border-radius: 4px;
        padding: 6px 12px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        border: 1px solid #b26a00;
        background: #f59e0b;
        color: #1a1a1a;
    }
    .cdd-mp-float__retry:hover { background: #e08e08; }
    `;

    document.head.appendChild(style);
}
