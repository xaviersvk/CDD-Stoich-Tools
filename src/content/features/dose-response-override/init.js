import { injectDoseResponseOverrideStyles } from "./styles.js";
import { ensureEasyOverrideToggle } from "./dom.js";
import { scanDoseResponseOverride } from "./scanner.js";

let initialized = false;
let observer = null;
let scanScheduled = false;

function scheduleScan() {
    if (scanScheduled) return;
    scanScheduled = true;

    setTimeout(() => {
        scanDoseResponseOverride();
        scanScheduled = false;
    }, 200);
}

export function initDoseResponseOverride() {
    if (initialized) return;
    initialized = true;

    injectDoseResponseOverrideStyles();
    ensureEasyOverrideToggle();
    scanDoseResponseOverride();

    observer = new MutationObserver(() => {
        scheduleScan();
    });

    // <html>, not <body>: Turbo swaps <body> on in-app navigation.
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });
}