// content/features/run-form-templates/protocol-runs.js
//
// A Copy and a Duplicate button on every row of a protocol's "Run Data" table.
//
// That table is the one place where every run of a protocol is visible at
// once, with its parameters as columns — which makes it the natural place to
// say "that one, give me those settings" without opening the run first. What
// it copies is exactly what the run page's own Copy produces, so "Paste into
// form" on the target run does not care where the values came from.
//
// Which columns count is NOT guessed from the headers. The same page carries
// a run-definition annotator (`resourceType === "run"`), and its
// protocolFields are the authoritative list of field names — so `Molecules`
// and `Plates`, which are row counts rather than fields, drop out on their
// own rather than by a hand-maintained blocklist.
//
// Duplicate is Copy + "Create a new run" + Paste into form, in one click. Its
// values come from the run's own page, not from the row: the table shows only
// some fields as columns and cuts long values short, while the run page's
// annotator carries every field exactly — the same readFilledFields the run
// page's own Copy uses. Run Date and Person are left to the new-run form
// (today, and its default), as Copy leaves them out. It stops at a filled
// form: CDD's Create Run is the chemist's to press.

import { copyText } from "../../utils/clipboard.js";
import { isWritableKind, setRunFormStash } from "../../../shared/run-form-templates.js";
import { formatFields } from "./clipboard-io.js";
import { isEditMode, isRunDefinition, normalizeValue, readFilledFields, readProps, RUN_DATE_FIELD_NAME } from "./form-model.js";
import { BUTTON_CLASS, injectRunFormTemplateStyles, QUIET_CLASS, ROOT_CLASS, STATUS_CLASS, WARN_CLASS } from "./styles.js";

const TABLE_SELECTOR = "table.SimpleDataTable";
const HEADER_ROW_SELECTOR = "tr.header-row";
const MARKER = "cddRunRowCopy";
const RUN_PATH_RE = /^\/vaults\/\d+\/runs\/\d+$/;
// CDD's "Create a new run" panel on the protocol page.
const NEW_RUN_EDIT = "#protocol-newRun-edit";
const NEW_RUN_OPEN = "#protocol-newRun-editLink";

// Fields that belong to ONE run rather than to the method — the same pair the
// panel's own Copy leaves out. Pasting last week's date and operator into a
// fresh run is never what "reuse these settings" means.
const PER_RUN_FIELDS = new Set([RUN_DATE_FIELD_NAME.toLowerCase(), "person", "date"]);

// The run-definition field names this page knows about, lowercased.
function runFieldNames() {
    for (const annotator of document.querySelectorAll(".protocolAnnotator")) {
        const props = readProps(annotator);
        if (!isRunDefinition(props)) continue;

        const names = new Set([RUN_DATE_FIELD_NAME.toLowerCase()]);
        for (const field of props.protocolFields) {
            const name = field?.definition?.name || field?.label;
            if (name) names.add(normalizeValue(name).toLowerCase());
        }
        return names;
    }
    return null;
}

function headerLabels(table) {
    const headerRow = table.querySelector(HEADER_ROW_SELECTOR);
    if (!headerRow) return null;
    return Array.from(headerRow.cells, (cell) => normalizeValue(cell.innerText));
}

