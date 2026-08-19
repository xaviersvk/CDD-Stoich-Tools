// content/features/panel-state.js
//
// Where the floating panel remembers itself: position (left/top/right) and,
// since the panel became resizable, its size (width/height).
//
// localStorage rather than chrome.storage on purpose — this is per-tab-origin
// chrome furniture, not a synced setting, and the panel needs it synchronously
// while it is being built.

const PANEL_STORAGE_KEY = "cdd-stoich-panel-state";

export function loadPanelState() {
    try {
        const parsed = JSON.parse(localStorage.getItem(PANEL_STORAGE_KEY) || "{}");
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

// Merges into whatever is stored, so saving a size never forgets a position.
export function savePanelState(partialState) {
    const currentState = loadPanelState();

    try {
        localStorage.setItem(
            PANEL_STORAGE_KEY,
            JSON.stringify({
                ...currentState,
                ...partialState,
            })
        );
    } catch {
        /* a full or blocked localStorage must not break the panel */
    }
}
