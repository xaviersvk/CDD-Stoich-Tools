// content/features/control-layout/styles.js
//
// One stylesheet for the control-layout toolbar (brush buttons + saved
// layouts). Injected once, on first attach; there is no page CSS to override,
// so nothing here needs !important.
//
// The colours mirror CDD's own legend swatches (positive = red, negative =
// blue, reference = yellow) so an armed brush reads as "this is the thing the
// legend calls positive control".

const STYLE_ID = "cdd-control-layout-tools-style";

export const ROOT_CLASS = "cdd-control-layout-tools";
export const BAR_CLASS = "cdd-clt-bar";
export const LABEL_CLASS = "cdd-clt-label";
export const BUTTON_CLASS = "cdd-clt-button";
export const BRUSH_CLASS = "cdd-clt-brush";
export const ARMED_CLASS = "cdd-clt-armed";
export const SWATCH_CLASS = "cdd-clt-swatch";
export const HINT_CLASS = "cdd-clt-hint";
export const STATUS_CLASS = "cdd-clt-status";
export const SELECT_CLASS = "cdd-clt-select";
export const NAME_INPUT_CLASS = "cdd-clt-name";
export const PAINTING_CLASS = "cdd-clt-painting";

export function injectControlLayoutStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        .${ROOT_CLASS} {
            margin: 6px 0 8px;
            font-size: 12px;
            color: #333;
        }
        .${ROOT_CLASS} .${BAR_CLASS} {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 6px;
            padding: 3px 0;
        }
        /* The rule above is a class selector and therefore beats the UA's
           [hidden] { display: none }, which would leave the "Save as" row (and
           the preset row it replaces) on screen forever — Cancel included.
           Restore the attribute's meaning at matching specificity. */
        .${ROOT_CLASS} .${BAR_CLASS}[hidden] {
            display: none;
        }
        .${ROOT_CLASS} .${LABEL_CLASS} {
            color: #666;
            margin-right: 2px;
        }
        .${ROOT_CLASS} .${BUTTON_CLASS} {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 3px 9px;
            border: 1px solid #c3c3c3;
            border-radius: 3px;
            background: #fff;
            color: #333;
            font-size: 12px;
            line-height: 16px;
            cursor: pointer;
        }
        .${ROOT_CLASS} .${BUTTON_CLASS}:hover {
            background: #f0f4f8;
        }
        .${ROOT_CLASS} .${BUTTON_CLASS}:disabled {
            opacity: .5;
            cursor: default;
            background: #fff;
        }
        .${ROOT_CLASS} .${BRUSH_CLASS}.${ARMED_CLASS} {
            border-color: #4a76b8;
            background: #e6effa;
            box-shadow: inset 0 0 0 1px #4a76b8;
            font-weight: bold;
        }
        .${ROOT_CLASS} .${SWATCH_CLASS} {
            width: 10px;
            height: 10px;
            border: 2px solid #999;
            border-radius: 2px;
            background: #fff;
        }
        .${ROOT_CLASS} .${SWATCH_CLASS}[data-state="+"] { border-color: #e02020; }
        .${ROOT_CLASS} .${SWATCH_CLASS}[data-state="-"] { border-color: #3b73d1; }
        .${ROOT_CLASS} .${SWATCH_CLASS}[data-state="#"] { border-color: #f0c000; }
        .${ROOT_CLASS} .${SWATCH_CLASS}[data-state=""] {
            border-color: #bbb;
            border-style: dashed;
        }
        .${ROOT_CLASS} .${HINT_CLASS},
        .${ROOT_CLASS} .${STATUS_CLASS} {
            color: #777;
            font-style: italic;
        }
        .${ROOT_CLASS} .${STATUS_CLASS} {
            font-style: normal;
            color: #2c6e2c;
        }
        .${ROOT_CLASS} .${SELECT_CLASS} {
            min-width: 190px;
            max-width: 280px;
            font-size: 12px;
            padding: 2px;
        }
        .${ROOT_CLASS} .${NAME_INPUT_CLASS} {
            width: 200px;
            font-size: 12px;
            padding: 2px 4px;
            border: 1px solid #c3c3c3;
            border-radius: 3px;
        }

        /* While a brush is armed the grid is a painting surface: crosshair
           cursor, and no text selection so a drag across wells does not turn
           into a text drag. */
        table.plateLayout.${PAINTING_CLASS} {
            cursor: crosshair;
            user-select: none;
        }
        table.plateLayout.${PAINTING_CLASS} th.well-row-header,
        table.plateLayout.${PAINTING_CLASS} th.well-column-header {
            cursor: crosshair;
        }
    `;

    document.head.appendChild(style);
}
