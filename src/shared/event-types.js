export const EVENT_SOURCE = "CDD_STOICH_TOOLS";

// Content -> background (chrome.runtime.sendMessage, not window.postMessage):
// open the settings page. A content script may not call openOptionsPage itself.
//
// background.js is copied to dist unbundled, so it cannot import this file and
// repeats the literal. Keep the two in step.
export const OPEN_OPTIONS_MESSAGE = "CDD_STOICH_TOOLS_OPEN_OPTIONS";

export const EVENTS = {
  REACTION_VISIBILITY: "REACTION_VISIBILITY",
  SAMPLE_DATA: "SAMPLE_DATA",
  PRINT_DATA: "PRINT_DATA",
  PRINT_REQUEST: "PRINT_REQUEST",
  INVENTORY_MOLECULES: "INVENTORY_MOLECULES",
  INVENTORY_BOX: "INVENTORY_BOX",
  // Page world -> content: a snapshot of an outgoing create-sample request body,
  // used as a faithful payload template when FormData(form) cannot reproduce it.
  CREATE_SAMPLE_CAPTURED: "CREATE_SAMPLE_CAPTURED",
  // Page world -> content: the RESPONSE to that create-sample request (ok/status
  // + body text), so the batch orchestrator can confirm the native first save
  // succeeded before it replays the remaining positions.
  CREATE_SAMPLE_RESPONDED: "CREATE_SAMPLE_RESPONDED",
};