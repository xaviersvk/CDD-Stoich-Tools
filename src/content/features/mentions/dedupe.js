// content/features/mentions/dedupe.js
//
// A substance that is already a row in a stoichiometry table must not appear
// a second time as a mention. It happens easily: writing "we used
// RGT-0000204-002-I003520" in the text AND putting that bottle in the table
// is the normal way to record an experiment, not a mistake.
//
// Matching is by ID, never by name. The two sources name the same record
// differently — the table row calls that bottle `I003520` (its
// sample_identifier) while the link in the text calls it
// `RGT-0000204-002-I003520` (its full name) — so any name comparison would
// miss exactly the case this exists for.
//
// Two keys, because a mention can be either kind:
//   - the SAMPLE id catches the same bottle in both places;
//   - the BATCH id catches the same substance, which is what a reader means
//     by "it is already in the table". That also hides a mention of a
//     DIFFERENT bottle of a batch the table already carries, which is the
//     intended reading and the reason the hidden ones are counted out loud
//     rather than just dropped.

function idSet(samples, key) {
    const out = new Set();
    for (const sample of samples || []) {
        const value = sample?.[key];
        if (value != null && value !== "") out.add(String(value));
    }
    return out;
}

/**
 * Split mentions into the ones worth showing and the ones the table already
 * covers.
 *
 * Returns { kept, hidden } — `hidden` is a count, so the panel can say so
 * instead of letting cards disappear without explanation.
 */
export function splitMentionsAlreadyShown(mentions, tableSamples) {
    if (!mentions?.length) return { kept: [], hidden: 0 };
    if (!tableSamples?.length) return { kept: mentions, hidden: 0 };

    const sampleIds = idSet(tableSamples, "sampleId");
    const batchIds = idSet(tableSamples, "batchId");

    const kept = [];
    let hidden = 0;

    for (const mention of mentions) {
        const known =
            (mention?.sampleId != null && sampleIds.has(String(mention.sampleId)))
            || (mention?.batchId != null && batchIds.has(String(mention.batchId)));

        if (known) hidden += 1;
        else kept.push(mention);
    }

    return { kept, hidden };
}