// One run's parameters as {name, value} pairs, in column order.
function rowFields(row, labels, validNames) {
    const out = [];

    Array.from(row.cells).forEach((cell, index) => {
        const label = labels[index];
        if (!label) return;

        const key = label.toLowerCase();
        if (!validNames.has(key) || PER_RUN_FIELDS.has(key)) return;

        const value = normalizeValue(cell.innerText);
        if (!value) return;

        out.push({ name: label, value });
    });

    return out;
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Counted in attempts, not wall-clock: a background tab's timers are throttled.
async function waitFor(probe, attempts = 40) {
    for (let i = 0; i < attempts; i += 1) {
        const result = probe();
        if (result) return result;
        await wait(150);
    }
    return null;
}

// The run's fields from its own page, as the run page's Copy would take them.
async function fetchRunFields(path) {
    const res = await fetch(path, { credentials: "include", headers: { Accept: "text/html" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const doc = new DOMParser().parseFromString(await res.text(), "text/html");
    const props = [...doc.querySelectorAll(".protocolAnnotator")].map(readProps).find(isRunDefinition);
    if (!props) throw new Error("no run definition on the run page");
    return readFilledFields(props)
        .filter((f) => isWritableKind(f.kind))
        .filter((f) => !PER_RUN_FIELDS.has(f.name.toLowerCase()));
}

// Opens CDD's "Create a new run" and presses our Paste into form in it.
async function pasteIntoNewRun() {
    const panel = document.querySelector(NEW_RUN_EDIT);
    if (!panel) throw new Error("no “Create a new run” on this page");
    if (!panel.offsetParent) document.querySelector(NEW_RUN_OPEN)?.click();

    const paste = await waitFor(() => {
        const root = panel.querySelector(`.${ROOT_CLASS}`);
        const annotator = root?.nextElementSibling;
        const btn = root?.querySelector("[data-cdd-rft-paste]");
        return panel.offsetParent && isEditMode(annotator) && btn && !btn.disabled ? btn : null;
    });
    if (!paste) throw new Error("the new-run form did not open");
    panel.scrollIntoView({ block: "start", behavior: "smooth" });
    paste.click();
}

// Copy + open "Create a new run" + Paste, for the run at `runPath`. `say`
// hears each step. Resolves to the number of fields written, 0 when the run
// has none to copy.
async function duplicateIntoNewRun(runPath, say) {
    say("reading…");
    const fields = await fetchRunFields(runPath);
    if (!fields.length) return 0;

    const text = formatFields(fields);
    await copyText(text);
    await setRunFormStash(text, {
        protocolName: normalizeValue(document.querySelector("h1")?.textContent),
        fieldCount: fields.length,
    });

    say("opening…");
    await pasteIntoNewRun();
    return fields.length;
}

async function duplicateRun(row, button) {
    const path = [...row.querySelectorAll("a[href]")]
        .map((a) => a.getAttribute("href"))
        .find((href) => RUN_PATH_RE.test(href));
    if (!path) {
        button.textContent = "no run link";
        return;
    }

    const say = (text) => { button.textContent = text; };
    const count = await duplicateIntoNewRun(path, say);
    say(count ? `duplicated ${count}` : "nothing to copy");
}

/* ------------------------------------------------------------------ *
 * From the run page
 *
 * "Create a new run" lives on the protocol page, so the run page's
 * "Duplicate this run" is a link there, carrying the run in the hash. The
 * protocol page takes it from there as if its own row's duplicate had been
 * pressed, and drops the hash so a reload does not do it again.
 * ------------------------------------------------------------------ */

const HASH_RE = /^#cdd-duplicate-run=(\d+)$/;
const RUN_PAGE_RE = /^\/vaults\/(\d+)\/runs\/(\d+)$/;
const PROTOCOL_PATH_RE = /^\/vaults\/(\d+)\/protocols\/\d+$/;
const SIDEBAR_LINK_MARK = "cddDuplicateRun";

let resuming = false;

export function attachRunPageDuplicate() {
    const match = location.pathname.match(RUN_PAGE_RE);
    if (!match) return;
    const list = document.querySelector(".sidebar .actionLinks ul.iconList");
    if (!list || list.querySelector(`[data-cdd-duplicate-run]`)) return;
    const protocol = [...document.querySelectorAll('a[href*="/protocols/"]')]
        .map((a) => a.getAttribute("href"))
        .find((href) => PROTOCOL_PATH_RE.test(href));
    if (!protocol) return;

    const item = document.createElement("li");
    item.dataset[SIDEBAR_LINK_MARK] = "1";
    const link = document.createElement("a");
    link.href = `${protocol}#cdd-duplicate-run=${match[2]}`;
    link.title = "Open this protocol's “Create a new run” filled with this run's parameters (not its date or person). Nothing is created until you press Create Run.";
    // CDD's items lead with a 16px `img.icon-16`, which CDD's own CSS hangs
    // in the list's left margin; a glyph with the same class hangs there too.
    const icon = document.createElement("span");
    icon.className = "icon-16";
    icon.textContent = "⧉";
    icon.style.cssText = "width:16px;line-height:16px;text-align:center;";
    link.append(icon, " Duplicate this run");
    item.append(link);
    list.append(item);
}

export function resumeDuplicateFromHash() {
    if (resuming) return;
    const hash = location.hash.match(HASH_RE);
    const vault = location.pathname.match(PROTOCOL_PATH_RE);
    if (!hash || !vault) return;
    // Wait for the new-run form and its bar; the scan comes back on the next
    // mutation.
    const root = document.querySelector(`${NEW_RUN_EDIT} .${ROOT_CLASS}`);
    if (!root) return;

    resuming = true;
    history.replaceState(history.state, "", location.pathname + location.search);
    const status = root.querySelector(`.${STATUS_CLASS}`);
    const say = (text, warn = false) => {
        if (!status) return;
        status.textContent = text;
        status.classList.toggle(WARN_CLASS, warn);
    };

    duplicateIntoNewRun(`/vaults/${vault[1]}/runs/${hash[1]}`, (step) => say(`Duplicating run — ${step}`))
        .then((count) => { if (!count) say("That run has no parameters to duplicate.", true); })
        .catch((error) => {
            console.warn("[CDD Stoich Tools] duplicate run failed", error);
            say(`Could not duplicate the run — ${error.message}.`, true);
        })
        .finally(() => { resuming = false; });
}

function attachRowButton(row, labels, validNames, table) {
    if (row.dataset[MARKER] === "1") return;

    const cell = row.cells[row.cells.length - 1];
    if (!cell) return;

    row.dataset[MARKER] = "1";

    const button = document.createElement("button");
    button.type = "button";
    button.className = `${ROOT_CLASS}-inline ${BUTTON_CLASS} ${QUIET_CLASS}`;
    button.textContent = "copy";
    button.title = "Copy this run's parameters, ready for “Paste into form” on another run.";

    button.addEventListener("click", async (event) => {
        event.stopPropagation();

        const fields = rowFields(row, labels, validNames);
        if (!fields.length) {
            button.textContent = "nothing to copy";
            return;
        }

        const text = formatFields(fields);
        const ok = await copyText(text);
        await setRunFormStash(text, {
            protocolName: normalizeValue(document.querySelector("h1")?.textContent),
            fieldCount: fields.length,
        });

        button.textContent = ok ? `copied ${fields.length}` : `kept ${fields.length}`;
        setTimeout(() => { button.textContent = "copy"; }, 2000);
    });

    const duplicate = document.createElement("button");
    duplicate.type = "button";
    duplicate.className = `${ROOT_CLASS}-inline ${BUTTON_CLASS} ${QUIET_CLASS}`;
    duplicate.textContent = "duplicate";
    duplicate.title = "Open “Create a new run” filled with this run's parameters (not its date or person). Nothing is created until you press Create Run.";

    duplicate.addEventListener("click", async (event) => {
        event.stopPropagation();
        if (duplicate.dataset.busy) return;
        duplicate.dataset.busy = "1";
        try {
            await duplicateRun(row, duplicate);
        } catch (error) {
            console.warn("[CDD Stoich Tools] duplicate run failed", error);
            duplicate.textContent = "could not duplicate";
        } finally {
            delete duplicate.dataset.busy;
            setTimeout(() => { duplicate.textContent = "duplicate"; }, 3000);
        }
    });

    // The bar's stylesheet is injected on demand; a protocol page may never
    // have shown a run definition bar.
    injectRunFormTemplateStyles();
    cell.append(button, duplicate);
    void table;
}

export function scanProtocolRunTables() {
    const validNames = runFieldNames();
    if (!validNames) return;

    for (const table of document.querySelectorAll(TABLE_SELECTOR)) {
        const labels = headerLabels(table);
        if (!labels) continue;

        // Only a table whose columns ARE run fields — the same page renders
        // other SimpleDataTables.
        const matches = labels.filter((l) => l && validNames.has(l.toLowerCase())).length;
        if (matches < 3) continue;

        for (const row of table.querySelectorAll("tbody tr")) {
            if (!row.cells?.length) continue;
            attachRowButton(row, labels, validNames, table);
        }
    }
}
