// setup-wizard.js — the setup guide on the settings page.
//
// A short tour a newcomer can click through: each step says, in a chemist's
// words, what one part of the extension does, where it shows up in CDD, and
// offers the switches that matter for it. It opens by itself the first time
// the settings page is shown, and whenever asked — the masthead button, or
// the ⚙ in the floating panel.
//
// It owns NO settings. Every control here is a MIRROR of a control on the
// settings page behind it: changing a mirror copies the value onto the real
// control and fires its `change`/`input`, so the save code in options.js runs
// exactly as if the user had clicked there. One storage key, one writer, and
// the guide can never disagree with the page — the mirror is re-read from the
// real control each time its step is shown.

import {
    getSetupWizardSeen,
    markSetupWizardSeen,
    takeSetupWizardRequest,
} from "../shared/setup-wizard-flag.js";

/* ------------------------------------------------------------------ *
 * The steps
 * ------------------------------------------------------------------ */

// kind: "check" | "radio" | "text" | "number"
// mirror: selector of the real control (radios: the shared `name`)
// pane: the settings card this lives in (the "Open in settings" link)
const STEPS = [
    {
        title: "Welcome",
        lead: "CDD Stoich Tools lives inside CDD Vault. It adds a floating panel to ELN entries, fills stoichiometry rows for you, carries the entry ID onto the batches you register, and tidies a few pages along the way.",
        body: [
            "This guide walks through the things worth deciding up front. Every switch here is the same switch as on the settings page — change it here or there, it is one setting.",
            "Settings save as you change them. Refresh the CDD page to see them take effect. Skip anything you are not sure about: the defaults are safe, and nothing writes to a CDD record unless you switch it on.",
        ],
    },
    {
        title: "Your vault",
        lead: "How an ELN entry's ID is read and carried. Two facts about your vault decide this.",
        pane: "col-regdefaults-heading",
        controls: [
            {
                kind: "radio",
                mirror: "elnIdFormat",
                label: "ELN identifier format",
                hint: "The same three CDD offers under ELN settings. Only an admin can see which one the vault is on — pick the one that matches your entry IDs.",
                options: [
                    { value: "vault-user", label: "Vault-User Identifier", sample: "PHA-MDX-0095 → MDX-0095 on the batch" },
                    { value: "vault", label: "Vault Identifier", sample: "carried whole" },
                    { value: "global", label: "Global Identifier", sample: "carried whole" },
                ],
            },
            {
                kind: "text",
                mirror: "#elnIdCarryFieldLabel",
                label: "Batch field that takes the entry ID",
                hint: "Its name on the Create Entity page. CDD's required marker does not matter — Internal ID matches *Internal ID.",
                placeholder: "Internal ID",
            },
            {
                kind: "radio",
                mirror: "elnTitleMode",
                label: "Browser tab title on an ELN entry",
                options: [
                    { value: "id-title", label: "Entry ID and title", sample: "4821 — Suzuki coupling" },
                    { value: "id-only", label: "Entry ID only", sample: "I34E-KRAP-0123" },
                    { value: "title-only", label: "Title only", sample: "Suzuki coupling" },
                    { value: "original", label: "Leave CDD's title", sample: "ELN: Vault 109" },
                ],
            },
        ],
    },
    {
        title: "The floating panel",
        lead: "Open any ELN entry and a panel appears at the top right. Entities shows one card per stoichiometry row — batch, purity, density, amounts — with buttons that fill the row. Phrases is a pasteboard of reusable text.",
        body: [
            "Drag it by its header, resize it from the corner, collapse it with −. Export prints what the cards show (save as PDF from the print dialog); its ▾ holds the CSV exports. The ⚙ brings you back here.",
        ],
        pane: "col-fields-heading",
        controls: [
            { kind: "check", mirror: "#panelSourceTableRows", label: "Cards for the stoichiometry table rows", hint: "The reaction cards, with their fill buttons." },
            { kind: "check", mirror: "#panelSourceMentions", label: "Cards for batches and samples linked in the entry text", hint: "Display only — a mention has no table row to fill." },
            { kind: "check", mirror: "#showProducts", label: "Show the products of each reaction", hint: "In the panel and on the print sheets. No fill buttons: a product has nothing to fill." },
            { kind: "check", mirror: "#elnShiftLeft", label: "Move the entry to the left edge while the panel is open", hint: "So the panel sits beside the entry instead of over its right-hand columns. Helps on a laptop." },
        ],
        after: "Which attributes each card shows is under Settings → Panel fields.",
    },
    {
        title: "Filling the table",
        lead: "Type a density, purity or concentration into a row once and the panel remembers it for that batch. Next time the batch turns up, the card offers to fill it — one click per value, or Fill all for every offer at once.",
        pane: "col-densities-heading",
        controls: [
            {
                kind: "radio",
                mirror: "fillRowName",
                label: "Row name from synonym",
                hint: "A row's free-text Name, taken from the names the molecule already answers to — DIPEA rather than N-ethyldiisopropylamine. Each new molecule costs one request for its page.",
                options: [
                    { value: "off", label: "Off" },
                    { value: "suggest", label: "Suggest in the Name editor", sample: "a list under CDD's own Name box" },
                    { value: "auto", label: "Suggest, and fill automatically", sample: "rows you add while working" },
                ],
            },
            { kind: "check", mirror: "#autoFillEnabled", label: "Experimental: auto-fill rows you add while working", hint: "Rows that already existed when the entry loaded are never touched on their own." },
            { kind: "number", mirror: "#purityFillThreshold", label: "Offer a purity fill only at or below (%)", inline: true },
            { kind: "number", mirror: "#purityWarnThreshold", label: "Show the LOW PURITY badge at or below (%)", inline: true },
        ],
    },
    {
        title: "Entry ID onto the batch",
        lead: "A product registered from an entry should carry that entry's ID. There are two ways it gets there.",
        body: [
            "Register link — click Register in a stoichiometry row and the new entity's Internal ID is already filled in. Nothing is saved until you press CDD's own Register.",
            "Panel button — a product card whose batch exists but has an empty Internal ID offers ⤴ Write … into Internal ID. One click saves it onto the batch record.",
            "The suffix tells reactions apart: the second stoichiometry table adds a B, the third a C. A product of a parallel (bulk) reaction gets -1A, -1B … for the first parallel reaction, -2A … for the second.",
        ],
        pane: "col-fields-heading",
        controls: [
            { kind: "check", mirror: "#elnIdCarryEnabled", label: "Register link fills the entry ID into the new entity", hint: "Only an empty field is filled." },
            { kind: "check", mirror: "#elnIdToBatch", label: "Product cards offer the Write into Internal ID button", hint: "This one saves to the batch record — the only thing in the panel that does. Off until you switch it on." },
        ],
    },
    {
        title: "HPLC injection",
        lead: "For each reaction the panel can work out an injection volume from the molarity CDD prints on the solvent row: an aliquot diluted to the vial volume, and however much of that carries the target amount.",
        pane: "col-hplc-heading",
        controls: [
            { kind: "check", mirror: "#hplcBlockEnabled", label: "Show the HPLC injection block in the panel", hint: "Aliquot, vial volume, target amount and the injector range are starting points under Settings → HPLC injection; any block can be recomputed for its own reaction." },
        ],
    },
    {
        title: "Registering a compound",
        lead: "The Create Entity page opens on the form you want, and a compound registered from an entry arrives with its fields already filled.",
        pane: "col-regform-heading",
        controls: [
            {
                kind: "radio",
                mirror: "regFormMode",
                label: "Which registration form the page opens on",
                options: [
                    { value: "remember", label: "The one you used last", sample: "remembered per vault" },
                    { value: "fixed", label: "Always the same form", sample: "pick it under Settings → Registration form" },
                    { value: "off", label: "Leave CDD's choice" },
                ],
            },
        ],
        after: "Per-vault field defaults — Origin: Synthesized and the like — are under Settings → Registration defaults. Vaults appear there as you use them. The registration form also grows a field filter, so a long form shows only the fields you pick.",
    },
    {
        title: "Everywhere else",
        lead: "These are on without a switch. Knowing they exist is the whole setting.",
        list: [
            ["Inventory → Pick location", "hover a well to see the structure stored there."],
            ["Plates", "a Location column on the plates list, a location tooltip in search results, a structure tooltip on the plate map, and Export locations as CSV."],
            ["Search and Inventory filters", "a picker to find a filter field or keyword by typing instead of scrolling."],
            ["Column manager", "pick and reorder result columns in one dialog."],
            ["Saved searches", "a Copy link button."],
            ["Consumed batches", "collapsed on the batch page until you open them."],
            ["Prefix colours and the heat-map tooltip", "tune them under Settings → Prefix colours and Heat map tooltip."],
            ["CDD Plugin options", "in CDD's user menu, top right — the settings page from anywhere in CDD."],
        ],
    },
    {
        title: "Done",
        lead: "That is the tour. Here is what is switched on right now.",
        summary: true,
        after: "Open this guide again any time: the Setup guide button at the top of the settings page, or the ⚙ in the floating panel.",
    },
];

