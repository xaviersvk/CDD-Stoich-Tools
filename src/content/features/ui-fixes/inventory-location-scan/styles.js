// content/features/ui-fixes/inventory-location-scan/styles.js
//
// All CSS for the scan panel, kept apart from the view so the view file stays
// about behaviour. Injected once per page.
//
// The panel is positioned ABSOLUTE over CDD's right pane rather than replacing
// it. CDD's name and grid inputs have to stay mounted, because creating a box
// means writing into them — hiding that pane would be asking React to keep
// rendering something we told the browser to stop drawing.

let injected = false;

export function injectScanStyles() {
    if (injected) return;
    injected = true;

    const style = document.createElement("style");
    style.id = "cdd-inventory-location-scan-style";

    style.textContent = `
    /* ===== THE FOOTER BUTTON ===== */
    .cdd-scan-open {
        appearance: none;
        border: 0;
        background: none;
        margin: 0 18px 0 0;
        padding: 0;
        font: inherit;
        font-size: 13px;
        color: #1565c0;
        cursor: pointer;
    }
    .cdd-scan-open:hover { text-decoration: underline; }
    .cdd-scan-open[disabled] { color: rgba(0, 0, 0, 0.38); cursor: default; }

    /* ===== THE PANEL ===== */
    .cdd-scan-panel {
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        z-index: 5;
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 16px 20px;
        overflow-y: auto;
        background: #fff;
        font-size: 13px;
        line-height: 1.4;
        color: rgba(0, 0, 0, 0.87);
    }

    .cdd-scan-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
        padding-bottom: 10px;
        border-bottom: 1px solid rgba(0, 0, 0, 0.12);
    }
    .cdd-scan-title { font-size: 15px; font-weight: 600; }
    .cdd-scan-note { color: rgba(0, 0, 0, 0.6); }

    .cdd-scan-controls {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px 16px;
    }
    .cdd-scan-controls label {
        display: inline-flex;
        align-items: center;
        gap: 6px;
    }
    .cdd-scan-controls select,
    .cdd-scan-controls input[type="number"] {
        font: inherit;
        padding: 4px 6px;
        border: 1px solid rgba(0, 0, 0, 0.3);
        border-radius: 4px;
        background: #fff;
    }
    .cdd-scan-controls select { max-width: 320px; }
    .cdd-scan-controls input[type="number"] { width: 60px; }

    /* The scan box is the one thing on this panel that matters, so it is the
       one thing that looks like it. */
    .cdd-scan-input {
        font: inherit;
        font-size: 15px;
        width: 100%;
        padding: 9px 11px;
        border: 2px solid #1565c0;
        border-radius: 5px;
        background: #fff;
    }
    .cdd-scan-input:disabled { border-color: rgba(0, 0, 0, 0.2); background: #f5f5f5; }

    /* ===== THE LIST ===== */
    .cdd-scan-list {
        flex: 1 1 auto;
        min-height: 80px;
        overflow-y: auto;
        border: 1px solid rgba(0, 0, 0, 0.12);
        border-radius: 4px;
    }
    .cdd-scan-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 5px 10px;
        border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    }
    .cdd-scan-row:last-child { border-bottom: 0; }
    .cdd-scan-ordinal {
        min-width: 22px;
        text-align: right;
        color: rgba(0, 0, 0, 0.45);
        font-variant-numeric: tabular-nums;
    }
    .cdd-scan-name { flex: 1 1 auto; font-weight: 600; }

    /* A shelf is not all one size, so the grid sits on the row. Narrow boxes:
       they hold two digits and must not compete with the code beside them. */
    .cdd-scan-size { display: inline-flex; align-items: center; gap: 4px; }
    .cdd-scan-times { color: rgba(0, 0, 0, 0.45); }
    .cdd-scan-size-input {
        font: inherit;
        width: 46px;
        padding: 2px 4px;
        text-align: center;
        border: 1px solid rgba(0, 0, 0, 0.25);
        border-radius: 3px;
        background: #fff;
    }
    .cdd-scan-why { color: #b3261e; }
    .cdd-scan-row--refused .cdd-scan-name {
        font-weight: 400;
        text-decoration: line-through;
        color: rgba(0, 0, 0, 0.5);
    }
    .cdd-scan-row--created .cdd-scan-name { color: rgba(0, 0, 0, 0.5); }
    .cdd-scan-row--created .cdd-scan-why { color: #2e7d32; }
    .cdd-scan-drop {
        appearance: none;
        border: 0;
        background: none;
        padding: 0 4px;
        font: inherit;
        color: rgba(0, 0, 0, 0.45);
        cursor: pointer;
    }
    .cdd-scan-drop:hover { color: #b3261e; }

    .cdd-scan-empty { padding: 14px 12px; margin: 0; color: rgba(0, 0, 0, 0.5); }

    /* ===== FOOT ===== */
    .cdd-scan-foot {
        display: flex;
        align-items: center;
        gap: 14px;
        padding-top: 4px;
    }
    .cdd-scan-create {
        appearance: none;
        border: 0;
        border-radius: 4px;
        padding: 8px 16px;
        font: inherit;
        font-weight: 600;
        color: #fff;
        background: #43a047;
        cursor: pointer;
    }
    .cdd-scan-create[disabled] { background: rgba(0, 0, 0, 0.18); cursor: default; }
    .cdd-scan-close {
        appearance: none;
        border: 0;
        background: none;
        padding: 0;
        font: inherit;
        color: #1565c0;
        cursor: pointer;
    }
    .cdd-scan-status { color: #b3261e; }
    `;

    (document.head || document.documentElement).appendChild(style);
}
