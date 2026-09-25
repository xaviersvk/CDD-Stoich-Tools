// shared/next-step-reaction.js
//
// "Copy as next step": this reaction's products become the reactants of a
// new one. Pure — no DOM, no fetch — so it runs in node.
//
// Everything here was measured on entry 1000000814 (2026-09-25); see
// docs/superpowers/specs/2026-09-25-next-step-reaction-design.md.

const FRAGMENT_PREFIX = "application/x-slate-fragment:";

const roleOf = (row) => String(row?.role || "").toLowerCase();

export function nextStepBlocker(data) {
    const rows = data?.stoichiometryTable?.rows || [];
    if (rows.some((r) => roleOf(r).startsWith("parallel"))) return "parallel";
    if (!rows.some((r) => roleOf(r) === "product")) return "no-product";
    return null;
}

/* ---------------- MRV ---------------- */

// MRV is machine-written ChemAxon XML; the lists are flat siblings and a
// superatom (Boc) is a <molecule> nested INSIDE its parent molecule, so a
// list's content is taken whole, never molecule by molecule.
function listBody(mrv, name) {
    const m = mrv.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
    return m ? m[1] : "";
}

function replaceList(mrv, name, body) {
    const re = new RegExp(`<${name}>[\\s\\S]*?</${name}>|<${name}\\s*/>`);
    return mrv.replace(re, body ? `<${name}>${body}</${name}>` : `<${name}/>`);
}

function atomXs(xml) {
    return [...xml.matchAll(/<atom\b[^>]*\bx2="(-?[\d.]+)"/g)].map((m) => parseFloat(m[1]));
}

function shiftAtoms(xml, dx) {
    return xml.replace(/(<atom\b[^>]*\bx2=")(-?[\d.]+)(")/g,
        (_, a, x, b) => `${a}${(parseFloat(x) + dx).toFixed(4)}${b}`);
}

// A "+" sign: <MReactionSign …>…<MPoint x=".." y=".."/>…</MReactionSign>.
function signX(sign) {
    const xs = [...sign.matchAll(/<MPoint\b[^>]*\bx="(-?[\d.]+)"/g)].map((m) => parseFloat(m[1]));
    return xs.length ? Math.min(...xs) : NaN;
}

function shiftSign(sign, dx) {
    return sign.replace(/(<MPoint\b[^>]*\bx=")(-?[\d.]+)(")/g,
        (_, a, x, b) => `${a}${(parseFloat(x) + dx).toFixed(4)}${b}`);
}

export function rewriteMrv(mrv) {
    const arrow = mrv.match(/<arrow\b[^>]*\bx1="(-?[\d.]+)"[^>]*\bx2="(-?[\d.]+)"/);
    if (!arrow) throw new Error("reaction drawing has no arrow");
    const x1 = parseFloat(arrow[1]);
    const x2 = parseFloat(arrow[2]);

    const reactants = listBody(mrv, "reactantList");
    const products = listBody(mrv, "productList");
    const productXs = atomXs(products);
    if (!productXs.length) throw new Error("reaction drawing has no product");

    const reactantXs = atomXs(reactants);
    const gap = reactantXs.length ? Math.max(0.8, x1 - Math.max(...reactantXs)) : 1.5;
    const dx = (x1 - gap) - Math.max(...productXs);

    let out = replaceList(mrv, "reactantList", shiftAtoms(products, dx));
    out = replaceList(out, "agentList", "");
    out = replaceList(out, "productList", "");

    // "+" left of the arrow joined the old reactants: gone. Right of it they
    // joined the products, which move — the sign moves with them.
    out = out.replace(/<MReactionSign\b[\s\S]*?<\/MReactionSign>/g, (sign) => {
        const x = signX(sign);
        return Number.isFinite(x) && x > x2 ? shiftSign(sign, dx) : "";
    });
    out = out.replace(/<MTextBox\b[\s\S]*?<\/MTextBox>/g, "");
    return out;
}

/* ---------------- rows ---------------- */

function keepKeys(map, ids) {
    return Object.fromEntries(
        Object.entries(map || {}).filter(([k]) => ids.has(String(k)))
    );
}

function moleOf(row) {
    const mass = Number(row.mass);
    const fw = Number(row.formulaWeight);
    if (!Number.isFinite(mass) || !Number.isFinite(fw) || fw <= 0) return row.mole ?? null;
    const purity = Number.isFinite(Number(row.purity)) ? Number(row.purity) : 1;
    return (mass * purity) / fw;
}

export function buildNextStepData(data) {
    const blocker = nextStepBlocker(data);
    if (blocker) throw new Error(`next step blocked: ${blocker}`);

    const table = data.stoichiometryTable;
    const rows = table.rows
        .filter((r) => roleOf(r) === "product")
        .map((r, i) => {
            const row = JSON.parse(JSON.stringify(r));
            delete row.yield;
            delete row.displayIndex;
            row.uid = i + 1;
            row.order = i;
            row.role = "reactant";
            row.inDrawing = true;
            row.mole = moleOf(row);
            return row;
        });

    const lrMole = rows[0].mole;
    rows.forEach((row, i) => {
        row.limitingReagent = i === 0;
        row.moleffective = lrMole;
        row.equivalent = i === 0 || !lrMole || row.mole == null ? 1 : row.mole / lrMole;
    });

    const moleculeIds = new Set(rows.map((r) => String(r.moleculeId)));
    const batchIds = new Set(rows.map((r) => String(r.batchId)));
    const structureIds = new Set(rows.map((r) => String(r.rdkitStructureId)));

    return {
        ...data,
        mrv: rewriteMrv(data.mrv),
        structureMrv: keepKeys(data.structureMrv, structureIds),
        stoichiometryTable: {
            ...table,
            rows,
            currentRowUid: rows.length + 1,
            batches: keepKeys(table.batches, moleculeIds),
            samples: keepKeys(table.samples, batchIds),
            molecules: keepKeys(table.molecules, structureIds),
        },
    };
}

/* ---------------- clipboard / image ---------------- */

export function encodeFragment(nodes) {
    return FRAGMENT_PREFIX + btoa(encodeURIComponent(JSON.stringify(nodes)));
}

export function decodeFragment(text) {
    if (typeof text !== "string" || !text.startsWith(FRAGMENT_PREFIX)) return null;
    try {
        return JSON.parse(decodeURIComponent(atob(text.slice(FRAGMENT_PREFIX.length))));
    } catch {
        return null;
    }
}

// `structure` is base64 of the zlib-deflated MRV; the rest of the URL
// (size, format) stays as CDD built it.
export function withImageStructure(imageUrl, base64) {
    const url = new URL(imageUrl, "https://x.invalid");
    url.searchParams.set("structure", base64);
    return url.pathname + "?" + url.searchParams.toString();
}