/* ------------------------------------------------------------------ *
 * Mirrors — the wizard control ↔ the real control on the settings page
 * ------------------------------------------------------------------ */

function realRadios(name) {
    return [...document.querySelectorAll(`.panes input[name="${name}"]`)];
}

function realControl(selector) {
    return document.querySelector(`.panes ${selector}`);
}

function fire(el, type) {
    el.dispatchEvent(new Event(type, { bubbles: true }));
}

function buildCheck(spec) {
    const real = realControl(spec.mirror);
    const label = document.createElement("label");
    label.className = "wizard__check";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.disabled = !real;

    const text = document.createElement("span");
    text.className = "wizard__check-text";
    const strong = document.createElement("strong");
    strong.textContent = spec.label;
    text.appendChild(strong);
    if (spec.hint) {
        const hint = document.createElement("span");
        hint.className = "wizard__hint";
        hint.textContent = spec.hint;
        text.appendChild(hint);
    }

    input.addEventListener("change", () => {
        if (!real) return;
        real.checked = input.checked;
        fire(real, "change");
    });

    label.append(input, text);
    return { el: label, sync: () => { if (real) input.checked = real.checked; } };
}

function buildRadio(spec) {
    const reals = realRadios(spec.mirror);
    const wrap = document.createElement("fieldset");
    wrap.className = "wizard__radios";

    const legend = document.createElement("legend");
    legend.className = "wizard__legend";
    legend.textContent = spec.label;
    wrap.appendChild(legend);

    if (spec.hint) {
        const hint = document.createElement("p");
        hint.className = "wizard__hint";
        hint.textContent = spec.hint;
        wrap.appendChild(hint);
    }

    const inputs = [];
    const name = `wizard-${spec.mirror}`;
    for (const opt of spec.options) {
        const label = document.createElement("label");
        label.className = "wizard__radio";

        const input = document.createElement("input");
        input.type = "radio";
        input.name = name;
        input.value = opt.value;
        input.disabled = reals.length === 0;

        const text = document.createElement("span");
        text.className = "wizard__check-text";
        const strong = document.createElement("strong");
        strong.textContent = opt.label;
        text.appendChild(strong);
        if (opt.sample) {
            const sample = document.createElement("span");
            sample.className = "wizard__sample";
            sample.textContent = opt.sample;
            text.appendChild(sample);
        }

        input.addEventListener("change", () => {
            if (!input.checked) return;
            const real = reals.find((r) => r.value === opt.value);
            if (!real) return;
            real.checked = true;
            fire(real, "change");
        });

        label.append(input, text);
        wrap.appendChild(label);
        inputs.push(input);
    }

    return {
        el: wrap,
        sync: () => {
            const current = reals.find((r) => r.checked);
            for (const input of inputs) input.checked = !!current && input.value === current.value;
        },
    };
}

