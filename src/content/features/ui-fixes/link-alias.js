// content/features/ui-fixes/link-alias.js
//
// Insert link → pick a batch or a sample → Display Options. CDD offers
// "Description" (free text) and the record's identifier as radio choices.
// This adds one more choice next to the identifier: the batch's Internal ID
// (or the field set in Settings), e.g. "ab123". Nothing is chosen for you —
// it is there to pick.
//
// CDD's choices live in React state the extension cannot add to, so the
// extra radio is a shortcut onto the one free-text choice CDD has: picking
// it writes the value into Description, which CDD then selects itself. The
// extra radio shows as picked exactly while Description is picked and holds
// that value, so it unticks as soon as another choice is made or the text
// is edited.
//
// Batch and sample links only: a molecule has many batches, so "its"
// Internal ID is undefined (and CDD offers synonyms there already). A batch
// with the field empty gets no extra choice. Not for `@` (no Display
// Options) nor Bulk link (one display choice for all items).

import { watchDocument, setNativeValue } from "../../utils/dom.js";
import { getBatchFieldData } from "../../api/batch-fields.js";
import { fetchMoleculeSamples } from "../mentions/store.js";
import { fieldLabelsMatch } from "../../../shared/eln-id-carry.js";
import { currentLinkAliasField, initLinkAliasField } from "../../../shared/link-alias.js";

const OPTIONS = '[data-autotest-id="display-options"]';
const SEARCH_INPUT = '[data-autotest-id="link-url-input-field"]';
const DESCRIPTION_INPUT = '[data-autotest-id="link-description-field"]';
const RADIO_ROW = '[data-autotest-id="radio-button"]';
const ALIAS_ROW_ATTR = "data-cdd-link-alias";

// …/vaults/<vault>/molecules/<molecule>#molecule-(batches|inventory_samples)/<id>
const LINK_PATTERN =
    /\/vaults\/(\d+)\/molecules\/(\d+)#molecule-(batches|inventory_samples)\/(\d+)/;

// display-options element -> { url, alias | null | undefined (pending) }
const state = new WeakMap();
// display-options elements already listening for other choices.
const listening = new WeakSet();

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
    return field?.value?.trim() || null;
}

function popupOf(options) {
    let node = options;
    while (node && !node.querySelector(SEARCH_INPUT)) node = node.parentElement;
    return node;
}

function descriptionParts(options) {
    const input = options.querySelector(DESCRIPTION_INPUT);
    const radio = input?.closest(RADIO_ROW)?.querySelector('input[type="radio"]');
    return { input, radio };
}

// CDD's identifier choice: the radio row that is not Description and not ours.
function identifierRow(options) {
    return [...options.querySelectorAll(RADIO_ROW)].find(
        (row) => !row.querySelector(DESCRIPTION_INPUT) && !row.hasAttribute(ALIAS_ROW_ATTR)
    );
}

function syncChecked(options, alias) {
    const row = options.querySelector(`[${ALIAS_ROW_ATTR}]`);
    const ours = row?.querySelector('input[type="radio"]');
    if (!ours) return;
    const { input, radio } = descriptionParts(options);
    ours.checked = !!(radio?.checked && input?.value === alias);
}

function pick(options, alias) {
    const { input, radio } = descriptionParts(options);
    if (!input) return;
    setNativeValue(input, alias);
    if (radio && !radio.checked) radio.click();
    syncChecked(options, alias);
}

// A copy of CDD's own identifier row, so it looks like the others; cloneNode
// carries no React handlers, so it is inert until wired here.
function ensureAliasRow(options, alias) {
    if (options.querySelector(`[${ALIAS_ROW_ATTR}]`)) return;
    const template = identifierRow(options);
    if (!template) return;

    const row = template.cloneNode(true);
    row.setAttribute(ALIAS_ROW_ATTR, "");
    row.removeAttribute("data-autotest-id");
    row.title = `${currentLinkAliasField()} of this batch`;

    const radio = row.querySelector('input[type="radio"]');
    if (!radio) return;
    radio.checked = false;
    radio.removeAttribute("id");
    radio.value = "";

    const label = [...row.querySelectorAll("span")].reverse().find((s) => !s.children.length);
    if (label) label.textContent = `${alias} (${currentLinkAliasField()})`;

    row.addEventListener("click", (event) => {
        event.stopPropagation();
        pick(options, alias);
    });

    // Appended after CDD's last choice, inside the same wrapper: the end of a
    // list is where a foreign node is least in React's way.
    template.parentElement.appendChild(row);

    // Any other choice, or editing the Description text, unticks ours.
    if (!listening.has(options)) {
        listening.add(options);
        const resync = () => {
            const current = state.get(options)?.alias;
            if (current) syncChecked(options, current);
        };
        options.addEventListener("change", resync, true);
        options.addEventListener("input", resync, true);
    }
    syncChecked(options, alias);
}

function check() {
    const options = document.querySelector(OPTIONS);
    if (!options) return;
    const url = popupOf(options)?.querySelector(SEARCH_INPUT)?.value || "";
    if (!LINK_PATTERN.test(url)) return;

    const known = state.get(options);
    if (known?.url === url) {
        // CDD may re-render the wrapper and drop the row; put it back.
        if (known.alias) ensureAliasRow(options, known.alias);
        return;
    }

    // A different link in the same popup: the old row belongs to the old one.
    options.querySelector(`[${ALIAS_ROW_ATTR}]`)?.remove();
    const entry = { url, alias: undefined };
    state.set(options, entry);
    aliasFor(url)
        .catch(() => null)
        .then((alias) => {
            if (state.get(options) !== entry) return;
            entry.alias = alias;
            if (alias && options.isConnected) ensureAliasRow(options, alias);
        });
}

export function initLinkAlias() {
    initLinkAliasField();
    watchDocument(check);
}
