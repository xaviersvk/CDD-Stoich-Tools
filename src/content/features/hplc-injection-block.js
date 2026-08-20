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
// The inputs ARE the settings, not a local copy of them: typing here is the
// same edit as typing in the options page. They write on `change` — blur or
// Enter — so a half-typed "1." never reaches storage, comes back sanitised,
// and lands under the caret.

import { copyTextWithFeedback } from "../utils/clipboard.js";
import {
    effectiveMolarity,
    computeInjectionVolume,
    formatInjectionVolume,
    formatMolarity,
    HPLC_MIN_INJECTION_UL,
} from "../../shared/hplc-injection-math.js";
import {
    getHplcSettings,
    onHplcSettingsChanged,
    saveHplcAliquotVolumeUl,
    saveHplcVialVolumeMl,
    saveHplcTargetAmountNmol,
} from "../../shared/hplc-injection.js";

// The blocks currently in the DOM. renderSamples clears this before it
// rebuilds the list, so the single settings listener below never repaints a
// block that has been thrown away.
let liveBlocks = [];
let listenerAttached = false;

export function resetHplcInjectionBlocks() {
    liveBlocks = [];
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

function numberInput(value, step, onCommit) {
    const input = document.createElement("input");
    input.type = "number";
    input.className = "cdd-hplc-input";
    input.min = "0";
    input.step = step;
    input.value = String(value);
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

// The block for one reaction, or null when the reaction has no solvent
// molarity — there is nothing to compute from, and an empty block reads as
// a bug rather than as an absence.
export function createHplcInjectionBlock(reaction) {
    const molarity = effectiveMolarity(reaction?.solvents);
    if (molarity == null) return null;

    attachSettingsListener();

    const block = document.createElement("div");
    block.className = "cdd-hplc-block";

    const top = document.createElement("div");
    top.className = "cdd-hplc-top";

    const title = document.createElement("span");
    title.className = "cdd-hplc-title";
    title.textContent = "HPLC injection";

    const result = document.createElement("span");
    result.className = "cdd-hplc-result";

    top.append(title, result);

    const molarityEl = document.createElement("span");
    molarityEl.className = "cdd-hplc-molarity";
    molarityEl.textContent = `${formatMolarity(molarity)} M`;
    molarityEl.title = describeSolvents(reaction.solvents);

    const settings = getHplcSettings();
    const aliquotInput = numberInput(settings.aliquotUl, "1", saveHplcAliquotVolumeUl);
    const vialInput = numberInput(settings.vialMl, "0.1", saveHplcVialVolumeMl);
    const targetInput = numberInput(settings.targetNmol, "0.1", saveHplcTargetAmountNmol);

    aliquotInput.title = "Aliquot drawn from the reaction mixture";
    vialInput.title = "Final volume of the diluted sample";
    targetInput.title = "Amount that should reach the column";

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

    block.append(top, inputs, note);

    let copyValue = "";
    result.addEventListener("click", async () => {
        if (!copyValue) return;
        await copyTextWithFeedback(result, copyValue);
    });

    function repaint() {
        const current = getHplcSettings();

        // Never write over the box the user is standing in — the commit that
        // triggered this repaint came from it.
        for (const [input, value] of [
            [aliquotInput, current.aliquotUl],
            [vialInput, current.vialMl],
            [targetInput, current.targetNmol],
        ]) {
            if (input !== document.activeElement) input.value = String(value);
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
            note.hidden = true;
            return;
        }

        const text = formatInjectionVolume(computed.volumeUl);
        result.textContent = `${text} µL`;
        copyValue = text;

        result.classList.toggle(
            "cdd-hplc-result-warn",
            computed.warning === "exceeds-vial"
        );

        if (computed.warning === "exceeds-vial") {
            note.textContent =
                "Exceeds the vial volume — the dilution is too weak for this target.";
            note.className = "cdd-hplc-note cdd-hplc-note-error";
            note.hidden = false;
        } else if (computed.warning === "below-minimum") {
            note.textContent =
                `Below ${HPLC_MIN_INJECTION_UL} µL — under the typical injector minimum.`;
            note.className = "cdd-hplc-note cdd-hplc-note-warn";
            note.hidden = false;
        } else {
            note.hidden = true;
        }
    }

    repaint();
    liveBlocks.push(repaint);

    return block;
}

// Spliced into the panel's own <style> so the block inherits the panel-id
// scoping the rest of the rules use.
export const HPLC_BLOCK_STYLES = `
  .cdd-hplc-block {
    border: 1px solid rgba(56, 189, 248, 0.35);
    border-radius: 10px;
    padding: 8px 10px;
    background: rgba(56, 189, 248, 0.07);
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

  .cdd-hplc-note {
    margin-top: 5px;
    font-size: 10px;
    line-height: 1.35;
  }

  .cdd-hplc-note-warn {
    color: #f59e0b;
  }

  .cdd-hplc-note-error {
    color: #ef4444;
  }
`;
