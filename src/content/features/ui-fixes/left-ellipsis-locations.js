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

        /* The outer box stays RTL so the ellipsis lands on the left; the text
           itself must stay LTR and isolated, otherwise the bidi algorithm
           moves a leading number to the end ("90% FBS, 10% DMSO" was shown
           as "FBS, 10% DMSO 90%"). */
        .AutoEllipsisTooltip.value-text.right-margin .text-contents {
            direction: ltr !important;
            unicode-bidi: isolate !important;
            text-align: left !important;
        }
    `;

    document.head.appendChild(style);

    console.log("[LEFT-ELLIPSIS] CSS injected");
}