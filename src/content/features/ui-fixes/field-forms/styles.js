// content/features/ui-fixes/field-forms/styles.js
//
// The small (i) after a field's name and the bubble it opens. The (i) is red
// when the field is in no registration form. The bubble is one element on
// <body>, position: fixed — a table wrapper that scrolls would clip anything
// positioned inside the cell. Injected once per page.

let injected = false;

export function injectFieldFormsStyles() {
    if (injected) return;
    injected = true;

    const style = document.createElement("style");
    style.id = "cdd-field-forms-style";
    style.textContent = `
    .cdd-field-forms {
        display: inline-block;
        box-sizing: border-box;
        width: 14px;
        height: 14px;
        margin-left: 6px;
        border: 1px solid currentColor;
        border-radius: 50%;
        font: italic 600 10px/12px Georgia, serif;
        text-align: center;
        vertical-align: 1px;
        color: rgba(0, 0, 0, 0.45);
        cursor: default;
        user-select: none;
    }
    .cdd-field-forms:hover,
    .cdd-field-forms:focus { color: #1565c0; outline: none; }
    .cdd-field-forms--warn,
    .cdd-field-forms--warn:hover,
    .cdd-field-forms--warn:focus { color: #b3261e; }

    .cdd-field-forms-bubble {
        position: fixed;
        z-index: 2000;
        max-width: 360px;
        max-height: 320px;
        overflow-y: auto;
        padding: 8px 10px;
        border: 1px solid rgba(0, 0, 0, 0.12);
        border-radius: 4px;
        background: #fff;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        font-size: 12px;
        line-height: 1.5;
        color: rgba(0, 0, 0, 0.87);
        pointer-events: none;
    }
    .cdd-field-forms-bubble[hidden] { display: none; }
    .cdd-field-forms-heading { font-weight: 600; }
    .cdd-field-forms-heading--warn { color: #b3261e; }
    .cdd-field-forms-note { color: rgba(0, 0, 0, 0.5); }
    `;
    (document.head || document.documentElement).appendChild(style);
}
