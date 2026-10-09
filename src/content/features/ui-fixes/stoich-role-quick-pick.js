// content/features/ui-fixes/stoich-role-quick-pick.js
//
// Picking a row's Role in CDD's stoichiometry table takes three clicks:
// "Role: Optional" opens a popup holding a read-only "Select role" box,
// a second click on that box drops the list (Reactant / Reagent /
// Catalyst; Product on a product row), and a third picks. This makes the
// second click for you, so the list is already open when the popup is.
//
// Nothing is chosen or written here: CDD's own list takes the pick and
// saves it. Edit mode only — in view mode the Role label is not in the
// DOM at all.

const ROLE_LABEL = '[data-autotest-id="stoichiometry-role-select"]';
const ROLE_INPUT = '[data-autotest-id="Role-input"]';
const ROLE_LIST = '[data-autotest-id="stoichiometry-role-select-popup"]';

// CDD renders the popup shortly after the click. Poll briefly, then give
// up rather than wait on a popup that never came. A timer, not
// requestAnimationFrame: rAF never fires in a hidden tab.
const POLL_MS = 20;
const MAX_TRIES = 15;

function openListWhenReady(triesLeft) {
    const input = document.querySelector(ROLE_INPUT);
    if (!input) {
        if (triesLeft > 0) setTimeout(() => openListWhenReady(triesLeft - 1), POLL_MS);
        return;
    }
    // The box toggles the list: clicking it while open would close it.
    if (document.querySelector(ROLE_LIST)) return;
    input.click();
}

function onClick(event) {
    // Trusted only: our own input.click() must not start another round.
    if (!event.isTrusted) return;
    if (!(event.target instanceof Element) || !event.target.closest(ROLE_LABEL)) return;
    setTimeout(() => openListWhenReady(MAX_TRIES), 0);
}

export function initStoichRoleQuickPick() {
    document.addEventListener("click", onClick, true);
}
