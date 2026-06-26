// content/api/molecule-image.js
//
// Resolves molecule data (rendered structure SVG + synonym) for the inventory
// "Pick Location" well tooltip.
//
// Why fetch the molecule page? The structure on it is rendered CLIENT-SIDE
// (WebMolKit -> inline SVG); the server's `react_props.imgUrl` carries no
// molecule id and is not reusable cross-page. A plain `fetch` only yields the
// pre-React server HTML, so we read the SMILES (and the synonym) from it and
// render the structure ourselves (see structure-render.js).
//
// We fetch each molecule page once and cache the resulting Promise -- including
// failures -- for the session, so repeated hovers never re-request or re-render.

import { renderSmilesToSvg } from "./structure-render.js";

const LOG_PREFIX = "[CDD inventory plugin]";

// cacheKey (`${vaultId}:${moleculeId}`) -> Promise<{ svg, synonym }>
const moleculeCache = new Map();

const EMPTY = { svg: null, synonym: null };

// Detect the current vault id from the URL: `/vaults/6884/...`.
// Falls back to CDD's `to-context-param` meta tag (`vaults/6884`) if present.
export function detectVaultId() {
    const fromPath = window.location.pathname.match(/\/vaults\/(\d+)(?:\/|$)/);
    if (fromPath) return fromPath[1];

    const meta = document
        .querySelector('meta[name="to-context-param"]')
        ?.getAttribute("content");
    const fromMeta = meta && meta.match(/vaults\/(\d+)/);
    return fromMeta ? fromMeta[1] : null;
}

// Pull a SMILES string out of the molecule page. CDD exposes it in a couple of
// React components' `react_props`; we probe them in order of reliability.
function extractSmiles(doc) {
    const candidates = [
        ['[component_class="DownloadMoleculeImage"]', "formatSMILES"],
        ['[component_class="ModelPredictionsView"]', "smiles"],
    ];

    for (const [selector, key] of candidates) {
        const raw = doc.querySelector(selector)?.getAttribute("react_props");
        if (!raw) continue;

        try {
            const smiles = JSON.parse(raw)?.[key];
            if (typeof smiles === "string" && smiles.trim()) {
                return smiles.trim();
            }
        } catch {
            // Try the next candidate.
        }
    }

    return null;
}

// The molecule definition list carries a "Synonyms" row; read its value.
function extractSynonym(doc) {
    const fields = doc.querySelectorAll(".molecule_field");
    for (const field of fields) {
        const label = field.querySelector("dt")?.textContent?.trim().toLowerCase();
        if (label === "synonyms" || label === "synonym") {
            const value = field.querySelector("dd")?.textContent?.trim();
            // Only the first synonym (CDD lists several comma/semicolon separated).
            if (value) return value.split(/[,;]/)[0].trim();
        }
    }
    return null;
}

async function fetchMoleculeData(vaultId, moleculeId) {
    try {
        const res = await fetch(`/vaults/${vaultId}/molecules/${moleculeId}`, {
            credentials: "include",
        });

        if (!res.ok) {
            console.warn(`${LOG_PREFIX} molecule page HTTP ${res.status}`, {
                vaultId,
                moleculeId,
            });
            return EMPTY;
        }

        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, "text/html");

        const synonym = extractSynonym(doc);
        const smiles = extractSmiles(doc);

        if (!smiles) {
            console.warn(`${LOG_PREFIX} no SMILES on molecule page`, {
                vaultId,
                moleculeId,
            });
            return { svg: null, synonym };
        }

        const svg = await renderSmilesToSvg(smiles);
        return { svg, synonym };
    } catch (err) {
        console.warn(`${LOG_PREFIX} failed to load molecule data`, {
            vaultId,
            moleculeId,
            err,
        });
        return EMPTY;
    }
}

// Public API: returns a cached Promise<{ svg, synonym }>. Safe to call on every
// hover -- the fetch + render happen at most once per (vault, molecule) per
// session, failures included.
export function getMoleculeData(vaultId, moleculeId) {
    if (!vaultId || moleculeId == null || moleculeId === "") {
        return Promise.resolve(EMPTY);
    }

    const cacheKey = `${vaultId}:${moleculeId}`;

    if (moleculeCache.has(cacheKey)) {
        return moleculeCache.get(cacheKey);
    }

    const promise = fetchMoleculeData(vaultId, moleculeId);
    moleculeCache.set(cacheKey, promise);
    return promise;
}
