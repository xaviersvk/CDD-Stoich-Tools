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

// Park a floating bubble next to the cursor: below-right by default, flipped or
// pulled back to the viewport edge when it would otherwise overflow. Both plate
// tooltips grew their own copy of this; they are now the same one.
//
// Read the element's rect BEFORE calling, i.e. with the bubble already filled
// and visible — an empty bubble measures 0×0 and every clamp below no-ops.
export function positionAtCursor(el, event) {
    const pad = 12;
    const rect = el.getBoundingClientRect();

    let left = event.clientX + 14;
    let top = event.clientY + 16;

    if (left + rect.width + pad > window.innerWidth) {
        left = Math.max(pad, window.innerWidth - rect.width - pad);
    }
    if (top + rect.height + pad > window.innerHeight) {
        // Flip above the cursor, but never off the top of the screen — a tall
        // bubble near the bottom of a long plate map used to do exactly that.
        top = Math.max(pad, event.clientY - rect.height - 12);
    }

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
}
