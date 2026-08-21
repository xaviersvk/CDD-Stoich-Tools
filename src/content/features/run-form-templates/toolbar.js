// content/features/run-form-templates/toolbar.js
//
// The bar above a run's "Run Definition" card: save the values as a named
// template, replay a template into another run.
//
// It is inserted as a SIBLING of `div.protocolAnnotator`, never inside it.
// The annotator is a React root that re-renders wholesale on edit/cancel, and
// a node of ours among its children would either be destroyed on the next
// render or make React throw while removing children it does not own. Outside
// it, the bar simply survives.
//
// Nothing here presses CDD's Save. A fill loads controls and stops.

import {
    deleteRunFormTemplate,
    getRunFormStash,
    getRunFormTemplates,
    isExtensionContextAlive,
    isWritableKind,
    KIND_FILE,
    MAX_TEMPLATE_NAME_LENGTH,
    onRunFormTemplatesChanged,
    saveRunFormTemplate,
    setRunFormStash,
} from "../../../shared/run-form-templates.js";
import {
    isEditMode,
    protocolLabel,
    readEditControls,
    readFilledFields,
    readProps,
    RUN_DATE_FIELD_NAME,
    writeField,
} from "./form-model.js";
import { applyEmpty, OUTCOME_CONFLICT, OUTCOME_SKIPPED, planFill } from "./fill-plan.js";
import { applyPaste, formatFields, parseFields, planPaste } from "./clipboard-io.js";
import { copyText } from "../../utils/clipboard.js";
import {
    BAR_CLASS,
    BUTTON_CLASS,
    DANGER_CLASS,
    FIELD_NAME_CLASS,
    injectRunFormTemplateStyles,
    ITEM_CLASS,
    LABEL_CLASS,
    LIST_CLASS,
    NAME_INPUT_CLASS,
    NEW_VALUE_CLASS,
    NOTE_CLASS,
    OLD_VALUE_CLASS,
    PANEL_CLASS,
    PRIMARY_CLASS,
    QUIET_CLASS,
    ROOT_CLASS,
    SELECT_CLASS,
    STATUS_CLASS,
    VALUE_CLASS,
    WARN_CLASS,
} from "./styles.js";

// Fields that belong to ONE run rather than to the method. Pre-unticked when
// saving: a template that carries last week's date and whoever ran it is a
// template nobody wants to apply twice.
const PER_RUN_FIELDS = new Set([RUN_DATE_FIELD_NAME.toLowerCase(), "person"]);

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function button(label, title, className = "") {
    const node = el("button", `${BUTTON_CLASS} ${className}`.trim(), label);
    node.type = "button";
    if (title) node.title = title;
    return node;
}

/* ------------------------------------------------------------------ *
 * Toolbar lifecycle
 * ------------------------------------------------------------------ */

export function isOwnToolbar(root) {
    return root instanceof HTMLElement && root.dataset.cddRft === "1";
}

// A bar no longer sitting in front of a live annotator is a leftover from a
// re-render and has to go, or the next scan adds a second one beside it.
export function isStaleToolbar(root) {
    const next = root.nextElementSibling;
    return !(next && next.classList?.contains("protocolAnnotator"));
}

export function destroyToolbar(root) {
    root.remove();
}

/**
 * Enable the two WRITING buttons only while CDD's editor is open.
 *
 * Reading a run definition is fine from the read-only view — that is where
 * you are when you decide to reuse it. Writing is not: a button that quietly
 * opened the editor for you would put the run into an editable, unsaved
 * state you never asked for. So Fill and Paste wait until you are already
 * in edit mode, and say so until then.
 *
 * Called from the discovery scan, which already runs on every mutation
 * batch — so the buttons follow the form in and out of edit mode without
 * this feature keeping any state of its own.
 */
