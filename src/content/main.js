// content/main.js
import { injectPageScript } from "./inject-loader.js";
import { handleMessage } from "./message-router.js";
import { watchUrlChanges } from "./url-watcher.js";
import { watchKetcherDialog } from "./overlay-watcher.js";
import { ensurePanel, renderFromState } from "./features/sample-panel.js";
import { ensurePrintButtons } from "./features/print-buttons.js";
import {
  ensureDepletedStyle,
  markDepletedSamplesInSelector,
  startDepletedMarkerObserver
} from "./features/depleted-marker.js";
import {resetState} from "./state";
import {initDoseResponseOverride} from "./features/dose-response-override/init";
import {
  applyFileDialogFixes,
  fixAssociateFileBar,
  injectAssociateFileBarStyles
} from "./features/ui-fixes/file-dialog-fixes";


function isSupportedHost() {
  return /collaborativedrug\.com/i.test(location.hostname);
}

function watchFileDialog() {
  const observer = new MutationObserver(() => {
    applyFileDialogFixes();
    fixAssociateFileBar();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function init() {
  if (!isSupportedHost()) return;

  if (window.__CDD_STOICH_TOOLS_CONTENT__) return;
  window.__CDD_STOICH_TOOLS_CONTENT__ = true;

  injectPageScript();
  initDoseResponseOverride();

  window.addEventListener("message", handleMessage);

  ensurePanel();
  ensureDepletedStyle();
  startDepletedMarkerObserver();

  renderFromState();
  ensurePrintButtons();
  markDepletedSamplesInSelector();
  applyFileDialogFixes();
  injectAssociateFileBarStyles()
  watchFileDialog();

  const fileDialogObserver = new MutationObserver(() => {
    applyFileDialogFixes();
  });

  fileDialogObserver.observe(document.body, {
    childList: true,
    subtree: true
  });




  watchUrlChanges(() => {
    resetState();

    ensurePanel();
    renderFromState();

    ensurePrintButtons();
    markDepletedSamplesInSelector();
  });

  watchKetcherDialog();
}

init();