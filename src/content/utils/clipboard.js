// content/utils/clipboard.js
export async function copyText(text) {
    if (!text) return false;

    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (err) {
        console.warn("[CDD Stoich Tools] Clipboard write failed:", err);
        return false;
    }
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