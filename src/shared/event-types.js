export const EVENT_SOURCE = "CDD_STOICH_TOOLS";

export const EVENTS = {
  REACTION_VISIBILITY: "REACTION_VISIBILITY",
  SAMPLE_DATA: "SAMPLE_DATA",
  PRINT_DATA: "PRINT_DATA",
  PRINT_REQUEST: "PRINT_REQUEST",
  INVENTORY_MOLECULES: "INVENTORY_MOLECULES",
  INVENTORY_BOX: "INVENTORY_BOX",
  // Page world -> content: a snapshot of an outgoing create-sample request body,
  // used as a faithful payload template when FormData(form) cannot reproduce it.
  CREATE_SAMPLE_CAPTURED: "CREATE_SAMPLE_CAPTURED"
};