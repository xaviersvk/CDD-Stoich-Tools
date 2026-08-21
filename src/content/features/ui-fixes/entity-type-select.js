// content/features/ui-fixes/entity-type-select.js
//
// The DOM half that registration-form-default.js and slurp-type-default.js
// share. Both apply the SAME configured order to a <select> of entity types —
// one on the Create a New Entity page, one in the bulk-registration ("slurp")
// dialog — and both had grown a byte-identical copy of the code below.
//
// It lives here rather than in shared/registration-form.js because that module
// is deliberately DOM-free: the options page imports it too, and it must run
// verbatim in a context with no CDD page in it. Ordering <option> nodes is
// content-script work.

import { orderNames } from "../../../shared/registration-form.js";

// The option labels, in current DOM order. Names, never values: an option's
// `value` is a per-vault registration_form_definition_id.
export function optionNames(select) {
    return Array.from(select.options).map((option) => option.text.trim());
}

/**
 * applyOptionOrder(select, order) — reorder the option nodes in place into the
 * sequence configured on the options page.
 *
 * Appending an existing child MOVES it, so the selected option stays selected
 * (selectedness is a property of the option element, not of its position) and
 * each option's nested <template> of with/without choices rides along inside
 * it. CDD's Stimulus controllers see nothing.
 *
 * No-op — and, importantly, NO DOM writes, so it cannot feed the
 * MutationObserver that calls it — when the options already sit in the wanted
 * order, or when the names don't line up one-to-one (duplicates, odd labels),
 * where leaving the vault's own order alone beats guessing.
 */
export function applyOptionOrder(select, order) {
    if (!order?.length) return;

    const options = Array.from(select.options);
    const byName = new Map();
    for (const option of options) {
        const name = option.text.trim();
        if (!byName.has(name)) byName.set(name, []);
        byName.get(name).push(option);
    }

    const wanted = orderNames(optionNames(select), order)
        .map((name) => byName.get(name)?.shift())
        .filter(Boolean);

    if (wanted.length !== options.length) return; // duplicate/odd names: leave alone
    if (wanted.every((option, i) => option === options[i])) return; // already sorted

    for (const option of wanted) select.appendChild(option);
}
