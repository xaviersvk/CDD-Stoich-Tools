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
import { createCalculation, createReadout, getCalculation, listReadouts } from "./api.js";
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

    const calculationsById = new Map();
    for (const def of readouts) {
        if (def.calculation_type !== "CustomCalculation" || !def.calculation_id) continue;
        const calc = await getCalculation(vaultId, protocolId, def.calculation_id);
        calculationsById.set(String(def.calculation_id), calc);
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

async function paste({ vaultId, protocolId }, entry, report) {
    const existing = new Set((await listReadouts(vaultId, protocolId)).map((d) => d.name.trim()));
    const result = { created: [], skipped: [], failed: [] };

    const fresh = (body) => {
        if (!existing.has(body.name.trim())) return true;
        result.skipped.push(body.name);
        return false;
    };

    // Plain readouts first: calculations refer to them. Stop at the first
    // failure — whatever went wrong will go wrong for the rest too.
    for (const body of entry.readouts.filter(fresh)) {
        report(`Creating ${body.name}…`);
        try {
            await createReadout(vaultId, protocolId, body);
            result.created.push(body.name);
        } catch (error) {
            result.failed.push(`${body.name}: ${error.message}`);
            return result;
        }
    }

    // A calculation may refer to another calculation's output; retry the
    // ones that failed for as long as a round still creates something.
    const target = protocolName();
    let pending = entry.calculations.filter((calc) => fresh(calc.output_readout_definition_attributes));
    let errors = new Map();

    while (pending.length) {
        const next = [];
        errors = new Map();
        for (const calc of pending) {
            const name = calc.output_readout_definition_attributes.name;
            report(`Creating ${name}…`);
            try {
                await createCalculation(vaultId, protocolId, {
                    ...calc,
                    formatted_formula: retargetFormula(calc.formatted_formula, entry.protocolName, target),
                });
                result.created.push(name);
            } catch (error) {
                errors.set(name, error.message);
                next.push(calc);
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
            status.textContent = summary(result, entry);
            if (result.failed.length) {
                status.className = "cdd-fc-status";
            } else if (result.created.length) {
                status.textContent += " Reloading…";
                setTimeout(() => location.reload(), 1200);
                return;
            }
        } catch (error) {
            status.className = "cdd-fc-status";
            status.textContent = `Paste failed: ${error.message}`;
        }
        setBusy(false);
    });

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
