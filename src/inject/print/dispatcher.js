import { EVENT_SOURCE, EVENTS } from "../../shared/event-types.js";

function waitForImages(doc, callback) {
    const images = Array.from(doc.images || []);
    if (!images.length) {
        setTimeout(callback, 200);
        return;
    }

    let remaining = images.length;

    const done = () => {
        remaining -= 1;
        if (remaining <= 0) {
            setTimeout(callback, 200);
        }
    };

    images.forEach((img) => {
        if (img.complete) {
            done();
            return;
        }

        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
    });
}

function printHtmlViaIframe(html) {
    const oldFrame = document.getElementById("cdd-stoich-print-frame");
    if (oldFrame) {
        oldFrame.remove();
    }

    const iframe = document.createElement("iframe");
    iframe.id = "cdd-stoich-print-frame";
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    iframe.setAttribute("aria-hidden", "true");

    document.documentElement.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
        console.warn("[CDD Stoich Tools] print iframe document unavailable");
        iframe.remove();
        return;
    }

    doc.open();
    doc.write(html);
    doc.close();

    waitForImages(doc, () => {
        try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
        } catch (err) {
            console.warn("[CDD Stoich Tools] print failed", err);
        }

        setTimeout(() => {
            iframe.remove();
        }, 1500);
    });
}

export function installPrintDispatcher() {
    if (window.__CDD_STOICH_TOOLS_PRINT_DISPATCHER__) return;
    window.__CDD_STOICH_TOOLS_PRINT_DISPATCHER__ = true;

    window.addEventListener("message", (event) => {
        if (event.source !== window) return;

        const data = event.data;
        if (!data || data.source !== EVENT_SOURCE) return;
        if (data.type !== EVENTS.PRINT_REQUEST) return;

        const html = data.payload?.html;
        if (!html || typeof html !== "string") {
            console.warn("[CDD Stoich Tools] invalid print payload");
            return;
        }

        printHtmlViaIframe(html);
    });
}