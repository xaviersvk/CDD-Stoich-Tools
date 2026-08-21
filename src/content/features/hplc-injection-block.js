// content/features/hplc-injection-block.js
//
// "How much do I inject?" answered in the panel, once per reaction.
//
// An aliquot is drawn out of the reaction mixture, diluted into an HPLC
// vial, and the injection is however much of THAT carries the target amount
// onto the column. The reaction molarity comes off the stoichiometry table
// (see the solvent pass in inject/parsers/sample-data.js); the other three
// numbers are settings.
//
// The inputs are LOCAL to the reaction. One assay takes a single 10 µL drop
// and the next takes two, so recomputing reaction 2 must not quietly rewrite
// reaction 1 — or the settings. The options page holds the defaults a block
// starts from; typing here overrides them for that reaction only, until the
// entry is left or the value is reset.
//
// Overrides live in module state rather than on the element, because
// renderSamples rebuilds every block from scratch on each payload, field
// toggle and enrichment pass — an override kept on the DOM node would be
// thrown away by a re-render the user did not ask for.

import { copyTextWithFeedback } from "../utils/clipboard.js";
import {
    effectiveMolarity,
    computeInjectionVolume,
    formatMolarity,
} from "../../shared/hplc-injection-math.js";
import { optimizeInjection } from "../../shared/hplc-optimizer.js";
import {
    getHplcSettings,
    isHplcBlockEnabled,
    onHplcSettingsChanged,
    sanitizeAliquotVolumeUl,
    sanitizeVialVolumeMl,
    sanitizeTargetAmountNmol,
} from "../../shared/hplc-injection.js";

// The blocks currently in the DOM. renderSamples clears this before it
// rebuilds the list, so the single settings listener below never repaints a
// block that has been thrown away.
let liveBlocks = [];
let listenerAttached = false;

// reactionIndex -> { aliquotUl?, vialMl?, targetNmol? }
//
// Deliberately NOT persisted. It is a recalculation for the reaction on
// screen — "this one took two drops" — not a preference, and carrying a
// reaction 0 override into the next entry's reaction 0 would be wrong.
// Survives a re-render, cleared when the entry changes.
const overrides = new Map();

// reactionIndex of every block whose calculator is open.
//
// Same home as `overrides`, for the same reason: a flag kept on the DOM node
// would be thrown away by the next renderSamples, which rebuilds every block
// from scratch. Not persisted either — this is a glance, not a preference.
const expanded = new Set();

export function resetHplcInjectionBlocks() {
    liveBlocks = [];
}

// Called when the ELN entry changes — see the url-watcher callback in
// content/main.js, next to resetState().
export function clearHplcInjectionState() {
    overrides.clear();
    expanded.clear();
}

const FIELDS = {
    aliquotUl: { defaultOf: (s) => s.aliquotUl, sanitize: sanitizeAliquotVolumeUl },
    vialMl: { defaultOf: (s) => s.vialMl, sanitize: sanitizeVialVolumeMl },
    targetNmol: { defaultOf: (s) => s.targetNmol, sanitize: sanitizeTargetAmountNmol },
};

// The three numbers this block computes with: its own override where it has
// one, the options-page default everywhere else.
function effectiveParams(reactionIndex) {
    const settings = getHplcSettings();
    const local = overrides.get(reactionIndex) || {};

    const out = {};
    for (const [name, field] of Object.entries(FIELDS)) {
        out[name] = local[name] ?? field.defaultOf(settings);
    }
    return out;
}

function setOverride(reactionIndex, name, rawValue) {
    const clean = FIELDS[name].sanitize(rawValue);
    const local = overrides.get(reactionIndex) || {};

    // Typing the default back in is the same as never having overridden it,
    // so the block stops flagging the field and follows the settings again.
    if (clean === FIELDS[name].defaultOf(getHplcSettings())) delete local[name];
    else local[name] = clean;

    if (Object.keys(local).length) overrides.set(reactionIndex, local);
    else overrides.delete(reactionIndex);
}