export function refreshToolbarState(root) {
    const annotator = root.nextElementSibling;
    const editing = isEditMode(annotator);

    for (const btn of root.querySelectorAll("[data-needs-edit]")) {
        btn.disabled = !editing;
        btn.title = editing
            ? btn.dataset.titleReady || ""
            : "Click “Edit run definition” first — this writes into the form.";
    }

    // Leaving edit mode — by Save or by Cancel — ends the session a fill or
    // paste report was describing. Keeping "Overwritten: …" on screen next
    // to a form that is no longer editable says nothing true about what is
    // there now, so it goes. The save-as-template panel stays: it works
    // outside the editor and is the one panel that still means something.
    const panel = root.querySelector(`.${PANEL_CLASS}`);
    if (!editing && panel && (panel.dataset.mode === "fill" || panel.dataset.mode === "paste")) {
        // Claim it too: a paste still running must not draw its report into a
        // panel that has just been emptied because the form left edit mode.
        claimPanel(panel);
        panel.replaceChildren();
        panel.hidden = true;
        delete panel.dataset.mode;
    }
}

export function attachRunFormTemplates(annotator, props) {
    const previous = annotator.previousElementSibling;
    if (previous && previous.classList?.contains(ROOT_CLASS)) return;
    if (!props) return;

    injectRunFormTemplateStyles();

    const root = el("div", ROOT_CLASS);
    root.dataset.cddRft = "1";
    annotator.parentElement?.insertBefore(root, annotator);

    buildToolbar(root, annotator);
}

/* ------------------------------------------------------------------ *
 * The bar
 * ------------------------------------------------------------------ */

function buildToolbar(root, annotator) {
    const mainBar = el("div", BAR_CLASS);
    const status = el("span", STATUS_CLASS, "");

    const saveBtn = button(
        "⤓ Save these values as a template",
        "Stores the values this run's definition already carries, under a name you choose. Nothing on the run changes."
    );
    const fillBtn = button("⤒ Fill from template");
    fillBtn.dataset.needsEdit = "1";
    fillBtn.dataset.titleReady = "Loads a saved template into this run's definition. Empty fields are filled; anything already filled is shown for you to decide. CDD's own Save is never pressed.";

    const copyBtn = button(
        "⧉ Copy",
        "Puts these values on the clipboard as name/value lines — paste them into another run, or into Excel to edit first."
    );
    const pasteBtn = button("⎘ Paste into form");
    pasteBtn.dataset.needsEdit = "1";
    pasteBtn.dataset.titleReady = "Writes what Copy last put down into this run's definition. Unlike a template fill, this OVERWRITES fields that already have a value. CDD's own Save is still never pressed.";

    // A second way IN to pasting — for lines that went out to a spreadsheet
    // and were edited there. It belongs beside the other entry points, not
    // after a result: "paste edited lines instead" makes no sense offered
    // once the pasting is already done.
    const pasteLinesBtn = button("paste edited lines…", "", QUIET_CLASS);
    pasteLinesBtn.dataset.needsEdit = "1";
    pasteLinesBtn.dataset.titleReady = "For values you copied out, changed in a spreadsheet, and want to bring back.";

    mainBar.append(saveBtn, fillBtn, copyBtn, pasteBtn, pasteLinesBtn, status);

    const panel = el("div", PANEL_CLASS);
    panel.hidden = true;

    root.append(mainBar, panel);

    const setStatus = (text, warn = false) => {
        status.textContent = text || "";
        status.className = warn ? `${STATUS_CLASS} ${WARN_CLASS}` : STATUS_CLASS;
    };

    const closePanel = () => {
        // Closing is a write too: a paste still walking its plan must not
        // draw its report into a panel the user has just closed.
        claimPanel(panel);
        panel.replaceChildren();
        panel.hidden = true;
    };

    saveBtn.addEventListener("click", () => {
        setStatus("");
        renderSavePanel(panel, annotator, setStatus, closePanel);
    });

    fillBtn.addEventListener("click", () => {
        setStatus("");
        renderFillPanel(panel, annotator, setStatus, closePanel);
    });

    copyBtn.addEventListener("click", async () => {
        closePanel();

        // The same selection a template would take by default: the fields
        // that describe the METHOD. Copying the run's own date and operator
        // into another run is never what "reuse these settings" means, and
        // paste overwrites without asking.
        const fields = readFilledFields(readProps(annotator))
            .filter((f) => isWritableKind(f.kind))
            .filter((f) => !PER_RUN_FIELDS.has(f.name.toLowerCase()));

        if (!fields.length) {
            setStatus("Nothing to copy — this run definition is empty.", true);
            return;
        }

        const text = formatFields(fields);
        const ok = await copyText(text);

        // Also kept where our own Paste button can reach it without the
        // `clipboardRead` permission — see setRunFormStash.
        await setRunFormStash(text, {
            protocolName: protocolLabel(readProps(annotator)).protocolName,
            fieldCount: fields.length,
        });

        setStatus(ok
            ? `Copied ${fields.length} field(s) — paste into another run, or into a spreadsheet.`
            : `Kept ${fields.length} field(s) for “Paste into form”, but could not reach the system clipboard.`,
        !ok);
    });

    pasteBtn.addEventListener("click", () => {
        setStatus("");
        runPaste(panel, annotator, setStatus, closePanel);
    });

    pasteLinesBtn.addEventListener("click", () => {
        setStatus("");
        renderEditedLinesPanel(panel, annotator, setStatus, closePanel);
    });

    // Another tab (or a second run page) editing the list should not leave a
    // stale dropdown behind.
    const unsubscribe = onRunFormTemplatesChanged(() => {
        if (!root.isConnected) {
            unsubscribe();
            return;
        }
        if (panel.dataset.mode === "fill") renderFillPanel(panel, annotator, setStatus, closePanel);
    });
}