function buildTextLike(spec) {
    const real = realControl(spec.mirror);
    const label = document.createElement("label");
    label.className = spec.inline ? "wizard__field wizard__field--inline" : "wizard__field";

    const text = document.createElement("span");
    text.className = "wizard__check-text";
    const strong = document.createElement("strong");
    strong.textContent = spec.label;
    text.appendChild(strong);
    if (spec.hint) {
        const hint = document.createElement("span");
        hint.className = "wizard__hint";
        hint.textContent = spec.hint;
        text.appendChild(hint);
    }

    const input = document.createElement("input");
    input.type = spec.kind === "number" ? "number" : "text";
    input.className = "wizard__input";
    input.spellcheck = false;
    input.disabled = !real;
    if (spec.placeholder) input.placeholder = spec.placeholder;
    if (real && spec.kind === "number") {
        for (const attr of ["min", "max", "step"]) {
            if (real.hasAttribute(attr)) input.setAttribute(attr, real.getAttribute(attr));
        }
    }

    // Text saves as you type (the real control listens to `input`); numbers
    // save on `change`, like the real ones. Blur is forwarded too, because
    // the field-label box repairs an empty value to its default on blur —
    // and the repaired value is read back so the mirror shows it.
    input.addEventListener("input", () => {
        if (!real) return;
        real.value = input.value;
        fire(real, "input");
    });
    input.addEventListener("change", () => {
        if (!real) return;
        real.value = input.value;
        fire(real, "change");
    });
    input.addEventListener("blur", () => {
        if (!real) return;
        fire(real, "blur");
        setTimeout(() => { input.value = real.value; }, 50);
    });

    label.append(text, input);
    return { el: label, sync: () => { if (real) input.value = real.value; } };
}

