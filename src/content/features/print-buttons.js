// content/features/print-buttons.js
import { STATE } from "../state.js";
import { escapeHtml } from "../utils/dom.js";
import {EVENT_SOURCE, EVENTS} from "../../shared/event-types";
import { isShowProductsEnabled } from "../../shared/show-products-flag.js";

const BTN_CLASS = "cdd-stoich-print-button";
const BTN_ATTR = "data-cdd-stoich-print-button";



function formatNumber(value, digits = 2) {
    if (value == null || value === "") return "—";
    const num = Number(value);
    if (Number.isNaN(num)) return String(value);
    return num.toFixed(digits);
}

function formatMass(value) {
    if (value == null || value === "") return "—";

    const num = Number(value);
    if (Number.isNaN(num)) return escapeHtml(String(value));

    if (num < 0.1) {
        return `${formatNumber(num * 1000, 2)} mg`;
    }

    return `${formatNumber(num, 3)} g`;
}

function formatMmol(value) {
    if (value == null || value === "") {
        return "—";
    }

    const num = Number(value);
    if (Number.isNaN(num)) {
        return "—";
    }

    const abs = Math.abs(num);

    let result;
    let unit;

    if (abs >= 1e-3) {
        result = (num * 1e3).toFixed(2);
        unit = "mmol";
    } else if (abs >= 1e-6) {
        result = (num * 1e6).toFixed(2);
        unit = "µmol";
    } else if (abs >= 1e-9) {
        result = (num * 1e9).toFixed(2);
        unit = "nmol";
    } else {
        result = num.toExponential(2);
        unit = "mol";
    }

    return `${result} ${unit}`;
}

function formatVolume(value) {
    if (value == null || value === "") return "—";

    const num = Number(value);
    if (Number.isNaN(num)) return String(value);

    const ml = num * 1000;

    if (ml >= 1) {
        return `${formatNumber(ml, 3)} mL`;
    } else {
        const ul = ml * 1000;
        return `${formatNumber(ul, 3)} µL`;
    }
}

