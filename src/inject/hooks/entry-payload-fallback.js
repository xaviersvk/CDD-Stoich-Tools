// inject/hooks/entry-payload-fallback.js
//
// Opening an ELN entry does not put its payload on the wire.
//
// Measured on entry 2761893: a full load AND a Turbo navigation from the
// entry list both leave the panel reporting "0 sample(s) from 0 reaction(s)",
// while `/vaults/<vault>/eln/v2/entries/<id>` serves the complete thing —
// two reactions, six rows each. CDD renders the entry from data it already
// holds, so installFetchHook has nothing to catch. The panel only woke up on
// the first autosave, whose RESPONSE carries the payload: the user had to
// edit the entry to see it.
//
// So ask for it ourselves. The answer travels back through installFetchHook
// like any other response, which is why nothing here parses or posts — the
// request IS the whole fix.
//
// Once per entry per page session, and only after a grace period: if CDD (or
// a save) produces the payload on its own the request is never made.

const GRACE_MS = 2500;

// Entry ids we have already asked for, so a Turbo round trip through the list
// and back does not repeat the request.
const asked = new Set();

function currentEntry() {
    const match = (location.pathname || "").match(
        /^\/vaults\/(\d+)\/eln\/entries\/(\d+)/
    );
    return match ? { vaultId: match[1], entryId: match[2] } : null;
}

// Turbo swaps the document without a navigation event, so the URL has to be
// watched rather than the page.
function onUrlChange(callback) {
    let last = location.href;

    const fire = () => {
        if (location.href === last) return;
        last = location.href;
        callback();
    };

    for (const method of ["pushState", "replaceState"]) {
        const original = history[method];
        if (typeof original !== "function") continue;
        history[method] = function (...args) {
            const result = original.apply(this, args);
            setTimeout(fire, 0);
            return result;
        };
    }

    window.addEventListener("popstate", () => setTimeout(fire, 0));
}

/**
 * installEntryPayloadFallback(hasPayloadFor)
 *
 * @param hasPayloadFor (entryId: string) => boolean — true once a payload for
 *   that entry has passed through processJsonPayload. Checked at the END of
 *   the grace period, never before: an entry whose payload arrived on its own
 *   costs no request.
 */
export function installEntryPayloadFallback(hasPayloadFor) {
    const schedule = () => {
        const entry = currentEntry();
        if (!entry || asked.has(entry.entryId)) return;

        setTimeout(() => {
            // Re-read the location: the user may have moved on during the wait.
            const still = currentEntry();
            if (!still || still.entryId !== entry.entryId) return;
            if (asked.has(entry.entryId) || hasPayloadFor(entry.entryId)) return;

            asked.add(entry.entryId);
            fetch(`/vaults/${entry.vaultId}/eln/v2/entries/${entry.entryId}`, {
                credentials: "include",
                headers: { Accept: "application/json" },
            }).catch((err) => {
                // A failed request means the panel stays empty, which is the
                // state we were in anyway. Nothing to recover.
                console.debug("[CDD Stoich Tools] entry payload request failed", err);
            });
        }, GRACE_MS);
    };

    schedule();
    onUrlChange(schedule);
}
