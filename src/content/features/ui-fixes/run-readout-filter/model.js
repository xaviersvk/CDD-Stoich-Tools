// content/features/ui-fixes/run-readout-filter/model.js
//
// What the readout filter box means, kept free of the DOM so it can be tested.
//
// A query is one or more groups separated by commas or semicolons; a row is
// shown when it matches ANY group. Inside a group the words are separated by
// spaces and the row must match EVERY word. A word matches a row when it
// matches its molecule, its plate or its well:
//
//   PHA-0334303          molecule contains it (dash and spaces ignored)
//   1059                 plate is exactly it, or molecule contains it
//   H01, H1              well is exactly it (leading zero optional)
//   H, H*                any well in row H
//   1059*, *4303         `*` is a wildcard over the whole field, any field
//
// Case never matters. A bare well row letter does not search molecules, or
// `H` would match every PHA-… name.

const WELL_RE = /^([A-Z]{1,2})(\d{1,3})?$/;
const WELL_ROW_RE = /^([A-Z]{1,2})\*$/;

const squash = (text) => String(text ?? "").toUpperCase().replace(/[\s\-_]+/g, "");

function wellKey(text) {
    const match = String(text ?? "").trim().toUpperCase().match(WELL_RE);
    if (!match) return null;
    return { row: match[1], column: match[2] == null ? null : Number(match[2]) };
}

function globRe(word) {
    const body = word
        .split("*")
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*");
    return new RegExp(`^${body}$`, "i");
}

function parseWord(raw) {
    const word = raw.toUpperCase();

    const rowOnly = word.match(WELL_ROW_RE);
    if (rowOnly) return { kind: "wellRow", row: rowOnly[1] };

    if (word.includes("*")) return { kind: "glob", re: globRe(word), squashedRe: globRe(squash(word)) };

    const well = wellKey(word);
    if (well && well.column == null) return { kind: "wellRow", row: well.row };

    return { kind: "text", word, squashed: squash(word), well };
}

// "PHA-0334303, 1059 H*" → [[word], [word, word]]. Empty groups are dropped;
// an empty query gives [] (show everything).
export function parseQuery(text) {
    return String(text ?? "")
        .split(/[,;]/)
        .map((group) => group.trim().split(/\s+/).filter(Boolean).map(parseWord))
        .filter((group) => group.length > 0);
}

function wordMatches(word, row) {
    const well = wellKey(row.well);

    switch (word.kind) {
        case "wellRow":
            return well != null && well.row === word.row;

        case "glob":
            return (
                word.re.test(String(row.plate ?? "").trim()) ||
                word.re.test(String(row.well ?? "").trim()) ||
                word.squashedRe.test(squash(row.molecule))
            );

        default:
            if (word.well && well && word.well.row === well.row && word.well.column === well.column) return true;
            if (String(row.plate ?? "").trim().toUpperCase() === word.word) return true;
            return word.squashed.length > 0 && squash(row.molecule).includes(word.squashed);
    }
}

// row: { molecule, plate, well } as the table shows them.
export function matchesQuery(row, groups) {
    if (!groups.length) return true;
    return groups.some((group) => group.every((word) => wordMatches(word, row)));
}

// The column index of each field, from the header cells' text. -1 when the
// table has no such column.
export function columnIndexes(headerTexts) {
    const names = headerTexts.map((text) => String(text ?? "").trim().toLowerCase());
    return {
        molecule: names.indexOf("molecule"),
        plate: names.indexOf("plate"),
        well: names.indexOf("well"),
    };
}
