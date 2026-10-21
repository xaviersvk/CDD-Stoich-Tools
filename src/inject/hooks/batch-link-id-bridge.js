// inject/hooks/batch-link-id-bridge.js
//
// Page-world half of content/features/ui-fixes/batch-link-synonyms.js.
//
// A run's BatchLink fields (run page, Details) render as <a title="NAME">
// with no href: the batch's id sits only in the React props of the field
// component above it (`field.value.batch_link_id`). Fiber expandos are
// invisible to the content script, so this stamps the id onto the <a> as
// `data-cdd-batch-link-id`; DOM attributes are shared by both worlds.
//
// Read-only: nothing is written to React, and an <a> that already has an
// href is left alone.

const ATTR = "data-cdd-batch-link-id";
const LINK_SELECTOR = `.ProtocolAnnotator-table a:not([href]):not([${ATTR}])`;
const MAX_WALK = 6;

function fiberOf(element) {
    const key = Object.keys(element).find((k) => k.startsWith("__reactFiber$"));
    return key ? element[key] : null;
}

// Measured: <a> -> sanitizeUrls(a) -> fragment -> field component, whose
// props carry `field: { value: { batch_link_id }, definition: { data_type_name } }`.
function batchLinkIdOf(link) {
    let cursor = fiberOf(link);
    for (let step = 0; cursor && step < MAX_WALK; step += 1) {
        const field = cursor.memoizedProps?.field;
        if (field && field.definition?.data_type_name === "BatchLink") {
            const id = field.value?.batch_link_id;
            return id != null ? String(id) : null;
        }
        cursor = cursor.return;
    }
    return null;
}

function stamp() {
    for (const link of document.querySelectorAll(LINK_SELECTOR)) {
        // Stamped even when empty, so a link without an id is not walked on
        // every mutation.
        link.setAttribute(ATTR, batchLinkIdOf(link) ?? "");
    }
}

export function installBatchLinkIdBridge() {
    let scheduled = false;
    const schedule = () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            try {
                stamp();
            } catch (err) {
                console.debug("[CDD Stoich Tools] batch link id stamp failed", err);
            }
        });
    };
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
    schedule();
}
