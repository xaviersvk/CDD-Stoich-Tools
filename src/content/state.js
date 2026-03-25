// content/state.js
export const STATE = {
  lastUrl: location.href,
  hasReactionFeature: false,
  isKetcherOpen: false,

  lastPayload: null,          // sample panel payload
  reactionPayloads: [],       // print payloads per reaction
  depletedIdentifiers: new Set(),

  panelCollapsed: false
};


export function resetState() {
  STATE.hasReactionFeature = false;
  STATE.lastPayload = null;
  STATE.reactionPayloads = [];
  STATE.depletedIdentifiers = new Set();
}