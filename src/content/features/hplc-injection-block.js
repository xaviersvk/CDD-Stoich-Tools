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
    formatInjectionVolume,
    formatMolarity,
    formatNmol,
    HPLC_INJECTION_STEP_UL,
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

export function resetHplcInjectionBlocks() {
    liveBlocks = [];
}

// Called when the ELN entry changes — see the url-watcher callback in
// content/main.js, next to resetState().
export function clearHplcInjectionOverrides() {
    overrides.clear();
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

    const top = document.createElement("div");
    top.className = "cdd-hplc-top";

    const title = document.createElement("span");
    title.className = "cdd-hplc-title";
    title.textContent = "HPLC injection";

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

    const exact = document.createElement("div");
    exact.className = "cdd-hplc-exact";

    top.append(title, reset, result);

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
    );

    const note = document.createElement("div");
    note.className = "cdd-hplc-note";
    note.hidden = true;

    // What to do when the computed injection is not one the instrument can
    // comfortably deliver. Clicking it applies the suggestion as this
    // reaction's own override — nothing global moves.
    const advice = document.createElement("button");
    advice.type = "button";
    advice.className = "cdd-hplc-advice";
    advice.hidden = true;

    block.append(top, exact, inputs, note, advice);

    let copyValue = "";
    result.addEventListener("click", async () => {
        if (!copyValue) return;
        await copyTextWithFeedback(result, copyValue);
    });

    function repaint() {
        const current = effectiveParams(reactionIndex);
        const local = overrides.get(reactionIndex) || {};

        reset.hidden = !Object.keys(local).length;

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
            exact.textContent = "";
            exact.hidden = true;
            note.hidden = true;
            advice.hidden = true;
            return;
        }

        // The big number is what gets dialled into the sequence: tenths of a
        // microlitre, one decimal, the way the bench's printed guide prints
        // it.
        const rounded = computed.roundedUl.toFixed(1);
        result.textContent = `${rounded} µL`;
        copyValue = rounded;

        // The exact figure appears ONLY when rounding actually moved the
        // volume, because that is exactly when the column stops getting the
        // amount that was asked for. At tenth-µL steps it usually moves
        // nothing, and a line saying so would be noise.
        const roundingMoved =
            Math.abs(computed.roundedUl - computed.volumeUl) > 1e-9;

        exact.hidden = !roundingMoved;
        exact.textContent = roundingMoved
            ? `exact ${formatInjectionVolume(computed.volumeUl)} µL · ` +
              `${formatNmol(computed.deliveredNmol)} nmol on column`
            : "";

        result.classList.toggle(
            "cdd-hplc-result-warn",
            computed.warning === "exceeds-vial"
        );

        if (computed.warning === "exceeds-vial") {
            note.textContent =
                "Exceeds the vial volume — the dilution is too weak for this target.";
            note.className = "cdd-hplc-note cdd-hplc-note-error";
            note.hidden = false;
        } else if (computed.warning === "floored") {
            note.textContent =
                `Rounded up to the ${HPLC_INJECTION_STEP_UL} µL minimum — the vial is ` +
                "too concentrated, so this injection overshoots the target.";
            note.className = "cdd-hplc-note cdd-hplc-note-warn";
            note.hidden = false;
        } else {
            note.hidden = true;
        }

        paintAdvice(current);
    }

    // One sentence, one action — see the optimiser for how the suggestion is
    // chosen. Silence when the current preparation is already comfortable.
    function paintAdvice(current) {
        const settings = getHplcSettings();
        const result = optimizeInjection({
            molarity,
            targetNmol: current.targetNmol,
            dropUl: settings.aliquotUl,
            currentAliquotUl: current.aliquotUl,
            currentVialMl: current.vialMl,
            vialLadderMl: settings.vialLadderMl,
            comfortMinUl: settings.comfortMinUl,
            comfortMaxUl: settings.comfortMaxUl,
        });

        if (result.ok) {
            advice.hidden = true;
            advice.onclick = null;
            return;
        }

        if (result.reason === "impossible" || !result.suggestion) {
            advice.hidden = false;
            advice.disabled = true;
            advice.textContent =
                result.reason === "impossible"
                    ? "⚠ No dilution on the ladder brings this into the injector's range."
                    : "⚠ Outside the comfortable range, and nothing on the ladder does better.";
            advice.onclick = null;
            return;
        }

        const s = result.suggestion;
        const lead =
            result.reason === "too-dilute" ? "Too dilute" : "Too concentrated";

        const steps = [];
        if (Math.abs(s.vialMl - current.vialMl) > 1e-9) {
            steps.push(`dilute into ${s.vialMl} mL`);
        }
        const currentDrops = Math.max(1, Math.round(current.aliquotUl / settings.aliquotUl));
        if (s.drops !== currentDrops) {
            steps.push(`take ${s.drops} drop${s.drops === 1 ? "" : "s"}`);
        }
        if (s.dilution !== 1) {
            steps.push(`dilute the aliquot ${s.dilution}×`);
        }

        advice.hidden = false;
        advice.disabled = false;
        advice.textContent =
            `⚠ ${lead} — ${steps.join(", ")} → ${s.volumeUl.toFixed(1)} µL injection`;
        advice.title = "Apply to this reaction only";

        advice.onclick = () => {
            setOverride(reactionIndex, "vialMl", s.vialMl);
            // The EFFECTIVE aliquot, dilution folded in — a 20×-diluted drop
            // puts the same material in the vial as 0.5 µL would, which is
            // exactly how the bench's own grid labels that row. Without this
            // the click would apply a suggestion whose dilution has nowhere
            // to live, and the number would not move.
            setOverride(reactionIndex, "aliquotUl", s.aliquotUl);
            repaint();
        };
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

  .cdd-hplc-exact {
    margin-top: 2px;
    font-size: 10px;
    line-height: 1.3;
    color: #94a3b8;
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

  .cdd-hplc-top {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
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

  .cdd-hplc-note {
    margin-top: 5px;
    font-size: 10px;
    line-height: 1.35;
  }

  .cdd-hplc-note-warn {
    color: #f59e0b;
  }

  /* An author display rule beats the UA stylesheet's [hidden] rule, so without
     this the element stays on screen when advice.hidden = true -- an empty
     amber bar on every reaction that needs no advice. */
  .cdd-hplc-advice[hidden] {
    display: none;
  }

  .cdd-hplc-advice {
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

  .cdd-hplc-advice:hover:not(:disabled) {
    background: rgba(245, 158, 11, 0.22);
  }

  .cdd-hplc-advice:disabled {
    cursor: default;
    opacity: 0.85;
  }

  .cdd-hplc-note-error {
    color: #ef4444;
  }
`;
