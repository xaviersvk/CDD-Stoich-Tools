// content/features/ui-fixes/slurp-protocol-picklist-defaults.js
//
// Bulk import ("slurp") mapping page, protocol data:
//
//   /vaults/{vault}/slurps/{slurp}/mapping/edit
//
// A required pick-list readout (typically a protocol condition such as
// Buffer) blocks the import:
//
//   You must map <strong>Buffer</strong> when importing protocol data for MTAP FP DR Assay.
//
// Unlike molecule fields, CDD offers no "provide a default" link here. The
// manual way is "+ Add a field…" (name + value), then map that new column to
// Readouts → protocol → run → Buffer. This puts the readout's allowed values
// under the error as buttons and does both steps on one click.
//
// WHERE THE VALUES COME FROM
// --------------------------
//   GET /vaults/{v}/protocols/{p}/readout_definitions
//
// Each definition carries name, data_type_name and pick_list_values. The
// protocol id comes from the mapping drilldown's `select[name=protocols]`,
// matched by the protocol name in the error.
//
// HOW A CLICK APPLIES IT (same requests CDD's own forms send)
// -----------------------------------------------------------
// 1. A column already mapped to this protocol (its footer reads
//    "… → {protocol} → {run}") tells us the run: GET its edit drilldown and
//    read header_mapping[run_id] from the readouts form.
// 2. POST /mapping/headers with virtual_header[name|virtual_value] — the
//    "+ Add a field…" form.
// 3. Reload /mapping/edit, find the new column_header_{id}.
// 4. GET its edit drilldown, fill the readouts form (run, protocol, readout)
//    and submit it — the "Apply" of the column mapping.
// 5. Reload the page so CDD re-renders the mapping and the error list.

import { listReadouts } from "./readout-clipboard/api.js";
import { injectStyles, ROW_CLASS } from "./slurp-picklist-defaults.js";
import { watchDocument } from "../../utils/dom.js";

const PAGE = /^(\/vaults\/(\d+)\/slurps\/\d+)\/mapping/;

const MARK_ATTR = "data-cdd-protocol-picklist";
const REQUIREMENT = /^You must map (.+?) when importing protocol data for (.+?)\.?$/;
const READOUT_SELECT = 'select[name="header_mapping[readout_definition_id]"]';
const RUN_INPUT = 'input[name="header_mapping[run_id]"]';

let started = false;

// "vaultId:protocolId" -> Map<readoutName, string[]>, or a Promise while it loads.
const picklistsByProtocol = new Map();

/* ------------------------------------------------------------------ *
 * Pure helpers
 * ------------------------------------------------------------------ */

const squash = (text) => (text || "").replace(/\s+/g, " ").trim();

// "You must map Buffer when importing protocol data for MTAP FP DR Assay."
//   -> { readout: "Buffer", protocol: "MTAP FP DR Assay" }
export function parseProtocolRequirement(text) {
    const match = squash(text).match(REQUIREMENT);
    return match ? { readout: match[1], protocol: match[2] } : null;
}

// Map<readoutName, { id, values }> of every pick-list readout, visible values
// only, in CDD's order.
export function readoutPicklists(definitions) {
    const out = new Map();
    for (const def of Array.isArray(definitions) ? definitions : []) {
        if (def?.data_type_name !== "PickList" || !def.name) continue;

        const values = (Array.isArray(def.pick_list_values) ? def.pick_list_values : [])
            .filter((v) => v && !v.hidden && typeof v.value === "string" && v.value.trim())
            .map((v) => v.value);

        if (values.length) out.set(def.name, { id: String(def.id), values });
    }
    return out;
}

/* ------------------------------------------------------------------ *
 * Data
 * ------------------------------------------------------------------ */

// protocol name -> id, from any readouts drilldown seen so far.
const protocolIds = new Map();
let protocolIdsLoading = null;

function rememberProtocols(doc) {
    for (const option of doc.querySelectorAll('select[name="protocols"] option')) {
        if (option.value) protocolIds.set(squash(option.textContent), option.value);
    }
}

// The page carries the drilldown of whichever column is active; when that
// has no protocol list, load the drilldown of a column mapped to this protocol.
function protocolIdFor(name, base, rerun) {
    rememberProtocols(document);
    if (protocolIds.has(name)) return protocolIds.get(name);

    const column = mappedColumnFor(name);
    if (!protocolIdsLoading && column) {
        protocolIdsLoading = fetchDocument(`${base}/mapping/headers/${column}/edit`)
            .then(rememberProtocols)
            .catch((error) => console.debug("[CDD] protocol list not loaded:", error))
            .then(rerun);
    }
    return null;
}

function picklistsFor(vaultId, protocolId, rerun) {
    const key = `${vaultId}:${protocolId}`;
    const cached = picklistsByProtocol.get(key);
    if (cached instanceof Map) return cached;

    if (!cached) {
        picklistsByProtocol.set(
            key,
            listReadouts(vaultId, protocolId)
                .then(readoutPicklists)
                .catch((error) => {
                    console.debug("[CDD] protocol readouts not loaded:", error);
                    return new Map();
                })
                .then((map) => {
                    picklistsByProtocol.set(key, map);
                    rerun();
                })
        );
    }
    return null;
}

/* ------------------------------------------------------------------ *
 * Requests
 * ------------------------------------------------------------------ */

function csrfToken() {
    return document.querySelector('meta[name="csrf-token"]')?.content || "";
}

