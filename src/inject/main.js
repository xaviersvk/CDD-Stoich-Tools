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
import { installCreateRequestCapture } from "./hooks/create-request-capture.js";
import { installEntryPayloadFallback } from "./hooks/entry-payload-fallback.js";
import { installSelectBoxBridge } from "./hooks/selectbox-bridge.js";
import { installPrintDispatcher } from "./print/dispatcher.js";


// Best-effort Sample ID / name for a box-contents entry, mirroring the field
// fallbacks used elsewhere (see parsers/field-resolvers.js resolveRowName).
// Returns a string or null. The grid colouring derives the prefix from this.
function pickInventoryName(item) {
  const candidate =
    item.sample_identifier ||
    item.name ||
    item.sample_name ||
    item.molecule_name ||
    item.identifier ||
    (item.sample && (item.sample.sample_identifier || item.sample.name)) ||
    null;
  return candidate ? String(candidate).trim() : null;
}

// Inventory "Pick Location" box contents come back as an array of location
// entries carrying `molecule_id` + `inventory_location_id` /
// `inventory_location_position`. Detect that shape (no URL needed) and forward:
//   - INVENTORY_MOLECULES: unique molecule ids, to pre-warm the structure cache;
//   - INVENTORY_BOX: one record per occupied well { position, moleculeId, name },
//     so the content side can tint each filled grid cell by its prefix colour.
function maybePostInventoryMolecules(data) {
  if (!Array.isArray(data)) return;

  const seen = new Set();
  const moleculeIds = [];
  const positions = [];

  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const hasLocation =
      "inventory_location_id" in item || "inventory_location_position" in item;
    const id = item.molecule_id;
    if (!hasLocation || id == null) continue;

    if (!seen.has(id)) {
      seen.add(id);
      moleculeIds.push(id);
    }

    const position = item.inventory_location_position;
    if (position != null && position !== "") {
      positions.push({
        position,
        moleculeId: id,
        name: pickInventoryName(item),
      });
    }
  }

  if (moleculeIds.length) {
    post(EVENTS.INVENTORY_MOLECULES, { moleculeIds });
  }
  if (positions.length) {
    post(EVENTS.INVENTORY_BOX, { positions });
  }
}

// Entry ids whose payload has already come past, so the fallback below can
// tell "CDD never asked for it" from "it arrived on its own".
const seenEntryIds = new Set();

function hasPayloadForEntry(entryId) {
  return seenEntryIds.has(String(entryId));
}

function processJsonPayload(data, url) {
  if (!data || typeof data !== "object") return;

  // The reagent search. Its answer is the only place a molecule's synonyms
  // exist before the entry is saved — adding a reagent through the row's own
  // Name field never puts the molecule id on the page — and it is recognisable
  // by URL alone: the body is an ordinary result list with nothing ELN-shaped
  // about it.
  if (/inventory_search/.test(url || "")) {
    post(EVENTS.MOLECULE_SEARCH, { body: data });
  }

  maybePostInventoryMolecules(data);

  if (!isElnPayload(data)) return;

  const entryId = data.eln_entry?.id;
  if (entryId != null) seenEntryIds.add(String(entryId));

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

  // An opening ELN entry puts no payload on the wire; ask for it ourselves and
  // let the fetch hook above parse the answer.
  installEntryPayloadFallback(hasPayloadForEntry);
  installSelectBoxBridge();

  // Snapshot outgoing create-sample requests (read-only) so the content side has
  // a faithful payload template, AND tap their responses so the batch
  // orchestrator can confirm the native first save succeeded before replaying.
  installCreateRequestCapture(
    (record) => {
      try {
        post(EVENTS.CREATE_SAMPLE_CAPTURED, record);
      } catch (err) {
        console.debug("[CDD Stoich Tools] create capture post failed", err);
      }
    },
    (record) => {
      try {
        post(EVENTS.CREATE_SAMPLE_RESPONDED, record);
      } catch (err) {
        console.debug("[CDD Stoich Tools] create response post failed", err);
      }
    }
  );
})();