/* ------------------------------------------------------------------ *
 * Save panel — pick the fields, name it
 * ------------------------------------------------------------------ */

function renderSavePanel(panel, annotator, setStatus, closePanel) {
    claimPanel(panel);
    panel.dataset.mode = "save";
    panel.replaceChildren();
    panel.hidden = false;

    const props = readProps(annotator);
    const fields = readFilledFields(props);

    if (!fields.length) {
        panel.append(el("div", NOTE_CLASS, "This run definition has no values to save yet."));
        const bar = el("div", BAR_CLASS);
        const close = button("Close");
        close.addEventListener("click", closePanel);
        bar.append(close);
        panel.append(bar);
        return;
    }

    panel.append(el("div", LABEL_CLASS,
        "Tick what belongs to the method rather than to this one run:"));

    const list = el("div", LIST_CLASS);
    const boxes = [];

    for (const field of fields) {
        const item = el("label", ITEM_CLASS);

        const box = document.createElement("input");
        box.type = "checkbox";
        const replayable = isWritableKind(field.kind);
        const perRun = PER_RUN_FIELDS.has(field.name.toLowerCase());
        box.checked = replayable && !perRun;
        box.disabled = !replayable;

        const name = el("span", FIELD_NAME_CLASS, field.label);
        const value = el("span", VALUE_CLASS, field.value);

        item.append(box, name, value);
        if (!replayable) {
            item.append(el("span", NOTE_CLASS, field.kind === KIND_FILE
                ? "files cannot be replayed"
                : "cannot be replayed"));
        } else if (perRun) {
            item.append(el("span", NOTE_CLASS, "belongs to this run"));
        }

        list.append(item);
        boxes.push({ box, field });
    }

    panel.append(list);

    const bar = el("div", BAR_CLASS);
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = NAME_INPUT_CLASS;
    nameInput.placeholder = "Template name";
    nameInput.maxLength = MAX_TEMPLATE_NAME_LENGTH;

    const confirm = button("Save template", "", PRIMARY_CLASS);
    const cancel = button("Cancel");

    bar.append(el("span", LABEL_CLASS, "Name:"), nameInput, confirm, cancel);
    panel.append(bar);

    cancel.addEventListener("click", closePanel);

    confirm.addEventListener("click", async () => {
        if (!isExtensionContextAlive()) {
            setStatus("The extension was reloaded — refresh this page first.", true);
            return;
        }

        const chosen = boxes.filter(({ box }) => box.checked).map(({ field }) => ({
            defId: field.defId,
            name: field.name,
            kind: field.kind,
            value: field.value,
        }));

        confirm.disabled = true;
        const label = protocolLabel(props);
        const result = await saveRunFormTemplate({
            name: nameInput.value,
            ...label,
            savedAt: Date.now(),
            fields: chosen,
        });
        confirm.disabled = false;

        if (result.ok) {
            setStatus(`Saved "${nameInput.value.trim()}" — ${chosen.length} field(s).`);
            closePanel();
            return;
        }

        const reason = {
            name: "Give the template a name first.",
            fields: "Tick at least one field.",
            limit: "The template list is full — delete one first.",
        }[result.reason] || "Could not save the template.";
        setStatus(reason, true);
    });

    nameInput.focus();
}