async function fetchDocument(url) {
    const response = await fetch(url, {
        credentials: "same-origin",
        headers: { Accept: "text/vnd.turbo-stream.html, text/html" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} on ${url}`);
    return new DOMParser().parseFromString(await response.text(), "text/html");
}

async function post(url, body) {
    body.set("authenticity_token", csrfToken());
    const response = await fetch(url, {
        method: "POST",
        credentials: "same-origin",
        headers: {
            Accept: "text/vnd.turbo-stream.html, text/html",
            "X-CSRF-Token": csrfToken(),
        },
        body,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} on ${url}`);
}

function readoutsForm(doc) {
    return doc.querySelector(READOUT_SELECT)?.closest("form") || null;
}

function columnIds(doc) {
    return [...doc.querySelectorAll('[id^="column_header_"]')].map((el) =>
        el.id.slice("column_header_".length)
    );
}

// A column already mapped to this protocol: its footer reads
// "Polarization (mP) → MTAP FP DR Assay → 2026-10-08 (…".
function mappedColumnFor(protocol) {
    for (const cell of document.querySelectorAll('[id^="mapping_summary_header_"]')) {
        if (squash(cell.textContent).includes(`→ ${protocol}`)) {
            return cell.id.slice("mapping_summary_header_".length);
        }
    }
    return null;
}

// The form's own fields, as the browser would submit them.
function formBody(form) {
    const body = new FormData();
    for (const el of form.querySelectorAll("input[name], select[name], textarea[name]")) {
        if (el.disabled) continue;
        if ((el.type === "checkbox" || el.type === "radio") && !el.checked) continue;
        body.append(el.name, el.value);
    }
    return body;
}

// target: { base, protocol, protocolId, readout, readoutId }
async function applyReadoutDefault(target, value) {
    const { base, protocol, protocolId, readout, readoutId } = target;
    const headers = `${base}/mapping/headers`;

    // Everything is checked before the first write, so a failure leaves no
    // stray column behind.
    const mapped = mappedColumnFor(protocol);
    if (!mapped) throw new Error(`no column is mapped to ${protocol} yet`);

    const template = readoutsForm(await fetchDocument(`${headers}/${mapped}/edit`));
    const runId = template?.querySelector(RUN_INPUT)?.value;
    if (!runId) throw new Error("could not tell which run the file goes to");

    const before = new Set(columnIds(document));
    const add = new FormData();
    add.set("virtual_header[name]", readout);
    add.set("virtual_header[virtual_value]", value);
    await post(headers, add);

    const added = columnIds(await fetchDocument(`${base}/mapping/edit`)).filter((id) => !before.has(id));
    const headerId = added[added.length - 1];
    if (!headerId) throw new Error("the new column did not show up");

    const form = readoutsForm(await fetchDocument(`${headers}/${headerId}/edit`));
    if (!form) throw new Error("the new column has no readout mapping form");

    const body = formBody(form);
    body.set("header_mapping[run_id]", runId);
    body.set("protocols", protocolId);
    body.set("runs", runId);
    body.set("header_mapping[readout_definition_id]", `readout_${readoutId}`);
    await post(form.getAttribute("action"), body);

    location.reload();
}

/* ------------------------------------------------------------------ *
 * DOM
 * ------------------------------------------------------------------ */

function buildRow(target, values) {
    const row = document.createElement("div");
    row.className = ROW_CLASS;

    const status = document.createElement("span");

    for (const value of values) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "buttony buttony-small";
        button.textContent = value;
        button.title = `Use "${value}" as ${target.readout} for all records in this file`;
        button.addEventListener("click", async (event) => {
            event.preventDefault();
            const buttons = row.querySelectorAll("button");
            buttons.forEach((b) => (b.disabled = true));
            status.textContent = "…";
            try {
                await applyReadoutDefault(target, value);
            } catch (error) {
                console.warn("[CDD] protocol pick list default failed:", error);
                status.textContent = `Not applied: ${error.message}`;
                buttons.forEach((b) => (b.disabled = false));
            }
        });
        row.appendChild(button);
    }

    row.appendChild(status);
    return row;
}

function decorate(base, vaultId, rerun) {
    const seen = new Set();

    // Rows already added count first, so a later pass cannot add a second one.
    for (const item of document.querySelectorAll(`li[${MARK_ATTR}]`)) {
        seen.add(item.getAttribute(MARK_ATTR));
    }

    for (const item of document.querySelectorAll("li")) {
        if (item.hasAttribute(MARK_ATTR)) continue;
        const requirement = parseProtocolRequirement(item.textContent);
        if (!requirement) continue;

        // CDD repeats the line once per mapped readout; one row is enough.
        const key = `${requirement.protocol}\n${requirement.readout}`;
        if (seen.has(key)) continue;

        const protocolId = protocolIdFor(requirement.protocol, base, rerun);
        if (!protocolId) continue;

        const picklists = picklistsFor(vaultId, protocolId, rerun);
        const readout = picklists?.get(requirement.readout);
        if (!readout) continue;

        injectStyles();
        seen.add(key);
        item.setAttribute(MARK_ATTR, key);
        const target = { base, protocolId, readoutId: readout.id, ...requirement };
        item.appendChild(buildRow(target, readout.values));
    }
}

/* ------------------------------------------------------------------ *
 * Wiring
 * ------------------------------------------------------------------ */

export function initSlurpProtocolPicklistDefaults() {
    if (started) return;
    started = true;

    let run = () => {};

    const sync = () => {
        const match = location.pathname.match(PAGE);
        if (!match) return;
        decorate(match[1], match[2], () => run());
    };

    run = watchDocument(sync);
    run();
}
