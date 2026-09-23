// content/api/run-heat-maps.js — control-well readouts of a run, read from
// CDD's heat map viewer (no API exposes them).
//
// Two endpoints, both HTML the viewer itself loads:
//
//   GET /vaults/<v>/runs/<r>/heat_maps
//     The viewer shell: `select#readout_definition_id` lists the run's
//     readouts (the selected one is CDD's default), and one
//     `div#heat_map_plate_<plateId>` per plate with the plate name in its <h4>.
//
//   GET /vaults/<v>/runs/<r>/heat_maps/<plateId>.js?readout_definition_id=<id>
//     A `<template name="ujs-replace">` holding the plate's
//     `table.plateLayout.heatMap`: every well is `td.heat-map-well` with id
//     `plate_<plateId>_well_<row>_<col>`, and the control layout shows as the
//     classes `positive` / `negative`. Beside it an inline script
//     `CDD.HeatMap.wellDetails['<plateId>'] = {row: {col: {popupData}}}`,
//     where popupData[0] is [readout name, html] for the requested readout.
//     The html holds the value in `span.flaggable > span`; a readout flagged
//     as an outlier carries `span.flaggable.flagged` and CDD leaves it out of
//     its own Z′ — so do we.
//
// A plate response runs to ~400 kB (the whole plate's popups), so the caller
// fetches a few at a time and caches per plate + readout.

const WELL_ID_RE = /^plate_(\d+)_well_(\d+)_(\d+)$/;
const WELL_DETAILS_RE = /CDD\.HeatMap\.wellDetails\['\d+']\s*=\s*(\{.*});?\s*$/m;

function heatMapsPath(vaultId, runId) {
    return `/vaults/${vaultId}/runs/${runId}/heat_maps`;
}

async function fetchText(url, accept) {
    const res = await fetch(url, {
        credentials: "include",
        headers: { Accept: accept, "X-Requested-With": "XMLHttpRequest" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.text();
}

// → { readouts: [{ id, name, selected }], plates: [{ id, name }] }
export async function fetchRunHeatMapIndex(vaultId, runId) {
    const html = await fetchText(heatMapsPath(vaultId, runId), "text/html");
    const doc = new DOMParser().parseFromString(html, "text/html");

    const readouts = [...doc.querySelectorAll("select#readout_definition_id option")]
        .map((o) => ({ id: o.value, name: o.textContent.trim(), selected: o.selected }))
        .filter((r) => r.id);

    const plates = [...doc.querySelectorAll("div[id^='heat_map_plate_']")]
        .map((div) => ({
            id: div.id.slice("heat_map_plate_".length),
            name: div.querySelector("h4")?.textContent.trim() || div.id,
        }))
        .filter((p) => /^\d+$/.test(p.id));

    return { readouts, plates };
}

function readoutValue(popupHtml) {
    const doc = new DOMParser().parseFromString(popupHtml, "text/html");
    const flaggable = doc.querySelector(".flaggable");
    const text = (flaggable?.querySelector("span") || doc.body).textContent.trim();
    return {
        value: parseFloat(text.replace(/,/g, "")),
        flagged: !!flaggable?.classList.contains("flagged"),
    };
}

// → { pos: number[], neg: number[], flagged: number }
export async function fetchPlateControls(vaultId, runId, plateId, readoutId) {
    const url = `${heatMapsPath(vaultId, runId)}/${plateId}.js`
        + `?readout_definition_id=${encodeURIComponent(readoutId)}`;
    const text = await fetchText(url, "text/javascript, text/html");
    const doc = new DOMParser().parseFromString(text, "text/html");
    const root = doc.querySelector("template")?.content || doc;

    const scripts = [...root.querySelectorAll("script"), ...doc.querySelectorAll("script")];
    let details = null;
    for (const script of scripts) {
        const match = script.textContent.match(WELL_DETAILS_RE);
        if (match) {
            details = JSON.parse(match[1]);
            break;
        }
    }
    if (!details) throw new Error(`No well details in heat map of plate ${plateId}`);

    const out = { pos: [], neg: [], flagged: 0 };
    for (const td of root.querySelectorAll("td.heat-map-well.positive, td.heat-map-well.negative")) {
        const match = td.id.match(WELL_ID_RE);
        const entry = match && details[match[2]]?.[match[3]]?.popupData?.[0];
        if (!entry) continue; // empty control well
        const { value, flagged } = readoutValue(entry[1]);
        if (flagged) {
            out.flagged += 1;
            continue;
        }
        if (!Number.isFinite(value)) continue;
        (td.classList.contains("positive") ? out.pos : out.neg).push(value);
    }
    return out;
}
