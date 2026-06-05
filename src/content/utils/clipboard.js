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