/* ------------------------------------------------------------------ *
 * Paste — one click, straight into the open form
 *
 * "Paste" means paste. It takes what Copy last put down and writes it; there
 * is no box to paste into and no second button, because there is nothing to
 * ask. The box below exists only for the other route — lines that went out
 * to a spreadsheet, got edited there, and are coming back — and it stays out
 * of the way behind a link until someone wants it.
 * ------------------------------------------------------------------ */

// Returns false when something else took the panel over while this was
// writing, so the caller knows not to append its Close bar to a panel it no
// longer owns.
async function pasteLines(text, panel, annotator, setStatus, token) {
    const { pairs, unparsed } = parseFields(text);
    if (!pairs.length) {
        setStatus("Nothing to paste — expected lines of “name<TAB>value”.", true);
        return false;
    }

    panel.replaceChildren(el("div", NOTE_CLASS, "Writing…"));
    panel.hidden = false;

    const plan = planPaste(readProps(annotator), pairs, readEditControls(annotator));

    // The long one: a field at a time, each polling for the control to
    // settle. Seconds on a definition with picker or BatchLink fields, and
    // the whole window in which the user can press Fill.
    const { changed, unchanged, failed } = await applyPaste(plan);
    if (!stillOwnsPanel(panel, token)) return false;

    renderPasteOutcome(panel, plan, { changed, unchanged, failed, unparsed }, setStatus);
    return true;
}

async function runPaste(panel, annotator, setStatus, closePanel) {
    const token = claimPanel(panel);
    panel.dataset.mode = "paste";

    const stash = await getRunFormStash();
    if (!stillOwnsPanel(panel, token)) return;

    if (!stash) {
        panel.replaceChildren();
        panel.hidden = false;
        panel.append(el("div", NOTE_CLASS,
            "Nothing copied yet — open a run whose definition is filled in and press Copy."));
        appendClose(panel, closePanel);
        return;
    }

    const finished = await pasteLines(stash.text, panel, annotator, setStatus, token);
    if (finished) appendClose(panel, closePanel);
}

// The spreadsheet round-trip: values that left as a Copy, were edited
// somewhere else, and are coming back.
function renderEditedLinesPanel(panel, annotator, setStatus, closePanel) {
    claimPanel(panel);
    panel.dataset.mode = "paste";
    panel.replaceChildren();
    panel.hidden = false;

    panel.append(el("div", LABEL_CLASS,
        "Paste your lines here — one field per line, name and value separated by a tab:"));

    const box = document.createElement("textarea");
    box.className = NAME_INPUT_CLASS;
    box.rows = 8;
    box.style.width = "100%";
    box.style.fontFamily = "monospace";
    panel.append(box);

    const bar = el("div", BAR_CLASS);
    const apply = button("Write into form (overwrites)", "", PRIMARY_CLASS);
    const cancel = button("Cancel");
    bar.append(apply, cancel);
    panel.append(bar);

    cancel.addEventListener("click", closePanel);
    apply.addEventListener("click", async () => {
        apply.disabled = true;
        await pasteLines(box.value, panel, annotator, setStatus);
        appendClose(panel, closePanel);
    });

    box.focus();
}

// A finished report needs exactly one control: a way to dismiss it.
function appendClose(panel, closePanel) {
    const bar = el("div", BAR_CLASS);
    const close = button("Close");
    close.addEventListener("click", closePanel);
    bar.append(close);
    panel.append(bar);
}

