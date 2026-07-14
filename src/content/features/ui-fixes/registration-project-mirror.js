// content/features/ui-fixes/registration-project-mirror.js
//
// The "Create a New Entity" registration form puts the required Project select
// at the very top and the Create Entity button at the very bottom, often a full
// screen apart. Filling the form in, hitting Create and only then being told the
// project is missing costs a rejected submit and a scroll back to the top. CDD
// keeps what you typed -- the cost is the round trip, not the data.
//
// This mirrors the Project select next to the Create Entity button, keeps the
// two in sync in both directions, and disables Create Entity until a project is
// chosen -- so the round trip never happens.
//
// Both controls are the same underlying field: only CDD's original select
// carries the `name`, so the POST body is unchanged.

const STYLE_ID = "cdd-registration-project-mirror-style";
const WRAP_CLASS = "cdd-project-mirror";
const MIRROR_CLASS = "cdd-project-mirror-select";

// Marks the button as disabled *by us*, so CDD's own disabled state (it starts
// the form off `data-initally-disabled`) is never cleared on our behalf.
const OWNED_ATTR = "data-cdd-project-disabled";

const NO_PROJECT_TITLE = "Select a project first";

// CDD renders two `form#new_molecule` copies -- the live one and a hidden
// template for the other registration types -- so every lookup is scoped to
// the displayed one.
const FORM_SELECTOR = ".displayed_form_content form.new_molecule";
const SOURCE_SELECTOR = 'select[name="molecule[batch][project_id]"]';
const SUBMIT_SELECTOR = "button.new_molecule-button[type=submit]";

let started = false;

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        .${WRAP_CLASS} {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            margin-right: 14px;
            vertical-align: middle;
            font-size: 13px;
        }

        .${WRAP_CLASS} label {
            color: #57606a;
            white-space: nowrap;
        }

        .${WRAP_CLASS} .${MIRROR_CLASS} {
            max-width: 220px;
        }

        .${WRAP_CLASS}[data-missing="true"] label {
            color: #b45309;
            font-weight: 600;
        }

        .${WRAP_CLASS}[data-missing="true"] .${MIRROR_CLASS} {
            border: 1px solid #d97706;
            background: #fffbeb;
        }

        .${WRAP_CLASS}[data-nudge="true"] .${MIRROR_CLASS} {
            animation: cdd-project-mirror-nudge 0.45s ease;
        }

        ${SUBMIT_SELECTOR}[${OWNED_ATTR}] {
            opacity: 0.5;
            cursor: not-allowed;
        }

        @keyframes cdd-project-mirror-nudge {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-4px); }
            75% { transform: translateX(4px); }
        }
    `;

    document.head.appendChild(style);
}

function getForm() {
    return document.querySelector(FORM_SELECTOR);
}

function getSource(form) {
    return form?.querySelector(SOURCE_SELECTOR) || null;
}

function getButtonsRow(form) {
    const submit = form?.querySelector(SUBMIT_SELECTOR);
    return submit?.closest(".buttons-right") || null;
}

// Cheap identity for the option list, so the mirror is only rebuilt when CDD
// actually swaps the projects (it re-renders the form on registration-type and
// project changes).
function optionsSignature(select) {
    return JSON.stringify(
        Array.from(select.options).map((option) => [option.value, option.text])
    );
}

function rebuildOptions(mirror, source) {
    const signature = optionsSignature(source);
    if (mirror.dataset.cddSignature === signature) return;

    mirror.dataset.cddSignature = signature;
    mirror.replaceChildren();

    Array.from(source.options).forEach((option) => {
        const clone = document.createElement("option");
        clone.value = option.value;
        clone.text = option.text;
        mirror.add(clone);
    });
}

function createMirror() {
    const wrap = document.createElement("span");
    wrap.className = WRAP_CLASS;

    const label = document.createElement("label");
    label.textContent = "Project:";

    // Deliberately no `name` and no `id`: this control never reaches the POST
    // body and must not collide with CDD's own `#project_id`.
    const mirror = document.createElement("select");
    mirror.className = MIRROR_CLASS;

    label.addEventListener("click", () => mirror.focus());

    mirror.addEventListener("change", () => {
        const source = getSource(getForm());
        if (!source || source.value === mirror.value) return;

        source.value = mirror.value;
        source.dispatchEvent(new Event("input", { bubbles: true }));
        source.dispatchEvent(new Event("change", { bubbles: true }));

        sync();
    });

    wrap.append(label, mirror);
    return wrap;
}

