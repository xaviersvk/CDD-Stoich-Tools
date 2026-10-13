// content/features/ui-fixes/readout-clipboard/init.js
//
// Copy a protocol's readout definitions in one vault, paste them into a
// protocol in another — typically a new one that has none yet. CDD's own
// "Duplicate protocol details" stays inside one vault.
//
// The bar sits just above CDD's readout table on the Protocol Details tab,
// OUTSIDE the React root (ProtocolReadoutDefinitionsView), so a re-render of
// the table cannot take it away. Copy only reads. Paste only creates: a
// readout whose name already exists in the target is skipped, never
// overwritten, and nothing is deleted.

import { watchDocument } from "../../../utils/dom.js";
import { injectFieldClipboardStyles } from "../field-clipboard/styles.js";
import {
    createCalculation,
    createDoseResponse,
    createReadout,
    getCalculation,
    getDoseResponse,
    listReadouts,
} from "./api.js";
import { onReadoutClipboardChanged, readReadoutClipboard, writeReadoutClipboard } from "./clipboard.js";
import { readoutCount, retargetFormula, toClipboard } from "./model.js";

const PAGE = /^\/vaults\/(\d+)\/protocols\/(\d+)(?:\/|$)/;
const VIEW_SELECTOR = '[component_class="ProtocolReadoutDefinitionsView"]';
const BAR_CLASS = "cdd-readout-clipboard";

let started = false;
const refreshers = new Set();

function plural(n, word) {
    return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function pageIds() {
    const match = PAGE.exec(location.pathname);
    return match ? { vaultId: match[1], protocolId: match[2] } : null;
}

function vaultName() {
    return document.querySelector("#headerSwitcher-current-title")?.textContent.trim() || "";
}

function protocolName() {
    return document.querySelector("h1")?.textContent.trim() || "";
}

function editingAllowed(view) {
    try {
        return !!JSON.parse(view.getAttribute("react_props") || "{}").editingAllowed;
    } catch {
        return false;
    }
}

function button(text) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cdd-fc-button";
    b.textContent = text;
    return b;
}

/* ------------------------------------------------------------------ *
 * Copy
 * ------------------------------------------------------------------ */

async function copy({ vaultId, protocolId }) {
    const readouts = await listReadouts(vaultId, protocolId);

    const fetchers = {
        CustomCalculation: getCalculation,
        DoseResponseCalculation: getDoseResponse,
    };
    const calculationsById = new Map();
    for (const def of readouts) {
        const fetchCalc = fetchers[def.calculation_type];
        if (!fetchCalc || !def.calculation_id) continue;
        calculationsById.set(String(def.calculation_id), await fetchCalc(vaultId, protocolId, def.calculation_id));
    }

    const entry = toClipboard({
        vaultId,
        vaultName: vaultName(),
        protocolName: protocolName(),
        readouts,
        calculationsById,
    });
    await writeReadoutClipboard(entry);
    return entry;
}

/* ------------------------------------------------------------------ *
 * Paste
 * ------------------------------------------------------------------ */

// Clipboards written before dose-response support held bare custom
// calculation bodies; read them as custom steps.
function steps(entry) {
    return (entry.calculations || []).map((calc) =>
        calc.kind ? calc : { kind: "custom", name: calc.output_readout_definition_attributes.name, body: calc }
    );
}

function createStep({ vaultId, protocolId }, step, { idByName, from, to }) {
    if (step.kind === "custom") {
        return createCalculation(vaultId, protocolId, {
            ...step.body,
            formatted_formula: retargetFormula(step.body.formatted_formula, from, to),
        });
    }

    const dose = idByName.get(step.doseName.trim());
    const response = idByName.get(step.responseName.trim());
    if (!dose || !response) {
        const missing = [!dose && step.doseName, !response && step.responseName].filter(Boolean);
        return Promise.reject(new Error(`needs ${missing.join(" and ")} in this protocol`));
    }
    return createDoseResponse(vaultId, protocolId, {
        ...step.body,
        dose_readout_definition_id: dose,
        response_readout_definition_id: response,
    });
}

async function paste({ vaultId, protocolId }, entry, report) {
    const existing = new Set((await listReadouts(vaultId, protocolId)).map((d) => d.name.trim()));
    const result = { created: [], skipped: [], failed: [] };

    const fresh = (name) => {
        if (!existing.has(name.trim())) return true;
        result.skipped.push(name);
        return false;
    };

    // Plain readouts first: calculations refer to them. Stop at the first
    // failure — whatever went wrong will go wrong for the rest too.
    for (const body of entry.readouts.filter((b) => fresh(b.name))) {
        report(`Creating ${body.name}…`);
        try {
            await createReadout(vaultId, protocolId, body);
            result.created.push(body.name);
            for (const n of body.normalized_calculations_attributes || []) result.created.push(n.name);
        } catch (error) {
            result.failed.push(`${body.name}: ${error.message}`);
            return result;
        }
    }

    // Calculations build on readouts, normalisations and each other (a
    // pIC50 formula reads a fit's IC50). Retry the ones that failed for as
    // long as a round still creates something; each round re-reads the
    // target so a fit can find the readouts the previous round made.
    const target = protocolName();
    let pending = steps(entry).filter((step) => fresh(step.name.split(", ")[0]));
    let errors = new Map();

    while (pending.length) {
        const idByName = new Map((await listReadouts(vaultId, protocolId)).map((d) => [d.name.trim(), d.id]));
        const next = [];
        errors = new Map();
        for (const step of pending) {
            report(`Creating ${step.name}…`);
            try {
                await createStep({ vaultId, protocolId }, step, { idByName, from: entry.protocolName, to: target });
                result.created.push(step.name);
            } catch (error) {
                errors.set(step.name, error.message);
                next.push(step);
            }
        }
        if (next.length === pending.length) break;
        pending = next;
    }

    for (const [name, message] of errors) result.failed.push(`${name}: ${message}`);
    return result;
}

