export function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

export function decodeHtmlEntities(value) {
    const textarea = document.createElement("textarea");
    textarea.value = value ?? "";
    return textarea.value;
}

// Replay a real click on `element`: mousedown → mouseup → click, all aimed at
// the element's own centre. React and MUI listen for the full sequence and for
// plausible coordinates, so a bare element.click() is not enough.
export function mouseClick(element) {
    const rect = element.getBoundingClientRect();
    const options = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        button: 0,
    };

    element.dispatchEvent(new MouseEvent("mousedown", options));
    element.dispatchEvent(new MouseEvent("mouseup", options));
    element.dispatchEvent(new MouseEvent("click", options));
}