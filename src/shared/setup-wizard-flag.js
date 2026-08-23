// setup-wizard-flag.js
//
// Two flags for the setup guide on the settings page.
//
//   SEEN      — the guide has been opened at least once. The settings page
//               opens the guide by itself the FIRST time it is shown, and
//               never again on its own; the masthead button and the panel's
//               ⚙ still open it whenever asked.
//   REQUESTED — a one-shot "open the guide when the settings page next
//               loads". Set by the panel's ⚙ (a content script cannot open
//               the options page with a query string: openOptionsPage takes
//               none), read and cleared by the settings page.
//
// No DOM, no chrome.* at import time: the content script and the options page
// both import this.

export const SETUP_WIZARD_SEEN_KEY = "cddSetupWizardSeenV1";
export const SETUP_WIZARD_REQUESTED_KEY = "cddSetupWizardRequested";

export async function getSetupWizardSeen() {
    try {
        const stored = await chrome.storage.local.get(SETUP_WIZARD_SEEN_KEY);
        return stored?.[SETUP_WIZARD_SEEN_KEY] === true;
    } catch {
        return true; // storage broken: better no guide than a guide on every load
    }
}

export async function markSetupWizardSeen() {
    try {
        await chrome.storage.local.set({ [SETUP_WIZARD_SEEN_KEY]: true });
    } catch {
        /* nothing to do */
    }
}

export async function requestSetupWizard() {
    try {
        await chrome.storage.local.set({ [SETUP_WIZARD_REQUESTED_KEY]: true });
    } catch {
        /* the settings page still opens; just not on the guide */
    }
}

// Reads AND clears the request, so a reload of the settings page does not
// bring the guide back.
export async function takeSetupWizardRequest() {
    try {
        const stored = await chrome.storage.local.get(SETUP_WIZARD_REQUESTED_KEY);
        const requested = stored?.[SETUP_WIZARD_REQUESTED_KEY] === true;
        if (requested) await chrome.storage.local.remove(SETUP_WIZARD_REQUESTED_KEY);
        return requested;
    } catch {
        return false;
    }
}
