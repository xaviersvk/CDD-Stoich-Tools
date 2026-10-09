// content/features/ui-fixes/link-alias.js
//
// Insert link → pick a batch or a sample → Display Options. CDD offers
// "Description" (free text) and the record's identifier. This fills the
// Description with a batch field the chemist actually uses as a name —
// Internal ID by default, configurable in Settings — and selects it, so
// the link reads "ab123" instead of "IXX-DEMO-0000011-001-SM000008".
// The identifier stays one click away.
//
// Batch and sample links only: a molecule has many batches, so "its"
// Internal ID is undefined (and CDD offers synonyms there already). A batch
// with the field empty is left as CDD offers it. Not for `@` (no Display
// Options — changing the text would mean editing the document) nor Bulk
// link (one display choice for all items, no description).
//
// Once per popup and link: picking the identifier again, or typing your own
// description, is never overwritten.

import { watchDocument, setNativeValue } from "../../utils/dom.js";
import { getBatchFieldData } from "../../api/batch-fields.js";
import { fetchMoleculeSamples } from "../mentions/store.js";
import { fieldLabelsMatch } from "../../../shared/eln-id-carry.js";
import { currentLinkAliasField, initLinkAliasField } from "../../../shared/link-alias.js";

const OPTIONS = '[data-autotest-id="display-options"]';
const SEARCH_INPUT = '[data-autotest-id="link-url-input-field"]';
const DESCRIPTION_INPUT = '[data-autotest-id="link-description-field"]';

// …/vaults/<vault>/molecules/<molecule>#molecule-(batches|inventory_samples)/<id>
const LINK_PATTERN =
    /\/vaults\/(\d+)\/molecules\/(\d+)#molecule-(batches|inventory_samples)\/(\d+)/;

const handled = new WeakMap();  // display-options element -> link URL done

async function batchIdOf(vaultId, moleculeId, kind, id) {
    if (kind === "batches") return id;
    const { bySampleId } = await fetchMoleculeSamples(vaultId, moleculeId);
    const sample = bySampleId.get(String(id));
    return sample?.batch_id != null ? String(sample.batch_id) : null;
}

async function aliasFor(url) {
    const match = LINK_PATTERN.exec(url);
    if (!match) return null;
    const [, vaultId, moleculeId, kind, id] = match;

    const batchId = await batchIdOf(vaultId, moleculeId, kind, id);
    if (!batchId) return null;

    const { batches } = await getBatchFieldData(vaultId, moleculeId);
    const batch = batches.find((b) => String(b.batchId) === batchId);
    const field = batch?.fields.find((f) => fieldLabelsMatch(f.label, currentLinkAliasField()));
    const value = field?.value?.trim();
    return value || null;
}

function popupOf(options) {
    let node = options;
    while (node && !node.querySelector(SEARCH_INPUT)) node = node.parentElement;
    return node;
}

async function offerAlias(options, url) {
    let alias = null;
    try {
        alias = await aliasFor(url);
    } catch {
        return;  // a failed lookup leaves CDD's own choice
    }
    if (!alias || !options.isConnected) return;

    // Still the same link, and nobody has typed a description meanwhile.
    const popup = popupOf(options);
    if (popup?.querySelector(SEARCH_INPUT)?.value !== url) return;
    const description = options.querySelector(DESCRIPTION_INPUT);
    if (!description || description.value.trim()) return;

    setNativeValue(description, alias);
    const radio = description
        .closest('[data-autotest-id="radio-button"]')
        ?.querySelector('input[type="radio"]');
    if (radio && !radio.checked) radio.click();
}

function check() {
    const options = document.querySelector(OPTIONS);
    if (!options) return;
    const url = popupOf(options)?.querySelector(SEARCH_INPUT)?.value || "";
    if (!LINK_PATTERN.test(url) || handled.get(options) === url) return;
    handled.set(options, url);
    offerAlias(options, url);
}

export function initLinkAlias() {
    initLinkAliasField();
    watchDocument(check);
}
