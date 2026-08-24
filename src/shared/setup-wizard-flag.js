// setup-wizard-flag.js
//
// One flag for the setup guide on the settings page.
//
//   SEEN — the guide has been opened at least once. The settings page opens
//          the guide by itself the FIRST time it is shown, and never again on
//          its own; the masthead button opens it whenever asked.
//
// No DOM, no chrome.* at import time: the options page imports this.

export const SETUP_WIZARD_SEEN_KEY = "cddSetupWizardSeenV1";

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
