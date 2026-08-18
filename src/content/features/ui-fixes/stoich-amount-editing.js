// content/features/ui-fixes/stoich-amount-editing.js
//
// CDD's one-field stoichiometry popup opens with the caret at the END of
// the value and nothing selected — so changing "19 g" to "25 g" costs
// four backspaces. Worse: Mass and Volume keep their unit INSIDE the
// input text while the popup label states the default ("Mass [mg]"), so
// clearing the field and typing a bare 25 commits 25 mg — a silent 1000x
// error that looks like a normal edit.
//
// Two halves, one file: preselect the number on open (the unit stays in
// the box, after the caret), and put the remembered unit back if the
// field is committed as a bare number anyway.

// "19 g" -> { number: "19", unit: "g" }; "1.23" -> { number: "1.23",
// unit: "" }; "" and anything not starting with a number -> null.
// The decimal separator is kept as typed — CDD accepts a comma, and
// rewriting it would be an edit nobody asked for.
export function splitAmount(value) {
    const match = /^\s*(\d+(?:[.,]\d+)?)\s*(.*?)\s*$/.exec(String(value ?? ""));
    if (!match) return null;
    return { number: match[1], unit: match[2] };
}
