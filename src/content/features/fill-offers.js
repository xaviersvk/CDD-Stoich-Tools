// content/features/fill-offers.js
//
// ONE source of truth for "what could be filled into this row": the panel
// renders a button per offer, the experimental auto-fill runs the same
// offers without the click. Order: authoritative source (batch / sample)
// first, remembered value second — never both for one field.

import { getRememberedValues } from "../../shared/density-memory.js";
import {
    fillDensityIntoTable,
    fillPurityIntoTable,
    fillConcentrationIntoTable,
} from "./row-fill.js";

const has = (v) => v != null && String(v).trim() !== "";

export function computeFillOffers(sample) {
    const offers = [];
    const entry = sample?.batchId ? getRememberedValues(sample.batchId) : null;

    if (!has(sample?.tableDensity)) {
        if (has(sample?.density)) {
            offers.push({ field: "density", value: String(sample.density), source: "batch" });
        } else if (entry?.density) {
            offers.push({ field: "density", value: entry.density, source: "memory" });
        }
    }
    if (!has(sample?.tablePurity)) {
        if (has(sample?.purity)) {
            offers.push({ field: "purity", value: String(sample.purity), source: "batch" });
        } else if (entry?.purity) {
            offers.push({ field: "purity", value: entry.purity, source: "memory" });
        }
    }
    if (!has(sample?.tableConcentration)) {
        if (has(sample?.concentration)) {
            offers.push({
                field: "concentration",
                value: String(sample.concentration),
                units: has(sample?.concentrationUnits) ? String(sample.concentrationUnits) : null,
                source: "sample",
            });
        } else if (entry?.concentration) {
            offers.push({
                field: "concentration",
                value: entry.concentration,
                units: entry.concentrationUnits || null,
                source: "memory",
            });
        }
    }
    return offers;
}

export function runFillOffer(sample, offer) {
    switch (offer.field) {
        case "density":
            return fillDensityIntoTable(sample, offer.value);
        case "purity":
            return fillPurityIntoTable(sample, offer.value);
        case "concentration":
            return fillConcentrationIntoTable(sample, offer.value, offer.units);
        default:
            return Promise.resolve({ ok: false, reason: "unknown field" });
    }
}

// Stamp the in-memory sample so the offer disappears on the next render
// without waiting for CDD's autosave payload.
export function markOfferFilled(sample, offer) {
    if (offer.field === "density") sample.tableDensity = String(offer.value);
    if (offer.field === "purity") sample.tablePurity = String(offer.value);
    if (offer.field === "concentration") sample.tableConcentration = String(offer.value);
}
