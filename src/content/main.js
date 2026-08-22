// content/main.js
import { injectPageScript } from "./inject-loader.js";
import { handleMessage } from "./message-router.js";
import { watchUrlChanges } from "./url-watcher.js";
import { watchKetcherDialog } from "./overlay-watcher.js";
import { ensurePanel, renderFromState, initSamplePanelFields, clearElnIdToBatchWrites } from "./features/sample-panel.js";
import { ensurePrintButtons } from "./features/print-buttons.js";
import { initSynonymEnrichment } from "./features/synonym-enrichment.js";
import { initRowNameEnrichment } from "./features/name-enrichment.js";
import { initNamePicker } from "./features/name-picker.js";
import { initNameWatch } from "./features/name-watch.js";
import { initPhraseCapture } from "./features/phrases/capture.js";
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
import {initFilterFieldPicker} from "./features/ui-fixes/filter-field-picker";
import {initElnFilterFieldPicker} from "./features/ui-fixes/eln-filter-field-picker";
import {initKeywordsFieldPicker} from "./features/ui-fixes/keywords-field-picker";
import {initColumnManager} from "./features/ui-fixes/column-manager";
import {initLocationPickerResize} from "./features/ui-fixes/location-picker-resize";
import {injectMoleculeLinksStyles} from "./features/ui-fixes/molecule-links-fixes";
import {watchConsumedBatches} from "./features/ui-fixes/consumed-batches-collapse";
import {watchInventoryWellStructure} from "./features/ui-fixes/inventory-well-structure";
import {initInventoryGridColors} from "./features/ui-fixes/inventory-grid-colors";
import {initPlateLocationTooltip} from "./features/ui-fixes/plate-location-tooltip";
import {initPlateLocationExport} from "./features/ui-fixes/plate-location-export";
import {initPlateListLocations} from "./features/ui-fixes/plate-list-locations";
import {initPlateListExport} from "./features/ui-fixes/plate-list-export";
import {initPlateMapStructureTooltip} from "./features/ui-fixes/plate-map-structure-tooltip";
import {initPlateMapExport} from "./features/ui-fixes/plate-map-export";
import {initHeatMapWellFields} from "./features/ui-fixes/heat-map-well-fields";
import {initControlLayoutTools} from "./features/control-layout/init";
import {initRunFormTemplates} from "./features/run-form-templates/init";
import {initRegistrationProjectMirror} from "./features/ui-fixes/registration-project-mirror";
import {initRegistrationFormDefault} from "./features/ui-fixes/registration-form-default";
import {initElnIdToRegistration} from "./features/ui-fixes/eln-id-to-registration";
import {initRegistrationDefaults} from "./features/ui-fixes/registration-defaults";
import {initStoichAmountEditing} from "./features/ui-fixes/stoich-amount-editing";
import {initStoichTableCopy} from "./features/ui-fixes/stoich-table-copy";
import {initSlurpTypeDefault} from "./features/ui-fixes/slurp-type-default";
import {initOptionsMenuLink} from "./features/ui-fixes/options-menu-link";
import {initSavedSearchCopyLinks} from "./features/savedSearchCopyLinks/savedSearchCopyLinks";
import {initSearchColumnCopy} from "./features/ui-fixes/search-column-copy";
import {initElnTitle} from "./features/eln-title";
import {initBoxSelection} from "./features/box-selection/init";
import {initMultiPositionSampleCreate} from "./features/multi-position-sample-create/init";
import {initPrefixColorCache} from "../shared/prefix-colors.js";
import {initDensityMemory, onDensityMemoryChanged} from "../shared/density-memory.js";
import {initAutoFill} from "./features/auto-fill.js";
import {initPurityThresholds, onPurityThresholdChanged} from "../shared/purity-threshold.js";
import {initHplcSettings, onHplcBlockEnabledChanged} from "../shared/hplc-injection.js";
import {clearHplcInjectionState} from "./features/hplc-injection-block.js";
import {initShowProducts, onShowProductsChanged} from "../shared/show-products-flag.js";
import {initFillRowName} from "../shared/row-name-flag.js";
import {initNameMemory, onNameMemoryChanged} from "../shared/name-memory.js";
import {initElnIdToBatch, onElnIdToBatchChanged} from "../shared/eln-id-to-batch.js";
import {initHeatMapFieldsConfig} from "../shared/heat-map-fields.js";
import {initPanelSources, onPanelSourcesChanged} from "../shared/panel-sources-flag.js";
import {initElnMentions} from "./features/mentions/init.js";


function isSupportedHost() {
  return /collaborativedrug\.com/i.test(location.hostname);
}

