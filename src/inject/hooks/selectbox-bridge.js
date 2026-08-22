// inject/hooks/selectbox-bridge.js
//
// Page-world access to CDD's SelectBox component for the content script.
//
// CDD's SelectBox (the dropdown used by, among others, the ELN entries filter
// field selector) keeps its full option list in React props and renders only
// the rows that fit the 400px window — a virtualised list. The content script
// redesigns that dropdown into a searchable multi-column picker and needs
// every option, including the ones that never reach the DOM. React's fiber
// tree hangs off DOM nodes as `__reactFiber$…` expandos, which only the page
// world can read; this bridge reads them on request and applies a selection
// by calling the component's own onChange(value, option) — measured to do
// exactly what clicking the option does, including closing the dropdown.
//
// Protocol (window.postMessage, source EVENT_SOURCE):
//   SELECTBOX_OPTIONS_REQUEST { requestId, selector }
//     -> SELECTBOX_OPTIONS   { requestId, options: [{ value, label, header, disabled, selected }] | null }
//   SELECTBOX_SELECT         { selector, value }

import { post } from "../bus.js";
import { EVENTS, EVENT_SOURCE } from "../../shared/event-types.js";

function fiberOf(element) {
    if (!element) return null;
    const key = Object.keys(element).find((k) => k.startsWith("__reactFiber$"));
    return key ? element[key] : null;
}

// Depth-first through the fiber subtree under `root` for the first component
// whose props carry an `options` array and an `onChange`.
function findSelectBoxProps(root, maxDepth = 16) {
    let found = null;
    const walk = (fiber, depth) => {
        if (!fiber || found || depth > maxDepth) return;
        const props = fiber.memoizedProps;
        if (props && Array.isArray(props.options) && typeof props.onChange === "function") {
            found = props;
            return;
        }
        walk(fiber.child, depth + 1);
        walk(fiber.sibling, depth);
    };
    walk(root, 0);
    return found;
}

// A label is a string, or a React element whose props carry the text
// (CDD's IndentedLabel: { title, children }).
function labelText(label) {
    if (typeof label === "string" || typeof label === "number") return String(label);
    const props = label?.props;
    if (!props) return "";
    if (typeof props.title === "string") return props.title;
    if (typeof props.children === "string") return props.children;
    return "";
}

// `selected` is computed against the SelectBox's current value: CDD's own
// option.selected is a string (the selected label) on EVERY option, not a
// flag — trusting it marked the whole list as selected.
function serializeOptions(options, currentValue) {
    const current = currentValue == null ? null : String(currentValue);
    return options.map((option) => ({
        value: option?.value == null ? "" : String(option.value),
        label: labelText(option?.label).trim(),
        header: option?.optionType === "header",
        disabled: option?.disabled === true,
        selected: current != null && String(option?.value) === current,
    }));
}

function selectBoxFor(selector) {
    const element = typeof selector === "string" ? document.querySelector(selector) : null;
    const fiber = fiberOf(element);
    return fiber ? findSelectBoxProps(fiber) : null;
}

export function installSelectBoxBridge() {
    window.addEventListener("message", (event) => {
        if (event.source !== window) return;
        const data = event.data;
        if (!data || data.source !== EVENT_SOURCE) return;

        if (data.type === EVENTS.SELECTBOX_OPTIONS_REQUEST) {
            const { requestId, selector } = data.payload || {};
            let options = null;
            try {
                const props = selectBoxFor(selector);
                if (props) options = serializeOptions(props.options, props.value);
            } catch (err) {
                console.warn("[CDD Stoich Tools] SelectBox options read failed:", err);
            }
            post(EVENTS.SELECTBOX_OPTIONS, { requestId, options });
            return;
        }

        if (data.type === EVENTS.SELECTBOX_SELECT) {
            const { selector, value } = data.payload || {};
            try {
                const props = selectBoxFor(selector);
                const option = props?.options.find((o) => String(o?.value) === String(value));
                if (props && option) props.onChange(option.value, option);
            } catch (err) {
                console.warn("[CDD Stoich Tools] SelectBox select failed:", err);
            }
        }
    });
}