function attachSettingsListener() {
    if (listenerAttached) return;
    listenerAttached = true;

    onHplcSettingsChanged(() => {
        for (const repaint of liveBlocks) {
            try {
                repaint();
            } catch {
                /* one bad block must not stop the others */
            }
        }
    });
}

function unit(text) {
    const span = document.createElement("span");
    span.className = "cdd-hplc-unit";
    span.textContent = text;
    return span;
}

function numberInput(step, onCommit) {
    const input = document.createElement("input");
    input.type = "number";
    input.className = "cdd-hplc-input";
    input.min = "0";
    input.step = step;
    // `change` fires on blur/Enter, never mid-typing — a half-typed "1."
    // must not be sanitised and put back under the caret.
    input.addEventListener("change", () => onCommit(input.value));
    return input;
}

// "hexane 0.1 M" — the tooltip that says where the molarity came from, and
// the only place the individual solvents are named.
function describeSolvents(solvents) {
    const parts = (solvents || [])
        .filter((s) => Number.isFinite(Number(s?.molarity)) && Number(s.molarity) > 0)
        .map((s) => `${s.name || "solvent"} ${formatMolarity(Number(s.molarity))} M`);

    if (parts.length > 1) {
        return `${parts.join(" + ")} → effective ${formatMolarity(effectiveMolarity(solvents))} M`;
    }
    return parts[0] || "";
}

