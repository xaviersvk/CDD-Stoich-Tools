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

    /* Sits above .MuiDialogActions-root; blends in as a native dialog section.
       No background or border box — a top divider is the only separator. */
    .cdd-mp-panel {
        display: flex;
        flex-direction: column;
        gap: 6px;
        width: 100%;
        box-sizing: border-box;
        padding: 12px 24px 4px;
        border-top: 1px solid rgba(0, 0, 0, 0.12);
        font-family: inherit;
        font-size: 0.875rem;
    }

    /* "N positions selected" — MUI caption style */
    .cdd-mp-count {
        font-size: 0.75rem;
        line-height: 1.66;
        letter-spacing: 0.03333em;
        color: rgba(0, 0, 0, 0.6);
        user-select: none;
    }

    /* Button row: Clear left, Create N Samples right */
    .cdd-mp-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        flex-wrap: wrap;
    }

    /* Clear — MUI outlined secondary */
    .cdd-mp-clear {
        height: 36px;
        padding: 0 15px;
        font-family: inherit;
        font-size: 0.875rem;
        font-weight: 500;
        letter-spacing: 0.02857em;
        border-radius: 4px;
        border: 1px solid rgba(0, 0, 0, 0.23);
        background: transparent;
        color: rgba(0, 0, 0, 0.87);
        cursor: pointer;
        transition: background-color 150ms cubic-bezier(0.4, 0, 0.2, 1);
    }
    .cdd-mp-clear:hover:not([disabled]) {
        background: rgba(0, 0, 0, 0.04);
        border-color: rgba(0, 0, 0, 0.87);
    }
    .cdd-mp-clear[disabled] {
        border-color: rgba(0, 0, 0, 0.12);
        color: rgba(0, 0, 0, 0.26);
        cursor: default;
    }

    /* Create N Samples — MUI contained primary */
    .cdd-mp-btn {
        height: 36px;
        padding: 0 16px;
        font-family: inherit;
        font-size: 0.875rem;
        font-weight: 500;
        letter-spacing: 0.02857em;
        border-radius: 4px;
        border: none;
        background: #1565c0;
        color: #fff;
        cursor: pointer;
        box-shadow: 0 3px 1px -2px rgba(0,0,0,.2),
                    0 2px 2px 0   rgba(0,0,0,.14),
                    0 1px 5px 0   rgba(0,0,0,.12);
        transition: background-color 150ms cubic-bezier(0.4, 0, 0.2, 1),
                    box-shadow     150ms cubic-bezier(0.4, 0, 0.2, 1);
    }
    .cdd-mp-btn:hover:not([disabled]) {
        background: #0d47a1;
        box-shadow: 0 2px 4px -1px rgba(0,0,0,.2),
                    0 4px 5px  0   rgba(0,0,0,.14),
                    0 1px 10px 0   rgba(0,0,0,.12);
    }
    .cdd-mp-btn[disabled] {
        background: rgba(0, 0, 0, 0.12);
        color: rgba(0, 0, 0, 0.26);
        box-shadow: none;
        cursor: default;
    }

    /* Error/status line — shown only when needed */
    .cdd-mp-result {
        font-size: 0.75rem;
        line-height: 1.66;
        min-height: 0;
    }
    .cdd-mp-result:empty { display: none; }
    .cdd-mp-result.cdd-mp-error {
        color: #c62828;
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