function watchFileDialog() {
  const observer = new MutationObserver(() => {
    applyFileDialogFixes();
    fixAssociateFileBar();
  });

  // <html>, not <body>: Turbo swaps <body> on in-app navigation, which would
  // silently kill an observer attached to the old body.
  observer.observe(document.documentElement, {
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
  initSynonymEnrichment();
  initRowNameEnrichment();
  initNamePicker();
  initNameWatch();
  initPhraseCapture();

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
    // Per-reaction HPLC overrides describe the entry being left, not the one
    // being opened — "reaction 1 took two drops" does not carry over.
    clearHplcInjectionState();

    // Same reasoning: a "✓ Internal ID set to MDX-0095" belongs to the entry
    // it was clicked in.
    clearElnIdToBatchWrites();

    ensurePanel();
    renderFromState();

    ensurePrintButtons();
    markDepletedSamplesInSelector();
  });

  watchKetcherDialog();

  observeCopyableFields();


  injectLeftEllipsisForLocations();
  initFilterFieldPicker();
  initElnFilterFieldPicker();
  initKeywordsFieldPicker();
  initColumnManager();
  initLocationPickerResize();
  injectMoleculeLinksStyles();
  watchConsumedBatches();
  watchInventoryWellStructure();
  initInventoryGridColors();
  initPlateLocationTooltip();
  initPlateLocationExport();
  initPlateListLocations();
  initPlateListExport();
  initPlateMapStructureTooltip();
  initPlateMapExport();
  initHeatMapWellFields();

  // Control-layout editor: arm a control type, then drag a rectangle over the
  // wells (or click a row/column header) to set them all at once, plus named
  // layout presets per plate format. Inert until a brush is armed — CDD's
  // one-well click cycling is untouched otherwise.
  initControlLayoutTools();
  initRunFormTemplates();

  initRegistrationProjectMirror();
  initRegistrationFormDefault();

  // Registering a product straight out of a reaction: the Register link in a
  // stoichiometry row carries the entry's own ID (IDEMO-MDX-0014) across in its
  // URL, and the Create a New Entity page writes it into Internal ID.
  initElnIdToRegistration();

  // Per-vault constants (Origin -> Synthesized) plus the amount out of the
  // stoichiometry row, both only on a registration opened FROM an ELN entry.
  initRegistrationDefaults();

  initStoichAmountEditing();

  // Selecting text in a stoichiometry table: CDD's Slate void turns
  // user-select off and hijacks the mouse into a block drag, so nothing in
  // the table could be copied. Both are lifted here, plus Ctrl/Cmd+click to
  // copy a single field.
  initStoichTableCopy();

  initSlurpTypeDefault();
  initOptionsMenuLink();
  initSavedSearchCopyLinks();
  initSearchColumnCopy();
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

  // Remembered densities: load the batch->density map, then re-render the
  // panel whenever it changes in any context (typing on another tab, deleting
  // from the options page) so fill offers appear/disappear live.
  initDensityMemory().then(() => {
    onDensityMemoryChanged(() => renderFromState());
  });

  // Experimental auto-fill (opt-in via the options checkbox): runs the
  // same fills the card buttons offer, sequentially, once the page settles.
  initAutoFill();

  // Purity thresholds (fill + warn): badge and offers re-render when they
  // change in the options page.
  initPurityThresholds().then(() => {
    onPurityThresholdChanged(() => renderFromState());
  });

  // The HPLC injection parameters. Fire-and-forget: the block paints with
  // the defaults until the (fast) storage read lands, and the block's own
  // listener repaints it then — no panel re-render involved, which is what
  // keeps focus in an input the user is typing in.
  //
  // The on/off flag is the exception: it adds and removes whole blocks, so
  // it does need a re-render. It has its own subscription for exactly that
  // reason — see the two listener sets in shared/hplc-injection.js.
  initHplcSettings();
  onHplcBlockEnabledChanged(() => renderFromState());

  // Optional products section (panel + print).
  initShowProducts().then(() => {
    onShowProductsChanged(() => renderFromState());
  });

  // Row name from synonym. Off by default; nothing that depends on it runs
  // until the flag is on.
  initFillRowName();

  // Remembered row names: load the molecule->name map, then re-render the
  // panel whenever it changes in any context (typing on another tab, deleting
  // from the options page) so fill offers appear/disappear live.
  initNameMemory().then(() => {
    onNameMemoryChanged(() => renderFromState());
  });

  // Writing this entry's ID onto a product's existing batch. Off by default:
  // it is the only thing in the panel that saves to a record rather than to
  // the stoichiometry table.
  initElnIdToBatch().then(() => {
    onElnIdToBatchChanged(() => renderFromState());
  });

  // Which sources the panel draws from (stoichiometry tables / entity links
  // written into the entry body). The mention scan starts only once the flag
  // is known, so a disabled scan never fires a single request.
  initPanelSources().then(() => {
    onPanelSourcesChanged(() => renderFromState());
    initElnMentions();
  });

  // Extra rows in the heat-map well tooltip. Fire-and-forget: hovers before
  // the (fast) storage read completes just show CDD's native popup.
  initHeatMapFieldsConfig();
}

init();