import { post } from "./bus.js";
import { EVENTS } from "../shared/event-types.js";
import {
  isElnPayload,
  hasAnyReactionFeature,
  createTextParser
} from "./parsers/common.js";
import { extractAllReactionRows } from "./parsers/sample-data.js";
import { extractPrintData } from "./parsers/print-data.js";
import { installFetchHook } from "./hooks/fetch-hook.js";
import { installXhrHook } from "./hooks/xhr-hook.js";
import { installPrintDispatcher } from "./print/dispatcher.js";


// Inventory "Pick Location" box contents come back as an array of location
// entries carrying `molecule_id` + `inventory_location_id`. Detect that shape
// (no URL needed) and forward the unique molecule ids so the content side can
// pre-warm the structure cache.
function maybePostInventoryMolecules(data) {
  if (!Array.isArray(data)) return;

  const seen = new Set();
  const moleculeIds = [];

  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const hasLocation =
      "inventory_location_id" in item || "inventory_location_position" in item;
    const id = item.molecule_id;
    if (hasLocation && id != null && !seen.has(id)) {
      seen.add(id);
      moleculeIds.push(id);
    }
  }

  if (moleculeIds.length) {
    post(EVENTS.INVENTORY_MOLECULES, { moleculeIds });
  }
}

function processJsonPayload(data) {
  if (!data || typeof data !== "object") return;

  maybePostInventoryMolecules(data);

  if (!isElnPayload(data)) return;

  const hasReaction = hasAnyReactionFeature(data);

  post(EVENTS.REACTION_VISIBILITY, {
    visible: hasReaction,
  });

  if (!hasReaction) return;

  try {
    const sampleResult = extractAllReactionRows(data);
    if (sampleResult?.samples?.length) {
      post(EVENTS.SAMPLE_DATA, sampleResult);
    }
  } catch (err) {
    console.warn("[CDD Stoich Tools] sample parse failed", err);
  }

  try {
    const printResult = extractPrintData(data);
    post(EVENTS.PRINT_DATA, printResult);
  } catch (err) {
    console.warn("[CDD Stoich Tools] print parse failed", err);
  }
}

const tryParseText = createTextParser(processJsonPayload);

(() => {
  if (window.__CDD_STOICH_TOOLS_HOOKED__) return;
  window.__CDD_STOICH_TOOLS_HOOKED__ = true;

  console.log("[CDD Stoich Tools] inject main loaded");

  installPrintDispatcher();
  installFetchHook(processJsonPayload, tryParseText);
  installXhrHook(tryParseText);
})();