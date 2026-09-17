// content/features/ui-fixes/registration-systems/page-dom.js
//
// Everything that knows what CDD's Registration Systems section looks like.
//
// Facts this file is built on, measured on the Settings → Registration page:
//
//   - The section is its own React root, .registrationSystemsPage, beside
//     .registrationFormDefinitionsPage. Its table's first column is Prefix.
//   - "Create a new System" opens a MUI dialog with input[name=".prefix"],
//     a checkbox input[name=".use_salt_code_as_batch_prefix"] and
//     input[name=".value"] (type number, "Current value", default 0 — the
//     first identifier is one past it). Buttons: Cancel and Save.
//   - Save is the only thing that reaches the server.

const ROOT = ".registrationSystemsPage";
const CREATE_TEXT = /Create a new System/;

/* ----- waiting ----- */

// One beat: the next DOM mutation, or a short timer, whichever is first.
// Timers alone are throttled in a hidden tab; mutations are not.
function tick(ms = 50) {
    return new Promise((resolve) => {
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            observer.disconnect();
            resolve();
        };
        const observer = new MutationObserver(() => setTimeout(finish, 0));
        observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
        setTimeout(finish, ms);
    });
}

async function waitFor(predicate, tries = 100) {
    for (let attempt = 0; attempt < tries; attempt += 1) {
        const value = predicate();
        if (value) return value;
        await tick();
    }
    return null;
}

/* ----- finding things ----- */

export function findRoot() {
    return document.querySelector(ROOT);
}

export function findCreateLink() {
    const root = findRoot();
    if (!root) return null;
    return [...root.querySelectorAll("a, button")]
        .find((el) => CREATE_TEXT.test(el.textContent) && el.offsetParent !== null) || null;
}

export function existingPrefixes() {
    const root = findRoot();
    if (!root) return [];
    return [...root.querySelectorAll("tbody tr")]
        .map((tr) => tr.querySelector("td")?.textContent.trim() || "")
        .filter(Boolean);
}

function openDialog() {
    return [...document.querySelectorAll('[role="dialog"]')]
        .find((dialog) => dialog.querySelector('input[name=".prefix"]')) || null;
}

/* ----- writing ----- */

// React tracks an input's value on the node; the prototype setter plus
// input+change is what a keystroke looks like to it.
function setNativeValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    if (setter) setter.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
}

export async function createSystem(prefix, currentValue) {
    if (openDialog()) throw new Error("a Create dialog is already open");
    const link = findCreateLink();
    if (!link) throw new Error('"Create a new System" is not on the page');
    link.click();

    const dialog = await waitFor(openDialog);
    if (!dialog) throw new Error("the Create dialog did not open");

    const prefixInput = dialog.querySelector('input[name=".prefix"]');
    const valueInput = dialog.querySelector('input[name=".value"]');
    setNativeValue(prefixInput, prefix);
    if (valueInput) setNativeValue(valueInput, String(currentValue));
    await tick();
    if (prefixInput.value !== prefix) throw new Error(`the prefix reads "${prefixInput.value}"`);

    const save = [...dialog.querySelectorAll("button")].find((button) => button.textContent.trim() === "Save");
    if (!save) throw new Error("the dialog has no Save button");
    save.click();

    // Done when the dialog is gone and the row is in the table. A dialog
    // that stays open is CDD refusing; its message is the reason.
    const made = await waitFor(() => !openDialog()
        && existingPrefixes().some((existing) => existing.toLowerCase() === prefix.toLowerCase()));
    if (made) return;

    const still = openDialog();
    if (still) {
        const reason = [...still.querySelectorAll('.Mui-error, [class*="error"], [role="alert"]')]
            .map((el) => el.textContent.trim()).filter(Boolean).join(" ");
        const cancel = [...still.querySelectorAll("button")].find((button) => button.textContent.trim() === "Cancel");
        cancel?.click();
        await waitFor(() => !openDialog(), 40);
        throw new Error(reason || "CDD did not save it");
    }
    throw new Error("the new system did not appear in the table");
}
