// content/main.js
import { injectPageScript } from "./inject-loader.js";
import { handleMessage } from "./message-router.js";
import { watchUrlChanges } from "./url-watcher.js";
import { watchKetcherDialog } from "./overlay-watcher.js";
import { ensurePanel, renderFromState, initSamplePanelFields } from "./features/sample-panel.js";
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
import {observeCopyableFields} from "./features/ui-fixes/copyable-fields";
import {injectLeftEllipsisForLocations} from "./features/ui-fixes/left-ellipsis-locations";
import {initFilterDefaultFix} from "./features/ui-fixes/filter-default";
import {initLocationPickerResize} from "./features/ui-fixes/location-picker-resize";
import {injectMoleculeLinksStyles} from "./features/ui-fixes/molecule-links-fixes";
import {watchConsumedBatches} from "./features/ui-fixes/consumed-batches-collapse";
import {watchInventoryWellStructure} from "./features/ui-fixes/inventory-well-structure";
import {initSavedSearchCopyLinks} from "./features/savedSearchCopyLinks/savedSearchCopyLinks";
import {initElnTitle} from "./features/eln-title";


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
  initSamplePanelFields();

  window.addEventListener("message", handleMessage);

  ensurePanel();
  ensureDepletedStyle();
  startDepletedMarkerObserver();

  renderFromState();
  ensurePrintButtons();
  markDepletedSamplesInSelector();
  applyFileDialogFixes();
  injectAssociateFileBarStyles();
  watchFileDialog();

  watchUrlChanges(() => {
    resetState();

    ensurePanel();
    renderFromState();

    ensurePrintButtons();
    markDepletedSamplesInSelector();
  });

  watchKetcherDialog();

  observeCopyableFields();


  injectLeftEllipsisForLocations();
  initFilterDefaultFix();
  initLocationPickerResize();
  injectMoleculeLinksStyles();
  watchConsumedBatches();
  watchInventoryWellStructure();
  initSavedSearchCopyLinks();
  initElnTitle();
}

init();