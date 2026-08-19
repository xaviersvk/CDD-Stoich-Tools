// content/features/mentions/init.js
//
// Keeps the "Mentioned in text" cards in step with the entry body.
//
// The body is a live editor: links appear as they are typed, and CDD
// re-renders large parts of it on every autosave. So the scan is driven by a
// MutationObserver like the rest of the content features — but it compares a
// SIGNATURE of what it found before doing anything. An autosave that
// rearranged the DOM without touching a single link costs one
// querySelectorAll and stops there: no fetch, no re-render, and above all no
// render loop, since rendering the panel is itself a mutation.

import { isElnEntryPage } from "../../../shared/page-detection.js";
import { isMentionsEnabled, onPanelSourcesChanged } from "../../../shared/panel-sources-flag.js";
import { getPanelRoot, renderFromState } from "../sample-panel.js";
import { mentionKey, mentionsSignature, scanMentions } from "./scan.js";
import { setMentionSamples } from "./state.js";
import { buildMentionSample, fetchMoleculeSamples } from "./store.js";
import { enrichSampleSynonyms } from "../synonym-enrichment.js";

let started = false;
let signature = "";
let hasCards = false;

function clear() {
    if (!signature && !hasCards) return false;
    signature = "";
    hasCards = false;
    setMentionSamples([]);
    return true;
}

async function refresh() {
    if (!isElnEntryPage() || !isMentionsEnabled()) {
        if (clear()) renderFromState();
        return;
    }

    const mentions = scanMentions(getPanelRoot());
    const next = mentionsSignature(mentions);
    if (next === signature) return;
    signature = next;

    if (!mentions.length) {
        hasCards = false;
        setMentionSamples([]);
        renderFromState();
        return;
    }

    // One request per molecule, however many of its records are mentioned.
    const molecules = new Map();
    for (const mention of mentions) {
        if (!molecules.has(mention.moleculeId)) {
            molecules.set(mention.moleculeId, fetchMoleculeSamples(mention.vaultId, mention.moleculeId));
        }
    }

    const indexes = new Map();
    await Promise.all(
        Array.from(molecules, async ([moleculeId, promise]) => {
            try {
                indexes.set(moleculeId, await promise);
            } catch {
                // A molecule in a vault this user cannot read still gets a
                // card, built from the link text alone.
                indexes.set(moleculeId, { bySampleId: new Map(), byBatchId: new Map() });
            }
        })
    );

    // A newer scan may have finished while these requests were in flight.
    if (signature !== next) return;

    const seen = new Set();
    const cards = mentions
        .filter((mention) => {
            const key = mentionKey(mention);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .map((mention) => buildMentionSample(mention, indexes.get(mention.moleculeId)));

    hasCards = cards.length > 0;
    setMentionSamples(cards);
    renderFromState();

    // These cards never pass through SAMPLE_DATA, so nothing else would ever
    // ask for their synonym. No-op unless the Synonym panel field is on.
    enrichSampleSynonyms();
}

export function initElnMentions() {
    if (started) return;
    started = true;

    let scheduled = false;
    function schedule() {
        if (scheduled) return;
        scheduled = true;
        setTimeout(() => {
            scheduled = false;
            refresh().catch(() => { /* a failed scan must not break the page */ });
        }, 400);
    }

    schedule();

    // Turning the source off should empty the group immediately, not at the
    // next stray mutation.
    onPanelSourcesChanged(() => {
        signature = "";
        schedule();
    });

    // <html>, not <body>: Turbo swaps <body> on in-app navigation, which
    // would silently kill an observer attached to the old body.
    new MutationObserver(schedule).observe(document.documentElement, {
        childList: true,
        subtree: true,
    });
}
