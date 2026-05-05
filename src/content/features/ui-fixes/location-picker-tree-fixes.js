let stylesInjected = false;

export function injectLocationPickerTreeStyles() {
    if (stylesInjected) return;
    stylesInjected = true;

    const style = document.createElement("style");
    style.id = "cdd-location-picker-tree-fixes";

    style.textContent = `
        .LocationPicker [role="treeitem"] .location-picker-tree-item-content {
            padding: 0 0 0 calc(var(--TreeView-itemDepth, 0) * 5px) !important;
        }
        
     
    `;

    document.head.appendChild(style);
}