export function injectLeftEllipsisForLocations() {
    const styleId = "cdd-left-ellipsis-locations";

    if (document.getElementById(styleId)) return;

    const style = document.createElement("style");
    style.id = styleId;

    style.textContent = `
            .SampleDataView
        .MultipleTablesWithStickyHeaders
        .additionalHeaderElements
        .AutoEllipsisTooltip {
            max-width: 27rem !important;
        }
    
        .AutoEllipsisTooltip.value-text.right-margin {
            direction: rtl !important;
            text-align: left !important;
        }

        .AutoEllipsisTooltip.value-text.right-margin .text-contents {
            direction: rtl !important;
            text-align: left !important;
        }
    `;

    document.head.appendChild(style);

    console.log("[LEFT-ELLIPSIS] CSS injected");
}