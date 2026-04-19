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