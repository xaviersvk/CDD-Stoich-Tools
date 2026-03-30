import { copyTextWithFeedback } from "../utils/clipboard.js";
import { STATE } from "../state.js";
import { isElnEntryPage } from "../../shared/page-detection.js";
import { PANEL_ID, REACTION_COLORS } from "../../shared/plugin-constants.js";
import { updatePanelVisibilityForOverlays } from "../overlay-watcher.js";
import { printPanel } from "./panel-print.js";

export function makePanelDraggable(panel) {
    const header = panel.querySelector(".cdd-stoich-header");
    if (!header) return;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    header.addEventListener("mousedown", (event) => {
        if (event.target.closest("button")) return;

        isDragging = true;

        const rect = panel.getBoundingClientRect();
        panel.style.left = `${rect.left}px`;
        panel.style.top = `${rect.top}px`;
        panel.style.right = "auto";

        startX = event.clientX;
        startY = event.clientY;
        startLeft = rect.left;
        startTop = rect.top;

        document.body.style.userSelect = "none";
        event.preventDefault();
    });

    document.addEventListener("mousemove", (event) => {
        if (!isDragging) return;

        const dx = event.clientX - startX;
        const dy = event.clientY - startY;

        let newLeft = startLeft + dx;
        let newTop = startTop + dy;

        const maxLeft = window.innerWidth - panel.offsetWidth;
        const maxTop = window.innerHeight - panel.offsetHeight;

        newLeft = Math.max(0, Math.min(newLeft, maxLeft));
        newTop = Math.max(0, Math.min(newTop, maxTop));

        panel.style.left = `${newLeft}px`;
        panel.style.top = `${newTop}px`;
    });

    document.addEventListener("mouseup", () => {
        if (!isDragging) return;
        isDragging = false;
        document.body.style.userSelect = "";
    });
}