function buildControl(spec) {
    if (spec.kind === "check") return buildCheck(spec);
    if (spec.kind === "radio") return buildRadio(spec);
    return buildTextLike(spec);
}

/* ------------------------------------------------------------------ *
 * The summary on the last step
 * ------------------------------------------------------------------ */

function summaryRows() {
    const rows = [];
    for (const step of STEPS) {
        for (const spec of step.controls || []) {
            if (spec.kind === "check") {
                const real = realControl(spec.mirror);
                rows.push([spec.label, real?.checked ? "on" : "off", !!real?.checked]);
            } else if (spec.kind === "radio") {
                const current = realRadios(spec.mirror).find((r) => r.checked);
                const opt = spec.options.find((o) => o.value === current?.value);
                rows.push([spec.label, opt ? opt.label : "—", !!opt && opt.value !== "off"]);
            } else {
                const real = realControl(spec.mirror);
                rows.push([spec.label, real?.value || "—", true]);
            }
        }
    }
    return rows;
}

/* ------------------------------------------------------------------ *
 * The overlay
 * ------------------------------------------------------------------ */

const root = document.getElementById("setupWizard");
let index = 0;
const built = new Map(); // step index → { el, syncs }

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function buildStep(i) {
    const step = STEPS[i];
    const pane = el("section", "wizard__step");
    const syncs = [];

    pane.appendChild(el("p", "wizard__count", `${i + 1} of ${STEPS.length}`));
    pane.appendChild(el("h2", "wizard__title", step.title));
    pane.appendChild(el("p", "wizard__lead", step.lead));

    for (const paragraph of step.body || []) {
        pane.appendChild(el("p", "wizard__body", paragraph));
    }

    if (step.list) {
        const ul = el("ul", "wizard__list");
        for (const [where, what] of step.list) {
            const li = el("li");
            li.appendChild(el("strong", null, where));
            li.appendChild(document.createTextNode(` — ${what}`));
            ul.appendChild(li);
        }
        pane.appendChild(ul);
    }

    if (step.controls) {
        const box = el("div", "wizard__controls");
        for (const spec of step.controls) {
            const { el: node, sync } = buildControl(spec);
            box.appendChild(node);
            syncs.push(sync);
        }
        pane.appendChild(box);
    }

    if (step.summary) {
        const table = el("dl", "wizard__summary");
        syncs.push(() => {
            table.replaceChildren();
            for (const [label, value, on] of summaryRows()) {
                const dt = el("dt", null, label);
                const dd = el("dd", on ? "is-on" : "is-off", value);
                table.append(dt, dd);
            }
        });
        pane.appendChild(table);
    }

    if (step.after) pane.appendChild(el("p", "wizard__after", step.after));

    if (step.pane) {
        const link = el("button", "wizard__pane-link", "Open this section in settings →");
        link.type = "button";
        link.addEventListener("click", () => {
            close();
            document.querySelector(`.rail__item[data-pane="${step.pane}"]`)?.click();
        });
        pane.appendChild(link);
    }

    return { el: pane, syncs };
}

