// content/features/fill-offers.js
//
// ONE source of truth for "what could be filled into this row": the panel
// renders a button per offer, the experimental auto-fill runs the same
// offers without the click. Order: authoritative source (batch / sample)
// first, remembered value second — never both for one field.

import { getRememberedValues, touchValueUsed } from "../../shared/density-memory.js";
import { getRememberedName, touchNameUsed } from "../../shared/name-memory.js";
import { isFillRowNameEnabled } from "../../shared/row-name-flag.js";
import { getPurityFillThreshold } from "../../shared/purity-threshold.js";
import { getPrettyName } from "./name-enrichment.js";
import {
    fillDensityIntoTable,
    fillPurityIntoTable,
    fillConcentrationIntoTable,
    fillSolventIntoTable,
    fillNameIntoTable,
} from "./row-fill.js";

const has = (v) => v != null && String(v).trim() !== "";

// The solvent to write for this row, sample record first, memory second —
// the same precedence every other field uses. Returns a string or null.
function solventSource(sample, entry) {
    if (has(sample?.solvent)) return { value: String(sample.solvent), source: "sample" };
    if (entry?.solvent) return { value: entry.solvent, source: "memory" };
    return null;
}

export function computeFillOffers(sample) {
    if (sample?.isProduct) return [];   // products are display-only
    // A mention is prose, not a row: there is no table cell to fill and no
    // row number to find one by.
    if (sample?.isMention) return [];

    const offers = [];
    const entry = sample?.batchId ? getRememberedValues(sample.batchId) : null;

    // The row's free-text Name. Unlike every other field there is no
    // authoritative record to prefer — the synonym is a guess, and a name the
    // user typed before is the better guess, so MEMORY WINS HERE. First in
    // the list because a row reads better named than unnamed, and "Fill all"
    // runs offers in order.
    if (isFillRowNameEnabled() && sample?.moleculeId && !has(sample?.tableName)) {
        const remembered = getRememberedName(sample.moleculeId);
        const synonym = getPrettyName(sample.moleculeId);
        if (remembered) {
            offers.push({ field: "name", value: remembered, source: "memory" });
        } else if (synonym) {
            offers.push({ field: "name", value: synonym, source: "synonym" });
        }
    }

    if (!has(sample?.tableDensity)) {
        if (has(sample?.density)) {
            offers.push({ field: "density", value: String(sample.density), source: "batch" });
        } else if (entry?.density) {
            offers.push({ field: "density", value: entry.density, source: "memory" });
        }
    }
    if (!has(sample?.tablePurity)) {
        // High purities are stoichiometric noise — offer a purity fill
        // only at or below the configurable threshold. A batch purity
        // above it does NOT fall through to the remembered value: the
        // batch stays authoritative.
        const limit = getPurityFillThreshold();
        const lowEnough = (v) => {
            const n = parseFloat(String(v).replace(",", "."));
            return Number.isFinite(n) && n <= limit;
        };
        if (has(sample?.purity)) {
            if (lowEnough(sample.purity)) {
                offers.push({ field: "purity", value: String(sample.purity), source: "batch" });
            }
        } else if (entry?.purity && lowEnough(entry.purity)) {
            offers.push({ field: "purity", value: entry.purity, source: "memory" });
        }
    }
    // A row with no concentration is not a solution at all, so it has no
    // solvent slot either: the concentration fill makes the solution and
    // takes the solvent with it. Only once the row IS a solution does a
    // solvent of its own become something to offer.
    const solvent = solventSource(sample, entry);
    if (!has(sample?.tableConcentration)) {
        if (has(sample?.concentration)) {
            offers.push({
                field: "concentration",
                value: String(sample.concentration),
                units: has(sample?.concentrationUnits) ? String(sample.concentrationUnits) : null,
                solvent: solvent?.value || null,
                solventSource: solvent?.source || null,
                source: "sample",
            });
        } else if (entry?.concentration) {
            offers.push({
                field: "concentration",
                value: entry.concentration,
                units: entry.concentrationUnits || null,
                solvent: solvent?.value || null,
                solventSource: solvent?.source || null,
                source: "memory",
            });
        }
    } else if (!has(sample?.tableSolvent) && solvent) {
        offers.push({ field: "solvent", value: solvent.value, source: solvent.source });
    }
    return offers;
}

// True when any part of this offer came out of density-memory — a
// concentration offer can carry a remembered solvent next to a
// concentration the sample record itself knows.
export function offerUsesMemory(offer) {
    return offer.source === "memory" || offer.solventSource === "memory";
}

// A successful fill from memory refreshes that entry's LRU stamp — in
// whichever memory the value came out of. The name memory is keyed by
// molecule, every other value by batch.
export function touchOfferMemory(sample, offer) {
    if (!offerUsesMemory(offer)) return;
    if (offer.field === "name") touchNameUsed(sample.moleculeId);
    else touchValueUsed(sample.batchId);
}

export function runFillOffer(sample, offer) {
    switch (offer.field) {
        case "density":
            return fillDensityIntoTable(sample, offer.value);
        case "purity":
            return fillPurityIntoTable(sample, offer.value);
        case "concentration":
            return fillConcentrationIntoTable(sample, offer.value, offer.units, offer.solvent);
        case "solvent":
            return fillSolventIntoTable(sample, offer.value);
        case "name":
            return fillNameIntoTable(sample, offer.value);
        default:
            return Promise.resolve({ ok: false, reason: "unknown field" });
    }
}

// Stamp the in-memory sample so the offer disappears on the next render
// without waiting for CDD's autosave payload. `result` is the fill's own
// return value: a concentration fill reports a solvent it could NOT pick as
// a note, and that solvent must stay on offer.
export function markOfferFilled(sample, offer, result) {
    if (offer.field === "density") sample.tableDensity = String(offer.value);
    if (offer.field === "purity") sample.tablePurity = String(offer.value);
    if (offer.field === "solvent") sample.tableSolvent = String(offer.value);
    if (offer.field === "name") sample.tableName = String(offer.value);
    if (offer.field === "concentration") {
        sample.tableConcentration = String(offer.value);
        if (offer.solvent && !result?.note) sample.tableSolvent = String(offer.solvent);
    }
}