// The block for one reaction, or null when the feature is switched off, or
// when the reaction has no solvent molarity — there is nothing to compute
// from, and an empty block reads as a bug rather than as an absence.
//
// `color` is the reaction group's own colour (getReactionColor), worn the
// way the cards wear it — on the thick left edge — so the block reads as
// part of its group rather than as a panel of its own.
export function createHplcInjectionBlock(reaction, color) {
    if (!isHplcBlockEnabled()) return null;

    const molarity = effectiveMolarity(reaction?.solvents);
    if (molarity == null) return null;

    const reactionIndex = reaction.index;
    attachSettingsListener();

    const block = document.createElement("div");
    block.className = "cdd-hplc-block";
    if (color?.border) block.style.borderLeftColor = color.border;
    if (color?.glow) block.style.boxShadow = `0 0 0 1px ${color.glow} inset`;

    const header = document.createElement("div");
    header.className = "cdd-hplc-header";
    header.setAttribute("role", "button");
    header.tabIndex = 0;

    const title = document.createElement("span");
    title.className = "cdd-hplc-title";
    title.textContent = "HPLC injection";

    // The inputs are behind a collapse now, and so is the `reset` pill that
    // used to say "this reaction is not on the settings' numbers". Without
    // this dot that fact would be invisible at rest.
    const dot = document.createElement("span");
    dot.className = "cdd-hplc-dot";
    dot.textContent = "•";
    dot.title = "This reaction uses its own numbers";
    dot.hidden = true;

    const chevron = document.createElement("span");
    chevron.className = "cdd-hplc-chevron";

    const headLeft = document.createElement("span");
    headLeft.className = "cdd-hplc-head-left";
    headLeft.append(title, dot, chevron);

    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "cdd-hplc-reset";
    reset.textContent = "reset";
    reset.title = "Back to the defaults from the options page";
    reset.hidden = true;
    reset.addEventListener("click", () => {
        overrides.delete(reactionIndex);
        repaint();
    });

    const result = document.createElement("span");
    result.className = "cdd-hplc-result";

    header.append(headLeft, result);

    const molarityEl = document.createElement("span");
    molarityEl.className = "cdd-hplc-molarity";
    molarityEl.textContent = `${formatMolarity(molarity)} M`;
    molarityEl.title = describeSolvents(reaction.solvents);

    function commit(name) {
        return (rawValue) => {
            setOverride(reactionIndex, name, rawValue);
            repaint();
        };
    }

    const aliquotInput = numberInput("1", commit("aliquotUl"));
    const vialInput = numberInput("0.1", commit("vialMl"));
    const targetInput = numberInput("0.1", commit("targetNmol"));

    aliquotInput.title = "Aliquot drawn from the reaction mixture — this reaction only";
    vialInput.title = "Final volume of the diluted sample — this reaction only";
    targetInput.title = "Amount that should reach the column — this reaction only";

    const inputs = document.createElement("div");
    inputs.className = "cdd-hplc-inputs";
    inputs.append(
        molarityEl,
        unit(" · "),
        aliquotInput,
        unit(" µL → "),
        vialInput,
        unit(" mL · "),
        targetInput,
        unit(" nmol"),
        reset,
    );

    // One line, one action. It says what is wrong and — when there is one —
    // what to do about it; clicking applies that as this reaction's own
    // override, so nothing global moves. Never more than a line: the bench
    // reads this at a glance, and a paragraph here is a paragraph nobody
    // reads.
    const warn = document.createElement("button");
    warn.type = "button";
    warn.className = "cdd-hplc-warn";
    warn.hidden = true;

    const body = document.createElement("div");
    body.className = "cdd-hplc-body";
    body.append(inputs);

    // The warning sits OUTSIDE the body on purpose: a warning that hides when
    // the block is shut is not a warning.
    block.append(header, warn, body);

    let copyValue = "";

    // The header toggles; the number copies. Nested interactive elements are
    // not valid markup, so the result stops its own click from reaching the
    // header rather than being a button inside one.
    result.addEventListener("click", async (event) => {
        event.stopPropagation();
        if (!copyValue) return;
        await copyTextWithFeedback(result, copyValue);
    });

    header.addEventListener("click", toggle);
    header.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        // Space scrolls the panel otherwise.
        event.preventDefault();
        toggle();
    });

    function toggle() {
        if (expanded.has(reactionIndex)) expanded.delete(reactionIndex);
        else expanded.add(reactionIndex);
        paintCollapse();
    }

    function paintCollapse() {
        const open = expanded.has(reactionIndex);
        body.hidden = !open;
        chevron.textContent = open ? "▴" : "▾";
        header.setAttribute("aria-expanded", String(open));
    }

    function repaint() {
        const current = effectiveParams(reactionIndex);
        const local = overrides.get(reactionIndex) || {};

        const overridden = Object.keys(local).length > 0;
        reset.hidden = !overridden;
        dot.hidden = !overridden;

        // Reading the map here — rather than starting shut — is what makes an
        // open block survive renderSamples rebuilding it.
        paintCollapse();

        for (const [input, name] of [
            [aliquotInput, "aliquotUl"],
            [vialInput, "vialMl"],
            [targetInput, "targetNmol"],
        ]) {
            // Never write over the box the user is standing in — the commit
            // that triggered this repaint came from it.
            if (input !== document.activeElement) input.value = String(current[name]);
            // A field carrying an override is marked, so "why does this
            // reaction say something different?" has a visible answer.
            input.classList.toggle("cdd-hplc-input-local", local[name] != null);
        }

        const computed = computeInjectionVolume({
            molarity,
            aliquotUl: current.aliquotUl,
            vialMl: current.vialMl,
            targetNmol: current.targetNmol,
        });

        if (!computed) {
            result.textContent = "—";
            result.classList.remove("cdd-hplc-result-warn");
            copyValue = "";
            hideWarning();
            return;
        }

        // The big number is what gets dialled into the sequence: tenths of a
        // microlitre, one decimal, the way the bench's printed guide prints
        // it.
        const rounded = computed.roundedUl.toFixed(1);
        result.textContent = `${rounded} µL`;
        copyValue = rounded;

        result.classList.toggle(
            "cdd-hplc-result-warn",
            computed.warning === "exceeds-vial"
        );

        paintWarning(current, computed);
    }

    function hideWarning() {
        warn.hidden = true;
        warn.onclick = null;
    }

    function showWarning(text, { error = false, onclick = null } = {}) {
        warn.hidden = false;
        warn.disabled = !onclick;
        warn.textContent = text;
        warn.className = error ? "cdd-hplc-warn cdd-hplc-warn-error" : "cdd-hplc-warn";
        warn.title = onclick ? "Apply to this reaction only" : "";
        warn.onclick = onclick;
    }

    // What to say when the injection is not one the bench wants to make.
    //
    // One line, because it is read at a glance and it has to stay readable
    // while the calculator below is shut. An injection larger than the whole
    // sample takes that line whatever the optimiser thinks: that is a
    // mistake, not a preference, and it is the only red one here.
    function paintWarning(current, computed) {
        if (computed.warning === "exceeds-vial") {
            showWarning("⚠ More than the whole vial", { error: true });
            return;
        }

        const settings = getHplcSettings();
        const outcome = optimizeInjection({
            molarity,
            targetNmol: current.targetNmol,
            dropUl: settings.aliquotUl,
            currentAliquotUl: current.aliquotUl,
            currentVialMl: current.vialMl,
            vialLadderMl: settings.vialLadderMl,
            comfortMinUl: settings.comfortMinUl,
            comfortMaxUl: settings.comfortMaxUl,
            injectionMinUl: settings.injectionMinUl,
            injectionMaxUl: settings.injectionMaxUl,
        });

        if (outcome.ok) {
            hideWarning();
            return;
        }

        // "impossible" and "nothing on the ladder does better" are the same
        // sentence to the person holding the vial: there is no move to make.
        if (!outcome.suggestion) {
            showWarning("⚠ Nothing on the ladder brings this in range");
            return;
        }

        const s = outcome.suggestion;
        const lead =
            outcome.reason === "too-dilute" ? "Too dilute" : "Too concentrated";

        const steps = [];
        if (Math.abs(s.vialMl - current.vialMl) > 1e-9) steps.push(`${s.vialMl} mL`);

        const currentDrops = Math.max(1, Math.round(current.aliquotUl / settings.aliquotUl));
        if (s.drops !== currentDrops) {
            steps.push(`${s.drops} drop${s.drops === 1 ? "" : "s"}`);
        }
        if (s.dilution !== 1) steps.push(`${s.dilution}× dilution`);

        showWarning(
            `⚠ ${lead} → ${steps.join(", ")} = ${s.volumeUl.toFixed(1)} µL`,
            {
                onclick: () => {
                    setOverride(reactionIndex, "vialMl", s.vialMl);
                    // The EFFECTIVE aliquot, dilution folded in — a 5×-diluted
                    // drop puts the same material in the vial as 2 µL would,
                    // which is exactly how the bench's own grid labels that
                    // row. Without this the click would apply a suggestion
                    // whose dilution has nowhere to live, and the number would
                    // not move.
                    setOverride(reactionIndex, "aliquotUl", s.aliquotUl);
                    repaint();
                },
            }
        );
    }

    repaint();
    liveBlocks.push(repaint);

    return block;
}

