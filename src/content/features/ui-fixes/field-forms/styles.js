// content/features/ui-fixes/field-forms/styles.js
//
// The muted "Forms: …" / "In N of M forms" / "In no registration form" line
// this feature appends under a field's name. Same injected-once-per-page
// pattern as field-clipboard/styles.js.

let injected = false;

export function injectFieldFormsStyles() {
    if (injected) return;
    injected = true;

    const style = document.createElement("style");
    style.id = "cdd-field-forms-style";
    style.textContent = `
    .cdd-field-forms {
        display: block;
        margin-top: 2px;
        font-size: 12px;
        line-height: 1.3;
        font-weight: 400;
        color: rgba(0, 0, 0, 0.5);
    }
    .cdd-field-forms--warn { color: #b3261e; }
    `;
    (document.head || document.documentElement).appendChild(style);
}