function renderPasteOutcome(results, plan, { changed, unchanged, failed, unparsed }, setStatus) {
    results.replaceChildren();

    const unknown = plan.filter((s) => !s.writable);
    setStatus(
        `Overwrote ${changed.length} field(s), ${unchanged.length} already matched, `
        + `${unknown.length + failed.length + unparsed.length} skipped. `
        + "Nothing is saved until you press CDD's Save.",
        unknown.length + failed.length + unparsed.length > 0
    );

    if (changed.length) {
        results.append(el("div", LABEL_CLASS, "Overwritten:"));
        const list = el("div", LIST_CLASS);
        for (const step of changed) {
            const item = el("div", ITEM_CLASS);
            item.append(el("span", FIELD_NAME_CLASS, step.name));

            const value = el("span", VALUE_CLASS);
            if (step.current) {
                value.append(
                    el("span", OLD_VALUE_CLASS, step.current),
                    document.createTextNode("  →  ")
                );
            }
            value.append(el("span", NEW_VALUE_CLASS, step.value));
            item.append(value);
            list.append(item);
        }
        results.append(list);
    }

    const notes = [
        ...unknown.map((s) => ({ name: s.name, reason: s.reason })),
        ...failed.map((s) => ({ name: s.name, reason: s.reason || "could not write" })),
        ...unparsed.map((line) => ({ name: line.slice(0, 40), reason: "no tab between name and value" })),
    ];
    if (notes.length) {
        results.append(el("div", LABEL_CLASS, "Skipped:"));
        const list = el("div", LIST_CLASS);
        for (const note of notes) {
            const item = el("div", ITEM_CLASS);
            item.append(
                el("span", FIELD_NAME_CLASS, note.name),
                el("span", `${VALUE_CLASS} ${NOTE_CLASS}`, note.reason)
            );
            list.append(item);
        }
        results.append(list);
    }
}

/* ------------------------------------------------------------------ *
 * Fill panel — choose a template, then decide on the conflicts
 * ------------------------------------------------------------------ */

// Which render of the fill panel is the current one. Deleting a template
// starts TWO: the Delete handler's own re-render, and the storage-change
// listener's, since chrome.storage.onChanged fires in the writing tab as well.
// Both clear the panel and then await the list, so both used to append their
// own copy of whatever came back — the "No templates saved yet" note twice
// after forgetting the last one. The later render wins; the earlier one stops
// at its await.
// ONE token per panel, consulted by EVERY writer of it.
//
// It used to be one token consulted only by renderFillPanel, which guarded
// that function against other calls to itself and against nothing else. But
// Paste writes into the same element and takes seconds — applyPaste walks the
// plan a field at a time, each polling — and neither button disables the
// other. So: start a paste, click Fill while it runs, and when the paste
// finally resolves it calls replaceChildren() over the dropdown you are
// looking at, appends a second Close bar, and leaves dataset.mode as "fill"
// so the storage listener later redraws the fill panel over the paste report.
//
// Every writer now claims the panel before its first replaceChildren() and
// checks after every await that it is still the latest. The last writer to
// start is the one that gets to finish.
const panelRenderTokens = new WeakMap(); // panel -> latest writer's token

function claimPanel(panel) {
    const token = (panelRenderTokens.get(panel) || 0) + 1;
    panelRenderTokens.set(panel, token);
    return token;
}

function stillOwnsPanel(panel, token) {
    return panelRenderTokens.get(panel) === token;
}