function nudge(wrap) {
    wrap.dataset.nudge = "true";
    window.setTimeout(() => delete wrap.dataset.nudge, 500);
}

// Locks Create Entity while no project is picked. Ownership is one-way: we only
// ever release a button we locked ourselves, so a button CDD disabled for its
// own reasons (no structure drawn yet) stays disabled.
function setSubmitLocked(form, locked) {
    const submit = form.querySelector(SUBMIT_SELECTOR);
    if (!submit) return;

    const owned = submit.hasAttribute(OWNED_ATTR);

    if (locked) {
        if (submit.disabled && !owned) return;

        submit.disabled = true;
        submit.setAttribute(OWNED_ATTR, "");
        submit.title = NO_PROJECT_TITLE;
        return;
    }

    if (!owned) return;

    submit.disabled = false;
    submit.removeAttribute(OWNED_ATTR);
    if (submit.title === NO_PROJECT_TITLE) submit.removeAttribute("title");
}

function sync() {
    const form = getForm();
    const source = getSource(form);
    const buttonsRow = getButtonsRow(form);

    // "Other"-style registration types drop the project field entirely; there is
    // then nothing to wait for, so hand the button back.
    if (!source || !buttonsRow) {
        document.querySelector(`.${WRAP_CLASS}`)?.remove();
        if (form) setSubmitLocked(form, false);
        return;
    }

    injectStyles();

    let wrap = buttonsRow.querySelector(`.${WRAP_CLASS}`);

    if (!wrap) {
        document.querySelector(`.${WRAP_CLASS}`)?.remove();
        wrap = createMirror();
        buttonsRow.prepend(wrap);
    }

    const mirror = wrap.querySelector(`.${MIRROR_CLASS}`);

    rebuildOptions(mirror, source);

    if (mirror.value !== source.value) {
        mirror.value = source.value;
    }

    const missing = !source.value;

    wrap.dataset.missing = String(missing);
    setSubmitLocked(form, missing);

    return wrap;
}

// Backstop for the disabled button: CDD re-renders the form on its own schedule,
// so there is a frame between a fresh (enabled) button appearing and the next
// sync() locking it. A click landing in that gap must not post the form -- CDD's
// Stimulus controller submits directly, so the browser's `required` validation
// would never run.
function guardSubmit() {
    document.addEventListener(
        "click",
        (event) => {
            const submit = event.target?.closest?.(SUBMIT_SELECTOR);
            if (!submit) return;

            const form = getForm();
            if (!form || !form.contains(submit)) return;

            const source = getSource(form);
            if (!source || source.value) return;

            event.preventDefault();
            event.stopImmediatePropagation();

            const wrap = sync();
            if (!wrap) return;

            const mirror = wrap.querySelector(`.${MIRROR_CLASS}`);
            mirror.focus();
            nudge(wrap);
        },
        true
    );
}

export function initRegistrationProjectMirror() {
    if (started) return;
    started = true;

    guardSubmit();

    // Picking a project (in either control) makes CDD re-render the registration
    // fields, which can replace the source select -- hence the delegated listener
    // and the observer, rather than a one-shot binding.
    document.addEventListener(
        "change",
        (event) => {
            if (event.target?.matches?.(SOURCE_SELECTOR)) sync();
        },
        true
    );

    let scheduled = false;

    const run = () => {
        if (scheduled) return;
        scheduled = true;

        requestAnimationFrame(() => {
            scheduled = false;
            sync();
        });
    };

    // <html>, not <body>: Turbo swaps <body> on in-app navigation.
    new MutationObserver(run).observe(document.documentElement, {
        childList: true,
        subtree: true,
    });

    run();
}
