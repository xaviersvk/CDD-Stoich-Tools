let savedSearchCopyLinksInitialized = false;

export function initSavedSearchCopyLinks() {
    if (!location.pathname.endsWith("/searches")) return;

    injectSavedSearchCopyLinkStyles();
    addCopyLinksToSavedSearches();

    if (savedSearchCopyLinksInitialized) return;
    savedSearchCopyLinksInitialized = true;

    const observer = new MutationObserver(() => {
        if (!location.pathname.endsWith("/searches")) return;
        addCopyLinksToSavedSearches();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });
}

function addCopyLinksToSavedSearches() {
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

            try {
                await navigator.clipboard.writeText(absoluteUrl);
                showCopySuccess(copyLink);
            } catch (error) {
                fallbackCopyText(absoluteUrl);
                showCopySuccess(copyLink);
            }
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

function fallbackCopyText(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
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