function summary(result, entry) {
    const parts = [`Created ${plural(result.created.length, "readout definition")}.`];
    if (result.skipped.length) parts.push(`Already here, left as is: ${result.skipped.join(", ")}.`);
    if (entry.skipped?.length) {
        parts.push(`Not copied (${entry.skipped.map((s) => `${s.name} – ${s.type}`).join(", ")}); add by hand.`);
    }
    if (result.failed.length) parts.push(`Failed: ${result.failed.join(" | ")}`);
    return parts.join(" ");
}

/* ------------------------------------------------------------------ *
 * The paste report, carried across the reload
 * ------------------------------------------------------------------ */

const REPORT_KEY = "cddReadoutPasteReport";

function saveReport(text, isError) {
    try {
        sessionStorage.setItem(REPORT_KEY, JSON.stringify({ path: location.pathname, text, isError }));
    } catch {
        // no storage: the reload just shows the new table without the report
    }
}

// One-shot: shown on the next bar of the same protocol, then forgotten.
function takeReport() {
    try {
        const raw = sessionStorage.getItem(REPORT_KEY);
        if (!raw) return null;
        sessionStorage.removeItem(REPORT_KEY);
        const report = JSON.parse(raw);
        return report?.path === location.pathname ? report : null;
    } catch {
        return null;
    }
}

/* ------------------------------------------------------------------ *
 * The bar
 * ------------------------------------------------------------------ */

function buildBar(view) {
    const ids = pageIds();
    const bar = document.createElement("div");
    bar.className = `cdd-fc-bar ${BAR_CLASS}`;

    const copyButton = button("Copy readout definitions");
    const pasteButton = button("Paste readout definitions");
    const status = document.createElement("span");
    status.className = "cdd-fc-note";

    bar.append(copyButton);
    if (editingAllowed(view)) bar.append(pasteButton);
    bar.append(status);

    const setBusy = (busy) => {
        copyButton.disabled = busy;
        pasteButton.disabled = busy || !pasteButton.dataset.ready;
    };

    async function refresh() {
        const entry = await readReadoutClipboard();
        const count = readoutCount(entry);
        if (entry && count) {
            pasteButton.dataset.ready = "1";
            pasteButton.disabled = false;
            pasteButton.textContent = `Paste ${plural(count, "readout definition")}`;
            pasteButton.title = `From ${entry.protocolName || "a protocol"} in ${entry.vaultName || `vault ${entry.vaultId}`}`;
        } else {
            delete pasteButton.dataset.ready;
            pasteButton.disabled = true;
            pasteButton.textContent = "Paste readout definitions";
            pasteButton.title = "Nothing copied yet. Copy the readout definitions of a protocol first.";
        }
    }

    copyButton.addEventListener("click", async () => {
        setBusy(true);
        status.className = "cdd-fc-note";
        status.textContent = "Copying…";
        try {
            const entry = await copy(ids);
            const notCopied = entry.skipped.length
                ? ` Not copied: ${entry.skipped.map((s) => `${s.name} (${s.type})`).join(", ")}.`
                : "";
            status.textContent = `Copied ${plural(readoutCount(entry), "readout definition")} from ${entry.protocolName}.${notCopied}`;
        } catch (error) {
            status.className = "cdd-fc-status";
            status.textContent = `Copy failed: ${error.message}`;
        }
        setBusy(false);
        refresh();
    });

    pasteButton.addEventListener("click", async () => {
        const entry = await readReadoutClipboard();
        if (!readoutCount(entry)) return;

        setBusy(true);
        status.className = "cdd-fc-note";
        try {
            const result = await paste(ids, entry, (text) => (status.textContent = text));
            const text = summary(result, entry);
            const isError = result.failed.length > 0;

            // CDD's table only shows the new readouts after a reload. The
            // report — failures included — is handed over the reload so it
            // is still there to read.
            if (result.created.length) {
                saveReport(text, isError);
                status.textContent = `${text} Reloading…`;
                location.reload();
                return;
            }
            status.textContent = text;
            if (isError) status.className = "cdd-fc-status";
        } catch (error) {
            status.className = "cdd-fc-status";
            status.textContent = `Paste failed: ${error.message}`;
        }
        setBusy(false);
    });

    const report = takeReport();
    if (report) {
        status.textContent = report.text;
        status.className = report.isError ? "cdd-fc-status" : "cdd-fc-note";
    }

    refreshers.add(refresh);
    refresh();
    return bar;
}

function mount() {
    if (!pageIds()) return;
    const view = document.querySelector(VIEW_SELECTOR);
    if (!view || view.parentElement.querySelector(`.${BAR_CLASS}`)) return;
    view.parentElement.insertBefore(buildBar(view), view);
}

export function initReadoutClipboard() {
    if (started) return;
    started = true;

    injectFieldClipboardStyles();
    onReadoutClipboardChanged(() => refreshers.forEach((refresh) => refresh()));

    const run = watchDocument(mount);
    run();
}
