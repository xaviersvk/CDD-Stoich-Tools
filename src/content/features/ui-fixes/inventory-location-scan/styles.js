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
    /* ===== A BOX NAME ANOTHER BOX ALREADY CARRIES ===== */
    /* Colour only: weight is for structure, this is state. */
    li[role="treeitem"][data-cdd-dup] > .MuiTreeItem-content .MuiTreeItem-label {
        color: #e65100;
    }

    /* ===== THE FILTER ABOVE THE TREE ===== */
    .cdd-tree-filter {
        display: block;
        box-sizing: border-box;
        width: calc(100% - 16px);
        margin: 0 8px 8px;
        padding: 6px 9px;
        font: inherit;
        font-size: 13px;
        border: 1px solid rgba(0, 0, 0, 0.3);
        border-radius: 4px;
        background: #fff;
    }
    .cdd-tree-filter:focus { outline: none; border-color: #1565c0; }
    /* Pick Location: the tree scrolls inside its panel; the box stays put. */
    .location-picker-dialog-paper .cdd-tree-filter {
        position: sticky;
        top: 0;
        z-index: 2;
        width: 100%;
        margin: 0 0 8px;
    }
    li[role="treeitem"][data-cdd-filtered] { display: none; }

    /* ===== THE FOOTER BUTTONS: Scan racks, Copy tree ===== */
    .cdd-scan-open,
    .cdd-tree-copy {
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
    .cdd-scan-open:hover,
    .cdd-tree-copy:hover { text-decoration: underline; }
    .cdd-scan-open[disabled],
    .cdd-tree-copy[disabled] { color: rgba(0, 0, 0, 0.38); cursor: default; }

    /* ===== MERGE VAULTS: the footer switch ===== */
    .cdd-merge-switch {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin: 0 18px 0 0;
        font-size: 13px;
        color: #1565c0;
        cursor: pointer;
        user-select: none;
    }
    .cdd-merge-switch input { position: absolute; opacity: 0; width: 0; height: 0; }
    .cdd-merge-track {
        position: relative;
        width: 26px;
        height: 14px;
        border-radius: 7px;
        background: rgba(0, 0, 0, 0.28);
        transition: background 0.15s;
    }
    .cdd-merge-track::after {
        content: "";
        position: absolute;
        top: 2px;
        left: 2px;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: #fff;
        transition: transform 0.15s;
    }
    .cdd-merge-switch input:checked + .cdd-merge-track { background: #1565c0; }
    .cdd-merge-switch input:checked + .cdd-merge-track::after { transform: translateX(12px); }
    .cdd-merge-switch input:focus-visible + .cdd-merge-track { outline: 2px solid #1565c0; outline-offset: 2px; }

    /* ===== MERGE VAULTS: the tree in place of CDD's ===== */
    /* CDD's tree is hidden, not removed: unsaved edits in it survive. */
    .left-column[data-cdd-merged] > :not(.cdd-merged-tree) { display: none !important; }
    .cdd-merged-tree {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
        font-size: 13px;
        color: rgba(0, 0, 0, 0.87);
    }
    .cdd-mt-filter {
        box-sizing: border-box;
        width: calc(100% - 16px);
        margin: 0 8px 8px;
        padding: 6px 9px;
        font: inherit;
        border: 1px solid rgba(0, 0, 0, 0.3);
        border-radius: 4px;
        background: #fff;
    }
    .cdd-mt-filter:focus { outline: none; border-color: #1565c0; }
    .cdd-mt-legend {
        display: flex;
        flex-wrap: wrap;
        gap: 4px 12px;
        margin: 0 8px 6px;
        font-size: 12px;
    }
    .cdd-mt-legend-item { display: inline-flex; align-items: center; gap: 5px; }
    .cdd-mt-legend-failed { color: #b71c1c; }
    .cdd-mt-legend-empty { color: rgba(0, 0, 0, 0.45); }
    .cdd-mt-note {
        margin: 0 8px 6px;
        padding-bottom: 6px;
        border-bottom: 1px solid rgba(0, 0, 0, 0.12);
        font-size: 12px;
        color: rgba(0, 0, 0, 0.55);
    }
    .cdd-mt-tree { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding-bottom: 8px; }
    .cdd-mt-row {
        display: flex;
        align-items: center;
        gap: 5px;
        min-height: 24px;
        padding-right: 8px;
        cursor: default;
        white-space: nowrap;
    }
    .cdd-mt-row:hover { background: rgba(0, 0, 0, 0.04); }
    .cdd-mt-chevron { flex: 0 0 12px; text-align: center; color: rgba(0, 0, 0, 0.54); cursor: pointer; }
    .cdd-mt-icon { display: inline-flex; color: rgba(0, 0, 0, 0.54); }
    .cdd-mt-label { overflow: hidden; text-overflow: ellipsis; }
    .cdd-mt-match .cdd-mt-label { font-weight: 600; }
    .cdd-mt-count {
        padding: 0 5px;
        border-radius: 8px;
        background: rgba(0, 0, 0, 0.08);
        font-size: 11px;
        color: rgba(0, 0, 0, 0.6);
    }
    .cdd-mt-dots { display: inline-flex; gap: 3px; margin-left: 2px; padding: 4px 2px; cursor: help; }
    .cdd-mt-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; flex: 0 0 7px; }
    .cdd-mt-status { padding: 8px; color: rgba(0, 0, 0, 0.55); }
    .cdd-mt-legend-current { font-weight: 600; }
    /* Created here by Create here, not saved yet: a ring, not a dot. */
    .cdd-mt-dot-new { box-sizing: border-box; background: transparent; border: 1.5px solid; }
    .cdd-mt-message { margin: 0 8px 6px; font-size: 12px; color: #2e7d32; }
    .cdd-mt-message[hidden] { display: none; }
    .cdd-mt-message-error { color: #b71c1c; }
    /* One action per row, shown on hover so the tree stays quiet. */
    .cdd-mt-action {
        appearance: none;
        margin-left: auto;
        padding: 1px 7px;
        border: 1px solid #1565c0;
        border-radius: 10px;
        background: #fff;
        font: inherit;
        font-size: 11px;
        color: #1565c0;
        cursor: pointer;
        visibility: hidden;
    }
    .cdd-mt-action[data-action="create"] { border-color: #2e7d32; color: #2e7d32; }
    .cdd-mt-row:hover .cdd-mt-action,
    .cdd-mt-action:focus-visible { visibility: visible; }
    .cdd-mt-action:hover { background: #1565c0; color: #fff; }
    .cdd-mt-action[data-action="create"]:hover { background: #2e7d32; color: #fff; }
    .cdd-mt-action[disabled] { visibility: hidden !important; }

    /* ===== THE PANEL ===== */
    .cdd-scan-panel {
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        /* Above MUI's floating field labels, which are position:absolute with
           z-index 1000. .MuiDialogContent-root is z-index:auto and so opens no
           stacking context of its own, which left the panel competing with
           those labels directly: at 5 it covered the INPUTS and the labels
           printed straight through the header — "Scan racksName", "# columns",
           "# rows". The dialog root is z-index 1300 and IS a stacking context,
           so nothing here escapes the dialog. */
        z-index: 1200;
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

    /* The i: a small ring beside the title. Pressed, it shows the manual
       below the controls; the panel is the manual's home, not a new tab. */
    .cdd-scan-help-toggle {
        appearance: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        margin-left: 8px;
        padding: 0;
        border: 1.5px solid #1565c0;
        border-radius: 50%;
        background: #fff;
        color: #1565c0;
        font: inherit;
        font-size: 12px;
        font-weight: 700;
        font-style: italic;
        line-height: 1;
        vertical-align: 2px;
        cursor: pointer;
    }
    .cdd-scan-help-toggle:hover,
    .cdd-scan-help-toggle--on { background: #1565c0; color: #fff; }

    .cdd-scan-help {
        display: grid;
        grid-template-columns: max-content 1fr;
        gap: 6px 12px;
        padding: 10px 12px;
        border: 1px solid rgba(0, 0, 0, 0.12);
        border-radius: 4px;
        background: #f7f9fc;
        font-size: 12.5px;
        line-height: 1.45;
    }
    .cdd-scan-help[hidden] { display: none; }
    .cdd-scan-help-item { display: contents; }
    .cdd-scan-help-item b { font-weight: 600; white-space: nowrap; }
    .cdd-scan-help-link { grid-column: 2; color: #1565c0; }
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
    /* The grid pair and the capacity field take turns; the attribute must
       win over the inline-flex above. */
    .cdd-scan-controls label[hidden] { display: none; }
    .cdd-scan-controls select,
    .cdd-scan-controls input[type="number"] {
        font: inherit;
        padding: 4px 6px;
        border: 1px solid rgba(0, 0, 0, 0.3);
        border-radius: 4px;
        background: #fff;
    }
    .cdd-scan-controls select { max-width: 320px; }
    .cdd-scan-hint { color: rgba(0, 0, 0, 0.5); }

    /* The dropdown says which location in words; this says which ROW, so a
       click on the tree has something to answer it. Outline rather than a
       background: CDD paints its own selection there and the two must not
       fight — a click on a BOX targets the location above it, and then the
       two marks are deliberately on different rows. */
    li[role="treeitem"].cdd-scan-target > .MuiTreeItem-content {
        outline: 2px solid #1565c0;
        outline-offset: -2px;
        border-radius: 3px;
    }
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
    /* The path a row will build is context, the box is the thing. */
    .cdd-scan-path { color: rgba(0, 0, 0, 0.5); font-weight: 400; margin-right: 5px; }
    .cdd-scan-kind { color: rgba(0, 0, 0, 0.5); font-style: italic; }
    .cdd-scan-preset { max-width: 170px; }

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
    .cdd-scan-size-input--wide { width: 64px; }
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