function show(i) {
    index = Math.max(0, Math.min(STEPS.length - 1, i));
    if (!built.has(index)) built.set(index, buildStep(index));
    const { el: pane, syncs } = built.get(index);
    for (const s of syncs) s();

    root.querySelector(".wizard__stage").replaceChildren(pane);
    root.querySelector(".wizard__back").disabled = index === 0;
    root.querySelector(".wizard__next").textContent = index === STEPS.length - 1 ? "Finish" : "Next";
    root.querySelector(".wizard__skip").hidden = index === STEPS.length - 1;

    const dots = root.querySelector(".wizard__dots");
    dots.replaceChildren();
    STEPS.forEach((step, n) => {
        const dot = el("button", "wizard__dot" + (n === index ? " is-current" : ""));
        dot.type = "button";
        dot.title = step.title;
        dot.setAttribute("aria-label", `Step ${n + 1}: ${step.title}`);
        dot.addEventListener("click", () => show(n));
        dots.appendChild(dot);
    });

    root.querySelector(".wizard__stage").scrollTop = 0;
    pane.querySelector("h2")?.focus?.();
}

export function openSetupWizard() {
    root.hidden = false;
    document.body.classList.add("has-wizard");
    show(index);
    markSetupWizardSeen();
}

function close() {
    root.hidden = true;
    document.body.classList.remove("has-wizard");
}

function buildShell() {
    const card = el("div", "wizard");
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-label", "Setup guide");

    const head = el("div", "wizard__head");
    head.appendChild(el("span", "wizard__eyebrow", "Setup guide"));
    const closeBtn = el("button", "wizard__close", "×");
    closeBtn.type = "button";
    closeBtn.title = "Close";
    closeBtn.setAttribute("aria-label", "Close the setup guide");
    closeBtn.addEventListener("click", close);
    head.appendChild(closeBtn);

    const stage = el("div", "wizard__stage");

    const foot = el("div", "wizard__foot");
    const back = el("button", "btn btn--quiet wizard__back", "Back");
    back.type = "button";
    back.addEventListener("click", () => show(index - 1));
    const dots = el("div", "wizard__dots");
    const skip = el("button", "btn btn--quiet wizard__skip", "Skip the rest");
    skip.type = "button";
    skip.addEventListener("click", () => show(STEPS.length - 1));
    const next = el("button", "btn wizard__next", "Next");
    next.type = "button";
    next.addEventListener("click", () => {
        if (index === STEPS.length - 1) close();
        else show(index + 1);
    });
    foot.append(back, dots, skip, next);

    card.append(head, stage, foot);
    root.replaceChildren(card);

    root.addEventListener("click", (event) => {
        if (event.target === root) close();
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !root.hidden) close();
    });
}

export async function initSetupWizard() {
    if (!root) return;
    buildShell();

    document.getElementById("openSetupWizard")?.addEventListener("click", () => {
        index = 0;
        openSetupWizard();
    });

    // The ⚙ in the panel asked for the guide, or this is the first time the
    // settings page has ever been opened. The mirrors read the real controls,
    // and those are filled by async init code — a breath lets it finish.
    const requested = await takeSetupWizardRequest();
    const seen = requested ? true : await getSetupWizardSeen();
    if (requested || !seen) {
        index = 0;
        setTimeout(openSetupWizard, 250);
    }
}
