// content/features/sample-picker-hints.js
//
// The batch / sample picker of a stoichiometry row (an ELN entry, "Select a
// batch" → "Select a sample"): depleted samples crossed out as soon as the
// picker shows them, and the sample people actually use in bold.
//
// Timing is the point. The depleted list used to come only from the entry's
// own payload, which CDD sends after it saves — measured on + Reagent: entity
// picked, /molecules/<id>.json at +1.0 s, the save at +2.9 s taking 2.5 s,
// so samples showed plain for ~5 s before some were crossed out. Now the
// samples are fetched when the entity is known: CDD's /molecules/<id>.json
// (EVENTS.MOLECULE_LOADED) gives name → id, and the moment the picker shows
// that entity's batch radios we load its samples (api/molecule-samples.js),
// depleted included — they are in before a batch is picked. When CDD itself
// loads them with include_depleted (EVENTS.MOLECULE_SAMPLES) that answer is
// used and nothing is refetched; its own post-save lookups leave depleted
// samples out, so those are not used.
//
// "Most used" = the most debits in the sample's inventory history, ties to
// the most recent debit; a depleted sample is never recommended, and a
// sample nobody has debited is never bold. The batch holding that sample
// is bold too, when there is a choice of batches. Hovering shows the usage.
//
// Picker DOM (CDD, verified 2026-09-23):
//   [data-autotest-id="molecule-selector"] input      → entity name (editing a row)
//   the picker's plain Name input                      → entity name (+ Reagent)
//   [data-autotest-id="batchInformation__radio"] input[type=radio]  value = batch name
//   [data-autotest-id="sampleInformation__radio"] input[type=radio] value = sample_identifier
//   each radio sits in [data-autotest-id="radio-button"].

import { STATE } from "../state.js";
import { getMoleculeSamples, seedMoleculeSamples } from "../api/molecule-samples.js";
import { markDepletedSamplesInSelector } from "./depleted-marker.js";

const LOG_PREFIX = "[CDD stoich plugin]";
const STYLE_ID = "cdd-sample-picker-hints-style";
const MOST_USED_CLASS = "cdd-picker-most-used";
const SAMPLE_SELECTOR = '[data-autotest-id="sampleInformation__radio"] input[type="radio"]';
const BATCH_SELECTOR = '[data-autotest-id="batchInformation__radio"] input[type="radio"]';
const ENTITY_SELECTOR = '[data-autotest-id="molecule-selector"] input';

// Entity name → { vaultId, moleculeId }, learned from CDD's own requests.
const moleculesByName = new Map();
let lastLooked = null; // the molecule CDD looked up most recently
// Resolved sample lists, so the (synchronous) DOM pass can read them.
const loaded = new Map(); // moleculeId → SampleInfo[]

let started = false;
let schedule = () => {};

/* ------------------------------------------------------------------ *
 * Data
 * ------------------------------------------------------------------ */

const requested = new Set(); // moleculeIds with a fetch under way

function load(vaultId, moleculeId) {
    if (loaded.has(moleculeId) || requested.has(moleculeId)) return;
    requested.add(moleculeId);
    getMoleculeSamples(vaultId, moleculeId)
        .then((samples) => {
            loaded.set(moleculeId, samples);
            schedule();
        })
        .catch((error) => console.warn(LOG_PREFIX, "picker hints: samples of", moleculeId, error))
        .finally(() => requested.delete(moleculeId));
}

function inThisVault(vaultId) {
    // CDD also looks up shared/public vaults' molecules; those have no
    // samples of ours.
    const vault = location.pathname.match(/^\/vaults\/(\d+)/)?.[1];
    return !vault || String(vaultId) === vault;
}

// EVENTS.MOLECULE_LOADED: CDD looked up an entity the picker may offer. Only
// the name → id pair is kept; the samples are fetched once the picker shows
// that entity — opening a picker looks up dozens of molecules.
export function notePickedMolecule(payload) {
    if (!payload?.moleculeId || !payload?.name || !inThisVault(payload.vaultId)) return;
    lastLooked = {
        vaultId: String(payload.vaultId),
        moleculeId: String(payload.moleculeId),
    };
    moleculesByName.set(payload.name.trim(), lastLooked);
    schedule();
}

// EVENTS.MOLECULE_SAMPLES: CDD loaded a molecule's samples itself.
export function noteMoleculeSamples(payload) {
    if (!payload?.moleculeId || !inThisVault(payload.vaultId)) return;
    const id = String(payload.moleculeId);
    loaded.set(id, seedMoleculeSamples(String(payload.vaultId), id, payload.samples));
    schedule();
}

// The sample to recommend among `samples`, or null.
function mostUsed(samples) {
    let best = null;
    for (const s of samples) {
        if (s.depleted || s.debitCount === 0) continue;
        if (
            !best
            || s.debitCount > best.debitCount
            || (s.debitCount === best.debitCount && (s.lastDebit || "") > (best.lastDebit || ""))
        ) {
            best = s;
        }
    }
    return best;
}

