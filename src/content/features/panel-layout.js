export function setupDockedLayout(panel) {
    if (!panel) return;

    const editorSection = document.querySelector('[data-autotest-id="editor"]');

    if (!editorSection) {
        setTimeout(() => setupDockedLayout(panel), 500);
        return;
    }

    if (editorSection.parentElement?.classList.contains("cdd-stoich-layout")) {
        return;
    }

    const parent = editorSection.parentElement;
    if (!parent) return;

    const layout = document.createElement("div");
    layout.className = "cdd-stoich-layout";

    const editorWrapper = document.createElement("div");
    editorWrapper.className = "cdd-stoich-editor-wrapper";

    parent.insertBefore(layout, editorSection);
    layout.appendChild(editorWrapper);
    editorWrapper.appendChild(editorSection);
    layout.appendChild(panel);

    panel.removeAttribute("style");

    injectDockedStyles();
}

function injectDockedStyles() {
    document.getElementById("cdd-stoich-layout-style")?.remove();

    const style = document.createElement("style");
    style.id = "cdd-stoich-layout-style";

    style.textContent = `
.cdd-stoich-layout {
    position: relative !important;
    width: 100% !important;

    display: flex !important;
    align-items: flex-start !important;
}

.cdd-stoich-editor-wrapper {
    width: 100% !important;
    min-width: 0 !important;
}

#cdd-stoich-panel {
    position: sticky !important;
    top: 16px !important;

    margin-left: 16px !important;

    width: 280px !important;
    min-width: 280px !important;
    max-width: 280px !important;

    align-self: flex-start !important;

    max-height: calc(100vh - 32px) !important;
    overflow: auto !important;

    z-index: 100 !important;

    flex-shrink: 0 !important;
}
`;

    document.head.appendChild(style);
}