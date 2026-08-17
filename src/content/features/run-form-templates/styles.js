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
export const QUIET_CLASS = "cdd-rft-quiet";

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
        /* Borrowed from CDD's own \`.buttony\`: Arial bold 12px, 4px radius
           and its \`.buttony-small\` padding — enough that the bar reads as
           part of the page. Its classes are not reused directly: \`.buttony\`
           carries \`float: left\`, which would break a flex bar, and a class
           we do not own could be restyled under us at any release.

           Only the CONFIRM action wears CDD's blue. The rest stay quiet: a
           row of solid blue buttons above the card would pull harder than
           anything here deserves, since none of them is the thing you came
           to the page to do.

           Nothing here is ever green. Green is what CDD paints its own Save,
           and no button in this bar saves to CDD — they all stop at the form
           and leave the saving to the chemist. */
        .${ROOT_CLASS} .${BUTTON_CLASS} {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 6px 12px;
            border: 1px solid #c3ccd4;
            border-radius: 4px;
            background: #fff;
            color: #33475b;
            font-family: Arial, helvetica, sans-serif;
            font-size: 12px;
            font-weight: bold;
            line-height: 15px;
            white-space: nowrap;
            cursor: pointer;
        }
        .${ROOT_CLASS} .${BUTTON_CLASS}:hover {
            border-color: #0077cc;
            color: #0077cc;
        }
        /* CDD's own disabled buttony. */
        .${ROOT_CLASS} .${BUTTON_CLASS}:disabled,
        .${ROOT_CLASS} .${BUTTON_CLASS}:disabled:hover {
            border-color: #e0e6ea;
            background: #f0f4f7;
            color: #b6bec6;
            cursor: default;
        }
        /* CDD's .buttony, minus the float. */
        .${ROOT_CLASS} .${PRIMARY_CLASS} {
            border-color: #0077cc;
            background: #0077cc;
            color: #fff;
            box-shadow: 0 3px 1px -2px rgba(0, 0, 0, .2), 0 2px 2px 0 rgba(0, 0, 0, .14);
        }
        .${ROOT_CLASS} .${PRIMARY_CLASS}:hover,
        .${ROOT_CLASS} .${PRIMARY_CLASS}:active {
            border-color: #1262b3;
            background: #1262b3;
            color: #fff;
        }
        /* CDD's .buttony-red, kept for the one destructive action. */
        .${ROOT_CLASS} .${DANGER_CLASS}:hover {
            border-color: #e6364c;
            color: #e6364c;
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
        /* A secondary way in, not a second first choice: reads as a link so
           it never competes with the button beside it. */
        .${ROOT_CLASS} .${QUIET_CLASS} {
            border-color: transparent;
            background: none;
            color: #0077cc;
            font-weight: normal;
            text-decoration: underline;
            padding: 6px 4px;
        }
        /* These three restate border and background because the base
           button's :hover and :disabled rules carry a pseudo-class and
           therefore outrank a bare .${QUIET_CLASS}. */
        .${ROOT_CLASS} .${QUIET_CLASS}:hover {
            border-color: transparent;
            background: none;
            color: #1262b3;
        }
        .${ROOT_CLASS} .${QUIET_CLASS}:disabled,
        .${ROOT_CLASS} .${QUIET_CLASS}:disabled:hover {
            border-color: transparent;
            background: none;
            color: #b6bec6;
            text-decoration: none;
        }
    `;

    document.head.appendChild(style);
}