/* ------------------------------------------------------------------ *
 * DOM
 * ------------------------------------------------------------------ */

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        .${MOST_USED_CLASS},
        .${MOST_USED_CLASS} * {
            font-weight: bold !important;
        }
    `;
    (document.head || document.documentElement).appendChild(style);
}

// Two pickers, one shape: editing a row shows an "Entity" select
// (molecule-selector); a row added with + Reagent shows its "Name" field,
// which holds the entity once one is picked from the suggestions. Either
// way the root is the nearest ancestor holding a text input.
const TEXT_INPUT = 'input:not([type="radio"]):not([type="checkbox"]):not([type="hidden"])';

function pickerRoot(radioBox) {
    let el = radioBox;
    for (let i = 0; i < 12 && el; i += 1) {
        if (el.querySelector?.(ENTITY_SELECTOR) || el.querySelector?.(TEXT_INPUT)) return el;
        el = el.parentElement;
    }
    return null;
}

function entityName(root) {
    return (root.querySelector(ENTITY_SELECTOR) || root.querySelector(TEXT_INPUT))?.value?.trim() || "";
}

function describe(s) {
    const parts = [];
    parts.push(s.debitCount === 1 ? "1 debit" : `${s.debitCount} debits`);
    if (s.lastDebit) parts.push(`last ${s.lastDebit.slice(0, 10)}`);
    if (s.amount != null) parts.push(`${Math.round(Number(s.amount) * 100) / 100} ${s.units} left`);
    return parts.join(" · ");
}

// Bold (or not) one radio's label, and its tooltip. Idempotent: a pass that
// changes nothing touches nothing, so our own observer settles. CDD reuses
// radio nodes across batches, so the class is also taken OFF every time.
// Only a tooltip we set is ever cleared (marked in the dataset).
function setHint(radio, bold, title) {
    const wrapper = radio.closest('[data-autotest-id="radio-button"]') || radio.parentElement;
    if (!wrapper) return;
    if (wrapper.classList.contains(MOST_USED_CLASS) !== bold) {
        wrapper.classList.toggle(MOST_USED_CLASS, bold);
    }
    if (title) {
        if (wrapper.title !== title) wrapper.title = title;
        wrapper.dataset.cddHintTitle = "1";
    } else if (wrapper.dataset.cddHintTitle) {
        wrapper.removeAttribute("title");
        delete wrapper.dataset.cddHintTitle;
    }
}

function decorate(root) {
    // By name; a Name field can hold a synonym instead, and then the entity
    // is the one CDD looked up last — it does so the instant one is picked.
    const molecule = moleculesByName.get(entityName(root))
        || (!root.querySelector(ENTITY_SELECTOR) && lastLooked);
    if (!molecule) return;
    const samples = loaded.get(molecule.moleculeId);
    if (!samples) {
        // The entity was just chosen: start on its samples now, so they are
        // in by the time a batch is picked.
        load(molecule.vaultId, molecule.moleculeId);
        return;
    }

    const byId = new Map(samples.map((s) => [s.identifier, s]));
    const radios = [...root.querySelectorAll(SAMPLE_SELECTOR)];
    const batchRadios = [...root.querySelectorAll(BATCH_SELECTOR)]
        .filter((r) => !/unspecified/i.test(r.value || ""));

    // The fallback guess can be wrong (a save makes CDD look up every row's
    // molecule): only go on when what the picker shows is this molecule's.
    const shownSamples = radios.map((r) => r.value?.trim()).filter((v) => v && !/unspecified/i.test(v));
    if (shownSamples.length) {
        if (!shownSamples.every((v) => byId.has(v))) return;
    } else if (samples.length && batchRadios.length) {
        const batches = new Set(batchRadios.map((r) => r.value?.trim()));
        if (!samples.some((s) => batches.has(s.batchName))) return;
    }

    // Depleted: straight into the set the existing marker reads.
    let added = false;
    for (const s of samples) {
        if (s.depleted && !STATE.depletedIdentifiers.has(s.identifier)) {
            STATE.depletedIdentifiers.add(s.identifier);
            added = true;
        }
    }
    if (added) markDepletedSamplesInSelector();

    // Bold: the most used sample of those shown (the chosen batch's). Every
    // live sample tells its usage on hover.
    const shown = radios.map((r) => byId.get(r.value?.trim())).filter(Boolean);
    const best = mostUsed(shown);
    for (const radio of radios) {
        const s = byId.get(radio.value?.trim());
        let title = "";
        if (s === best && s) title = `Most used sample of this batch — ${describe(s)}`;
        else if (s && !s.depleted) title = describe(s);
        setHint(radio, !!s && s === best, title);
    }

    // Bold: the batch holding the molecule's most used sample, when there is
    // a choice of batches.
    const overall = batchRadios.length > 1 ? mostUsed(samples) : null;
    for (const radio of batchRadios) {
        const hit = !!overall && radio.value?.trim() === overall.batchName;
        setHint(
            radio,
            hit,
            hit ? `Holds the most used sample, ${overall.identifier} — ${describe(overall)}` : ""
        );
    }
}

function sync() {
    // Batch radios too: they show as soon as the entity is picked, which is
    // when its samples should start loading.
    const boxes = document.querySelectorAll(
        '[data-autotest-id="sampleInformation__radio"], [data-autotest-id="batchInformation__radio"]'
    );
    if (!boxes.length) return;
    injectStyles();
    const roots = new Set();
    for (const box of boxes) {
        const root = pickerRoot(box);
        if (root) roots.add(root);
    }
    for (const root of roots) decorate(root);
}

export function initSamplePickerHints() {
    if (started) return;
    started = true;

    let scheduled = false;
    schedule = () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            try {
                sync();
            } catch (error) {
                console.warn(LOG_PREFIX, "picker hints", error);
            }
        });
    };

    new MutationObserver(schedule).observe(document.documentElement, {
        childList: true,
        subtree: true,
    });
}