export function ensurePanel() {
    if (!STATE.hasReactionFeature) return null;

    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;

    panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.style.top = "16px";
    panel.style.right = "16px";
    panel.style.left = "auto";

    const header = document.createElement("div");
    header.className = "cdd-stoich-header";

    const title = document.createElement("div");
    title.className = "cdd-stoich-title";
    title.textContent = "CDD Samples";

    const actions = document.createElement("div");
    actions.className = "cdd-stoich-actions";

    const refreshBtn = document.createElement("button");
    refreshBtn.id = `${PANEL_ID}-refresh`;
    refreshBtn.type = "button";
    refreshBtn.textContent = "Refresh";

    const printBtn = document.createElement("button");
    printBtn.id = `${PANEL_ID}-print`;
    printBtn.type = "button";
    printBtn.textContent = "Print";

    const toggleBtn = document.createElement("button");
    toggleBtn.id = `${PANEL_ID}-toggle`;
    toggleBtn.type = "button";
    toggleBtn.textContent = "−";

    actions.appendChild(refreshBtn);
    actions.appendChild(printBtn);
    actions.appendChild(toggleBtn);

    header.appendChild(title);
    header.appendChild(actions);

    const body = document.createElement("div");
    body.className = "cdd-stoich-body";

    const status = document.createElement("div");
    status.className = "cdd-stoich-status";
    status.textContent = "Waiting for reaction data...";

    const list = document.createElement("div");
    list.className = "cdd-stoich-list";

    body.appendChild(status);
    body.appendChild(list);

    panel.appendChild(header);
    panel.appendChild(body);

    const style = document.createElement("style");
    style.textContent = `
  #${PANEL_ID} {
    position: fixed;
    top: 16px;
    right: 16px;
    width: 300px;
    max-height: calc(100vh - 32px);
    background: #111827;
    color: #f9fafb;
    border: 1px solid #374151;
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.35);
    z-index: 2147483647;
    font-family: Arial, sans-serif;
    overflow: hidden;
  }

  #${PANEL_ID} .cdd-stoich-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    background: #1f2937;
    border-bottom: 1px solid #374151;
    cursor: move;
    user-select: none;
  }

  #${PANEL_ID} .cdd-stoich-title {
    font-size: 14px;
    font-weight: 700;
  }

  #${PANEL_ID} .cdd-stoich-actions {
    display: flex;
    gap: 6px;
  }

  #${PANEL_ID} button {
    background: #374151;
    color: #f9fafb;
    border: 1px solid #4b5563;
    border-radius: 6px;
    padding: 4px 8px;
    font-size: 12px;
    cursor: pointer;
  }

  #${PANEL_ID} button:hover {
    background: #4b5563;
  }

  #${PANEL_ID} .cdd-stoich-body {
    padding: 10px;
    overflow: auto;
    max-height: calc(100vh - 90px);
  }

  #${PANEL_ID} .cdd-stoich-status {
    font-size: 12px;
    color: #cbd5e1;
    margin-bottom: 10px;
  }

  #${PANEL_ID} .cdd-stoich-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  #${PANEL_ID} .cdd-stoich-group {
    border: 1px solid #374151;
    border-radius: 12px;
    overflow: hidden;
    background: #0b1220;
  }

  #${PANEL_ID} .cdd-stoich-group-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 10px;
    font-size: 12px;
    font-weight: 700;
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }

  #${PANEL_ID} .cdd-stoich-group-count {
    font-size: 11px;
    opacity: 0.85;
  }

  #${PANEL_ID} .cdd-stoich-group-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
  }

  #${PANEL_ID} .cdd-stoich-card {
    border: 1px solid #374151;
    border-left-width: 4px;
    border-radius: 10px;
    padding: 10px;
    background: #0f172a;
  }

  #${PANEL_ID} .cdd-stoich-card-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 6px;
  }

  #${PANEL_ID} .cdd-stoich-reaction-badge {
    display: inline-block;
    font-size: 10px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 999px;
  }

  #${PANEL_ID} .cdd-stoich-row {
    margin-bottom: 4px;
    font-size: 12px;
    line-height: 1.4;
    word-break: break-word;
  }

  #${PANEL_ID} .cdd-stoich-row:last-child {
    margin-bottom: 0;
  }

  #${PANEL_ID} .cdd-stoich-label {
    color: #93c5fd;
    font-weight: 700;
  }

  #${PANEL_ID} .cdd-stoich-row-copyable {
    font-size: 12px;
    margin-bottom: 6px;
    line-height: 1.4;
    word-break: break-word;
  }

  #${PANEL_ID} .cdd-stoich-copy-value {
    cursor: pointer;
    margin-left: 6px;
    color: #f9fafb;
    padding: 1px 4px;
    border-radius: 4px;
  }

  #${PANEL_ID} .cdd-stoich-copy-value:hover {
    background: rgba(255,255,255,0.08);
  }

  #${PANEL_ID} .cdd-copy-flash {
    background: rgba(52, 211, 153, 0.35);
  }

  #${PANEL_ID}.collapsed .cdd-stoich-body {
    display: none;
  }

  #${PANEL_ID} .cdd-low-purity-badge {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
    font-weight: 700;
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 999px;
    border: 1px solid rgba(239, 68, 68, 0.35);
  }
`;

    document.documentElement.appendChild(style);
    document.documentElement.appendChild(panel);

    makePanelDraggable(panel);

    refreshBtn.addEventListener("click", () => {
        renderFromState();
    });

    printBtn.addEventListener("click", () => {
        printPanel();
    });

    toggleBtn.addEventListener("click", () => {
        panel.classList.toggle("collapsed");
        toggleBtn.textContent = panel.classList.contains("collapsed") ? "+" : "−";
    });

    updatePanelVisibilityForOverlays();
    return panel;
}

export function removePanel() {
    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.remove();
}

export function getPanelParts() {
    const panel = ensurePanel();
    if (!panel) {
        return {
            panel: null,
            status: null,
            list: null,
        };
    }

    return {
        panel,
        status: panel.querySelector(".cdd-stoich-status"),
        list: panel.querySelector(".cdd-stoich-list"),
    };
}

export function parsePurity(value) {
    if (value == null || value === "") return NaN;
    return parseFloat(String(value).replace(",", "."));
}

function formatClipboardNumber(value) {
    if (!Number.isFinite(value)) return null;

    const rounded = Number(value.toFixed(12));
    if (Object.is(rounded, -0)) return "0";

    return String(rounded);
}

function normalizeConcentrationUnit(unit) {
    return String(unit || "")
        .trim()
        .replace(/\s+/g, "")
        .replace(/μ/g, "u")
        .replace(/µ/g, "u")
        .toLowerCase();
}

