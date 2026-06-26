import { copyText } from "../../utils/clipboard.js";

let savedSearchCopyLinksInitialized = false;

export function initSavedSearchCopyLinks() {
    injectSavedSearchCopyLinkStyles();

    // Always set up the observer, regardless of the current path: the user may
    // arrive at /searches later via in-app (Turbo) navigation, not just on a
    // direct load. The path check lives in addCopyLinksToSavedSearches so every
    // entry point is covered.
    if (savedSearchCopyLinksInitialized) {
        addCopyLinksToSavedSearches();
        return;
    }
    savedSearchCopyLinksInitialized = true;

    let scheduled = false;
    const run = () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            addCopyLinksToSavedSearches();
        });
    };

    const observer = new MutationObserver(run);
    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });

    run();
}

function addCopyLinksToSavedSearches() {
    if (!location.pathname.endsWith("/searches")) return;

    const rows = document.querySelectorAll("tr.mainRow[id^='saved_search_session-']");

    rows.forEach((row) => {
        if (row.querySelector(".cdd-copy-search-link")) return;

        const searchButton = row.querySelector("td.savedSearches-run a[href*='/searches/']");
        const actionsCell = row.querySelector("td.actions");

        if (!searchButton || !actionsCell) return;

        const copyLink = document.createElement("a");
        copyLink.href = "#";
        copyLink.textContent = "Copy Link";
        copyLink.className = "cdd-copy-search-link";

        copyLink.addEventListener("click", async (event) => {
            event.preventDefault();
            event.stopPropagation();

            const absoluteUrl = new URL(searchButton.getAttribute("href"), window.location.origin).href;

            await copyText(absoluteUrl);
            showCopySuccess(copyLink);
        });

        const deleteLink = actionsCell.querySelector("a");

        if (deleteLink) {
            deleteLink.insertAdjacentElement("afterend", copyLink);
        } else {
            actionsCell.appendChild(copyLink);
        }
    });
}

function showCopySuccess(element) {
    const originalText = element.textContent;
    element.textContent = "Copied";
    element.classList.add("copied");

    setTimeout(() => {
        element.textContent = originalText;
        element.classList.remove("copied");
    }, 1200);
}

function injectSavedSearchCopyLinkStyles() {
    if (document.getElementById("cdd-copy-search-link-style")) return;

    const style = document.createElement("style");
    style.id = "cdd-copy-search-link-style";
    style.textContent = `
    td.actions {
        white-space: nowrap;
        vertical-align: middle !important;
    }

    td.actions a {
        display: inline-flex;
        align-items: center;
        vertical-align: middle;
        line-height: 1;
    }

    .cdd-copy-search-link {
        margin-left: 14px;
        color: #0074d9;
        cursor: pointer;
        text-decoration: none;
        font-size: 13px;
    }

    .cdd-copy-search-link:hover {
        text-decoration: underline;
    }

    .cdd-copy-search-link.copied {
        color: #2ca01c;
        font-weight: 600;
    }
`;

    document.head.appendChild(style);
}