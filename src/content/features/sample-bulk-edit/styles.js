// content/features/sample-bulk-edit/styles.js — one <style>, injected once.

const STYLE_ID = "cdd-sbe-style";

export function injectBulkEditStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
    .cdd-sbe-link { margin-left: 16px; }

    .cdd-sbe-backdrop { position: fixed; inset: 0; z-index: 2147483000;
        background: rgba(0, 0, 0, 0.35); display: flex; align-items: flex-start;
        justify-content: center; padding: 48px 16px; box-sizing: border-box; }
    .cdd-sbe { background: #fff; color: rgba(0, 0, 0, 0.87); border-radius: 6px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3); width: min(880px, 100%);
        max-height: calc(100vh - 96px); display: flex; flex-direction: column;
        font: 13px/1.4 inherit; }
    .cdd-sbe__head { display: flex; align-items: center; padding: 12px 16px;
        border-bottom: 1px solid rgba(0, 0, 0, 0.12); }
    .cdd-sbe__title { font-size: 16px; font-weight: 600; flex: 1; }
    .cdd-sbe__x { border: 0; background: none; font-size: 20px; cursor: pointer; line-height: 1; }

    .cdd-sbe__controls { display: flex; flex-wrap: wrap; gap: 12px; align-items: center;
        padding: 12px 16px; }
    .cdd-sbe__controls label { display: inline-flex; align-items: center; gap: 6px; }
    .cdd-sbe__controls select, .cdd-sbe__controls input[type="text"],
    .cdd-sbe__controls input[type="number"], .cdd-sbe__controls input[type="date"] {
        font: inherit; padding: 3px 6px; min-width: 140px; }
    .cdd-sbe__label { font-weight: 600; }

    .cdd-sbe__picks { display: flex; flex-wrap: wrap; gap: 10px; align-items: center;
        padding: 0 16px 8px; }
    .cdd-sbe__picks button { font: inherit; padding: 2px 8px; cursor: pointer; }
    .cdd-sbe__spacer { flex: 1; }

    .cdd-sbe__body { overflow: auto; border-top: 1px solid rgba(0, 0, 0, 0.12);
        border-bottom: 1px solid rgba(0, 0, 0, 0.12); }
    .cdd-sbe table { border-collapse: collapse; width: 100%; }
    .cdd-sbe th, .cdd-sbe td { text-align: left; padding: 4px 8px;
        border-bottom: 1px solid rgba(0, 0, 0, 0.06); vertical-align: top; }
    .cdd-sbe th { position: sticky; top: 0; background: #fafafa; font-weight: 600; }
    .cdd-sbe__depleted td { text-decoration: line-through; }
    .cdd-sbe__depleted td:first-child, .cdd-sbe__depleted td:last-child { text-decoration: none; }
    .cdd-sbe__new { font-weight: 600; }
    .cdd-sbe__same { font-style: italic; }
    .cdd-sbe__ok { color: #2e7d32; font-weight: 600; }
    .cdd-sbe__err { color: #a4262c; }
    .cdd-sbe__msg { padding: 16px; }

    .cdd-sbe__foot { display: flex; align-items: center; gap: 12px; padding: 10px 16px; }
    .cdd-sbe__summary { flex: 1; }
    .cdd-sbe__write { font: inherit; font-weight: 600; padding: 5px 14px; cursor: pointer;
        background: #1976d2; color: #fff; border: 0; border-radius: 4px; }
    .cdd-sbe__write:disabled { background: rgba(0, 0, 0, 0.12); color: rgba(0, 0, 0, 0.5); cursor: default; }
    .cdd-sbe__close { font: inherit; padding: 5px 14px; cursor: pointer; }
    `;
    document.head.appendChild(style);
}
