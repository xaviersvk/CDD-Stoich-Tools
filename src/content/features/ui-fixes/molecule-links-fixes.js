let stylesInjected = false;

export function injectMoleculeLinksStyles() {
    if (stylesInjected) return;
    stylesInjected = true;

    const style = document.createElement("style");
    style.id = "cdd-molecule-links-fixes";
    style.textContent = `
    #molecule-links .collapsible-inner > span {
        display: flex !important;
        flex-wrap: wrap !important;
        gap: 4px 8px !important;
    }

    #molecule-links .collapsible-inner > span > a {
        display: inline !important;
        line-height: 1.4 !important;
        max-width: 100% !important;
        word-break: break-word !important;
    }
`;

    document.head.appendChild(style);
}