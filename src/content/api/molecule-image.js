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
import { splitSynonyms } from "../../shared/pretty-name.js";

const LOG_PREFIX = "[CDD inventory plugin]";

// Flatten an error into plain named fields so the log is readable even when
// an external panel (e.g. the CDD app's own error console) stringifies the
// whole object as "[object Object]". Fields are strings so they survive
// JSON.stringify, .toString(), and template-literal coercion.
function describeErr(err) {
    if (err instanceof Error) {
        return {
            errorName: err.name,
            errorMessage: err.message,
            ...(err.stack ? { errorStack: err.stack } : {}),
        };
    }
    // Response-like (fetch Response that was passed as an error)
    if (err && typeof err === "object" && ("status" in err || "statusText" in err)) {
        return {
            httpStatus: err.status,
            httpStatusText: err.statusText ?? "",
            url: err.url ?? "",
        };
    }
    // Plain object or primitive
    if (err && typeof err === "object") return err;
    return { errorValue: String(err) };
}

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

// Pull a SMILES string out of the molecule page. CDD exposes it in a few React
// components' `react_props`; we probe them in order of reliability. `formatSMILES`
// can be empty when structure representations aren't computed yet, so we fall
// back to ModelPredictionsView's `smiles` and to CXSMILES (cleaned of its
// `|...|` extension block). Structureless entities legitimately have none.
function extractSmiles(doc) {
    const candidates = [
        ['[component_class="DownloadMoleculeImage"]', "formatSMILES"],
        ['[component_class="ModelPredictionsView"]', "smiles"],
        ['[component_class="ChemistryImage"]', "smiles"],
        ['[component_class="DownloadMoleculeImage"]', "formatCXSMILES"],
    ];

    const clean = (value) =>
        // CXSMILES is "SMILES |extensions|" -- keep the SMILES core; reject InChI.
        typeof value === "string" && value.trim() && !/^InChI/i.test(value.trim())
            ? value.trim().split(/\s/)[0]
            : null;

    for (const [selector, key] of candidates) {
        for (const el of doc.querySelectorAll(selector)) {
            const raw = el.getAttribute("react_props");
            if (!raw) continue;

            try {
                const value = clean(JSON.parse(raw)?.[key]);
                if (value) return value;
            } catch {
                // Try the next candidate.
            }
        }
    }

    // Last resort: scan any react_props that mentions a smiles-like key. Covers
    // component/markup differences across CDD instances. The cheap string
    // pre-filter keeps us from JSON-parsing every (often huge) props blob.
    for (const el of doc.querySelectorAll("[react_props]")) {
        const raw = el.getAttribute("react_props");
        if (!raw || !/smiles/i.test(raw)) continue;

        try {
            const props = JSON.parse(raw);
            for (const [key, value] of Object.entries(props)) {
                if (/smiles/i.test(key)) {
                    const smiles = clean(value);
                    if (smiles) return smiles;
                }
            }
        } catch {
            // Ignore and keep scanning.
        }
    }

    return null;
}

// A molecule's synonyms, in CDD's order; [] when it has none.
//
// CDD used to print them as a "Synonyms" row of the molecule definition list.
// Since 2026-10 that row is gone from the page HTML: the list only travels in
// the molecule-level RegistrationFormRenderer's props, as
// `synonyms: [{ synonym: "pPWWP-LEDGF", index, ... }]`, and React draws it.
// The props are read first; the old row stays as a fallback for a page that
// still has it. Also used by molecule-synonyms.js and by batch-fields.js,
// which parse the same page HTML.
export function extractSynonymList(doc) {
    const fromProps = synonymsFromRendererProps(doc);
    if (fromProps) return fromProps;

    const fields = doc.querySelectorAll(".molecule_field");
    for (const field of fields) {
        const label = field.querySelector("dt")?.textContent?.trim().toLowerCase();
        if (label === "synonyms" || label === "synonym") {
            const dd = field.querySelector("dd");
            if (!dd) return [];
            // <br>-separated synonyms would silently concatenate through
            // textContent; turn the breaks into real separators first.
            for (const br of dd.querySelectorAll("br")) br.replaceWith(", ");
            return splitSynonyms(dd.textContent);
        }
    }
    return [];
}

// null when no molecule-level renderer carries a synonyms array ("not on this
// page"), as opposed to [] ("the molecule has none"). The batch, sample and
// inventory renderers repeat the same list; the molecule one owns it.
function synonymsFromRendererProps(doc) {
    for (const el of doc.querySelectorAll('[component_class="RegistrationFormRenderer"]')) {
        let props;
        try {
            props = JSON.parse(el.getAttribute("react_props") || "");
        } catch {
            continue;
        }
        if (props?.resource_type !== "molecule" || !Array.isArray(props.synonyms)) continue;

        return props.synonyms
            .slice()
            .sort((a, b) => (a?.index ?? 0) - (b?.index ?? 0))
            .map((entry) => String(entry?.synonym ?? "").trim())
            .filter(Boolean);
    }
    return null;
}

// Only the first synonym — what the panel's Synonym field has always shown.
export function extractSynonym(doc) {
    return extractSynonymList(doc)[0] ?? null;
}

async function fetchMoleculeData(vaultId, moleculeId) {
    try {
        const res = await fetch(`/vaults/${vaultId}/molecules/${moleculeId}`, {
            credentials: "include",
        });

        if (!res.ok) {
            console.error(LOG_PREFIX, "Molecule page request failed", {
                vaultId,
                moleculeId,
                httpStatus: res.status,
                httpStatusText: res.statusText,
                url: res.url,
            });
            return EMPTY;
        }

        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, "text/html");

        const synonym = extractSynonym(doc);
        const smiles = extractSmiles(doc);

        if (!smiles) {
            // Expected for structureless entities (reagents, oligos, mixtures...):
            // the tooltip just keeps text + synonym, no error.
            console.debug(`${LOG_PREFIX} no structure for molecule`, {
                vaultId,
                moleculeId,
            });
            return { svg: null, synonym };
        }

        const svg = await renderSmilesToSvg(smiles);
        return { svg, synonym };
    } catch (err) {
        console.error(LOG_PREFIX, "Failed to load molecule data", {
            vaultId,
            moleculeId,
            ...describeErr(err),
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

function scheduleIdle(fn) {
    if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(fn, { timeout: 2000 });
    } else {
        setTimeout(fn, 200);
    }
}

// Pre-warm the cache for a list of molecule ids (e.g. every molecule in the box
// the user just opened) so subsequent hovers are instant. Runs in the background
// on idle, with a small concurrency cap so we don't hammer CDD or spike the CPU.
// Already-cached molecules are skipped; this only ever fills the same cache that
// getMoleculeData() reads, so it is purely additive and safe to call repeatedly.
export function prefetchMolecules(moleculeIds, { concurrency = 3 } = {}) {
    const vaultId = detectVaultId();
    if (!vaultId || !Array.isArray(moleculeIds)) return;

    const queue = [];
    const queued = new Set();
    for (const raw of moleculeIds) {
        if (raw == null) continue;
        const id = String(raw);
        const cacheKey = `${vaultId}:${id}`;
        if (moleculeCache.has(cacheKey) || queued.has(id)) continue;
        queued.add(id);
        queue.push(id);
    }

    if (!queue.length) return;

    let active = 0;
    const pump = () => {
        while (active < concurrency && queue.length) {
            const id = queue.shift();
            active += 1;
            getMoleculeData(vaultId, id).finally(() => {
                active -= 1;
                if (queue.length) scheduleIdle(pump);
            });
        }
    };

    scheduleIdle(pump);
}
