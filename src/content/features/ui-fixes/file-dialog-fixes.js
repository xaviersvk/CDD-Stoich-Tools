let stylesInjected = false;

export function injectFileDialogStyles() {
    if (stylesInjected) return;
    stylesInjected = true;

    const style = document.createElement("style");
    style.id = "cdd-stoich-file-dialog-fixes";
    style.textContent = `
        .filePreview a {
            display: inline-block !important;
            white-space: normal !important;
            overflow: visible !important;
            text-overflow: unset !important;
            word-break: break-word !important;
            max-width: 100% !important;
        }
    `;

    document.head.appendChild(style);
}

export function enhanceFileDialogLinks() {
    document.querySelectorAll(".filePreview a").forEach((link) => {
        const fullText = link.getAttribute("title")?.trim();

        if (!fullText) return;

        if (link.textContent.trim() !== fullText) {
            link.textContent = fullText;
        }

        link.title = fullText;
    });
}

export function applyFileDialogFixes() {
    injectFileDialogStyles();
    enhanceFileDialogLinks();
}

export function injectAssociateFileBarStyles() {
    const existing = document.getElementById("cdd-stoich-associate-file-bar-fix");
    if (existing) return;

    const style = document.createElement("style");
    style.id = "cdd-stoich-associate-file-bar-fix";
    style.textContent = `
        .buttons-right {
            position: fixed !important;
            right: 32px !important;
            bottom: 24px !important;
            z-index: 99999 !important;
            background: #fff !important;
            padding: 12px 16px !important;
            border: 1px solid #ddd !important;
            border-radius: 8px !important;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18) !important;
        }
    `;

    document.head.appendChild(style);
}