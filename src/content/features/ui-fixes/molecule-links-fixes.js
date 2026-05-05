let stylesInjected = false;

export function injectMoleculeLinksStyles() {
    if (stylesInjected) return;
    stylesInjected = true;

    const style = document.createElement("style");
    style.id = "cdd-molecule-links-fixes";
    style.textContent = `
    #molecule-links .collapsible.collapsible-open .collapsible-inner {
        display: grid !important;
        grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
        column-gap: 24px !important;
        row-gap: 5px !important;
        align-items: start !important;
    }

    #molecule-links .collapsible:not(.collapsible-open) .collapsible-inner {
        display: none !important;
    }

    #molecule-links .collapsible-inner > span {
        display: block !important;
        min-width: 0 !important;
    }

    #molecule-links .collapsible-inner > span > a {
        display: block !important;
        min-width: 0 !important;
        overflow-wrap: anywhere !important;
        line-height: 1.4 !important;
    }

    @media (max-width: 1500px) {
        #molecule-links .collapsible.collapsible-open .collapsible-inner {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        }
    }

    @media (max-width: 1300px) {
        #molecule-links .collapsible.collapsible-open .collapsible-inner {
            grid-template-columns: 1fr !important;
        }
    }
`;

    document.head.appendChild(style);
}