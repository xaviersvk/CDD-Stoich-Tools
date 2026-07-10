// background.js
//
// The toolbar icon has no popup any more — the settings live on their own page,
// which needs more room than a browser action's 800x600 ceiling allows. The
// background context exists only to open that page, from the two places that
// cannot open it themselves:
//
//   - the toolbar icon (action.onClicked fires only with no default_popup)
//   - the "CDD Plugin options" entry this extension adds to CDD's user dropdown
//     (content scripts have no access to runtime.openOptionsPage)
//
// openOptionsPage focuses an already-open settings tab rather than opening a
// second one.
//
// This file ships to dist unbundled, so it cannot import shared/event-types.js.
// The message name below is a copy of OPEN_OPTIONS_MESSAGE there — keep in step.

const OPEN_OPTIONS_MESSAGE = "CDD_STOICH_TOOLS_OPEN_OPTIONS";

chrome.action.onClicked.addListener(() => {
    chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === OPEN_OPTIONS_MESSAGE) chrome.runtime.openOptionsPage();
});