function getCddCompatibleConcentrationCopyValue(sample) {
    const rawValue = sample?.concentration;
    const rawUnits = sample?.concentrationUnits;

    if (rawValue == null || rawValue === "") return null;

    const numericValue = parseFloat(String(rawValue).replace(",", "."));
    if (!Number.isFinite(numericValue)) {
        return rawUnits ? `${rawValue} ${rawUnits}` : String(rawValue);
    }

    const unit = normalizeConcentrationUnit(rawUnits);

    if (!unit) {
        return String(rawValue);
    }

    if (unit === "m" || unit === "mol/l") {
        return `${formatClipboardNumber(numericValue)} mol/L`;
    }

    if (unit === "mm" || unit === "mmol/l") {
        return `${formatClipboardNumber(numericValue)} mmol/L`;
    }

    if (unit === "um" || unit === "umol/l") {
        return `${formatClipboardNumber(numericValue / 1000)} mmol/L`;
    }

    if (unit === "nm" || unit === "nmol/l") {
        return `${formatClipboardNumber(numericValue / 1000000)} mmol/L`;
    }

    if (unit === "mol/ml") {
        return `${formatClipboardNumber(numericValue)} mol/mL`;
    }

    return rawUnits ? `${rawValue} ${rawUnits}` : String(rawValue);
}

function createCopyableRow(label, value, options = {}) {
    if (value == null || value === "") return null;

    const row = document.createElement("div");
    row.className = "cdd-stoich-row-copyable";

    const labelEl = document.createElement("span");
    labelEl.className = "cdd-stoich-label";
    labelEl.textContent = `${label}:`;

    const valueEl = document.createElement("span");
    valueEl.className = "cdd-stoich-copy-value";

    const valueText = String(value);
    const copyText =
        options.copyValue != null && options.copyValue !== ""
            ? String(options.copyValue)
            : valueText;

    valueEl.textContent = valueText;

    row.appendChild(labelEl);
    row.appendChild(document.createTextNode(" "));
    row.appendChild(valueEl);

    if (options.highlight) {
        valueEl.style.color = "#ef4444";
        valueEl.style.fontWeight = "700";
    }

    valueEl.addEventListener("click", async () => {
        await copyTextWithFeedback(valueEl, copyText);
    });

    return row;
}

export function setStatus(text) {
    const { status } = getPanelParts();
    if (!status) return;
    status.textContent = text;
}

export function getReactionColor(index) {
    return REACTION_COLORS[index % REACTION_COLORS.length];
}

export function groupSamplesByReaction(samples) {
    const groups = new Map();

    for (const sample of samples) {
        const key = sample.reactionIndex ?? 0;
        if (!groups.has(key)) {
            groups.set(key, {
                reactionIndex: key,
                reactionLabel: sample.reactionLabel || `Reaction ${key + 1}`,
                items: [],
            });
        }
        groups.get(key).items.push(sample);
    }

    return [...groups.values()].sort((a, b) => a.reactionIndex - b.reactionIndex);
}

export function formatConcentration(sample) {
    if (sample.concentration == null || sample.concentration === "") return null;
    if (sample.concentrationUnits) {
        return `${sample.concentration} ${sample.concentrationUnits}`;
    }
    return String(sample.concentration);
}

function isRenderableTextValue(value) {
    // console.log("[CDD panel][location check] raw value =", value);
    // console.log("[CDD panel][location check] type =", typeof value);

    if (value == null) {
        // console.log("[CDD panel][location check] → NULL/undefined → skip");
        return false;
    }

    if (typeof value === "object") {
        // console.log("[CDD panel][location check] → OBJECT → skip", JSON.stringify(value, null, 2));
        return false;
    }

    const text = String(value).trim();

    // console.log("[CDD panel][location check] normalized text =", text);

    if (text === "") {
        // console.log("[CDD panel][location check] → empty string → skip");
        return false;
    }

    // console.log("[CDD panel][location check] → OK render");
    return true;
}

function normalizeValue(value) {
    return String(value || "")
        .replace(/\s+/g, " ")
        .trim();
}

function isSampleDepleted(sample) {
    const depleted = STATE.depletedIdentifiers instanceof Set
        ? STATE.depletedIdentifiers
        : new Set();

    const candidates = [
        sample?.name,
        sample?.sampleId,
        sample?.internalID,
    ]
        .map(normalizeValue)
        .filter(Boolean);

    for (const candidate of candidates) {
        if (depleted.has(candidate)) {
            return true;
        }
    }

    return false;
}

