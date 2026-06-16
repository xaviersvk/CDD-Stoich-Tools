import { isElnEntryPage } from "../../shared/page-detection.js";

let observer = null;
let currentElnTitleMode = "id-title";
let originalDocumentTitle = null;

const ELN_TITLE_MODE_KEY = "cddPluginElnTitleMode";
const DEFAULT_ELN_TITLE_MODE = "id-title";

export function initElnTitle() {
    loadElnTitleMode();

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local") return;
        if (!changes[ELN_TITLE_MODE_KEY]) return;

        currentElnTitleMode =
            changes[ELN_TITLE_MODE_KEY].newValue || DEFAULT_ELN_TITLE_MODE;

        updateElnTabTitle();
    });

    runOnlyOnElnEntryPage();

    window.addEventListener("popstate", runOnlyOnElnEntryPage);
    window.addEventListener("hashchange", runOnlyOnElnEntryPage);

    const navigationObserver = new MutationObserver(() => {
        runOnlyOnElnEntryPage();
    });

    navigationObserver.observe(document.body, {
        childList: true,
        subtree: true,
    });
}

function loadElnTitleMode() {
    chrome.storage.local.get(
        { [ELN_TITLE_MODE_KEY]: DEFAULT_ELN_TITLE_MODE },
        (result) => {
            currentElnTitleMode =
                result[ELN_TITLE_MODE_KEY] || DEFAULT_ELN_TITLE_MODE;

            updateElnTabTitle();
        }
    );
}

function runOnlyOnElnEntryPage() {
    if (!isElnEntryPage()) {
        stopTitleObserver();
        originalDocumentTitle = null;
        return;
    }

    startTitleObserver();
    updateElnTabTitle();
}

function getEntryId() {
    const idElement = [...document.querySelectorAll("div")]
        .find(el => el.textContent?.trim().startsWith("ID:"));

    if (!idElement) return null;

    return idElement.textContent
        .replace("ID:", "")
        .trim();
}

function startTitleObserver() {
    if (observer) return;

    observer = new MutationObserver(() => {
        updateElnTabTitle();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });
}

function stopTitleObserver() {
    if (!observer) return;

    observer.disconnect();
    observer = null;
}

function restoreOriginalTitle() {
    if (originalDocumentTitle && document.title !== originalDocumentTitle) {
        document.title = originalDocumentTitle;
    }
}

function updateElnTabTitle() {
    const titleElement = document.querySelector('[data-autotest-id="title"]');
    if (!titleElement) return;

    const elnTitle = titleElement.value?.trim();
    if (!elnTitle) return;

    const entryId = getEntryId();

    let newTitle = null;

    switch (currentElnTitleMode) {
        case "original":
            restoreOriginalTitle();
            return;

        case "title-only":
            newTitle = `${elnTitle}`;
            break;

        case "id-title":
        default:
            newTitle = entryId
                ? `${entryId} - ${elnTitle}`
                : `${elnTitle}`;
            break;
    }

    if (originalDocumentTitle === null && !document.title.startsWith("ELN: ")) {
        originalDocumentTitle = document.title;
    }

    if (document.title !== newTitle) {
        document.title = newTitle;
    }
}