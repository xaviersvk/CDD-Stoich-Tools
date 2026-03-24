import { post } from "./bus.js";
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

function processJsonPayload(data) {
  if (!data || typeof data !== "object") return;
  if (!isElnPayload(data)) return;

  const hasReaction = hasAnyReactionFeature(data);

  post("REACTION_VISIBILITY", {
    visible: hasReaction,
  });

  if (!hasReaction) return;

  try {
    const sampleResult = extractAllReactionRows(data);
    if (sampleResult?.samples?.length) {
      post("SAMPLE_DATA", sampleResult);
    }
  } catch (err) {
    console.warn("[CDD Stoich Tools] sample parse failed", err);
  }

  try {
    const printResult = extractPrintData(data);
    post("PRINT_DATA", printResult);
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