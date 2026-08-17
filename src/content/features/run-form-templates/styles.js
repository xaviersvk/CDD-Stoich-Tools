// content/features/run-form-templates/styles.js
//
// One stylesheet for the run-form template bar. Injected once, on first
// attach; the bar is our own node sitting OUTSIDE CDD's React root, so there
// is no page CSS to fight and nothing here needs !important.
//
// The conflict rows borrow the diff colours a reviewer expects — the value
// already in the run on the left in muted red, the template's on the right in
// green — because "which of these two is about to win" is the only question
// that row has to answer.

const STYLE_ID = "cdd-run-form-templates-style";

export const ROOT_CLASS = "cdd-run-form-templates";
export const BAR_CLASS = "cdd-rft-bar";
export const LABEL_CLASS = "cdd-rft-label";
export const BUTTON_CLASS = "cdd-rft-button";
export const PRIMARY_CLASS = "cdd-rft-primary";
export const DANGER_CLASS = "cdd-rft-danger";
export const SELECT_CLASS = "cdd-rft-select";
export const NAME_INPUT_CLASS = "cdd-rft-name";
export const STATUS_CLASS = "cdd-rft-status";
export const WARN_CLASS = "cdd-rft-warn";
export const PANEL_CLASS = "cdd-rft-panel";
export const LIST_CLASS = "cdd-rft-list";
export const ITEM_CLASS = "cdd-rft-item";
export const FIELD_NAME_CLASS = "cdd-rft-field";
export const VALUE_CLASS = "cdd-rft-value";
export const OLD_VALUE_CLASS = "cdd-rft-old";
export const NEW_VALUE_CLASS = "cdd-rft-new";
export const NOTE_CLASS = "cdd-rft-note";

export function injectRunFormTemplateStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        .${ROOT_CLASS} {
            margin: 8px 0 4px;
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
        /* A class selector beats the UA's [hidden] { display: none }, which
           would leave every collapsed row on screen forever. Restore the
           attribute's meaning at matching specificity. */
        .${ROOT_CLASS} .${BAR_CLASS}[hidden],
        .${ROOT_CLASS} .${PANEL_CLASS}[hidden] {
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
        .${ROOT_CLASS} .${PRIMARY_CLASS} {
            border-color: #4a76b8;
            background: #e6effa;
        }
        .${ROOT_CLASS} .${DANGER_CLASS}:hover {
            border-color: #c23030;
            color: #c23030;
            background: #fdf0f0;
        }
        .${ROOT_CLASS} .${SELECT_CLASS} {
            min-width: 200px;
            max-width: 320px;
            font-size: 12px;
            padding: 2px;
        }
        .${ROOT_CLASS} .${NAME_INPUT_CLASS} {
            width: 220px;
            font-size: 12px;
            padding: 2px 4px;
            border: 1px solid #c3c3c3;
            border-radius: 3px;
        }
        .${ROOT_CLASS} .${STATUS_CLASS} {
            color: #2c6e2c;
        }
        .${ROOT_CLASS} .${WARN_CLASS} {
            color: #a05000;
        }
        .${ROOT_CLASS} .${PANEL_CLASS} {
            margin: 4px 0 6px;
            padding: 8px 10px;
            border: 1px solid #d6d6d6;
            border-radius: 3px;
            background: #fafafa;
        }
        .${ROOT_CLASS} .${LIST_CLASS} {
            max-height: 320px;
            overflow-y: auto;
            margin: 4px 0 8px;
        }
        .${ROOT_CLASS} .${ITEM_CLASS} {
            display: flex;
            align-items: baseline;
            gap: 8px;
            padding: 3px 0;
            border-bottom: 1px solid #ececec;
        }
        .${ROOT_CLASS} .${ITEM_CLASS}:last-child {
            border-bottom: none;
        }
        .${ROOT_CLASS} .${FIELD_NAME_CLASS} {
            flex: 0 0 210px;
            font-weight: bold;
        }
        .${ROOT_CLASS} .${VALUE_CLASS} {
            flex: 1 1 auto;
            word-break: break-word;
        }
        .${ROOT_CLASS} .${OLD_VALUE_CLASS} {
            color: #a03030;
            text-decoration: line-through;
        }
        .${ROOT_CLASS} .${NEW_VALUE_CLASS} {
            color: #2c6e2c;
        }
        .${ROOT_CLASS} .${NOTE_CLASS} {
            color: #777;
            font-style: italic;
        }
    `;

    document.head.appendChild(style);
}
