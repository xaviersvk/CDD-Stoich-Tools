let observer = null;

export function initElnTitle() {
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

function runOnlyOnElnEntryPage() {
    if (!isElnEntryPage()) {
        stopTitleObserver();
        return;
    }

    startTitleObserver();
    updateElnTabTitle();
}

function isElnEntryPage() {
    return /^\/vaults\/\d+\/eln\/entries\/\d+/.test(location.pathname);
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

function updateElnTabTitle() {
    const titleElement = document.querySelector(
        '[data-autotest-id="title"]'
    );

    if (!titleElement) return;

    const elnTitle = titleElement.value?.trim();

    if (!elnTitle) return;

    if (document.title !== elnTitle) {
        document.title = `ELN: ${elnTitle}`;
    }
}