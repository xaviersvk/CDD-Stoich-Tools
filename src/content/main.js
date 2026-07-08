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
import {initInventoryGridColors} from "./features/ui-fixes/inventory-grid-colors";
import {initPlateLocationTooltip} from "./features/ui-fixes/plate-location-tooltip";
import {initPlateLocationExport} from "./features/ui-fixes/plate-location-export";
import {initPlateListLocations} from "./features/ui-fixes/plate-list-locations";
import {initPlateListExport} from "./features/ui-fixes/plate-list-export";
import {initSavedSearchCopyLinks} from "./features/savedSearchCopyLinks/savedSearchCopyLinks";
import {initElnTitle} from "./features/eln-title";
import {initBoxSelection} from "./features/box-selection/init";
import {initMultiPositionSampleCreate} from "./features/multi-position-sample-create/init";
import {initPrefixColorCache} from "../shared/prefix-colors.js";


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
  initInventoryGridColors();
  initPlateLocationTooltip();
  initPlateLocationExport();
  initPlateListLocations();
  initPlateListExport();
  initSavedSearchCopyLinks();
  initElnTitle();

  // Box Selection Framework (Phase 1): injects styles + a console debug handle.
  // Attaches no selection UI by itself — a consumer (e.g. multi-position sample
  // create, Phase 2) calls observeBoxGrids() to opt a grid into selection.
  initBoxSelection();

  // Multi-position sample create (Phase 3): production batch create — one click
  // creates N samples (native first save + sequential replay of the rest).
  // Consumes the Box Selection SelectionContext; CDD's native Save is untouched
  // outside batch mode.
  initMultiPositionSampleCreate();

  // Load the prefix->colour map into the in-memory cache and keep it live.
  // Called LAST so every feature that subscribed via onPrefixColorsChanged()
  // above gets notified once the initial map resolves, and again on any later
  // popup edit. Fire-and-forget: features render with the default look until the
  // (fast) storage read completes.
  initPrefixColorCache();
}

init();