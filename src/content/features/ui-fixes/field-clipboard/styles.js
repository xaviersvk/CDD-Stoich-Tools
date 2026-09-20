// content/features/ui-fixes/field-clipboard/styles.js
//
// CSS for the Copy / Paste bar and the preview card. Injected once per page.
// The buttons read as CDD's own blue links; the card is the same white
// bordered box the Scan racks list uses, so the two features look related.

let injected = false;

export function injectFieldClipboardStyles() {
    if (injected) return;
    injected = true;

    const style = document.createElement("style");
    style.id = "cdd-field-clipboard-style";
    style.textContent = `
    /* Edit mode puts an invisible error box (opacity 0, 42px) over the top
       of the table; without a stacking context it swallows the clicks. */
    .cdd-fc-bar {
        position: relative;
        z-index: 1;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px 14px;
        margin: 0 0 10px;
        font-size: 13px;
        line-height: 1.4;
        color: rgba(0, 0, 0, 0.87);
    }
    .cdd-fc-button {
        appearance: none;
        border: 0;
        background: none;
        padding: 0;
        font: inherit;
        color: #1565c0;
        cursor: pointer;
    }
    .cdd-fc-button:hover { text-decoration: underline; }
    .cdd-fc-button[disabled] { color: rgba(0, 0, 0, 0.38); cursor: default; text-decoration: none; }
    .cdd-fc-status { color: #b3261e; }
    /* The form table's Duplicate link, in a cell of its own. The cells around
       it are MUI's, padded 16px; ours has to match or the link sits glued to
       the date beside it. */
    .cdd-form-duplicate-cell {
        padding: 16px;
        text-align: right;
        white-space: nowrap;
        width: 1%;
        font-size: 13px;
        border-bottom: 1px solid rgba(224, 224, 224, 1);
    }
    thead .cdd-form-duplicate-cell { padding: 16px; }
    .cdd-form-duplicate.is-busy { color: rgba(0, 0, 0, 0.5); cursor: default; }
    .cdd-form-duplicate.is-failed { color: #b3261e; }

    /* ===== THE CARD ===== */
    .cdd-fc-card {
        flex: 1 0 100%;
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 12px 14px;
        border: 1px solid rgba(0, 0, 0, 0.12);
        border-radius: 4px;
        background: #fff;
    }
    .cdd-fc-card[hidden] { display: none; }
    .cdd-fc-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
        padding-bottom: 8px;
        border-bottom: 1px solid rgba(0, 0, 0, 0.12);
    }
    .cdd-fc-title { font-size: 15px; font-weight: 600; }
    .cdd-fc-note { color: rgba(0, 0, 0, 0.6); }

    .cdd-fc-list {
        max-height: 360px;
        overflow-y: auto;
        border: 1px solid rgba(0, 0, 0, 0.12);
        border-radius: 4px;
    }
    .cdd-fc-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 5px 10px;
        border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    }
    .cdd-fc-row:last-child { border-bottom: 0; }
    .cdd-fc-name { flex: 1 1 auto; font-weight: 600; }
    /* The form clipboard's editable name: a copy beside its original needs
       one of its own, and this is where it is typed. */
    .cdd-fc-rename {
        flex: 1 1 auto;
        min-width: 160px;
        font: inherit;
        font-weight: 600;
        padding: 3px 6px;
        border: 1px solid rgba(0, 0, 0, 0.25);
        border-radius: 3px;
        background: #fff;
    }
    .cdd-fc-rename:disabled { color: rgba(0, 0, 0, 0.5); background: #f5f5f5; }
    .cdd-fc-row--skip .cdd-fc-rename { text-decoration: line-through; font-weight: 400; }
    .cdd-fc-type { min-width: 70px; color: rgba(0, 0, 0, 0.6); }
    .cdd-fc-detail { color: rgba(0, 0, 0, 0.6); }
    .cdd-fc-why { color: #b3261e; }
    .cdd-fc-row--skip .cdd-fc-name {
        font-weight: 400;
        text-decoration: line-through;
        color: rgba(0, 0, 0, 0.5);
    }
    .cdd-fc-row--done .cdd-fc-name { color: rgba(0, 0, 0, 0.5); }
    .cdd-fc-row--done .cdd-fc-detail,
    .cdd-fc-row--done .cdd-fc-why { color: #2e7d32; }

    /* "Add fields to forms": two lists in one card, a filter over the first,
       the row order beside each ticked field, a Pick List's default. */
    .cdd-fc-section {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        font-weight: 600;
    }
    .cdd-fc-filter,
    .cdd-fc-select {
        font: inherit;
        padding: 3px 6px;
        border: 1px solid rgba(0, 0, 0, 0.25);
        border-radius: 3px;
        background: #fff;
    }
    .cdd-fc-filter { font-weight: 400; width: 180px; }
    .cdd-fc-order { min-width: 14px; color: rgba(0, 0, 0, 0.6); text-align: right; }
    .cdd-fc-row[hidden] { display: none; }

    .cdd-fc-foot { display: flex; align-items: center; gap: 14px; }
    .cdd-fc-add {
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
    .cdd-fc-add[disabled] { background: rgba(0, 0, 0, 0.2); cursor: default; }
    .cdd-fc-cancel {
        appearance: none;
        border: 0;
        background: none;
        padding: 0;
        font: inherit;
        color: #1565c0;
        cursor: pointer;
    }
    .cdd-fc-cancel[disabled] { color: rgba(0, 0, 0, 0.38); cursor: default; }
    `;
    (document.head || document.documentElement).appendChild(style);
}