function normalizeName(str) {
    if (!str) return "";
    return String(str)
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

function letterLabel(index) {
    let label = "";
    let n = index;

    do {
        label = String.fromCharCode(65 + (n % 26)) + label;
        n = Math.floor(n / 26) - 1;
    } while (n >= 0);

    return label;
}

function formatMolarity(value) {
    if (value == null || value === "") return "—";

    const num = Number(value);
    if (Number.isNaN(num)) return escapeHtml(String(value));

    // CDD stores and displays every concentration in mol/L — keep the unit and
    // only drop the trailing zeros, so the sheet reads like the on-screen table
    // ("0.6 mol/L", not "600.00 mmol/L").
    return `${Number(num.toFixed(4))} mol/L`;
}

// The solvent of a solution row, printed as an indented sub-row directly under
// its parent — mirroring how CDD stacks it in the on-screen table. Without it a
// "reagent as a solution in benzene" printed as if it were neat material.
function renderSolventRowHtml(solvent) {
    if (!solvent) return "";

    const fw = solvent.formulaWeight ?? solvent.molecularWeight;

    return `
          <tr class="solvent-row">
            <td class="col-name solvent-name">
              <div class="solvent-label">Solvent</div>
              <div class="solvent-main">${escapeHtml(solvent.name || "not specified")}</div>
              ${solvent.casNumber ? `<div class="muted">CAS-RN: ${escapeHtml(solvent.casNumber)}</div>` : ""}
            </td>

            <td class="col-properties">
              ${fw != null && fw !== "" ? `<div><strong>FW:</strong> ${formatNumber(fw, 2)} g/mol</div>` : ""}
              ${solvent.density != null && solvent.density !== "" ? `<div class="muted">Density: ${formatNumber(solvent.density, 3)} g/cm³</div>` : ""}
              ${solvent.boilingPoint != null && solvent.boilingPoint !== "" ? `<div class="muted">Boiling point: ${formatNumber(solvent.boilingPoint, 0)} °C</div>` : ""}
            </td>

            <td class="col-amounts">
              ${solvent.mass != null && solvent.mass !== "" ? `<div><strong>Mass:</strong> ${formatMass(solvent.mass)}</div>` : ""}
              ${solvent.volume != null && solvent.volume !== "" ? `<div><strong>Volume:</strong> ${formatVolume(solvent.volume)}</div>` : ""}
            </td>

            <td class="col-calculation">
              ${solvent.mole != null && solvent.mole !== "" ? `<div class="muted">Mole: ${formatMmol(solvent.mole)}</div>` : ""}
            </td>
          </tr>
        `;
}

function renderRowHtml(row, { indexLabel = "", roleTag = "" } = {}) {
    const fw = row.formulaWeight ?? row.molecularWeight;
    const exactMass = row.exactMass;
    const mass = row.mass;
    const volume = row.volume;
    const equivalent = row.equivalent;
    const limiting = row.limitingReagent;
    const mole = row.mole;
    const effectiveMole = row.effectiveMole;
    const yieldValue = row.yield;
    const showIupac =
        row.subtitle &&
        normalizeName(row.subtitle) !== normalizeName(row.name);

    const nameClass = row.depleted ? "name-main depleted" : "name-main";

    const indexHtml = indexLabel !== ""
        ? `<div class="row-index">${escapeHtml(indexLabel)}</div>`
        : "";

    const roleTagHtml = roleTag
        ? `<div class="role-tag">${escapeHtml(roleTag)}</div>`
        : "";

    const nameCellClass = indexLabel !== ""
        ? "col-name compact-name"
        : "col-name compact-name no-index";

    return `
          <tr class="main-row">
            <td class="${nameCellClass}">
              ${indexHtml}
              ${roleTagHtml ? `<div class="name-wrap">${roleTagHtml}<div class="${nameClass}">${escapeHtml(row.name || "Unnamed")}</div></div>` : `<div class="${nameClass}">${escapeHtml(row.name || "Unnamed")}</div>`}
            </td>

            <td class="col-properties">
              ${fw != null && fw !== "" ? `<div><strong>FW:</strong> ${formatNumber(fw, 2)} g/mol</div>` : ""}
              ${exactMass != null && exactMass !== "" ? `<div class="muted">Exact mass: ${formatNumber(exactMass, 6)} Da</div>` : ""}
              ${row.density != null && row.density !== "" ? `<div class="muted">Density: ${formatNumber(row.density, 3)} g/cm³</div>` : ""}
              ${row.concentration != null && row.concentration !== "" ? `<div><strong>Concentration:</strong> ${formatMolarity(row.concentration)}</div>` : ""}
              ${row.boilingPoint != null && row.boilingPoint !== "" ? `<div class="muted">Boiling point: ${formatNumber(row.boilingPoint, 0)} °C</div>` : ""}
            </td>

            <td class="col-amounts">
              ${mass != null && mass !== "" ? `<div><strong>Mass:</strong> ${formatMass(mass)}</div>` : ""}
              ${volume != null && volume !== "" ? `<div><strong>Volume:</strong> ${formatVolume(volume)}</div>` : ""}
            </td>

            <td class="col-calculation">
              ${limiting ? `<div><strong>Limiting reagent</strong></div>` : ""}
              ${equivalent != null && equivalent !== "" ? `<div><strong>Equivalent:</strong> ${formatNumber(equivalent, 2)}</div>` : ""}
              ${mole != null && mole !== "" ? `<div><strong>Mole:</strong> ${formatMmol(mole)}</div>` : ""}
              ${effectiveMole != null && effectiveMole !== "" ? `<div class="muted">Effective mole: ${formatMmol(effectiveMole)}</div>` : ""}
              ${row.molarity != null && row.molarity !== "" ? `<div class="muted">Reaction molarity: ${formatMolarity(row.molarity)}</div>` : ""}
              ${yieldValue != null && yieldValue !== "" ? `<div class="muted">Yield: ${formatNumber(yieldValue, 2)} %</div>` : ""}
            </td>
          </tr>

<tr class="details-row">
  <td colspan="4" class="row-details">
    <div class="location-line">
      <strong>Location:</strong> ${escapeHtml(row.location || "Location not set")}
    </div>

    ${showIupac ? `<div class="muted" style="margin-top:2px;">
             <strong>IUPAC:</strong> ${escapeHtml(row.subtitle)}
           </div>`
            : ""
        }
  </td>
</tr>
${renderSolventRowHtml(row.solvent)}
        `;
}

// Split the flat row list into the plain (fixed) rows and the parallel
// reagent/product pairs of a bulk reaction, keyed by parallelPairId in order
// of first appearance — the same order CDD letters them A, B, C…
function splitParallelPairs(rows) {
    const plainRows = [];
    const pairs = new Map();

    for (const row of rows) {
        const pairId = row?.parallelPairId;

        if (!pairId) {
            plainRows.push(row);
            continue;
        }

        if (!pairs.has(pairId)) pairs.set(pairId, []);
        pairs.get(pairId).push(row);
    }

    return { plainRows, pairs: Array.from(pairs.values()) };
}

function roleTagForRow(row) {
    const role = String(row?.role || "").toLowerCase();
    if (role === "parallelproduct") return "Product";
    if (role === "parallelreactant") return "Variable reagent";
    return "";
}

function buildRowsHtml(rows) {
    return rows
        .map((row, index) => renderRowHtml(row, { indexLabel: String(index + 1) }))
        .join("");
}

function buildPairBlocksHtml(pairs) {
    return pairs.map((pairRows, pairIndex) => {
        const letter = letterLabel(pairIndex);

        const rowsHtml = pairRows
            .map((row) => renderRowHtml(row, { roleTag: roleTagForRow(row) }))
            .join("");

        return `
          <div class="pair-block">
            <div class="pair-letter">${escapeHtml(letter)}</div>
            <div class="pair-body">
              <table>
                <tbody>
                  ${rowsHtml}
                </tbody>
              </table>
            </div>
          </div>
        `;
    }).join("");
}

function buildPrintHtml(reactionPayload) {
    const reactionIndex = Number(reactionPayload?.reactionIndex ?? 0);

    const title = escapeHtml(reactionPayload?.title || "Stoichiometry Sheet");
    const identifier = escapeHtml(reactionPayload?.identifier || "Unknown experiment");

    const rows = Array.isArray(reactionPayload?.rows) ? reactionPayload.rows : [];

    const domReactionImageHtml = getReactionImageHtmlForIndex(reactionIndex);

    const imageHtml = domReactionImageHtml
        ? `<div class="scheme">${domReactionImageHtml}</div>`
        : "";

    const { plainRows, pairs } = splitParallelPairs(rows);

    // The parser no longer filters products: keep them out of the numbered
    // reagent list always, and render them as their own section only when
    // the show-products option is on. (Bulk lettered pairs already carry
    // their products and are untouched.)
    const isProductRow = (row) => String(row?.role || "").toLowerCase() === "product";
    const reagentRows = plainRows.filter((row) => !isProductRow(row));
    const productRows = isShowProductsEnabled() ? plainRows.filter(isProductRow) : [];

    const rowsHtml = buildRowsHtml(reagentRows);

    const productSectionHtml = productRows.length
        ? `
            <div class="pair-section-title">Products</div>
            <table>
              <tbody>
                ${productRows.map((row) => renderRowHtml(row, { roleTag: "Product" })).join("")}
              </tbody>
            </table>
          `
        : "";

    const pairSectionHtml = pairs.length
        ? `
            <div class="pair-section-title">Reagents and products</div>
            ${buildPairBlocksHtml(pairs)}
          `
        : "";

    return `
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <title>${identifier} - ${title}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 12mm;
            }

            body {
              font-family: Arial, sans-serif;
              color: #111;
              margin: 0;
              padding: 0;
            }

            .page {
              width: 100%;
            }

            .header {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              gap: 16px;
              margin-bottom: 8px;
            }

            .header-left {
              flex: 1;
              min-width: 0;
            }

            .header-right {
              flex: 0 0 auto;
              text-align: right;
              padding-left: 16px;
            }

            .title {
              font-size: 18px;
              font-weight: 700;
              margin-bottom: 2px;
              line-height: 1.2;
              word-break: break-word;
            }

            .experiment-label {
              font-size: 10px;
              text-transform: uppercase;
              letter-spacing: 0.08em;
              color: #6b7280;
              margin-bottom: 2px;
            }

            .experiment-id {
              font-size: 15px;
              font-weight: 700;
              color: #111827;
              line-height: 1.2;
            }

            .meta {
              font-size: 11px;
              color: #666;
              margin-bottom: 14px;
            }

            .scheme {
              border: 1px solid #d1d5db;
              border-radius: 8px;
              padding: 10px 12px;
              margin-bottom: 14px;
              page-break-inside: avoid;
            }

            .scheme img {
              width: 100%;
              height: auto;
              display: block;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              table-layout: fixed;
            }

            thead {
              display: table-header-group;
            }

            .main-row {
              border-top: 1px solid #d1d5db;
            }

            .details-row {
              border-top: none;
            }

            th, td {
              padding: 10px 8px;
              font-size: 12px;
              text-align: left;
              vertical-align: top;
            }

            th {
              font-size: 12px;
              font-weight: 700;
              border-bottom: 1px solid #9ca3af;
            }

            .col-name { width: 24%; }
            .col-properties { width: 26%; }
            .col-amounts { width: 20%; }
            .col-calculation { width: 30%; }

            .compact-name .row-index {
              float: left;
              width: 18px;
              color: #444;
            }

            .compact-name .name-main {
              font-weight: 700;
              color: #1d4ed8;
              margin-left: 22px;
              line-height: 1.2;
              word-break: break-word;
            }

            .row-details {
              padding-top: 0;
              padding-left: 30px;
              padding-bottom: 8px;
            }

            /* Solvent of a solution row: no top border, so it reads as part of
               the reagent above it rather than as a numbered entry of its own. */
            .solvent-row {
              border-top: none;
            }

            .solvent-row td {
              padding-top: 0;
              padding-bottom: 8px;
            }

            .solvent-name {
              padding-left: 30px;
              border-left: 2px solid #d1d5db;
            }

            .solvent-label {
              font-size: 9px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.06em;
              color: #6b7280;
              margin-bottom: 2px;
            }

            .solvent-main {
              font-weight: 700;
              color: #374151;
              line-height: 1.2;
              word-break: break-word;
            }

            .location-line {
              margin-top: 0;
              margin-bottom: 1px;
              font-size: 11px;
              color: #1f2937;
              line-height: 1.15;
              word-break: break-word;
            }

            .muted {
              color: #6b7280;
              margin-top: 1px;
              line-height: 1.2;
            }

            .pair-section-title {
              font-size: 14px;
              font-weight: 700;
              margin: 18px 0 8px;
              padding-bottom: 4px;
              border-bottom: 1px solid #9ca3af;
            }

            .pair-block {
              display: flex;
              border: 1px solid #d1d5db;
              border-radius: 8px;
              margin-bottom: 10px;
              overflow: hidden;
              page-break-inside: avoid;
            }

            .pair-letter {
              flex: 0 0 32px;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 20px;
              font-weight: 700;
              color: #374151;
              background: #f3f4f6;
              border-right: 1px solid #d1d5db;
            }

            .pair-body {
              flex: 1;
              min-width: 0;
            }

            .pair-body table {
              width: 100%;
            }

            .pair-body .main-row:first-child {
              border-top: none;
            }

            .role-tag {
              font-size: 9px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.06em;
              color: #6b7280;
              margin-bottom: 2px;
            }

            .compact-name.no-index .name-main {
              margin-left: 0;
            }

            .print-footer {
              margin-top: 24px;
              padding-top: 8px;
              border-top: 1px solid #d1d5db;
              font-size: 9px;
              color: #9ca3af;
              text-align: center;
            }
          </style>
        </head>
        <body>
          <div class="page">
           <div class="header">
  <div class="header-left">
    <div class="title">${title}</div>
  </div>
  <div class="header-right">
    <div class="experiment-label">Experiment ID</div>
    <div class="experiment-id">${identifier}</div>
  </div>
</div>

            <div class="meta">
              <div><strong>Source:</strong> ${escapeHtml(location.href)}</div>
              <div><strong>Printed:</strong> ${escapeHtml(new Date().toLocaleString())}</div>
              <div><strong>Reaction index:</strong> ${reactionIndex + 1}</div>
            </div>

            ${imageHtml}

            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Properties</th>
                  <th>Amounts</th>
                  <th>Calculation</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>

            ${productSectionHtml}

            ${pairSectionHtml}

            <div class="print-footer">
              Custom print layout generated by CDD Stoichiometric Table Tools. Written by Matus Drexler, IOCB Prague & PharmTheon
            </div>
          </div>
        </body>
      </html>
    `;
}

function getReactionPayload(index) {
    if (!Array.isArray(STATE.reactionPayloads)) return null;

    return STATE.reactionPayloads.find(
        (item) => Number(item?.reactionIndex) === Number(index)
    ) || null;
}

function getReactionElements() {
    const exact = Array.from(
        document.querySelectorAll('[data-autotest-id="reaction"]')
    );

    if (exact.length) return exact;

    const selectors = [
        '[data-feature-type="reaction"]',
        '[data-testid*="reaction"]',
        '.reaction',
        '.reaction-block',
        '.eln-reaction',
        '.stoichiometry-table'
    ];

    const matched = [];
    const seen = new Set();

    for (const selector of selectors) {
        document.querySelectorAll(selector).forEach((el) => {
            if (seen.has(el)) return;
            seen.add(el);
            matched.push(el);
        });
    }

    return matched;
}


function buildButton(reactionIndex) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = BTN_CLASS;
    btn.setAttribute(BTN_ATTR, "1");
    btn.dataset.reactionIndex = String(reactionIndex);
    btn.title = "Print stoichiometry sheet";
    btn.setAttribute("aria-label", "Print stoichiometry sheet");

    const svgNs = "http://www.w3.org/2000/svg";

    const svg = document.createElementNS(svgNs, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    svg.setAttribute("aria-hidden", "true");

    const path = document.createElementNS(svgNs, "path");
    path.setAttribute(
        "d",
        "M6 9V4h12v5h1a2 2 0 0 1 2 2v5h-3v4H6v-4H3v-5a2 2 0 0 1 2-2h1zm2-3v3h8V6H8zm8 12v-4H8v4h8zm2-7H6a1 1 0 0 0-1 1v2h1v-2h12v2h1v-2a1 1 0 0 0-1-1z"
    );
    path.setAttribute("fill", "currentColor");

    svg.appendChild(path);
    btn.appendChild(svg);

    svg.style.display = "block";
    svg.style.width = "14px";
    svg.style.height = "14px";
    svg.style.flexShrink = "0";

    btn.style.position = "absolute";
    btn.style.top = "8px";
    btn.style.right = "70px";
    btn.style.width = "28px";
    btn.style.height = "25px";
    btn.style.minWidth = "20px";
    btn.style.minHeight = "20px";
    btn.style.display = "inline-flex";
    btn.style.alignItems = "center";
    btn.style.justifyContent = "center";
    btn.style.padding = "0";
    btn.style.margin = "0";
    btn.style.boxSizing = "border-box";
    btn.style.border = "1px solid #d1d5db";
    btn.style.borderRadius = "8px";
    btn.style.background = "#ffffff";
    btn.style.color = "#6b7280";
    btn.style.cursor = "pointer";
    btn.style.zIndex = "20";
    btn.style.verticalAlign = "middle";
    btn.style.lineHeight = "1";
    btn.style.boxShadow = "0 1px 2px rgba(0,0,0,0.08)";
    btn.style.transition =
        "background 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease";

    btn.addEventListener("mouseenter", () => {
        btn.style.background = "#f9fafb";
        btn.style.borderColor = "#bfc6cf";
        btn.style.color = "#374151";
        btn.style.boxShadow = "0 1px 3px rgba(0,0,0,0.12)";
    });

    btn.addEventListener("mouseleave", () => {
        btn.style.background = "#ffffff";
        btn.style.borderColor = "#d1d5db";
        btn.style.color = "#6b7280";
        btn.style.boxShadow = "0 1px 2px rgba(0,0,0,0.08)";
    });

    btn.addEventListener("focus", () => {
        btn.style.outline = "2px solid #93c5fd";
        btn.style.outlineOffset = "1px";
    });

    btn.addEventListener("blur", () => {
        btn.style.outline = "none";
    });

    btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        printStoichiometrySheet(reactionIndex);
    }, true);

    return btn;
}

