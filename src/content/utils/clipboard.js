// content/utils/clipboard.js
//
// Single clipboard helper for the whole content script. Prefers the async
// Clipboard API and falls back to a hidden-textarea + execCommand("copy") when
// it is unavailable or blocked (older pages, missing permission).

function copyTextFallback(text) {
    try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        textarea.style.top = "-9999px";

        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();

        const ok = document.execCommand("copy");
        textarea.remove();
        return ok;
    } catch (err) {
        console.warn("[CDD Stoich Tools] Clipboard fallback failed:", err);
        return false;
    }
}

export async function copyText(text) {
    if (!text) return false;

    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            console.warn("[CDD Stoich Tools] Clipboard write failed, using fallback:", err);
        }
    }

    return copyTextFallback(text);
}

export async function copyTextWithFeedback(element, text, successLabel = "Copied") {
    if (!element || !text) return false;

    const originalText = element.textContent;
    const originalBg = element.style.background;

    const ok = await copyText(text);
    if (!ok) return false;

    element.textContent = successLabel;
    element.style.background = "rgba(34,197,94,0.18)";

    setTimeout(() => {
        element.textContent = originalText;
        element.style.background = originalBg;
    }, 700);

    return true;
}

// Rich copy: both text/html and text/plain go on the clipboard, so a paste
// into the ELN editor keeps formatting while a paste into Excel or a plain
// input gets the text. Falls back to a one-shot `copy` listener that fills
// clipboardData itself when ClipboardItem is unavailable or refused.
function copyRichFallback(html, text) {
    const onCopy = (event) => {
        event.preventDefault();
        event.clipboardData.setData("text/html", html);
        event.clipboardData.setData("text/plain", text);
    };

    try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();

        document.addEventListener("copy", onCopy, { once: true });
        const ok = document.execCommand("copy");
        document.removeEventListener("copy", onCopy);
        textarea.remove();
        return ok;
    } catch (err) {
        document.removeEventListener("copy", onCopy);
        console.warn("[CDD Stoich Tools] Rich clipboard fallback failed:", err);
        return false;
    }
}

export async function copyRichText(html, text) {
    const plain = String(text ?? "");
    const markup = String(html ?? "");
    if (!plain && !markup) return false;
    if (!markup) return copyText(plain);

    if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
        try {
            await navigator.clipboard.write([
                new ClipboardItem({
                    "text/html": new Blob([markup], { type: "text/html" }),
                    "text/plain": new Blob([plain], { type: "text/plain" }),
                }),
            ]);
            return true;
        } catch (err) {
            console.warn("[CDD Stoich Tools] Rich clipboard write failed, using fallback:", err);
        }
    }

    return copyRichFallback(markup, plain);
}
