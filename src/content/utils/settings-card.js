// content/utils/settings-card.js
//
// The bar and card the field clipboard introduced and its siblings borrow
// (form clipboards, registration form rows, registration systems): the DOM
// for the classes field-clipboard/styles.js defines, built one way.

export function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

export function plural(count, noun) {
    return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function when(timestamp) {
    return new Date(timestamp).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function checkbox(checked, disabled = false) {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = checked;
    box.disabled = disabled;
    return box;
}

export function filterInput() {
    const filter = document.createElement("input");
    filter.type = "search";
    filter.className = "cdd-fc-filter";
    filter.placeholder = "Filter";
    return filter;
}

// A span with one button per label, a status line and a hidden card, in
// that order. `className` carries the bar's own classes.
export function buildButtonBar(className, labels) {
    const bar = el("span", className);
    const buttons = labels.map((label) => {
        const button = el("button", "cdd-fc-button", label);
        button.type = "button";
        return button;
    });
    const status = el("span", "cdd-fc-status");
    const card = el("div", "cdd-fc-card");
    card.hidden = true;
    bar.append(...buttons, status, card);
    return { bar, buttons, status, card };
}

export function cardHead(title, note) {
    const head = el("div", "cdd-fc-head");
    head.append(el("span", "cdd-fc-title", title));
    head.append(el("span", "cdd-fc-note", note));
    return head;
}

// Empties the card, shows it, and starts it with its head.
export function openCard(card, title, note) {
    card.textContent = "";
    card.hidden = false;
    card.append(cardHead(title, note));
}

// The foot, appended to `card`: the action, a button that hides the card,
// then `extra`.
export function cardFoot(card, { action = "", cancel = "Cancel", extra = [] } = {}) {
    const foot = el("div", "cdd-fc-foot");
    const actionButton = el("button", "cdd-fc-add", action);
    actionButton.type = "button";
    const cancelButton = el("button", "cdd-fc-cancel", cancel);
    cancelButton.type = "button";
    cancelButton.addEventListener("click", () => { card.hidden = true; });
    foot.append(actionButton, cancelButton, ...extra);
    card.append(foot);
    return { action: actionButton, cancel: cancelButton };
}
