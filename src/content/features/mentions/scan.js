// content/features/mentions/scan.js
//
// Finding the batch and sample links written into an ELN entry's body.
//
// CDD renders every one of them as an ordinary <a> whose href is a deep link
// into the molecule page:
//
//   /vaults/<vault>/molecules/<molecule>#molecule-batches/<batchId>
//   /vaults/<vault>/molecules/<molecule>#molecule-inventory_samples/<sampleId>
//
// That href is the whole identity — vault, molecule and the record's own id —
// so nothing here has to understand the editor's document model. It also
// covers both shapes the entry can hold: a link typed inline into the text
// (a Slate `.slate-a`) and one that is part of an embedded card, which look
// nothing alike in the DOM but carry the same href.
//
// The vault in the href is the molecule's HOME vault, which is often NOT the
// vault the entry lives in (an ELN vault links to a registration vault). It
// is kept as-is: fetching through it skips a redirect.

const MENTION_LINK_SELECTOR =
    'a[href*="#molecule-batches/"], a[href*="#molecule-inventory_samples/"]';

const HREF_PATTERN =
    /\/vaults\/(\d+)\/molecules\/(\d+)#molecule-(batches|inventory_samples)\/(\d+)/;

export const KIND_BATCH = "batch";
export const KIND_SAMPLE = "sample";

export function mentionKey(mention) {
    return `${mention.kind}:${mention.id}`;
}

function parseHref(href) {
    const match = HREF_PATTERN.exec(String(href || ""));
    if (!match) return null;

    return {
        vaultId: match[1],
        moleculeId: match[2],
        kind: match[3] === "batches" ? KIND_BATCH : KIND_SAMPLE,
        id: match[4],
    };
}

/**
 * Every batch/sample link in the entry, deduped — the same batch mentioned
 * three times is one card, not three.
 *
 * `panelRoot` is excluded so the panel can never read its own output back in
 * (it renders no such links today, but a card that grew one would otherwise
 * multiply on every scan).
 */
export function scanMentions(panelRoot) {
    const out = [];
    const seen = new Set();

    for (const link of document.querySelectorAll(MENTION_LINK_SELECTOR)) {
        if (panelRoot && panelRoot.contains(link)) continue;

        const parsed = parseHref(link.getAttribute("href"));
        if (!parsed) continue;

        const key = mentionKey(parsed);
        if (seen.has(key)) continue;
        seen.add(key);

        out.push({ ...parsed, text: (link.textContent || "").replace(/\s+/g, " ").trim() });
    }

    return out;
}

// Cheap "did anything change" key, so a mutation burst that did not touch the
// links does not trigger a refetch or a re-render.
export function mentionsSignature(mentions) {
    return mentions.map(mentionKey).sort().join("|");
}