export function printStoichiometrySheet(reactionIndex) {
    const payload = getReactionPayload(reactionIndex);

    if (!payload?.rows?.length) {
        alert("No stoichiometry data available yet for this reaction.");
        return;
    }

    const html = buildPrintHtml(payload);

    window.postMessage({
        source: EVENT_SOURCE,
        type: EVENTS.PRINT_REQUEST,
        payload: { html }
    }, "*");
}

export function ensurePrintButtons() {
    const reactionElements = getReactionElements();
    if (!reactionElements.length) return;

    ensurePrintButtonStyles();

    reactionElements.forEach((reactionEl, index) => {
        reactionEl.classList.add("cdd-stoich-reaction-host");

        const existing = reactionEl.querySelector(
            `.${BTN_CLASS}[data-reaction-index="${index}"]`
        );
        if (existing) return;

        const payload = getReactionPayload(index);
        if (!payload) return;

        const computed = window.getComputedStyle(reactionEl);
        if (computed.position === "static") {
            reactionEl.style.position = "relative";
        }

        const button = buildButton(index);
        reactionEl.appendChild(button);
    });
}

function getReactionImageHtmlForIndex(reactionIndex) {
    const reactions = getReactionElements();
    const reaction = reactions[reactionIndex];
    if (!reaction) return "";

    let img = reaction.querySelector(".ChemistryImage img");

    if (!img) {
        const imageContainer = reaction.querySelector('[data-autotest-id="inline-container--image"]');
        if (imageContainer) {
            img = imageContainer.querySelector("img");
        }
    }

    if (!img) return "";

    return img.outerHTML;
}

function ensurePrintButtonStyles() {
    if (document.getElementById("cdd-stoich-print-button-styles")) return;

    const style = document.createElement("style");
    style.id = "cdd-stoich-print-button-styles";
    style.textContent = `
        .cdd-stoich-reaction-host .${BTN_CLASS} {
            opacity: 0;
            pointer-events: none;
            transform: translateY(-2px);
            transition: opacity 0.15s ease, transform 0.15s ease;
        }

        .cdd-stoich-reaction-host:hover .${BTN_CLASS},
        .cdd-stoich-reaction-host:focus-within .${BTN_CLASS} {
            opacity: 1;
            pointer-events: auto;
            transform: translateY(0);
        }
    `;

    document.head.appendChild(style);
}
