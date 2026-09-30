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

// The one reused floating <div> behind each hover tooltip (plate location, plate
// map structure, run plates). Created on first use and again whenever a Turbo
// body swap has torn it out; hidden until the caller fills it.
export function floatingBubble(id) {
    let el = null;

    const ensure = () => {
        if (el && el.isConnected) return el;
        el = document.createElement("div");
        el.id = id;
        el.hidden = true;
        document.body.appendChild(el);
        return el;
    };

    return {
        ensure,
        hide() {
            if (el) el.hidden = true;
        },
        hidden: () => Boolean(el?.hidden),
        position: (event) => positionAtCursor(ensure(), event),
    };
}

// React tracks an input's value on the DOM node itself; assigning `.value`
// hides the change from it. Go through the element's own prototype setter and
// fire input + change, which is what a keystroke looks like to React.
export function setNativeValue(element, value) {
    const prototype = element instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : element instanceof HTMLSelectElement
            ? window.HTMLSelectElement.prototype
            : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (setter) setter.call(element, value);
    else element.value = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
}

// Run `callback` at most once per animation frame while the page changes.
// Watches <html>, not <body>: Turbo swaps <body> on in-app navigation. `extra`
// adds observer options (attributes, characterData) for the features that need
// them.
//
// Returns the scheduler, so other triggers (the first pass, a settings change,
// a Turbo event) share the same frame instead of running twice. Callers stay
// responsible for calling it once to get the first pass.
export function watchDocument(callback, extra = {}) {
    let scheduled = false;
    const schedule = () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            callback();
        });
    };

    new MutationObserver(schedule).observe(document.documentElement, {
        childList: true,
        subtree: true,
        ...extra,
    });

    return schedule;
}
