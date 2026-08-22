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
  // Page world -> content: the answer to CDD.s reagent search, which carries a
  // molecule.s synonyms while the user is still choosing a batch. It is the
  // only moment that information exists before the entry is saved.
  MOLECULE_SEARCH: "MOLECULE_SEARCH",
  // Page world -> content: a snapshot of an outgoing create-sample request body,
  // used as a faithful payload template when FormData(form) cannot reproduce it.
  CREATE_SAMPLE_CAPTURED: "CREATE_SAMPLE_CAPTURED",
  // Page world -> content: the RESPONSE to that create-sample request (ok/status
  // + body text), so the batch orchestrator can confirm the native first save
  // succeeded before it replays the remaining positions.
  CREATE_SAMPLE_RESPONDED: "CREATE_SAMPLE_RESPONDED",
  // Content -> page world: "read the option list of this CDD SelectBox". The
  // list lives in React props, which the isolated content world cannot see;
  // the page-world bridge (inject/hooks/selectbox-bridge.js) answers with
  // SELECTBOX_OPTIONS. Used by the ELN entries filter picker, whose native
  // list is virtualised and never renders the tail of the options in the DOM.
  SELECTBOX_OPTIONS_REQUEST: "SELECTBOX_OPTIONS_REQUEST",
  SELECTBOX_OPTIONS: "SELECTBOX_OPTIONS",
  // Content -> page world: pick one option of that SelectBox by value, by
  // calling its React onChange - the same thing a click on the option does.
  SELECTBOX_SELECT: "SELECTBOX_SELECT",
};