// Spliced into the panel's own <style> so the block inherits the panel-id
// scoping the rest of the rules use.
export const HPLC_BLOCK_STYLES = `
  /* Same shell as .cdd-stoich-card, on purpose: the block belongs to the
     reaction group, it is not a panel of its own. */
  .cdd-hplc-block {
    border: 1px solid #374151;
    border-left-width: 4px;
    border-radius: 10px;
    padding: 10px;
    background: #0f172a;
  }

  .cdd-hplc-reset {
    margin-left: 6px;
    padding: 0 5px;
    font-size: 9px;
    font-family: inherit;
    font-weight: 700;
    letter-spacing: 0.3px;
    text-transform: uppercase;
    color: #f59e0b;
    background: rgba(245, 158, 11, 0.12);
    border: 1px solid rgba(245, 158, 11, 0.4);
    border-radius: 999px;
    cursor: pointer;
  }

  .cdd-hplc-reset:hover {
    background: rgba(245, 158, 11, 0.25);
  }

  /* The WHOLE row is the toggle, not the chevron -- the chevron is only the
     sign that says so. The negative margin lets the hover tint reach the
     block's own padding, so what lights up is the width the click already
     had; without it the row looks smaller than it is and people aim at the
     arrow. */
  .cdd-hplc-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    margin: -4px -6px;
    padding: 4px 6px;
    border-radius: 7px;
    cursor: pointer;
  }

  .cdd-hplc-header:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .cdd-hplc-header:focus-visible {
    outline: 1px solid rgba(56, 189, 248, 0.7);
    outline-offset: -1px;
  }

  .cdd-hplc-head-left {
    display: flex;
    align-items: baseline;
    gap: 5px;
    min-width: 0;
  }

  /* A filled triangle, not U+2304 -- that arrowhead renders as a hairline in
     the system stacks and read as something too small to hit. */
  .cdd-hplc-chevron {
    font-size: 11px;
    line-height: 1;
    color: #94a3b8;
  }

  .cdd-hplc-header:hover .cdd-hplc-chevron {
    color: #e2e8f0;
  }

  /* This reaction is not on the settings' numbers. */
  .cdd-hplc-dot {
    font-size: 14px;
    line-height: 1;
    color: #f59e0b;
  }

  .cdd-hplc-dot[hidden] {
    display: none;
  }

  /* .cdd-hplc-inputs sets display:flex, which would beat the UA stylesheet's
     [hidden] rule if the body were still display:block. */
  .cdd-hplc-body[hidden] {
    display: none;
  }

  .cdd-hplc-title {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.4px;
    text-transform: uppercase;
    color: #7dd3fc;
  }

  .cdd-hplc-result {
    font-size: 15px;
    font-weight: 700;
    color: #f9fafb;
    cursor: pointer;
    padding: 1px 4px;
    border-radius: 4px;
  }

  .cdd-hplc-result:hover {
    background: rgba(255,255,255,0.08);
  }

  .cdd-hplc-result-warn {
    color: #ef4444;
  }

  .cdd-hplc-inputs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    margin-top: 6px;
    font-size: 11px;
    color: #cbd5e1;
  }

  .cdd-hplc-molarity {
    font-weight: 700;
    color: #93c5fd;
  }

  .cdd-hplc-unit {
    white-space: pre;
  }

  .cdd-hplc-input {
    width: 52px;
    padding: 1px 4px;
    font-size: 11px;
    font-family: inherit;
    color: #f9fafb;
    background: rgba(15, 23, 42, 0.9);
    border: 1px solid #374151;
    border-radius: 4px;
  }

  .cdd-hplc-input:focus {
    outline: none;
    border-color: rgba(56, 189, 248, 0.7);
  }

  /* Overridden for this reaction only — not what the options page says. */
  .cdd-hplc-input-local {
    border-color: rgba(245, 158, 11, 0.65);
    color: #fbbf24;
  }

  /* An author display rule beats the UA stylesheet's [hidden] rule, so without
     this the element stays on screen when warn.hidden = true -- an empty
     amber bar on every reaction that needs no advice. */
  .cdd-hplc-warn[hidden] {
    display: none;
  }

  .cdd-hplc-warn {
    display: block;
    width: 100%;
    margin-top: 6px;
    padding: 5px 7px;
    font-size: 10px;
    font-family: inherit;
    line-height: 1.35;
    text-align: left;
    color: #fbbf24;
    background: rgba(245, 158, 11, 0.1);
    border: 1px solid rgba(245, 158, 11, 0.4);
    border-radius: 6px;
    cursor: pointer;
  }

  .cdd-hplc-warn:hover:not(:disabled) {
    background: rgba(245, 158, 11, 0.22);
  }

  .cdd-hplc-warn:disabled {
    cursor: default;
    opacity: 0.85;
  }

  /* An injection larger than the whole sample is a mistake, not a preference
     -- the only red one here. */
  .cdd-hplc-warn-error {
    color: #fca5a5;
    background: rgba(239, 68, 68, 0.12);
    border-color: rgba(239, 68, 68, 0.45);
  }
`;