async function renderFillPanel(panel, annotator, setStatus, closePanel) {
    const token = claimPanel(panel);

    panel.dataset.mode = "fill";
    panel.replaceChildren();
    panel.hidden = false;

    const templates = await getRunFormTemplates();
    if (!stillOwnsPanel(panel, token)) return;

    if (!templates.length) {
        panel.append(el("div", NOTE_CLASS,
            "No templates saved yet. Open a run whose definition is filled in and use “Save these values as a template”."));
        const bar = el("div", BAR_CLASS);
        const close = button("Close");
        close.addEventListener("click", closePanel);
        bar.append(close);
        panel.append(bar);
        return;
    }

    const bar = el("div", BAR_CLASS);
    const select = el("select", SELECT_CLASS);
    for (const template of templates) {
        const option = document.createElement("option");
        option.value = template.name;
        const origin = [template.protocolName, template.formName].filter(Boolean).join(" · ");
        option.textContent = origin
            ? `${template.name} — ${origin} (${template.fields.length})`
            : `${template.name} (${template.fields.length})`;
        select.append(option);
    }

    const fill = button("Fill", "", PRIMARY_CLASS);
    const remove = button("Delete", "Forget this template", DANGER_CLASS);
    const cancel = button("Cancel");

    bar.append(el("span", LABEL_CLASS, "Template:"), select, fill, remove, cancel);
    panel.append(bar);

    const results = el("div");
    panel.append(results);

    cancel.addEventListener("click", closePanel);

    remove.addEventListener("click", async () => {
        const name = select.value;
        if (!window.confirm(`Forget the template "${name}"?`)) return;
        await deleteRunFormTemplate(name);
        await renderFillPanel(panel, annotator, setStatus, closePanel);
    });

    fill.addEventListener("click", async () => {
        const template = templates.find((t) => t.name === select.value);
        if (!template) return;

        fill.disabled = true;
        results.replaceChildren(el("div", NOTE_CLASS, "Working…"));

        const controls = readEditControls(annotator);
        const plan = planFill(annotator, template, controls);
        const { written, failed } = await applyEmpty(plan);

        fill.disabled = false;
        renderOutcome(results, plan, written, failed, setStatus);
    });
}

function renderOutcome(results, plan, written, failed, setStatus) {
    results.replaceChildren();

    const conflicts = plan.filter((s) => s.outcome === OUTCOME_CONFLICT);
    const skipped = plan.filter((s) => s.outcome === OUTCOME_SKIPPED);

    setStatus(
        `Filled ${written.length} empty field(s). ${conflicts.length} already filled, `
        + `${skipped.length + failed.length} skipped. Nothing is saved until you press CDD's Save.`,
        conflicts.length > 0
    );

    if (conflicts.length) {
        results.append(el("div", LABEL_CLASS,
            "These already hold a different value — left untouched:"));

        const list = el("div", LIST_CLASS);
        const replacements = [];

        for (const step of conflicts) {
            const item = el("div", ITEM_CLASS);
            item.append(el("span", FIELD_NAME_CLASS, step.field.name));

            const value = el("span", VALUE_CLASS);
            value.append(
                el("span", OLD_VALUE_CLASS, step.current),
                document.createTextNode("  →  "),
                el("span", NEW_VALUE_CLASS, step.field.value)
            );
            item.append(value);

            const use = button("Use template value");

            // One replacement, awaited. "Use all" calls these IN SEQUENCE:
            // a BatchLink write drives CDD's shared search picker, so two
            // running at once would type into each other's dropdown.
            const apply = async () => {
                if (use.disabled) return;
                use.disabled = true;

                const result = await writeField(step.entry, step.field);
                if (result.ok) {
                    use.replaceWith(el("span", STATUS_CLASS, "✓ replaced"));
                } else {
                    use.disabled = false;
                    item.append(el("span", NOTE_CLASS, result.reason || "could not write"));
                }
            };

            use.addEventListener("click", apply);
            item.append(use);
            list.append(item);
            replacements.push(apply);
        }
        results.append(list);

        const bar = el("div", BAR_CLASS);
        const useAll = button(`Use template value for all ${conflicts.length}`, "", PRIMARY_CLASS);
        useAll.addEventListener("click", async () => {
            useAll.disabled = true;
            for (const apply of replacements) await apply();
        });
        bar.append(useAll);
        results.append(bar);
    }

    const notes = [...skipped, ...failed].filter((s) => s.reason);
    if (notes.length) {
        results.append(el("div", LABEL_CLASS, "Skipped:"));
        const list = el("div", LIST_CLASS);
        for (const step of notes) {
            const item = el("div", ITEM_CLASS);
            item.append(
                el("span", FIELD_NAME_CLASS, step.field.name),
                el("span", `${VALUE_CLASS} ${NOTE_CLASS}`, step.reason)
            );
            list.append(item);
        }
        results.append(list);
    }
}