export function renderSamples(payload) {
    const { list } = getPanelParts();
    if (!list) return;

    list.replaceChildren();

    const samples = payload?.samples || [];
    if (!samples.length) {
        const emptyCard = document.createElement("div");
        emptyCard.className = "cdd-stoich-card";
        emptyCard.textContent = "No samples found in reaction block.";
        list.appendChild(emptyCard);
        return;
    }

    const groups = groupSamplesByReaction(samples);

    for (const group of groups) {
        const color = getReactionColor(group.reactionIndex);

        const groupEl = document.createElement("div");
        groupEl.className = "cdd-stoich-group";
        groupEl.style.borderColor = color.border;
        groupEl.style.boxShadow = `0 0 0 1px ${color.glow} inset`;

        const groupHeader = document.createElement("div");
        groupHeader.className = "cdd-stoich-group-header";
        groupHeader.style.background = color.badgeBg;
        groupHeader.style.color = color.badgeText;

        const groupTitle = document.createElement("span");
        groupTitle.textContent = group.reactionLabel;

        const groupCount = document.createElement("span");
        groupCount.className = "cdd-stoich-group-count";
        groupCount.textContent = `${group.items.length} sample(s)`;

        groupHeader.appendChild(groupTitle);
        groupHeader.appendChild(groupCount);

        const groupBody = document.createElement("div");
        groupBody.className = "cdd-stoich-group-body";

        for (const sample of group.items) {
            const card = document.createElement("div");
            card.className = "cdd-stoich-card";
            card.style.borderLeftColor = color.border;
            card.style.boxShadow = `0 0 0 1px ${color.glow} inset`;

            const concentrationText = formatConcentration(sample);
            const purityValue = parsePurity(sample.purity);
            const lowPurity = !isNaN(purityValue) && purityValue <= 93;
            const depletedSample = isSampleDepleted(sample);
            const { internalID, solvent } = sample;

            if (lowPurity || depletedSample) {
                card.style.borderLeftColor = "#ef4444";
                card.style.background = "rgba(239,68,68,0.05)";
            }

            const cardTop = document.createElement("div");
            cardTop.className = "cdd-stoich-card-top";

            const badge = document.createElement("div");
            badge.className = "cdd-stoich-reaction-badge";
            badge.style.background = color.badgeBg;
            badge.style.color = color.badgeText;
            badge.textContent = group.reactionLabel;

            cardTop.appendChild(badge);

            if (lowPurity) {
                const purityBadge = document.createElement("div");
                purityBadge.className = "cdd-low-purity-badge";
                purityBadge.textContent = "⚠ LOW PURITY";
                cardTop.appendChild(purityBadge);
            }

            if (depletedSample) {
                const depletedBadge = document.createElement("div");
                depletedBadge.className = "cdd-low-purity-badge";
                depletedBadge.textContent = "⚠ DEPLETED SAMPLE USED";
                cardTop.appendChild(depletedBadge);
            }

            card.appendChild(cardTop);

            const purityRow = lowPurity
                ? createCopyableRow("Purity [%]", sample.purity, { highlight: true })
                : null;

            const rows = [
                createCopyableRow("Name", sample.name || "—"),
                isRenderableTextValue(sample.location)
                    ? createCopyableRow("Location", sample.location)
                    : null,
                purityRow,
                createCopyableRow("Internal ID", internalID),
                createCopyableRow("Density [g/mL]", sample.density),
                createCopyableRow("Concentration", concentrationText, {
                    copyValue: getCddCompatibleConcentrationCopyValue(sample),
                }),
                createCopyableRow("Solvent", solvent),
            ].filter(Boolean);

            for (const rowEl of rows) {
                card.appendChild(rowEl);
            }

            groupBody.appendChild(card);
        }

        groupEl.appendChild(groupHeader);
        groupEl.appendChild(groupBody);
        list.appendChild(groupEl);
    }
}

export function renderFromState() {
    if (!isElnEntryPage()) return;
    if (!STATE.hasReactionFeature) return;
    if (STATE.isKetcherOpen) return;

    ensurePanel();

    if (!STATE.lastPayload) {
        setStatus("No reaction data captured yet. Wait for page API response.");
        return;
    }

    const count = STATE.lastPayload.samples?.length || 0;
    const reactionCount = STATE.lastPayload.reactionCount || 0;

    setStatus(`Loaded ${count} sample(s) from ${reactionCount} reaction(s).`);
    renderSamples(STATE.lastPayload);
}


